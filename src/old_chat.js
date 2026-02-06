const STORAGE_VERSION = 2;
const STORAGE_KEY = "mynorth_chat";
const MAX_MESSAGES = 20;
const chatTextArea = document.getElementById("chatTextArea");
const sendButton = document.getElementById("sendButton");
const chatLogs = document.getElementById("chatLogs");
const chatTabs = document.getElementById("chatTabs");
const newTabBtn = document.getElementById("newTabBtn");

const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("mynorth_theme", theme);
  themeToggle.innerText = theme === "dark" ? "☀️" : "🌙";
}

function loadTheme() {
  const saved = localStorage.getItem("mynorth_theme") || "light";
  setTheme(saved);
}
themeToggle.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme") || "light";
  setTheme(current === "dark" ? "light" : "dark");
});
loadTheme();
function trimHistory(messages) {
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }
}

function migrateState(oldData) {
  // Case 1: Already new format
  if (oldData && oldData.version === STORAGE_VERSION) {
    return oldData;
  }

  // Case 2: Old single-chat array
  if (Array.isArray(oldData)) {
    return {
      version: STORAGE_VERSION,
      activeTabId: "tab-1",
      tabs: {
        "tab-1": {
          title: "Chat 1",
          messages: oldData,
        },
      },
    };
  }

  // Case 3: Unknown / corrupted
  return getDefaultState();
}


marked.setOptions({
    breaks: true,
    mangle: false,
    headerIds: false,
});

function renderMarkdown(mdText) {
    const rawHtml = marked.parse(mdText);
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    return cleanHtml;
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
}




const state = loadState();

function getActiveTab() {
  if (!state.tabs[state.activeTabId]) {
    state.activeTabId = Object.keys(state.tabs)[0];
    saveState(state);
  }
  return state.tabs[state.activeTabId];
}

function getActiveMessages() {
  return getActiveTab().messages;
}

renderTabs();
renderHistory();


function renderTabs() {
  chatTabs.innerHTML = "";

  for (const [tabId, tab] of Object.entries(state.tabs)) {
    const li = document.createElement("li");
    li.className = "nav-item";

    const btn = document.createElement("button");
    btn.className =
      "nav-link" + (tabId === state.activeTabId ? " active" : "");
    btn.type = "button";
    btn.innerText = tab.title || "Chat";

    btn.addEventListener("click", () => {
      switchTab(tabId);
      renderTabs();
    });

    const closeBtn = document.createElement("span");
    closeBtn.innerHTML = "&times;";
    closeBtn.className = "ms-2 text-muted";
    closeBtn.style.cursor = "pointer";

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTab(tabId);
      renderTabs();
    });

    btn.appendChild(closeBtn);
    li.appendChild(btn);
    chatTabs.appendChild(li);
  }
}

newTabBtn.addEventListener("click", () => {
  createNewTab();
  renderTabs();
});


function getDefaultState() {
  return {
    version: STORAGE_VERSION,
    activeTabId: "tab-1",
    tabs: {
      "tab-1": {
        title: "Chat 1",
        messages: [],
      },
    },
  };
}

function saveState(state) {
  state.version = STORAGE_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return getDefaultState();

  try {
    const parsed = JSON.parse(saved);
    const migrated = migrateState(parsed);
    saveState(migrated); // rewrite in new format
    return migrated;
  } catch {
    return getDefaultState();
  }
}


function addUserMessage(text) {
    chatLogs.innerHTML += `
    <div class="d-flex justify-content-end mb-2">
      <div class="bg-success text-white p-2 rounded-4 shadow-sm" style="max-width: 70%">
        ${escapeHTML(text)}
      </div>
    </div>
  `;
}

function addAIMessage(text, model = "AI") {
  const html = renderMarkdown(text);

  chatLogs.innerHTML += `
    <div class="d-flex justify-content-start mb-2">
      <div class="bg-light border p-2 rounded-4 shadow-sm" style="max-width: 70%">
        ${html}
        <div class="text-muted small text-end mt-1">
          ${escapeHTML(model)}
        </div>
      </div>
    </div>
  `;
}

let loadingEl = null;

function showLoading() {
    if (loadingEl) return;

    loadingEl = document.createElement("div");
    loadingEl.className = "d-flex justify-content-start mb-2";
    loadingEl.innerHTML = `
    <div class="bg-light border p-2 rounded-3 text-muted fst-italic"
         style="max-width: 70%">
      Morgan is thinking...
    </div>
  `;
    chatLogs.appendChild(loadingEl);
    chatLogs.scrollTop = chatLogs.scrollHeight;
}

function hideLoading() {
    if (!loadingEl) return;
    loadingEl.remove();
    loadingEl = null;
}

sendButton.addEventListener("click", async () => {
  const userMessage = chatTextArea.value.trim();
  if (!userMessage) return;

  const messages = getActiveMessages();

  addUserMessage(userMessage);
  chatTextArea.value = "";

  const tab = getActiveTab();
if (tab.messages.length === 0) {
tab.title = userMessage.slice(0, 20);
renderTabs();
}

  messages.push({
    role: "user",
    text: userMessage,
  });

  trimHistory(messages);
  saveState(state);

  chatLogs.scrollTop = chatLogs.scrollHeight;

  showLoading();
  sendButton.disabled = true;

  try {
    const response = await fetch(
      "https://chatgemini-zoxcu4jcta-uc.a.run.app",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: messages,
          message: userMessage,
        }),
      }
    );

    const data = await response.json();

    hideLoading();
    sendButton.disabled = false;

    addAIMessage(data.message, data.model);

    messages.push({
      role: "model",
      text: data.message,
      model: data.model,
    });

    trimHistory(messages);
    saveState(state);

    chatLogs.scrollTop = chatLogs.scrollHeight;
  } catch (err) {
    hideLoading();
    sendButton.disabled = false;
    addAIMessage("_Error: failed to get response_", "System");
  }
});

chatTextArea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

chatTextArea.addEventListener("input", () => {
    chatTextArea.style.height = "auto";
    chatTextArea.style.height = chatTextArea.scrollHeight + "px";
});

function renderHistory() {
  chatLogs.innerHTML = "";

  const messages = getActiveMessages();

  for (const msg of messages) {
    if (msg.role === "user") {
      addUserMessage(msg.text);
    } else {
      addAIMessage(msg.text, msg.model || "AI");
    }
  }

  chatLogs.scrollTop = chatLogs.scrollHeight;
}

function switchTab(tabId) {
  state.activeTabId = tabId;
  saveState(state);
  renderTabs();
  renderHistory();
  chatTextArea.focus();
}

function deleteTab(tabId) {
  if (Object.keys(state.tabs).length === 1) {
    alert("You must have at least one tab");
    return;
  }

  delete state.tabs[tabId];

  if (state.activeTabId === tabId) {
    state.activeTabId = Object.keys(state.tabs)[0];
  }

  saveState(state);
  renderTabs();
  renderHistory();
}


function createNewTab() {
  const id = "tab-" + Date.now();

  state.tabs[id] = {
    title: "New Chat",
    messages: [],
  };

  state.activeTabId = id;
  saveState(state);
  renderTabs();
  renderHistory();
}


import dayjs from "dayjs";

console.log(dayjs().format());