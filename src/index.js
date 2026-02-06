import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBEZsmUytUocbZY6qEvxDaApExaOdb3RD8",
  authDomain: "mynorthhub.firebaseapp.com",
  projectId: "mynorthhub",
  storageBucket: "mynorthhub.firebasestorage.app",
  messagingSenderId: "860390455759",
  appId: "1:860390455759:web:83284f8719e03090b63aba"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/auth.user
    const uid = user.uid;
    console.log("User ID:", uid);
    console.log("User Email:", user.email);
    console.log("User Name:", user.displayName);
    console.log("User Photo URL:", user.photoURL);
    console.log("User Email Verified:", user.emailVerified);
    console.log("User Phone Number:", user.phoneNumber);
    // ...
  } else {
    console.log("No user is signed in.");
    // User is signed out
    // ...
  }
});