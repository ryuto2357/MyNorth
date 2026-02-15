// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================

// --- Google Config ---
const CLIENT_ID = '860390455759-vl0hc76obsfgne5f38182q77lsfigomh.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDePihMOrxvx9BiuP3wHRFMFhzMc7Uk6xY';
const SCOPES = 'https://www.googleapis.com/auth/calendar'; 

// --- Chat State ---
const STORAGE_VERSION = 2;
const STORAGE_KEY = "mynorth_chat";
const MAX_MESSAGES = 20;

let tokenClient;
let gapiInited = false;
let gisInited = false;
let calendar; // FullCalendar instance

// UI Elements
const chatTextArea = document.getElementById("chatTextArea");
const sendButton = document.getElementById("sendButton");
const chatLogs = document.getElementById("chatLogs");
const chatTabs = document.getElementById("chatTabs");
const newTabBtn = document.getElementById("newTabBtn");
const themeToggle = document.getElementById("themeToggle");
const authButton = document.getElementById('authorize_button');

// ==========================================
// 2. GOOGLE AUTHENTICATION LOGIC
// ==========================================

function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
    });
    gapiInited = true;
    maybeEnableButtons();
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined dynamically in handleAuthClick
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    authButton.style.display = 'block';
    initFullCalendar(); 
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error) {
      throw resp;
    }
    gapi.client.setToken(resp);

    // Success
    authButton.innerText = "Signed In";
    authButton.classList.remove("btn-primary");
    authButton.classList.add("btn-success");
    authButton.disabled = true;
    
    // Refresh calendar to fetch private events
    calendar.refetchEvents();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// ==========================================
// 3. CALENDAR LOGIC (FullCalendar)
// ==========================================

function initFullCalendar() {
  var calendarEl = document.getElementById('calendar');

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    height: '100%',
    
    // Custom Event Fetcher
    events: async function(info, successCallback, failureCallback) {
      // If not logged in, return empty
      if (!gapi.client.getToken()) {
         successCallback([]);
         return;
      }

      try {
        const response = await gapi.client.calendar.events.list({
          'calendarId': 'primary',
          'timeMin': info.startStr,
          'timeMax': info.endStr,
          'showDeleted': false,
          'singleEvents': true,
          'maxResults': 100,
          'orderBy': 'startTime'
        });

        const events = response.result.items.map(event => {
          return {
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            url: event.htmlLink,
            backgroundColor: '#198754', // Bootstrap success color
            borderColor: '#198754'
          };
        });

        successCallback(events);
      } catch (err) {
        console.error("Error fetching events", err);
        failureCallback(err);
      }
    }
  });

  calendar.render();
}

// ==========================================
// 4. CHAT LOGIC
// ==========================================

// --- Markdown Setup ---
marked.setOptions({ breaks: true, mangle: false, headerIds: false });

function renderMarkdown(mdText) {
    const rawHtml = marked.parse(mdText);
    return DOMPurify.sanitize(rawHtml);
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
}

// --- State Management ---
const state = loadState();

