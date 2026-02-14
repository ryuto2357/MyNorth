import { auth, db } from "../firebase.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  query,
  orderBy,
  getDoc,
  limit
} from "firebase/firestore";

let currentPlanId = null;
let isSending = false;

const CLOUD_FUNCTION_URL = "https://chatgemini-zoxcu4jcta-uc.a.run.app";
// Example:
// https://us-central1-mynorthhub.cloudfunctions.net/chatGemini


// ==========================
// Entry Point
// ==========================
export async function loadChatTab() {
  await loadPlans();
  setupSendButton();
}


// ==========================
// Load Plans into Dropdown
// ==========================
async function loadPlans() {

  const user = auth.currentUser;
  const selector = document.getElementById("plan-selector");

  if (!user) return;

  const plansSnapshot = await getDocs(
    collection(db, "users", user.uid, "plans")
  );

  selector.innerHTML = `<option value="">Select a plan</option>`;

  plansSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    selector.innerHTML += `
      <option value="${docSnap.id}">
        ${data.goal}
      </option>
    `;
  });

  selector.addEventListener("change", async (e) => {
    currentPlanId = e.target.value;
    await loadChatHistory();
  });
}


// ==========================
// Load Chat History
// ==========================
async function loadChatHistory() {

  const container = document.getElementById("chat-messages");
  container.innerHTML = "";

  if (!currentPlanId) return;

  const user = auth.currentUser;

  const messagesQuery = query(
    collection(db, "users", user.uid, "plans", currentPlanId, "chats"),
    orderBy("createdAt")
  );

  const snapshot = await getDocs(messagesQuery);

  snapshot.forEach(docSnap => {
    renderMessage(docSnap.data());
  });
}


// ==========================
// Send Message
// ==========================
function setupSendButton() {

  const btn = document.getElementById("send-btn");
  const input = document.getElementById("chat-input");

  async function sendMessage() {

  if (isSending) return;
  if (!currentPlanId) return alert("Select a plan first.");

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  isSending = true;
  btn.disabled = true;

  const user = auth.currentUser;

  try {

    // 1️⃣ Save user message
    await addDoc(
      collection(db, "users", user.uid, "plans", currentPlanId, "chats"),
      {
        role: "user",
        content: text,
        createdAt: new Date()
      }
    );

    renderMessage({ role: "user", content: text });

    // 2️⃣ Show temporary thinking bubble
    const thinkingBubble = renderThinkingBubble();

    // 3️⃣ Get Plan Context
    const planDoc = await getDoc(
      doc(db, "users", user.uid, "plans", currentPlanId)
    );

    const planData = planDoc.data();

    // 4️⃣ Get last 10 messages
    const history = await getRecentMessages(user.uid, currentPlanId);

    // 5️⃣ Call backend
    const aiReply = await callBackend(text, history, planData);

    // 6️⃣ Remove thinking bubble
    thinkingBubble.remove();

    // 7️⃣ Save assistant message
    await addDoc(
      collection(db, "users", user.uid, "plans", currentPlanId, "chats"),
      {
        role: "assistant",
        content: aiReply,
        createdAt: new Date()
      }
    );

    renderMessage({ role: "assistant", content: aiReply });

  } catch (error) {
    console.error(error);
  }

  isSending = false;
  btn.disabled = false;
}


  btn.addEventListener("click", sendMessage);

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });
}


// ==========================
// Get Recent Messages (Last 10)
// ==========================
async function getRecentMessages(uid, planId) {

  const messagesQuery = query(
    collection(db, "users", uid, "plans", planId, "chats"),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  const snapshot = await getDocs(messagesQuery);

  const messages = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    messages.push({
      role: data.role,
      text: data.content
    });
  });

  // Reverse so oldest comes first
  return messages.reverse();
}


// ==========================
// Call Cloud Function
// ==========================
async function callBackend(message, history, planData) {

  const response = await fetch(CLOUD_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      history,
      planContext: {
        goal: planData.goal,
        durationMonths: planData.durationMonths,
        level: planData.level,
        progress: planData.progress || 0
      }
    })
  });

  const data = await response.json();

  return data.message;
}


// ==========================
// Render Message
// ==========================
function renderMessage(message) {

  const container = document.getElementById("chat-messages");

  const isUser = message.role === "user";

  const wrapper = document.createElement("div");
  wrapper.className = `mb-2 d-flex ${isUser ? "justify-content-end" : "justify-content-start"}`;

  const bubble = document.createElement("div");
  bubble.className = `
    px-3 py-2 rounded-3
    ${isUser ? "bg-primary text-white" : "bg-white border"}
  `;
  bubble.style.maxWidth = "75%";
  bubble.style.whiteSpace = "pre-wrap";

  bubble.textContent = message.content;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

function renderThinkingBubble() {

  const container = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = "mb-2 d-flex justify-content-start";

  const bubble = document.createElement("div");
  bubble.className = "px-3 py-2 rounded-3 bg-white border text-muted";
  bubble.style.maxWidth = "75%";
  bubble.style.fontStyle = "italic";

  bubble.textContent = "Morgan is thinking...";

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;

  return wrapper; // IMPORTANT: return element so we can remove it later
}
