import { auth, db, functions } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const form = document.getElementById("new-plan-form");

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const goal = document.getElementById("goal").value.trim();
    const duration = parseInt(document.getElementById("duration").value);
    const currentStatus = document.getElementById("currentStatus").value.trim();

    if (!goal || !duration || !currentStatus) {
      alert("Please fill all fields.");
      return;
    }

    try {

      const newPlanId = crypto.randomUUID();
      const planRef = doc(db, "users", user.uid, "plans", newPlanId);

      await setDoc(planRef, {
        goal,
        durationMonths: duration,
        currentStatus,
        status: "active",
        createdAt: new Date(),
        completedAt: null
      });

      const generateRoadmap = httpsCallable(functions, "generateRoadmap");

      await generateRoadmap({
        planId: newPlanId,
        goal,
        durationMonths: duration,
        currentStatus
      });

      alert("Plan created!");
      window.location.href = "/dashboard.html";

    } catch (error) {
      console.error(error);
      alert("Something went wrong.");
    }
  });

});
