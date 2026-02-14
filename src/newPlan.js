import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";

const form = document.getElementById("new-plan-form");

// detect edit mode
const urlParams = new URLSearchParams(window.location.search);
const isEditMode = urlParams.get("edit") === "true";
const planId = urlParams.get("id");

// Wait for Firebase to finish loading auth
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  // If editing → load plan data
  if (isEditMode && planId) {

    const docRef = doc(db, "users", user.uid, "plans", planId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();

      document.getElementById("goal").value = data.goal;
      document.getElementById("duration").value = data.durationMonths;
      document.getElementById("level").value = data.level;

      // change UI text
      document.querySelector("h3").textContent = "Edit Plan";
      form.querySelector("button").textContent = "Save Changes";
    }
  }

  // Submit must be inside here (important!)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const goal = document.getElementById("goal").value;
    const duration = parseInt(document.getElementById("duration").value);
    const level = document.getElementById("level").value;

    try {

      if (isEditMode && planId) {

        await updateDoc(
          doc(db, "users", user.uid, "plans", planId),
          {
            goal,
            durationMonths: duration,
            level,
            updatedAt: new Date()
          }
        );

        alert("Plan updated!");

      } else {

        await setDoc(
          doc(db, "users", user.uid, "plans", crypto.randomUUID()),
          {
            goal,
            durationMonths: duration,
            level,
            createdAt: new Date(),
            progress: 0
          }
        );

        alert("Plan created!");
      }

      window.location.href = "/dashboard.html";

    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    }
  });

});
