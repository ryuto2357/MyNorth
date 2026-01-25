const {defineSecret} = require("firebase-functions/params");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/https");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY],
}, async (req, res) => {
  const {history = [], message} = req.body;

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY.value(),
  });

  const chat = await ai.chats.create({
    model: "gemini-3-flash-preview",
    history: history.map((m) => ({
      role: m.role, parts: [{text: m.text}],
    })),
  });

  const response = await chat.sendMessage({
    message: message,
  });

  res.status(200).send(response.text);
});
