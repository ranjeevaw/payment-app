// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDg7Thb6sNbZlajRJ04H0ZienByrePaMiE",
  authDomain: "englishdhammaorg.firebaseapp.com",
  projectId: "englishdhammaorg",
  storageBucket: "englishdhammaorg.firebasestorage.app",
  messagingSenderId: "839512705667",
  appId: "1:839512705667:web:5f4f8d471ecf1e97f3a9b6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
