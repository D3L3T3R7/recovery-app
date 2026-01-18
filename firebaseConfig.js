import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBuMQPeX9KPiK2SqfevXRJP2VOBAVpEao8",
  authDomain: "recoverytracker-76398.firebaseapp.com",
  projectId: "recoverytracker-76398",
  storageBucket: "recoverytracker-76398.firebasestorage.app",
  messagingSenderId: "110569586681",
  appId: "1:110569586681:web:c8333f1192bf5e558cc728"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the specific tools we need
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);