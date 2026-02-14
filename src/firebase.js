import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBEZsmUytUocbZY6qEvxDaApExaOdb3RD8",
  authDomain: "mynorthhub.firebaseapp.com",
  projectId: "mynorthhub",
  storageBucket: "mynorthhub.firebasestorage.app",
  messagingSenderId: "860390455759",
  appId: "1:860390455759:web:83284f8719e03090b63aba"
};

console.log("Firebase app initialized");

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
