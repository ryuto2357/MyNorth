import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  getDoc
} from "firebase/firestore";

// ==========================
// LOAD PLAN LIST
// ==========================
export async function loadPlanTab() {

  const container = document.getElementById("plans-container");

  container.innerHTML = `<div class="text-muted">Loading plans...</div>`;

  const user = auth.currentUser;

  if (!user) {
    container.innerHTML = "Not logged in.";
    return;
  }

  try {

    const querySnapshot = await getDocs(
      collection(db, "users", user.uid, "plans")
    );

    if (querySnapshot.empty) {
      container.innerHTML = `
        <div class="text-center text-muted mt-4">
          <p>No plans yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    for (const docSnap of querySnapshot.docs) {

      const data = docSnap.data();
      const planId = docSnap.id;

      const tasksSnapshot = await getDocs(
        collection(db, "users", user.uid, "plans", planId, "tasks")
      );

      let totalActive = 0;
      let completed = 0;

      tasksSnapshot.forEach(taskDoc => {
        const task = taskDoc.data();

        if (task.status !== "deleted") {
          totalActive++;
          if (task.status === "completed") completed++;
        }
      });

      const progress =
        totalActive === 0 ? 0 :
        Math.round((completed / totalActive) * 100);

      const statusBadge = data.status === "completed"
        ? `<span class="badge bg-success">Completed</span>`
        : `<span class="badge bg-primary">Active</span>`;

      const card = `
        <div class="col-md-6 col-lg-4">
          <div class="card shadow-sm h-100">
            <div class="card-body">
              <h6 class="card-title d-flex justify-content-between">
                ${data.goal}
                ${statusBadge}
              </h6>

              <p class="text-muted small">
                Duration: ${data.durationMonths} months
              </p>

              <div class="progress mb-2" style="height: 8px;">
                <div 
                  class="progress-bar" 
                  role="progressbar"
                  style="width: ${progress}%;">
                </div>
              </div>

              <small>${progress}% completed</small>

              <div class="mt-3 d-flex gap-2">
                <button 
                  class="btn btn-outline-primary btn-sm view-plan"
                  data-id="${planId}">
                  View
                </button>

                <button 
                  class="btn btn-outline-danger btn-sm delete-plan"
                  data-id="${planId}">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      container.innerHTML += card;
    }

    attachDeleteListeners(user.uid);
    attachViewListeners(user.uid);

  } catch (error) {
    console.error(error);
    container.innerHTML = "Error loading plans.";
  }
}

// ==========================
// LOAD PLAN DETAIL (TASKS)
// ==========================
async function loadPlanDetail(planId) {

  const container = document.getElementById("plans-container");

  container.innerHTML = `
    <div class="mb-3">
      <button class="btn btn-sm btn-outline-secondary" id="back-to-plans">
        ← Back
      </button>
    </div>
    <div>Loading tasks...</div>
  `;

  const user = auth.currentUser;
  if (!user) return;

  try {

    const planRef = doc(db, "users", user.uid, "plans", planId);
    const planSnap = await getDoc(planRef);

    if (!planSnap.exists()) {
      container.innerHTML = "Plan not found.";
      return;
    }

    const planData = planSnap.data();
    const isCompleted = planData.status === "completed";

    const q = query(
      collection(db, "users", user.uid, "plans", planId, "tasks"),
      orderBy("orderIndex")
    );

    const snapshot = await getDocs(q);

    let firstPendingFound = false;

    let html = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="back-to-plans">
          ← Back
        </button>
      </div>
    `;

    if (isCompleted) {
      html += `
        <div class="alert alert-success">
          🎉 This plan is completed.
        </div>
      `;
    }

    snapshot.forEach(docSnap => {

      const task = docSnap.data();
      if (task.status === "deleted") return;

      let badge = "";
      let cardStyle = "";

      if (task.status === "completed") {
        badge = `<span class="badge bg-success">Completed</span>`;
      } 
      else if (!firstPendingFound && !isCompleted) {
        badge = `<span class="badge bg-primary">Active</span>`;
        firstPendingFound = true;
      } 
      else {
        badge = `<span class="badge bg-secondary">Locked</span>`;
        cardStyle = "opacity:0.6;";
      }

      html += `
        <div class="card mb-2" style="${cardStyle}">
          <div class="card-body">
            <div class="d-flex justify-content-between">
              <strong>${task.title}</strong>
              ${badge}
            </div>
            <small class="text-muted">
              ${task.description || ""}
            </small>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    document
      .getElementById("back-to-plans")
      .addEventListener("click", loadPlanTab);

  } catch (err) {
    console.error(err);
    container.innerHTML = "Failed to load tasks.";
  }
}

// ==========================
// VIEW BUTTON
// ==========================
function attachViewListeners(uid) {

  document.querySelectorAll(".view-plan")
    .forEach(button => {
      button.addEventListener("click", (e) => {
        const planId = e.target.getAttribute("data-id");
        loadPlanDetail(planId);
      });
    });
}

// ==========================
// DELETE LOGIC
// ==========================
function attachDeleteListeners(uid) {

  document.querySelectorAll(".delete-plan")
    .forEach(button => {

      button.addEventListener("click", async (e) => {

        const planId = e.target.getAttribute("data-id");

        if (!confirm("Delete this plan?")) return;

        try {

          const planRef = doc(db, "users", uid, "plans", planId);

          const chatsSnapshot = await getDocs(
            collection(db, "users", uid, "plans", planId, "chats")
          );

          for (const chatDoc of chatsSnapshot.docs) {
            await deleteDoc(chatDoc.ref);
          }

          const tasksSnapshot = await getDocs(
            collection(db, "users", uid, "plans", planId, "tasks")
          );

          for (const taskDoc of tasksSnapshot.docs) {
            await deleteDoc(taskDoc.ref);
          }

          await deleteDoc(planRef);

          loadPlanTab();

        } catch (error) {
          console.error(error);
          alert("Failed to delete plan.");
        }
      });
    });
}
