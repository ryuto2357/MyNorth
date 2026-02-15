const {defineSecret} = require("firebase-functions/params");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/https");
const {OpenAI} = require("openai");
const {google} = require("googleapis");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const DEEPSEEK_API_KEY = defineSecret("DEEPSEEK_API_KEY");

const SYSTEM_PROMPT = `
You are a helpful assistant. If you are asked your identity, you are Morgan, an AI language model created to assist users with their questions and tasks.
Do not mention any other AI models or services.

CAPABILITIES:
- You HAVE access to the user's Google Calendar via the provided tools.
- You CAN list, create, update, and delete events.
- If the user asks to schedule, move, or delete an event, ALWAYS use the tools provided. Do not make excuses.
- If you need to find a time slot, use 'list_events' first.

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

const CALENDAR_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "list_events",
        description: "Lists the next 10 upcoming events to check availability or find an event ID.",
        parameters: {
          type: "OBJECT",
          properties: {
            // No strict parameters needed, but we can allow optional ones if we want
          },
        },
      },
      {
        name: "create_event",
        description: "Creates a new event in the user's Google Calendar.",
        parameters: {
          type: "OBJECT",
          properties: {
            summary: {type: "STRING", description: "The title of the event"},
            startTime: {type: "STRING", description: "ISO date string for start time (e.g., 2023-10-27T10:00:00)"},
            endTime: {type: "STRING", description: "ISO date string for end time"},
          },
          required: ["summary", "startTime", "endTime"],
        },
      },
      {
        name: "update_event",
        description: "Updates an existing event. You must provide the eventId and the fields you want to change.",
        parameters: {
          type: "OBJECT",
          properties: {
            eventId: {type: "STRING", description: "The unique ID of the event to update"},
            summary: {type: "STRING", description: "The new title (optional)"},
            startTime: {type: "STRING", description: "The new start time ISO string (optional)"},
            endTime: {type: "STRING", description: "The new end time ISO string (optional)"},
          },
          required: ["eventId"],
        },
      },
      {
        name: "delete_event",
        description: "Deletes an event from the user's calendar. You usually need to list events first to get the ID.",
        parameters: {
          type: "OBJECT",
          properties: {
            eventId: {type: "STRING", description: "The unique ID of the event to delete"},
          },
          required: ["eventId"],
        },
      },
    ],
  },
];

async function performCalendarAction(toolCall, userAccessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: userAccessToken });
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const args = toolCall.args;

  // --- NEW: LIST EVENTS ---
  if (toolCall.name === "list_events") {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(), // List events from now onwards
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    if (res.data.items.length === 0) {
      return "No upcoming events found.";
    }

    // Format the list so the AI can read it easily
    return res.data.items.map(event => {
      const start = event.start.dateTime || event.start.date;
      return `ID: ${event.id} | Title: ${event.summary} | Start: ${start}`;
    }).join("\n");
  }

  // --- EXISTING: CREATE EVENT ---
  if (toolCall.name === "create_event") {
    const event = {
      summary: args.summary,
      start: { dateTime: args.startTime },
      end: { dateTime: args.endTime },
    };
    const res = await calendar.events.insert({ calendarId: 'primary', resource: event });
    return `Event created! Link: ${res.data.htmlLink}`;
  }

  // --- NEW: UPDATE EVENT ---
  if (toolCall.name === "update_event") {
    // We construct a "patch" object containing ONLY the fields the AI wants to change
    const patchBody = {};
    if (args.summary) patchBody.summary = args.summary;
    if (args.startTime) patchBody.start = { dateTime: args.startTime };
    if (args.endTime) patchBody.end = { dateTime: args.endTime };

    // Use 'patch' instead of 'update' to avoid overwriting missing fields
    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId: args.eventId,
      resource: patchBody
    });
    
    return `Event updated successfully! New Link: ${res.data.htmlLink}`;
  }

  // --- EXISTING: DELETE EVENT ---
  if (toolCall.name === "delete_event") {
    await calendar.events.delete({ calendarId: 'primary', eventId: args.eventId });
    return `Event with ID ${args.eventId} deleted successfully.`;
  }
}

exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
}, async (req, res) => {
  const {history = [], message, accessToken} = req.body;
  if (!message) {
    return res.status(400).send("Message is required");
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY.value(),
  });

  const classificationPrompt = `
  Classify the user message.

  Rules:
  - SIMPLE: casual chat, short answers, basic explanations, scheduling, planning
  - COMPLEX: coding, math, multi-step reasoning, long analysis

  CRITICAL OVERRIDE:
  If the message mentions "calendar", "schedule", "meeting", "appointment", "event", or "remind", you MUST classify it as SIMPLE.

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
      finalText = await callDeepSeek(message, history);
    } catch (error) {
      res.status(200).json({
        model: "System",
        message: error.message || "Error calling DeepSeek API",
      });
      return;
    }
  } else {
    const tools = accessToken ? CALENDAR_TOOLS : undefined;
    
    const chat = await ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: tools,
      },
      history: history.map((m) => ({
        role: m.role, parts: [{text: m.text}],
      })),
    });

    const response = await chat.sendMessage({
      message: message,
    });

    const functionCall = response.functionCalls?.[0];

    let maxTurns = 5;

    while (functionCall && maxTurns > 0) {
      maxTurns--;
      console.log("Calling tool:", functionCall.name);

      try {
        // Run the tool
        let toolResult = await performCalendarAction(functionCall, accessToken);
        
        // Safety checks for the result
        if (toolResult === undefined || toolResult === null) toolResult = "Done.";
        if (typeof toolResult !== 'string') toolResult = JSON.stringify(toolResult);

        // Build the response part
        const responsePart = {
          functionResponse: {
            name: functionCall.name,
            response: { result: toolResult }
          }
        };

        // Send the tool result back to the model
        // The model will then decide: Answer with text OR call another tool?
        response = await chat.sendMessage([responsePart]);
        
        // Check if the NEW response is another function call
        functionCall = response.functionCalls?.[0];

      } catch (err) {
        console.error("Tool execution error:", err);
        // If a tool fails, tell the model so it can apologize
        const errorPart = {
           functionResponse: {
             name: functionCall.name,
             response: { result: "Error: " + err.message } 
           }
        };
        response = await chat.sendMessage([errorPart]);
        functionCall = null; // Stop looping on error
      }
    }
    finalText = response.text;
  }

  res.status(200).json({
    model: "Morgan",
    message: finalText,
  });
});

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
