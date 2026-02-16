import { auth, db, functions } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const form = document.getElementById("new-plan-form");

let isSubmitting = false;

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    const goal = document.getElementById("goal").value.trim();
    const duration = parseInt(document.getElementById("duration").value);
    const currentStatus = document.getElementById("currentStatus").value.trim();

    if (!goal || !duration || !currentStatus) {
      alert("Please fill all fields.");
      return;
    }

    isSubmitting = true;

    const submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    submitBtn.innerText = "Generating roadmap...";

    try {

      const newPlanId = crypto.randomUUID();
      const planRef = doc(db, "users", user.uid, "plans", newPlanId);

      // 🔹 IMPORTANT: status = "generating"
      await setDoc(planRef, {
        goal,
        durationMonths: duration,
        currentStatus,
        status: "generating",
        createdAt: serverTimestamp(),
        completedAt: null
      });

      const generateRoadmap = httpsCallable(functions, "generateRoadmap");

      await generateRoadmap({
        planId: newPlanId,
        goal,
        durationMonths: duration,
        currentStatus
      });

      alert("Plan created successfully!");
      window.location.href = "/dashboard.html";

    } catch (error) {
      console.error(error);

      alert("Something went wrong. Please try again.");

      submitBtn.disabled = false;
      submitBtn.innerText = "Generate Roadmap";
      isSubmitting = false;
    }
  });

});
