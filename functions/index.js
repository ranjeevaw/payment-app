const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const Stripe = require("stripe");

const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

setGlobalOptions({maxInstances: 10});

exports.createCheckoutSession = onRequest(
    {
      secrets: ["STRIPE_SECRET_KEY"],
      cors: true,
    },
    async (req, res) => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({
            error: "Method not allowed",
          });
        }

        const {amount} = req.body;

        if (!amount || typeof amount !== "number" || amount < 100) {
          return res.status(400).json({
            error: "A valid payment amount is required.",
          });
        }

        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

        const amountInCents = Math.round(amount * 100);

        const session = await stripe.checkout.sessions.create({
          mode: "payment",

          managed_payments: {
            enabled: false,
          },

          line_items: [
            {
              price_data: {
                currency: "aud",
                product_data: {
                  name: "English Dhamma Organisation Payment",
                },
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],

          success_url:
            "https://ranjeevaw.github.io/payment-app/?payment_session_id={CHECKOUT_SESSION_ID}",

          cancel_url:
            "https://ranjeevaw.github.io/appointments-app/#/alms-calendar",

          metadata: {
            paymentAmount: amount.toFixed(2),
          },
        });

        logger.info("Stripe Checkout Session created", {
          sessionId: session.id,
        });

        return res.status(200).json({
          sessionId: session.id,
          checkoutUrl: session.url,
        });
      } catch (error) {
        logger.error("Error creating Stripe Checkout Session", error);

        return res.status(500).json({
          error: "Unable to create payment session.",
        });
      }
    },
);

exports.getCheckoutSession = onRequest(
    {
      secrets: ["STRIPE_SECRET_KEY"],
      cors: true,
    },
    async (req, res) => {
      try {
        if (req.method !== "GET") {
          return res.status(405).json({
            error: "Method not allowed",
          });
        }

        const sessionId = req.query.session_id;

        if (!sessionId || typeof sessionId !== "string") {
          return res.status(400).json({
            error: "A valid session ID is required.",
          });
        }

        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

        const session = await stripe.checkout.sessions.retrieve(
            sessionId,
            {
              expand: ["payment_intent"],
            },
        );

        if (session.payment_status !== "paid") {
          return res.status(400).json({
            error: "Payment has not been completed.",
          });
        }

        const paymentIntent = session.payment_intent;

        return res.status(200).json({
          paymentId: paymentIntent ? paymentIntent.id : null,
          paymentSessionId: session.id,
          paymentAmount: session.amount_total / 100,
        });
      } catch (error) {
        logger.error("Error retrieving Checkout Session", error);

        return res.status(500).json({
          error: "Unable to verify payment.",
        });
      }
    },
);

exports.stripeWebhook = onRequest(
    {
      secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      cors: false,
    },
    async (req, res) => {
      try {
        if (req.method !== "POST") {
          return res.status(405).send("Method not allowed");
        }

        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

        const signature = req.headers["stripe-signature"];

        if (!signature) {
          logger.error("Missing Stripe signature");
          return res.status(400).send("Missing Stripe signature");
        }

        let event;

        try {
          event = stripe.webhooks.constructEvent(
              req.rawBody,
              signature,
              process.env.STRIPE_WEBHOOK_SECRET,
          );
        } catch (error) {
          logger.error(
              "Stripe webhook signature verification failed",
              error,
          );

          return res.status(400).send("Invalid webhook signature");
        }

        logger.info("Stripe webhook verified", {
          eventType: event.type,
          eventId: event.id,
        });

        /*
         * We only process successful Checkout payments.
         */
        if (event.type === "checkout.session.completed") {
          const session = event.data.object;

          /*
           * The Checkout Session contains the verified amount
           * and PaymentIntent created by Stripe.
           */
          const paymentSessionId = session.id;
          const paymentAmount = session.amount_total / 100;
          const paymentIntentId = session.payment_intent;

          /*
           * Retrieve the PaymentIntent so we can obtain
           * additional payment information such as the charge
           * and receipt URL.
           */
          let paymentIntent = null;

          if (paymentIntentId) {
            paymentIntent = await stripe.paymentIntents.retrieve(
                paymentIntentId,
                {
                  expand: ["latest_charge"],
                },
            );
          }

          /*
           * Our paymentId is the Stripe PaymentIntent ID.
           */
          const paymentId = paymentIntent ?
            paymentIntent.id :
            paymentIntentId;

          let chargeId = null;
          let receiptUrl = null;

          if (
            paymentIntent &&
            paymentIntent.latest_charge
          ) {
            const charge = paymentIntent.latest_charge;

            chargeId = charge.id;
            receiptUrl = charge.receipt_url || null;
          }

          /*
           * Customer information collected by Stripe Checkout.
           */
          const customerDetails = session.customer_details || {};

          const customerName = customerDetails.name || null;
          const customerEmail = customerDetails.email || null;

          /*
           * Use the Stripe event ID as the Firestore document ID.
           *
           * This makes the webhook idempotent:
           * if Stripe sends the same event again, we do not
           * create a second payment record.
           */
          const paymentRef = db.collection("payments").doc(event.id);

          const existingPayment = await paymentRef.get();

          if (existingPayment.exists) {
            logger.info("Payment already recorded", {
              stripeEventId: event.id,
              paymentSessionId: paymentSessionId,
            });

            return res.status(200).json({
              received: true,
              duplicate: true,
            });
          }

          /*
           * Save the payment.
           */
          await paymentRef.set({
            paymentId: paymentId,
            paymentSessionId: paymentSessionId,
            paymentAmount: paymentAmount,

            customerName: customerName,
            customerEmail: customerEmail,

            stripeCustomerId: session.customer || null,
            paymentIntentId: paymentIntentId,
            chargeId: chargeId,
            stripeEventId: event.id,

            receiptUrl: receiptUrl,

            currency: session.currency || "aud",

            stripePaymentStatus: session.payment_status || null,
            checkoutStatus: session.status || null,

            paymentCreated: session.created ?
              new Date(session.created * 1000) :
              null,

            createdAt: FieldValue.serverTimestamp(),

            metadata: session.metadata || {},
          });

          logger.info("Payment saved to Firestore", {
            paymentId: paymentId,
            paymentSessionId: paymentSessionId,
            paymentAmount: paymentAmount,
            stripeEventId: event.id,
          });
        }

        return res.status(200).json({
          received: true,
        });
      } catch (error) {
        logger.error("Stripe webhook error", error);

        return res.status(500).json({
          error: "Webhook error",
        });
      }
    },
);
