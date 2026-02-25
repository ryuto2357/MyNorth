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
- If you need to find a time slot, OR if you need to update or delete an event, you MUST use 'list_events' first to find the correct event ID.

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
            timeMin: {
              type: "STRING",
              description: "The start date/time in ISO string format (e.g., 2026-02-24T10:00:00Z)"
            },
            maxResults: {
              type: "INTEGER",
              description: "Maximum number of events to return"
            }
          },
          required: ["timeMin"]
        },
      },
      {
        name: "create_event",
        description: "Creates a new event in the user's Google Calendar.",
        parameters: {
          type: "OBJECT",
          properties: {
            summary: {type: "STRING", description: "The title of the event"},
            startTime: {type: "STRING", description: "Local ISO date string WITHOUT timezone offset or 'Z' (e.g., 2026-02-25T10:00:00)"},
            endTime: {type: "STRING", description: "Local ISO date string WITHOUT timezone offset or 'Z'"},
          },
          required: ["summary", "startTime", "endTime"],
        },
      },
      {
        name: "update_event",
        description: "Updates an existing event. You MUST call list_events first to find the correct eventId. Do not guess the eventId.",
        parameters: {
          type: "OBJECT",
          properties: {
            eventId: {type: "STRING", description: "The unique ID of the event to update"},
            summary: {type: "STRING", description: "The new title"},
            startTime: {type: "STRING", description: "Local ISO date string WITHOUT timezone offset or 'Z' (e.g., 2026-02-25T10:00:00)"},
            endTime: {type: "STRING", description: "Local ISO date string WITHOUT timezone offset or 'Z'"},
          },
          required: ["eventId"],
        },
      },
      {
        name: "delete_event",
        description: "Deletes an event from the user's calendar. You MUST call list_events first to find the correct eventId. Do not guess the eventId.",
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

async function performCalendarAction(toolCall, userAccessToken, userTimeZone) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: userAccessToken });
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const args = toolCall.args;

  const formatWithOffset = (dateString, targetTimeZone) => {
    if (!dateString) return dateString;
    
    // 1. Get the pure 19-char local time from the AI (e.g., '2026-02-25T10:00:00')
    const rawTime = dateString.substring(0, 19); 
    
    try {
      // 2. Parse into a temporary date object
      const date = new Date(rawTime + "Z");
      
      // 3. Extract the "face value" of the time in both UTC and the target timezone
      const utcDateString = date.toLocaleString('en-US', { timeZone: "UTC" });
      const tzDateString = date.toLocaleString('en-US', { timeZone: targetTimeZone });
      
      // 4. Convert face values back into temporary dates to do math
      const utcDate = new Date(utcDateString);
      const tzDate = new Date(tzDateString);
      
      // 5. Calculate the exact difference in minutes
      const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
      
      // 6. Format into an RFC3339 offset (e.g., "+08:00" or "-05:00")
      const sign = diffMinutes >= 0 ? '+' : '-';
      const absDiff = Math.abs(diffMinutes);
      const hours = String(Math.floor(absDiff / 60)).padStart(2, '0');
      const minutes = String(absDiff % 60).padStart(2, '0');
      
      const offset = `${sign}${hours}:${minutes}`;
      
      // Returns a perfectly formatted string: '2026-02-25T10:00:00+08:00'
      return `${rawTime}${offset}`; 
    } catch (e) {
      console.error("Timezone math error:", e);
      return dateString; 
    }
  };

  // --- LIST EVENTS ---
  if (toolCall.name === "list_events") {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    if (!res.data.items || res.data.items.length === 0) {
      return { status: "success", message: "No upcoming events found." };
    }

    // Return a structured array of objects instead of a massive string.
    // The AI parses JSON arrays perfectly.
    const eventsList = res.data.items.map(event => ({
      id: event.id,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date
    }));

    return { status: "success", events: eventsList };
  }

  // --- CREATE EVENT ---
  if (toolCall.name === "create_event") {
    const event = {
      summary: args.summary,
      start: { dateTime: formatWithOffset(args.startTime, userTimeZone), timeZone: userTimeZone },
      end: { dateTime: formatWithOffset(args.endTime, userTimeZone), timeZone: userTimeZone },
    };
    const res = await calendar.events.insert({ calendarId: 'primary', resource: event });
    return { 
      status: "success", 
      message: "Event created successfully.",
      link: res.data.htmlLink,
      eventId: res.data.id
    };
  }

  // --- UPDATE EVENT ---
  if (toolCall.name === "update_event") {
    const patchBody = {};
    if (args.summary) patchBody.summary = args.summary;
    if (args.startTime) patchBody.start = { dateTime: formatWithOffset(args.startTime, userTimeZone), timeZone: userTimeZone };
    if (args.endTime) patchBody.end = { dateTime: formatWithOffset(args.endTime, userTimeZone), timeZone: userTimeZone };

    const res = await calendar.events.patch({
      calendarId: 'primary',
      eventId: args.eventId,
      resource: patchBody
    });
    
    return { 
      status: "success", 
      message: "Event updated successfully.",
      link: res.data.htmlLink 
    };
  }

  // --- DELETE EVENT ---
  if (toolCall.name === "delete_event") {
    await calendar.events.delete({ calendarId: 'primary', eventId: args.eventId });
    return { 
      status: "success", 
      message: `Event with ID ${args.eventId} deleted successfully.` 
    };
  }

  // Fallback if the tool name doesn't match
  return { status: "error", message: "Unknown function called." };
}

