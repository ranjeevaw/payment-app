import {useEffect, useState} from "react";
import "./App.css";

const CREATE_CHECKOUT_URL =
  "https://us-central1-englishdhammaorg.cloudfunctions.net/createCheckoutSession";

const VERIFY_PAYMENT_URL =
  "https://us-central1-englishdhammaorg.cloudfunctions.net/getCheckoutSession";

const APPOINTMENTS_URL =
  "https://ranjeevaw.github.io/appointments-app/#/alms-calendar";

function App() {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [payment, setPayment] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const paymentSessionId =
    new URLSearchParams(window.location.search)
        .get("payment_session_id");

  useEffect(() => {
    if (!paymentSessionId) {
      return;
    }

    const verifyPayment = async () => {
      setVerifying(true);
      setError("");

      try {
        const response = await fetch(
            `${VERIFY_PAYMENT_URL}?session_id=${encodeURIComponent(
                paymentSessionId,
            )}`,
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
              data.error || "Unable to verify payment.",
          );
        }

        if (!data.paymentId ||
            !data.paymentSessionId ||
            typeof data.paymentAmount !== "number") {
          throw new Error("Invalid payment information received.");
        }

        setPayment(data);
      } catch (err) {
        console.error("Payment verification error:", err);

        setError(
            err.message || "Unable to verify payment.",
        );
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [paymentSessionId]);

  const handlePayment = async (event) => {
    event.preventDefault();

    setError("");

    const paymentAmount = Number(amount);

    if (!amount || Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      setError("Please enter a valid payment amount.");
      return;
    }

    if (!Number.isFinite(paymentAmount)) {
      setError("Please enter a valid payment amount.");
      return;
    }

    if (paymentAmount < 100) {
      setError("The minimum payment amount is $100.00.");
      return;
    }

    if (paymentAmount > 10000) {
      setError("The maximum payment amount is $10,000.00.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(CREATE_CHECKOUT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: paymentAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
            data.error || "Unable to start the payment.",
        );
      }

      if (!data.checkoutUrl) {
        throw new Error(
            "Stripe Checkout URL was not returned.",
        );
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error("Payment error:", err);

      setError(
          err.message || "Unable to start the payment.",
      );

      setLoading(false);
    }
  };

  if (paymentSessionId) {
    if (verifying) {
      return (
        <div className="app">
          <main className="payment-card">
            <div className="loading-icon">
              ...
            </div>

            <h1>Verifying Payment</h1>

            <p className="subtitle">
              Please wait while we confirm your payment.
            </p>
          </main>
        </div>
      );
    }

    if (error) {
      return (
        <div className="app">
          <main className="payment-card">
            <div className="error-icon">
              !
            </div>

            <h1>Payment Verification Failed</h1>

            <p className="subtitle">
              We could not verify this payment.
            </p>

            <div className="error-message">
              {error}
            </div>
          </main>
        </div>
      );
    }

    if (payment) {
      return (
        <div className="app">
          <main className="payment-card success-card">
            <div className="success-icon">
              ✓
            </div>

            <h1>Payment Successful</h1>

            <p className="subtitle">
              Thank you for your payment.
            </p>

            <div className="payment-details">
              <div className="payment-detail">
                <span>Amount paid</span>
                <strong>
                  ${payment.paymentAmount.toFixed(2)}
                </strong>
              </div>

              <div className="payment-detail">
                <span>Payment ID</span>
                <strong>
                  {payment.paymentId}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="pay-button"
              onClick={() => {
                window.location.href = APPOINTMENTS_URL;
              }}
            >
              Continue to Appointments
            </button>
          </main>
        </div>
      );
    }
  }

  return (
    <div className="app">
      <main className="payment-card">
        <div className="logo-circle">
          EDO
        </div>

        <h1>English Dhamma Organisation</h1>

        <p className="subtitle">
          Make a Payment
        </p>

        <form onSubmit={handlePayment}>
          <label htmlFor="amount">
            Payment amount
          </label>

          <div className="amount-input">
            <span>$</span>

            <input
              id="amount"
              type="number"
              min="100"
              max="10000"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="100.00"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="pay-button"
            disabled={loading}
          >
            {loading ? "Preparing payment..." : "Pay by Card"}
          </button>
        </form>

        <div className="secure-payment">
          <span>🔒</span>
          <span>Secure payment powered by Stripe</span>
        </div>
      </main>
    </div>
  );
}

export default App;
