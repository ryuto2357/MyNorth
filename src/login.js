import { auth, db } from "./firebase.js";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged 
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

const provider = new GoogleAuthProvider();

document.getElementById("googleLoginBtn")
  .addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  });


// 🔥 REAL LOGIC HERE
onAuthStateChanged(auth, async (user) => {
  console.log("Auth state changed triggered");

  if (!user) {
    console.log("No user detected");
    return;
  }

  console.log("User object:", user);
  console.log("User UID:", user.uid);
  console.log("Navigator online:", navigator.onLine);

  try {
    console.log("Creating userRef...");
    const userRef = doc(db, "users", user.uid);

    console.log("Testing Firestore instance:", db);
    console.log("Calling getDoc...");
    const userSnap = await getDoc(userRef);

    console.log("getDoc completed");
    console.log("Document exists?", userSnap.exists());

    if (userSnap.exists()) {
      console.log("Redirecting to dashboard");
      window.location.replace("dashboard.html");
    } else {
      console.log("Redirecting to intro");
      window.location.replace("intro.html");
    }

  } catch (error) {
    console.error("FULL ERROR OBJECT:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
  }
});
