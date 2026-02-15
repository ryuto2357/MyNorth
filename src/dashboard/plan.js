import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy
} from "firebase/firestore";


// ==========================
// LOAD PLAN LIST
// ==========================
export async function loadPlanTab() {

  const container = document.getElementById("plans-container");

  container.innerHTML = `
    <div class="text-muted">Loading plans...</div>
  `;

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

      // 🔹 Load tasks to calculate progress (DERIVED ONLY)
      const tasksSnapshot = await getDocs(
        collection(db, "users", user.uid, "plans", planId, "tasks")
      );

      let totalActive = 0;
      let completed = 0;

      tasksSnapshot.forEach(taskDoc => {
        const task = taskDoc.data();

        if (task.status !== "deleted") {
          totalActive++;

          if (task.status === "completed") {
            completed++;
          }
        }
      });

      const progress =
        totalActive === 0 ? 0 :
        Math.round((completed / totalActive) * 100);

      const card = `
        <div class="col-md-6 col-lg-4">
          <div class="card shadow-sm h-100">
            <div class="card-body">
              <h6 class="card-title">${data.goal}</h6>

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

                <a href="/newPlan.html?edit=true&id=${planId}" 
                   class="btn btn-outline-secondary btn-sm">
                  Edit
                </a>

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

    const q = query(
      collection(db, "users", user.uid, "plans", planId, "tasks"),
      orderBy("orderIndex")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      container.innerHTML += `<p>No tasks.</p>`;
      return;
    }

    let firstPendingFound = false;
    let html = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="back-to-plans">
          ← Back
        </button>
      </div>
    `;

    snapshot.forEach(docSnap => {

      const task = docSnap.data();

      if (task.status === "deleted") return;

      let badge = "";
      let cardStyle = "";

      if (task.status === "completed") {
        badge = `<span class="badge bg-success">Completed</span>`;
      } 
      else if (!firstPendingFound) {
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

    // Back button
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

  const viewButtons = document.querySelectorAll(".view-plan");

  viewButtons.forEach(button => {

    button.addEventListener("click", (e) => {

      const planId = e.target.getAttribute("data-id");
      loadPlanDetail(planId);

    });

  });
}


// ==========================
// DELETE LOGIC (FULL CLEAN)
// ==========================
function attachDeleteListeners(uid) {

  const deleteButtons = document.querySelectorAll(".delete-plan");

  deleteButtons.forEach(button => {

    button.addEventListener("click", async (e) => {

      const planId = e.target.getAttribute("data-id");

      const confirmDelete = confirm(
        "Are you sure you want to delete this plan and all its data?"
      );

      if (!confirmDelete) return;

      try {

        const planRef = doc(db, "users", uid, "plans", planId);

        // 1️⃣ Delete chats
        const chatsSnapshot = await getDocs(
          collection(db, "users", uid, "plans", planId, "chats")
        );

        for (const chatDoc of chatsSnapshot.docs) {
          await deleteDoc(chatDoc.ref);
        }

        // 2️⃣ Delete tasks
        const tasksSnapshot = await getDocs(
          collection(db, "users", uid, "plans", planId, "tasks")
        );

        for (const taskDoc of tasksSnapshot.docs) {
          await deleteDoc(taskDoc.ref);
        }

        // 3️⃣ Delete plan document
        await deleteDoc(planRef);

        // 4️⃣ Reload
        loadPlanTab();

      } catch (error) {
        console.error(error);
        alert("Failed to delete plan.");
      }

    });

  });
}
