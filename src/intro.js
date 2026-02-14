import { auth } from "./firebase.js";
import { db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

const form = document.getElementById("introForm");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;

  if (!user) {
    alert("You must be logged in.");
    return;
  }

  const introData = {
    name: form.name.value,
    gender: form.gender.value,
    age: Number(form.age.value),
    country: form.country.value,
    profession: form.profession.value,
    industry: form.industry.value,

    wakeUpTime: form.wakeUpTime.value,
    sleepTime: form.sleepTime.value,
    workHoursPerDay: Number(form.workHours.value),
    scheduleType: form.scheduleType.value,

    freeHoursDaily: Number(form.freeHours.value),
    busiestDay: form.busiestDay.value,
    mostFreeDays: form.mostFreeDays.value,

    productivityTime: form.productivityTime.value,
    exerciseRegularly: form.exercise.value,
    burnoutFrequency: form.burnout.value,

    createdAt: new Date()
  };

  try {
    await setDoc(doc(db, "users", user.uid), introData);
    window.location.replace("dashboard.html");
  } catch (error) {
    console.error("Error saving data:", error);
    alert("Something went wrong.");
  }
});