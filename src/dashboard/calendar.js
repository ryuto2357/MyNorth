import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc
} from "firebase/firestore";

import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";

let currentCalendar = null;

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  loadCalendarTab();
});

// ==========================
// LOAD CALENDAR TAB
// ==========================
export async function loadCalendarTab() {

  const user = auth.currentUser;
  if (!user) return;

  const selector = document.getElementById("calendar-plan-selector");

  try {

    const plansSnapshot = await getDocs(
      collection(db, "users", user.uid, "plans")
    );

    selector.innerHTML = `<option value="">Select a plan</option>`;

    plansSnapshot.forEach(planDoc => {
      const option = document.createElement("option");
      option.value = planDoc.id;
      option.textContent = planDoc.data().goal;
      selector.appendChild(option);
    });

    selector.addEventListener("change", (e) => {
      const planId = e.target.value;
      if (!planId) return;

      loadCalendarForPlan(planId);
    });

  } catch (error) {
    console.error(error);
  }
}

// ==========================
// LOAD PLAN EVENTS
// ==========================
async function loadCalendarForPlan(planId) {

  const user = auth.currentUser;
  if (!user) return;

  const calendarEl = document.getElementById("calendar");

  if (currentCalendar) {
    currentCalendar.destroy();
  }

  try {

    // 🔹 Get plan data
    const planRef = doc(db, "users", user.uid, "plans", planId);
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) return;

    const planData = planSnap.data();

    const createdAt = planData.createdAt.toDate();
    const durationMonths = planData.durationMonths || 1;

    // 🔹 Get all tasks ordered
    const q = query(
      collection(db, "users", user.uid, "plans", planId, "tasks"),
      orderBy("orderIndex")
    );

    const snapshot = await getDocs(q);

    const tasks = [];

    snapshot.forEach(docSnap => {
      const task = docSnap.data();
      if (task.status === "deleted") return;
      tasks.push(task);
    });

    const totalTasks = tasks.length;

    const totalDays = durationMonths * 30;
    const daysPerTask = totalTasks > 0
      ? totalDays / totalTasks
      : 0;

    const events = [];

    tasks.forEach(task => {

      // ==========================
      // 🟦 TARGET DATE (Derived)
      // ==========================
      const targetDate = new Date(createdAt);
      targetDate.setDate(
        targetDate.getDate() +
        Math.round(daysPerTask * task.orderIndex)
      );

      events.push({
        title: `Target: ${task.title}`,
        start: targetDate,
        allDay: true,
        color: "#0d6efd" // blue
      });

      // ==========================
      // 🟩 COMPLETION DATE
      // ==========================
      if (task.status === "completed" && task.completedAt) {

        events.push({
          title: `Completed: ${task.title}`,
          start: task.completedAt.toDate(),
          allDay: true,
          color: "#198754" // green
        });
      }
    });

    currentCalendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin],
      initialView: "dayGridMonth",
      height: 650,
      events: events
    });

    currentCalendar.render();

  } catch (error) {
    console.error(error);
  }
}
