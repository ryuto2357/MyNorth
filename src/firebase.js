import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBEZsmUytUocbZY6qEvxDaApExaOdb3RD8",
  authDomain: "mynorthhub.firebaseapp.com",
  projectId: "mynorthhub",
  storageBucket: "mynorthhub.firebasestorage.app",
  messagingSenderId: "860390455759",
  appId: "1:860390455759:web:83284f8719e03090b63aba"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// 🔥 CONNECT TO EMULATOR ONLY IN LOCALHOST
if (location.hostname === "127.0.0.1") {
  // connectAuthEmulator(auth, "http://127.0.0.1:9099");
  // connectFirestoreEmulator(db, "127.0.0.1", 8080);
  // connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export { auth, db, functions };
