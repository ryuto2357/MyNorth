const chatTextArea = document.getElementById("chatTextArea");
const sendButton = document.getElementById("sendButton");
const chatLogs = document.getElementById("chatLogs");

const chatHistory = [];

function addUserMessage(text) {
  chatLogs.innerHTML += `
    <div class="d-flex justify-content-end mb-2">
      <div class="bg-success text-white p-2 rounded-3" style="max-width: 70%">
        ${text}
      </div>
    </div>
  `;
}

function addAIMessage(text) {
  chatLogs.innerHTML += `
    <div class="d-flex justify-content-start mb-2">
      <div class="bg-light border p-2 rounded-3" style="max-width: 70%">
        ${text}
      </div>
    </div>
  `;
}

sendButton.addEventListener("click", async () => {
  const userMessage = chatTextArea.value.trim();
  if (!userMessage) return;

  // 1️⃣ show user message
  addUserMessage(userMessage);
  chatTextArea.value = "";

  // 2️⃣ save user message to history
  chatHistory.push({
    role: "user",
    text: userMessage,
  });

  chatLogs.scrollTop = chatLogs.scrollHeight;

  // 3️⃣ send history + new message to backend
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

  const data = await response.text();

  // 4️⃣ show AI reply
  addAIMessage(data);

  // 5️⃣ save AI reply to history
  chatHistory.push({
    role: "model",
    text: data,
  });

  chatLogs.scrollTop = chatLogs.scrollHeight;
});

