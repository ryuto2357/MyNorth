import { getAuth } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";

const form = document.getElementById("new-plan-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    alert("Not logged in.");
    window.location.href = "/login.html";
    return;
  }

  const goal = document.getElementById("goal").value;
  const duration = parseInt(document.getElementById("duration").value);
  const level = document.getElementById("level").value;

  try {
    await setDoc(doc(db, "users", user.uid, "plans", crypto.randomUUID()), {
      goal: goal,
      durationMonths: duration,
      level: level,
      createdAt: new Date(),
      progress: 0
    });

    alert("Plan created successfully!");
    window.location.href = "/dashboard.html";

  } catch (error) {
    console.error(error);
    alert("Something went wrong.");
  }
});
