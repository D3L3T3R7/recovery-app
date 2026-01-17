import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyBuMQPeX9KPiK2SqfevXRJP2VOBAVpEao8", // Your actual key from the terminal
  authDomain: "recoverytracker-76398.firebaseapp.com",
  projectId: "recoverytracker-76398",
  storageBucket: "recoverytracker-76398.appspot.com",
  messagingSenderId: "110569586681",
  appId: "1:110569586681:web:c8333f1192bf5e558cc728"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);