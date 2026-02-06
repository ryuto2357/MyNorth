import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";

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
const provider = new GoogleAuthProvider();

document.getElementById("googleLoginBtn").addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        // This gives you a Google Access Token. You can use it to access the Google API.
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential.accessToken;
        // The signed-in user info.
        const user = result.user;
        // IdP data available using getAdditionalUserInfo(result)
        // ...
      }).catch((error) => {
        // Handle Errors here.
        const errorCode = error.code;
        const errorMessage = error.message;
        // The email of the user's account used.
        const email = error.customData.email;
        // The AuthCredential type that was used.
        const credential = GoogleAuthProvider.credentialFromError(error);
        // ...
      });
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    // user is logged in
    window.location.replace("dashboard.html");
  }
});