import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  deleteDoc,
  doc
} from "firebase/firestore";

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

    querySnapshot.forEach((docSnap) => {

      const data = docSnap.data();

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
                  style="width: ${data.progress || 0}%;">
                </div>
              </div>

              <small>${data.progress || 0}% completed</small>

              <div class="mt-3 d-flex gap-2">

                <a href="/newPlan.html?edit=true&id=${docSnap.id}" 
                   class="btn btn-outline-secondary btn-sm">
                  Edit
                </a>

                <button 
                  class="btn btn-outline-danger btn-sm delete-plan"
                  data-id="${docSnap.id}">
                  Delete
                </button>

              </div>

            </div>
          </div>
        </div>
      `;

      container.innerHTML += card;
    });

    // 🔥 AFTER rendering all cards → attach delete listeners
    attachDeleteListeners(user.uid);

  } catch (error) {
    console.error(error);
    container.innerHTML = "Error loading plans.";
  }
}


// ==========================
// Delete Logic (Recursive)
// ==========================
function attachDeleteListeners(uid) {

  const deleteButtons = document.querySelectorAll(".delete-plan");

  deleteButtons.forEach(button => {

    button.addEventListener("click", async (e) => {

      const planId = e.target.getAttribute("data-id");

      const confirmDelete = confirm(
        "Are you sure you want to delete this plan and all its chats?"
      );

      if (!confirmDelete) return;

      try {

        const planRef = doc(db, "users", uid, "plans", planId);

        // 1️⃣ Delete all chats inside the plan
        const chatsSnapshot = await getDocs(
          collection(db, "users", uid, "plans", planId, "chats")
        );

        for (const chatDoc of chatsSnapshot.docs) {
          await deleteDoc(chatDoc.ref);
        }

        // 2️⃣ Delete the plan document
        await deleteDoc(planRef);

        // 3️⃣ Reload plans
        loadPlanTab();

      } catch (error) {
        console.error(error);
        alert("Failed to delete plan.");
      }

    });

  });
}
