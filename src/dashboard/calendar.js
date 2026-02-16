import { auth, db, functions } from "../firebase.js";
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
import { httpsCallable } from "firebase/functions";

const getGoogleEventsFn = httpsCallable(functions, "getGoogleCalendarEvents");

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
// LOAD PLAN + GOOGLE EVENTS
// ==========================
async function loadCalendarForPlan(planId) {

  const user = auth.currentUser;
  if (!user) return;

  const calendarEl = document.getElementById("calendar");

  if (currentCalendar) {
    currentCalendar.destroy();
  }

  try {

    // ==========================
    // 🔹 GET PLAN DATA
    // ==========================
    const planRef = doc(db, "users", user.uid, "plans", planId);
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) return;

    const planData = planSnap.data();

    const createdAt = planData.createdAt.toDate();
    const durationMonths = planData.durationMonths || 1;

    // ==========================
    // 🔹 GET TASKS
    // ==========================
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

    const roadmapEvents = [];

    tasks.forEach(task => {

      // ==========================
      // 🟦 TARGET DATE (Derived)
      // ==========================
      const targetDate = new Date(createdAt);
      targetDate.setDate(
        targetDate.getDate() +
        Math.round(daysPerTask * task.orderIndex)
      );

      roadmapEvents.push({
        title: `Target: ${task.title}`,
        start: targetDate,
        allDay: true,
        color: "#0d6efd" // blue
      });

      // ==========================
      // 🟩 COMPLETION DATE
      // ==========================
      if (task.status === "completed" && task.completedAt) {

        roadmapEvents.push({
          title: `Completed: ${task.title}`,
          start: task.completedAt.toDate(),
          allDay: true,
          color: "#198754" // green
        });
      }
    });


    // ==========================
    // 🔹 FETCH GOOGLE EVENTS
    // ==========================
    let googleEvents = [];

    try {
      const result = await getGoogleEventsFn();

      googleEvents = (result.data.events || []).map(ev => ({
        title: `Google: ${ev.title || "No Title"}`,
        start: ev.start,
        end: ev.end,
        color: "#ffc107" // yellow
      }));

    } catch (err) {
      console.error("Google events fetch failed:", err);
    }


    // ==========================
    // 🔹 MERGE EVENTS
    // ==========================
    const allEvents = [...roadmapEvents, ...googleEvents];


    // ==========================
    // 🔹 INIT CALENDAR
    // ==========================
    currentCalendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin],
      initialView: "dayGridMonth",
      height: 650,
      events: allEvents
    });

    currentCalendar.render();

  } catch (error) {
    console.error(error);
  }
}
