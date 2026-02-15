import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const form = document.getElementById("new-plan-form");

const urlParams = new URLSearchParams(window.location.search);
const isEditMode = urlParams.get("edit") === "true";
const planId = urlParams.get("id");

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  if (isEditMode && planId) {

    const docRef = doc(db, "users", user.uid, "plans", planId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();

      document.getElementById("goal").value = data.goal;
      document.getElementById("duration").value = data.durationMonths;
      document.getElementById("level").value = data.level;

      document.querySelector("h3").textContent = "Edit Plan";
      form.querySelector("button").textContent = "Save Changes";
    }
  }

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

        const newPlanId = crypto.randomUUID();

        const planRef = doc(db, "users", user.uid, "plans", newPlanId);

        await setDoc(planRef, {
          goal,
          durationMonths: duration,
          level,
          status: "active",
          createdAt: new Date(),
          completedAt: null
        });

        const functions = getFunctions();
        const generateRoadmap = httpsCallable(functions, "generateRoadmap");

        await generateRoadmap({
          planId: newPlanId,
          goal,
          durationMonths: duration,
          level
        });

        alert("Plan created!");
      }

      window.location.href = "/dashboard.html";

    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    }
  });

});
