const {defineSecret} = require("firebase-functions/params");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/https");
const {OpenAI} = require("openai");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");

const SYSTEM_PROMPT = `
You are a helpful assistant. If you are asked your identity, you are Morgan, an AI language model created to assist users with their questions and tasks.
Do not mention any other AI models or services.

When answering questions, provide clear and concise explanations. If the question involves multiple steps or complex reasoning, break down your response into manageable parts.

STRICT FORMAT RULES (MANDATORY):

1. You MUST NOT use LaTeX, MathJax, or KaTeX under any circumstance.
2. You MUST NOT use:
   - \\int
   - \\frac
   - subscripts like _{ }
   - superscripts like ^{ }
   - brackets like \\left or \\right
3. You MUST NOT use math symbols such as:
   ∫ ∑ √ ≤ ≥ ≠
4. You MUST write ALL math in plain text ONLY.

ALLOWED math examples:
- x^2
- 3x + 5
- (x + 1)(x - 2)
- sqrt(x)
- a/b

DISALLOWED examples (NEVER use):
- \\int x dx
- \\frac{a}{b}
- x^{2}
- ∫_0^2
- [ x^2 ]_0^2

STYLE RULES:

- Explain step by step.
- Use very simple English (like teaching a 13-year-old).
- No jargon unless explained.
- No fancy formatting.
- No diagrams made with symbols.
- Use normal sentences and numbered steps only.

SELF-CHECK RULE (VERY IMPORTANT):

Before sending the final answer:
- Check if ANY forbidden symbol or LaTeX-style formatting appears.
- If yes, REWRITE the entire answer using plain text only.

If you break any rule above, the response is considered incorrect and must be rewritten.
`;

function buildSystemPrompt(planContext) {
  if (!planContext) return SYSTEM_PROMPT;

  return `
  You are Morgan, an AI planning assistant inside MyNorth.

  User current plan:
  Goal: ${planContext.goal}
  Duration: ${planContext.durationMonths} months
  Level: ${planContext.level}
  Progress: ${planContext.progress || 0} percent completed

  Your job:
  - Help the user achieve this goal.
  - Give practical daily advice.
  - Adjust suggestions based on progress.
  - Encourage consistency.
  - Be supportive but realistic.

  ${SYSTEM_PROMPT}
`;
}

exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
}, async (req, res) => {
  const {history = [], message, planContext} = req.body;
  if (!message) {
    return res.status(400).send("Message is required");
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY.value(),
  });
  const dynamicSystemPrompt = buildSystemPrompt(planContext);

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
    try {
      finalText = await callDeepSeek(message, history, dynamicSystemPrompt);
    } catch (error) {
      res.status(200).json({
        model: "System",
        message: error.message || "Error calling DeepSeek API",
      });
      return;
    }
  } else {
    const chat = await ai.chats.create({
      model: "gemini-3-flash-preview",
      history: history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{text: m.text}],
      })),
    });

    const response = await chat.sendMessage({
      message: message,
      config: {
        systemInstruction: dynamicSystemPrompt,
      },
    });

    finalText = response.text;
  }

  res.status(200).json({
    model: "Morgan",
    message: finalText,
  });
});

async function callDeepSeek(message, history, dynamicSystemPrompt) {
  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: DEEPSEEK_API_KEY.value(),
  });

  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: dynamicSystemPrompt,
      },
      ...history.map((m) => ({
        role: normalizeRole(m.role),
        content: m.text,
      })),
      {
        role: "user",
        content: message,
      },
    ],
  });

  return completion.choices[0].message.content;
}

function normalizeRole(role) {
  if (role === "model" || role === "ai" || role === "assistant") {
    return "assistant";
  }
  if (role === "human" || role === "user") {
    return "user";
  }
  if (role === "system") {
    return "system";
  }
  return "user"; // fallback
}


const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

// 🔐 Secure secret
const openaiKey = defineSecret("OPENAI_API_KEY");

exports.generateRoadmap = onCall(
    {
      secrets: [openaiKey],
    },
    async (req) => {
      const {auth, data} = req;

      if (!auth) {
        throw new HttpsError("unauthenticated", "Login required.");
      }

      const {planId, goal, durationMonths, level} = data;
      const uid = auth.uid;

      if (!planId || !goal || !durationMonths || !level) {
        throw new HttpsError("invalid-argument", "Missing fields.");
      }

      const client = new OpenAI({
        apiKey: openaiKey.value(),
      });

      let completion;

      try {
        completion = await client.responses.create({
          model: "gpt-4o-2024-08-06",
          input: [
            {
              role: "system",
              content: "You are Morgan. Generate structured roadmap only.",
            },
            {
              role: "user",
              content: `
Goal: ${goal}
Duration (months): ${durationMonths}
Level: ${level}

Rules:
- Sequential
- Equal weight
- No explanation outside JSON
`,
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "roadmap_schema",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        title: {type: "string"},
                        description: {type: "string"},
                      },
                      required: ["title", "description"],
                    },
                  },
                },
                required: ["tasks"],
              },
            },
          },
        });
      } catch (err) {
        console.error("OpenAI error:", err);
        throw new HttpsError("internal", "AI request failed.");
      }

      // 🔹 Handle incomplete
      if (
        completion.status === "incomplete" &&
      completion.incomplete_details.reason === "max_output_tokens"
      ) {
        throw new HttpsError("internal", "AI response incomplete.");
      }

      const content = completion.output[0].content[0];

      if (!content) {
        throw new HttpsError("internal", "No AI response.");
      }

      // 🔹 Handle refusal
      if (content.type === "refusal") {
        console.error("AI refusal:", content.refusal);
        throw new HttpsError("internal", "AI refused request.");
      }

      if (content.type !== "output_text") {
        throw new HttpsError("internal", "Unexpected AI output type.");
      }

      let result;

      try {
        result = JSON.parse(content.text);
      } catch (err) {
        console.error("JSON parse error:", err);
        throw new HttpsError("internal", "Invalid AI JSON.");
      }

      if (!result.tasks || !Array.isArray(result.tasks)) {
        throw new HttpsError("internal", "Invalid roadmap structure.");
      }

      // 🔹 Batch write tasks
      const batch = db.batch();

      result.tasks.forEach((task, index) => {
        const taskRef = db
            .collection("users")
            .doc(uid)
            .collection("plans")
            .doc(planId)
            .collection("tasks")
            .doc();

        batch.set(taskRef, {
          orderIndex: index,
          title: task.title,
          description: task.description,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          completedAt: null,
        });
      });

      try {
        await batch.commit();
      } catch (err) {
        console.error("Firestore write error:", err);
        throw new HttpsError("internal", "Failed to save tasks.");
      }

      return {success: true};
    },
);
