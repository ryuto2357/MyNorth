import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  // 🔥 Check Firestore intro
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // user never completed intro
    window.location.replace("intro.html");
    return;
  }

  // Fill UI
  document.getElementById("userPhoto").src =
    user.photoURL || "https://via.placeholder.com/96";

  document.getElementById("userName").textContent =
    user.displayName || "No name";

  document.getElementById("userEmail").textContent = user.email || "-";
  document.getElementById("userUid").textContent = user.uid;
  document.getElementById("userProvider").textContent =
    user.providerData[0]?.providerId || "-";
  document.getElementById("userVerified").textContent =
    user.emailVerified ? "Yes" : "No";
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("index.html");
});