exports.chatGemini = onRequest({
  cors: true, secrets: [GEMINI_API_KEY, DEEPSEEK_API_KEY],
}, async (req, res) => {
  const {history = [], message, accessToken, timeZone = "UTC"} = req.body;
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
    
    // 1. Add dynamic time to the system prompt
    const currentDate = new Date().toLocaleString("en-US", { timeZone: timeZone });
    const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\nThe current date and time is: ${currentDate}.`;

    const config = {
      systemInstruction: dynamicSystemPrompt,
      tools: tools,
      temperature: 0.2
    };

    // 2. Build the initial contents array from history and the new message
    let contents = history.map((m) => ({
      role: normalizeRoleGemini(m.role), // Ensure role is 'user' or 'model'
      parts: [{text: m.text}],
    }));
    
    contents.push({ 
      role: 'user', 
      parts: [{text: message}] 
    });

    // 3. Make the initial call using generateContent instead of chat
    let response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: config
    });

    let maxTurns = 5;

    // 4. The Execution Loop
    while (response.functionCalls && response.functionCalls.length > 0 && maxTurns > 0) {
      maxTurns--;
      const functionCall = response.functionCalls[0];
      console.log("Calling tool:", functionCall.name);

      // Step A: Append the model's function call request to the contents history
      contents.push(response.candidates[0].content);

      try {
        let toolResult = await performCalendarAction(functionCall, accessToken, timeZone);
        if (!toolResult) toolResult = { result: "Action completed." };

        // Step B: Append the tool's result to the contents history as a 'user' role
        contents.push({ 
          role: 'user', 
          parts: [{ 
            functionResponse: {
              name: functionCall.name,
              response: toolResult 
            }
          }] 
        });

      } catch (err) {
        console.error("Tool execution error:", err);
        // If it fails, push the error back so the AI knows
        contents.push({ 
          role: 'user', 
          parts: [{ 
            functionResponse: {
              name: functionCall.name,
              response: { error: err.message } 
            }
          }] 
        });
      }

      // Step C: Trigger the model again with the newly updated contents array
      response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: config
      });
    }

    // 5. Extract the final text once there are no more function calls
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
        role: normalizeRoleDeepSeek(m.role),
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

function normalizeRoleDeepSeek(role) {
  const r = role.toLowerCase();
  if (r === "model" || r === "ai" || r === "assistant") return "assistant";
  if (r === "human" || r === "user") return "user";
  if (r === "system") return "system";
  return "user"; // fallback
}

function normalizeRoleGemini(role) {
  const r = role.toLowerCase();
  // Gemini STRICTLY accepts "user" or "model" in the contents array
  if (r === "model" || r === "ai" || r === "assistant") return "model";
  if (r === "human" || r === "user") return "user";
  return "user"; // fallback
}
