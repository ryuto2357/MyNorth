import { auth, db } from "../firebase.js";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { loadPlanTab } from "./plan.js";
import { loadChatTab } from "./chat.js";
// import { loadCalendarTab } from "./calendar.js";

const tabContent = document.getElementById("tab-content");
const tabs = document.querySelectorAll("[data-tab]");
const logoutBtn = document.getElementById("logout-btn");


// ===============================
// AUTH + PROFILE CHECK
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    window.location.href = "/intro.html";
    return;
  }

  const profileData = userDoc.data();

  // Set profile UI
  document.getElementById("user-name").textContent =
    profileData.name || user.displayName || "User";

  document.getElementById("user-email").textContent =
    user.email;

  document.getElementById("user-photo").src =
    profileData.photoURL || user.photoURL || "https://via.placeholder.com/40";

  // Load default tab
  loadTab("plan");
});


// ===============================
// TAB SWITCHING
// ===============================
async function loadTab(tabName) {

  // remove active
  tabs.forEach(tab => tab.classList.remove("active"));
  document
    .querySelector(`[data-tab="${tabName}"]`)
    .classList.add("active");

  // load html
  const response = await fetch(`/tabs/${tabName}.html`);
  const html = await response.text();
  tabContent.innerHTML = html;

  // initialize logic
  if (tabName === "plan") {
    loadPlanTab();
  }

  // comment others for now so no error
  if (tabName === "chat") loadChatTab();
  // if (tabName === "calendar") loadCalendarTab();
}

// tab click
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const tabName = tab.getAttribute("data-tab");
    loadTab(tabName);
  });
});


// ===============================
// LOGOUT
// ===============================
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login.html";
});

const editProfileBtn = document.getElementById("edit-profile-btn");

editProfileBtn.addEventListener("click", () => {
  window.location.href = "/intro.html?edit=true";
});