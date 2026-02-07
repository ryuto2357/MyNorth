const {defineSecret} = require("firebase-functions/params");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/https");
const {OpenAI} = require("openai");

// to use console.log()
require("firebase-functions/logger/compat");

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
- Use formatting (headers, bold/italic text, etc).
- No diagrams made with symbols.
- Use normal sentences and numbered steps only.

SELF-CHECK RULE (VERY IMPORTANT):

Before sending the final answer:
- Check if ANY forbidden symbol or LaTeX-style formatting appears.
- If yes, REWRITE the entire answer using plain text only.

If you break any rule above, the response is considered incorrect and must be rewritten.
`;


exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
}, async (req, res) => {
  const {history = [], message, userStats} = req.body;
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
  - PLANNING: task generation, scheduling, setting goals (anything that requires time to do)

  Reply with ONLY one word:
  SIMPLE, COMPLEX, or PLANNING

  User message:
  "${message}"
  `;

  const classificationResult = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: classificationPrompt,
  });

  const decision = classificationResult.text.trim().toUpperCase();

  console.log(decision);

  let finalText;

  if (decision.includes("COMPLEX")) {
    try {
      finalText = await callDeepSeek(message, history);
    } catch (error) {
      res.status(200).json({
        model: "System",
        message: error.message || "Error calling DeepSeek API",
      });
      return;
    }
  } else if (decision.includes("PLANNING")) {
    try {
      finalText = await planAI(message, history, userStats);
    } catch (error) {
      res.status(200).json({
        model: "System",
        message: error.message || "Error calling Gemini API",
      });
      return;
    }
  } else {
    const chat = await ai.chats.create({
      model: "gemini-3-flash-preview",
      history: history.map((m) => ({
        role: m.role, parts: [{text: m.text}],
      })),
    });

    const response = await chat.sendMessage({
      message: message,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    finalText = response.text;
  }

  res.status(200).json({
    model: "Morgan",
    message: finalText,
  });
});

async function planAI(message, history, userStats) {
  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY.value(),
  });
  
  const formulaPrompt = `
  Based on these variables:
  - h = Hours Remaining: ${userStats.hoursRemaining}
  - d = Deadline (in days): ${userStats.deadline}
  - f = Free Time / day (in hours): ${userStats.freeTime}
  - s = Familiarity (out of 10): ${userStats.skill}
  - h = Adherence (out of 100%): ${userStats.adherence}
  - D = Daily Load (in hours): ${userStats.dailyLoad()}

  For each variable, state their value and what do they mean.
  Then, explain what kind of tasks should be generated for the user.
  `;

  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: formulaPrompt,
  });

  return result;
}

async function callDeepSeek(message, history) {
  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: DEEPSEEK_API_KEY.value(),
  });

  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
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
