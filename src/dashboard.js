import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
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
