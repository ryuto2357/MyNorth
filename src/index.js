import { auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

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

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.replace("dashboard.html");
  }
});
