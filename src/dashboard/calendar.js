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
// LOAD GLOBAL CALENDAR
// ==========================
export async function loadCalendarTab() {

  const user = auth.currentUser;
  if (!user) return;

  const calendarEl = document.getElementById("calendar");

  if (currentCalendar) {
    currentCalendar.destroy();
  }

  try {

    const allEvents = [];

    // ==========================
    // 🔹 FETCH ALL PLANS
    // ==========================
    const plansSnapshot = await getDocs(
      collection(db, "users", user.uid, "plans")
    );

    for (const planDoc of plansSnapshot.docs) {

      const planData = planDoc.data();
      const planId = planDoc.id;

      if (!planData.createdAt) continue;

      const createdAt = planData.createdAt.toDate();
      const durationMonths = planData.durationMonths || 1;

      // ==========================
      // 🔹 FETCH TASKS FOR PLAN
      // ==========================
      const taskQuery = query(
        collection(db, "users", user.uid, "plans", planId, "tasks"),
        orderBy("orderIndex")
      );

      const taskSnapshot = await getDocs(taskQuery);

      const tasks = [];

      taskSnapshot.forEach(taskDoc => {
        const task = taskDoc.data();
        if (task.status === "deleted") return;
        tasks.push(task);
      });

      const totalTasks = tasks.length;
      const totalDays = durationMonths * 30;
      const daysPerTask = totalTasks > 0
        ? totalDays / totalTasks
        : 0;

      tasks.forEach(task => {

        // 🟦 TARGET DATE
        const targetDate = new Date(createdAt);
        targetDate.setDate(
          targetDate.getDate() +
          Math.round(daysPerTask * task.orderIndex)
        );

        allEvents.push({
          title: `🟦 ${planData.goal}: ${task.title}`,
          start: targetDate,
          allDay: true,
          color: "#0d6efd"
        });

        // 🟩 COMPLETED
        if (task.status === "completed" && task.completedAt) {
          allEvents.push({
            title: `🟩 ${planData.goal}: ${task.title}`,
            start: task.completedAt.toDate(),
            allDay: true,
            color: "#198754"
          });
        }

      });
    }


    // ==========================
    // 🔹 FETCH GOOGLE EVENTS
    // ==========================
    try {

      const result = await getGoogleEventsFn();

      const googleEvents = (result.data.events || []).map(ev => ({
        title: `🟡 ${ev.title || "No Title"}`,
        start: ev.start,
        end: ev.end,
        color: "#ffc107"
      }));

      allEvents.push(...googleEvents);

    } catch (err) {
      console.error("Google events fetch failed:", err);
    }


    // ==========================
    // 🔹 INIT CALENDAR
    // ==========================
    currentCalendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin],
      initialView: "dayGridMonth",
      height: 650,
      events: allEvents,

      eventContent: function(arg) {

        const event = arg.event;
        const start = event.start;

        let timeText = "";

        if (!event.allDay && start) {
          const hours = start.getHours().toString().padStart(2, "0");
          const minutes = start.getMinutes().toString().padStart(2, "0");
          timeText = `${hours}:${minutes} — `;
        }

        const container = document.createElement("div");
        container.style.fontSize = "0.85rem";

        container.innerHTML = `
          <div>
            ${timeText}${event.title}
          </div>
        `;

        return { domNodes: [container] };
      }
    });

    currentCalendar.render();

  } catch (error) {
    console.error(error);
  }
}
