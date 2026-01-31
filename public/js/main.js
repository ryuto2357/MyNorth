import katex from 'katex';
import 'katex/dist/katex.min.css';

const STORAGE_KEY = "mynorth_chat";
const MAX_MESSAGES = 20;
function trimHistory() {
  if (chatHistory.length > MAX_MESSAGES) {
    chatHistory.splice(0, chatHistory.length - MAX_MESSAGES);
  }
}

function saveChat() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
}

function loadChat() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    try {
        return JSON.parse(saved);
    } catch {
        return [];
    }
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

function renderMath(text) {
  const regex = /\[([\s\S]*?)\]|\(([\s\S]*?)\)/g;

  return text.replace(regex, (match, displayMath, inlineMath) => {
    const latex = displayMath || inlineMath;
    const isBlockDisplay = !!displayMath;

    latex = latex ? latex.trim() : "";

    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: isBlockDisplay,
      });
    } catch (err) {
      return;
    }
  });
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
}


const chatTextArea = document.getElementById("chatTextArea");
const sendButton = document.getElementById("sendButton");
const chatLogs = document.getElementById("chatLogs");

const chatHistory = loadChat();
renderHistory();

function addUserMessage(text) {
    chatLogs.innerHTML += `
    <div class="d-flex justify-content-end mb-2">
      <div class="bg-success text-white p-2 rounded-3" style="max-width: 70%">
        ${escapeHTML(text)}
      </div>
    </div>
  `;
}

function addAIMessage(text, model = "AI") {
  const html = renderMath(renderMarkdown(text));

  chatLogs.innerHTML += `
    <div class="d-flex justify-content-start mb-2">
      <div class="bg-light border p-2 rounded-3" style="max-width: 70%">
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
      AI is typing…
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

    addUserMessage(userMessage);
    chatTextArea.value = "";

    chatHistory.push({
        role: "user",
        text: userMessage,
    });
    trimHistory();
    saveChat();

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
                    history: chatHistory,
                    message: userMessage,
                }),
            }
        );

        const data = await response.json();

        hideLoading();
        sendButton.disabled = false;
        addAIMessage(data.message, data.model);

        chatHistory.push({
            role: "model",
            text: data.message,
            model: data.model,
        });
        trimHistory();
        saveChat();
        chatLogs.scrollTop = chatLogs.scrollHeight;

    } catch (err) {
        hideLoading();
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

    for (const msg of chatHistory) {
        if (msg.role === "user") {
            addUserMessage(msg.text);
        } else {
            addAIMessage(msg.text, msg.model || "AI");
        }
    }

    chatLogs.scrollTop = chatLogs.scrollHeight;
}
