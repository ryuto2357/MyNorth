import { auth, db, functions } from "../firebase.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  query,
  orderBy,
  getDoc,
  limit,
  deleteDoc
} from "firebase/firestore";

import { httpsCallable } from "firebase/functions";
import { marked } from "marked";
import DOMPurify from "dompurify";

let currentPlanId = null;
let isSending = false;

const chatMorgan = httpsCallable(functions, "chatMorgan");
const completeTaskFn = httpsCallable(functions, "completeTask");

// ==========================
// Entry
// ==========================
export async function loadChatTab() {
  await loadPlans();
  setupSendButton();
}

// ==========================
// Load Plans
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

  const planRef = doc(db, "users", user.uid, "plans", currentPlanId);
  const planSnap = await getDoc(planRef);

  const isCompleted =
    planSnap.exists() &&
    planSnap.data().status === "completed";

  // 1️⃣ Load chat history FIRST
  const messagesQuery = query(
    collection(db, "users", user.uid, "plans", currentPlanId, "chats"),
    orderBy("createdAt")
  );

  const snapshot = await getDocs(messagesQuery);

  snapshot.forEach(docSnap => {
    renderMessage(docSnap.data());
  });

  // 2️⃣ If completed, disable input + show banner
  if (isCompleted) {

    document.getElementById("chat-input").disabled = true;
    document.getElementById("send-btn").disabled = true;

    renderMessage({
      role: "assistant",
      content: "🎉 This plan is completed. Create a new plan to continue."
    });
  }
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

      // Save user message
      await addDoc(
        collection(db, "users", user.uid, "plans", currentPlanId, "chats"),
        {
          role: "user",
          content: text,
          createdAt: new Date()
        }
      );

      renderMessage({ role: "user", content: text });

      const thinkingBubble = renderThinkingBubble();

      const planDoc = await getDoc(
        doc(db, "users", user.uid, "plans", currentPlanId)
      );

      const planData = planDoc.data();

      const history = await getRecentMessages(user.uid, currentPlanId);
      const tasks = await getTasks(user.uid, currentPlanId);

      const result = await chatMorgan({
        message: text,
        history,
        planContext: {
          goal: planData.goal,
          durationMonths: planData.durationMonths,
          level: planData.level
        },
        tasks
      });

      thinkingBubble.remove();

      await handleAIResponse(result.data, user.uid);

      await enforceChatLimit(user.uid, currentPlanId);

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
// Fetch Tasks
// ==========================
async function getTasks(uid, planId) {

  const snapshot = await getDocs(
    collection(db, "users", uid, "plans", planId, "tasks")
  );

  const tasks = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    tasks.push({
      id: docSnap.id,
      title: data.title,
      description: data.description,
      status: data.status,
      orderIndex: data.orderIndex
    });
  });

  return tasks;
}

// ==========================
// Handle AI Response
// ==========================
async function handleAIResponse(response, uid) {

  if (!response || !response.type) {
    renderMessage({
      role: "assistant",
      content: "Something went wrong."
    });
    return;
  }

  if (response.type === "NORMAL_REPLY" ||
      response.type === "ASK_CLARIFICATION") {

    await saveAssistantMessage(uid, response.message);

    renderMessage({
      role: "assistant",
      content: response.message
    });

    return;
  }

  if (response.type === "PROPOSE_TASK_COMPLETION") {
    renderCompletionProposal(response, uid);
  }
}

// ==========================
// Render Completion Proposal
// ==========================
function renderCompletionProposal(response, uid) {

  const container = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = "mb-2 d-flex justify-content-start";

  const bubble = document.createElement("div");
  bubble.className = "px-3 py-2 rounded-3 bg-white border";
  bubble.style.maxWidth = "75%";

  bubble.innerHTML = `
    <div>${response.message}</div>
    <div class="mt-2 d-flex gap-2">
      <button class="btn btn-sm btn-success confirm-btn">
        Confirm
      </button>
      <button class="btn btn-sm btn-secondary cancel-btn">
        Cancel
      </button>
    </div>
  `;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;

  bubble.querySelector(".confirm-btn")
    .addEventListener("click", async () => {

      bubble.innerHTML = "Processing...";

      try {

        const result = await completeTaskFn({
          planId: currentPlanId,
          taskId: response.taskId,
          triggeredByChatId: null
        });

        if (result.data.planCompleted) {
          bubble.innerHTML = "🎉 Plan completed!";
        } else {
          bubble.innerHTML = "Task completed successfully.";
        }

      } catch (err) {
        console.error(err);
        bubble.innerHTML = "Failed to complete task.";
      }

    });

  bubble.querySelector(".cancel-btn")
    .addEventListener("click", () => {
      bubble.innerHTML = "Okay, let's continue.";
    });
}

// ==========================
// Save Assistant Message
// ==========================
async function saveAssistantMessage(uid, message) {

  await addDoc(
    collection(db, "users", uid, "plans", currentPlanId, "chats"),
    {
      role: "assistant",
      content: message,
      createdAt: new Date()
    }
  );
}

// ==========================
// Get Recent Messages
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

  return messages.reverse();
}

// ==========================
// Render Thinking Bubble
// ==========================
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

  return wrapper;
}

// ==========================
// Render Message (Markdown)
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

  bubble.innerHTML = DOMPurify.sanitize(
    marked.parse(message.content)
  );

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

// ==========================
// Enforce 30 Messages
// ==========================
async function enforceChatLimit(uid, planId) {

  const chatsRef = collection(db, "users", uid, "plans", planId, "chats");

  const snapshot = await getDocs(
    query(chatsRef, orderBy("createdAt", "desc"))
  );

  if (snapshot.docs.length <= 30) return;

  const docsToDelete = snapshot.docs.slice(30);

  for (const docSnap of docsToDelete) {
    await deleteDoc(docSnap.ref);
  }
}
