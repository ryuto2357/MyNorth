import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";

const form = document.getElementById("introForm");


// detect edit mode
const urlParams = new URLSearchParams(window.location.search);
const isEditMode = urlParams.get("edit") === "true";

if (isEditMode) {
  document.querySelector("h2").textContent = "Edit Your Profile";
}
if (isEditMode) {
  form.querySelector("button").textContent = "Save Changes";
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  // If edit mode → load existing data
  if (isEditMode) {
    const docRef = doc(db, "users", user.uid);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();

      // pre-fill form
      form.name.value = data.name || "";
      form.gender.value = data.gender || "";
      form.age.value = data.age || "";
      form.country.value = data.country || "";
      form.profession.value = data.profession || "";
      form.industry.value = data.industry || "";

      form.wakeUpTime.value = data.wakeUpTime || "";
      form.sleepTime.value = data.sleepTime || "";
      form.workHours.value = data.workHoursPerDay || "";
      form.scheduleType.value = data.scheduleType || "";

      form.freeHours.value = data.freeHoursDaily || "";
      form.busiestDay.value = data.busiestDay || "";
      form.mostFreeDays.value = data.mostFreeDays || "";

      form.productivityTime.value = data.productivityTime || "";
      form.exercise.value = data.exerciseRegularly || "";
      form.burnout.value = data.burnoutFrequency || "";
    }
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) return;

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

    updatedAt: new Date()
  };

  try {
    const docRef = doc(db, "users", user.uid);

    if (isEditMode) {
      await updateDoc(docRef, introData);
    } else {
      await setDoc(docRef, {
        ...introData,
        createdAt: new Date()
      });
    }

    window.location.replace("dashboard.html");

  } catch (error) {
    console.error("Error saving data:", error);
    alert("Something went wrong.");
  }
});