function getDefaultState() {
  return {
    version: STORAGE_VERSION,
    activeTabId: "tab-1",
    tabs: { "tab-1": { title: "Chat 1", messages: [] } },
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return getDefaultState();
  try {
    const parsed = JSON.parse(saved);
    // Simple migration check
    if (!parsed.tabs) return getDefaultState();
    return parsed;
  } catch {
    return getDefaultState();
  }
}

function saveState(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function getActiveTab() {
  if (!state.tabs[state.activeTabId]) {
    state.activeTabId = Object.keys(state.tabs)[0];
  }
  return state.tabs[state.activeTabId];
}

function trimHistory(messages) {
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }
}

// --- Rendering ---
function renderTabs() {
  chatTabs.innerHTML = "";
  for (const [tabId, tab] of Object.entries(state.tabs)) {
    const li = document.createElement("li");
    li.className = "nav-item";
    
    const btn = document.createElement("button");
    btn.className = "nav-link" + (tabId === state.activeTabId ? " active" : "");
    btn.innerText = tab.title || "Chat";
    btn.onclick = () => switchTab(tabId);

    // Delete X (if not only tab)
    if (Object.keys(state.tabs).length > 1) {
        const closeBtn = document.createElement("span");
        closeBtn.innerHTML = "&times;";
        closeBtn.className = "ms-2 text-muted small";
        closeBtn.onclick = (e) => { e.stopPropagation(); deleteTab(tabId); };
        btn.appendChild(closeBtn);
    }
    
    li.appendChild(btn);
    chatTabs.appendChild(li);
  }
}

function renderHistory() {
  chatLogs.innerHTML = "";
  const messages = getActiveTab().messages;
  
  for (const msg of messages) {
    if (msg.role === "user") addUserMessage(msg.text);
    else addAIMessage(msg.text, msg.model || "AI");
  }
  chatLogs.scrollTop = chatLogs.scrollHeight;
}

function addUserMessage(text) {
    chatLogs.innerHTML += `
    <div class="d-flex justify-content-end mb-2">
      <div class="bg-success text-white p-2 rounded-4 shadow-sm" style="max-width: 85%">
        ${escapeHTML(text)}
      </div>
    </div>`;
}

function addAIMessage(text, model = "AI") {
  chatLogs.innerHTML += `
    <div class="d-flex justify-content-start mb-2">
      <div class="bg-light border p-2 rounded-4 shadow-sm" style="max-width: 85%">
        ${renderMarkdown(text)}
        <div class="text-muted small text-end mt-1" style="font-size: 0.7rem;">${escapeHTML(model)}</div>
      </div>
    </div>`;
}

// --- Interaction ---
function switchTab(id) {
    state.activeTabId = id;
    saveState(state);
    renderTabs();
    renderHistory();
}

function deleteTab(id) {
    delete state.tabs[id];
    if (state.activeTabId === id) state.activeTabId = Object.keys(state.tabs)[0];
    saveState(state);
    renderTabs();
    renderHistory();
}

newTabBtn.onclick = () => {
    const id = "tab-" + Date.now();
    state.tabs[id] = { title: "New Chat", messages: [] };
    switchTab(id);
};

// --- Sending Messages (THE INTEGRATION POINT) ---
sendButton.addEventListener("click", async () => {
  const userMessage = chatTextArea.value.trim();
  if (!userMessage) return;

  // UI Updates
  addUserMessage(userMessage);
  chatTextArea.value = "";
  
  const tab = getActiveTab();
  if (tab.messages.length === 0) {
      tab.title = userMessage.slice(0, 15) + "...";
      renderTabs();
  }
  
  tab.messages.push({ role: "user", text: userMessage });
  trimHistory(tab.messages);
  saveState(state);
  
  // Loading State
  const loadingDiv = document.createElement("div");
  loadingDiv.innerHTML = `<div class="text-muted fst-italic ms-2">Morgan is thinking...</div>`;
  chatLogs.appendChild(loadingDiv);
  chatLogs.scrollTop = chatLogs.scrollHeight;
  sendButton.disabled = true;

  try {
    // 1. GET THE TOKEN
    // We check if the user is logged in via Google. If so, we grab the token.
    const tokenObj = gapi.client.getToken();
    const accessToken = tokenObj ? tokenObj.access_token : null;
    // 2. SEND TO BACKEND
    // "https://chatgemini-zoxcu4jcta-uc.a.run.app"
    const response = await fetch(
      "http://127.0.0.1:5001/mynorthhub/us-central1/chatGemini",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: tab.messages,
          message: userMessage,
          accessToken: accessToken
        }),
      }
    );

    const data = await response.json();

    // 3. HANDLE RESPONSE
    loadingDiv.remove();
    addAIMessage(data.message, data.model);
    
    tab.messages.push({ role: "model", text: data.message, model: data.model });
    trimHistory(tab.messages);
    saveState(state);

    // 4. REFRESH CALENDAR
    // If the AI just created an event, we want to see it immediately.
    if (calendar && accessToken) {
        calendar.refetchEvents();
    }

  } catch (err) {
    loadingDiv.remove();
    addAIMessage("_Error connecting to Morgan._");
    console.error(err);
  } finally {
    sendButton.disabled = false;
    chatLogs.scrollTop = chatLogs.scrollHeight;
  }
});

// Enter key to send
chatTextArea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

// Theme Logic
function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("mynorth_theme", theme);
  themeToggle.innerText = theme === "dark" ? "☀️" : "🌙";
}
themeToggle.onclick = () => {
    const current = document.body.getAttribute("data-theme") || "light";
    setTheme(current === "dark" ? "light" : "dark");
};
// Init
loadTheme();
renderTabs();
renderHistory();

function loadTheme() {
    const saved = localStorage.getItem("mynorth_theme") || "light";
    setTheme(saved);
}