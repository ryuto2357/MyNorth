const {defineSecret} = require("firebase-functions/params");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/https");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");


exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
}, async (req, res) => {
  const {history = [], message} = req.body;
  if (!message) {
    return res.status(400).send("Message is required");
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY.value(),
  });

  const classificationPrompt = `
  Classify the user message.

  Rules:
  - SIMPLE: casual chat, short answers, basic explanations
  - COMPLEX: coding, math, multi-step reasoning, long analysis

  Reply with ONLY one word:
  SIMPLE or COMPLEX

  User message:
  "${message}"
  `;

  const classificationResult = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: classificationPrompt,
  });

  const decision = classificationResult.text.trim().toUpperCase();

  let finalText;

  if (decision == "COMPLEX") {
    finalText = await callDeepSeek(message, history);
  } else {
    const chat = await ai.chats.create({
      model: "gemini-3-flash-preview",
      history: history.map((m) => ({
        role: m.role, parts: [{text: m.text}],
      })),
    });

    const response = await chat.sendMessage({
      message: message,
    });

    finalText = response.text;
  }


  res.status(200).send(finalText);
});

async function callDeepSeek(message, history) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        ...history.map((m) => ({
          role: m.role,
          content: m.text,
        })),
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  const data = await response.json();

  return data.choices[0].message.content;
}
