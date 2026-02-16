const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {OpenAI} = require("openai");

const openaiKey = defineSecret("OPENAI_API_KEY");

exports.chatMorgan = onCall(
    {
      region: "us-central1",
      secrets: [openaiKey],
    },
    async (req) => {
      const {auth, data} = req;

      if (!auth) {
        throw new HttpsError("unauthenticated", "Login required.");
      }

      const {message, history, planContext, tasks} = data;

      if (!message || !planContext || !tasks) {
        throw new HttpsError("invalid-argument", "Missing required fields.");
      }

      const client = new OpenAI({
        apiKey: openaiKey.value(),
      });

      const activeTask = tasks
          .filter((t) => t.status === "pending")
          .sort((a, b) => a.orderIndex - b.orderIndex)[0];

      if (!activeTask) {
        return {
          type: "NORMAL_REPLY",
          message: "All tasks are completed. Create a new plan.",
        };
      }

      const now = new Date();
      const todayISO = now.toISOString().split("T")[0];


      const systemPrompt = `
You are Morgan.

CURRENT DATE CONTEXT:
Today is: ${todayISO}
Time zone: Asia/Jakarta.

If user mentions relative time like:
- today
- tomorrow
- next week

You MUST calculate ISO datetime correctly relative to today's date.

Always use future dates.
Never use past dates unless user explicitly asks.


You are part of a deterministic state machine.

You have TWO responsibilities:

1) Evaluate ONLY the current active task for completion.
2) If user asks to schedule something on calendar,
   you may propose a calendar event.

STRICT RULES:

TASK RULES:
- Only evaluate current active task.
- Strong completion phrases required.
- Never assume completion.
- Never mention other tasks.

CALENDAR RULES:
- If user explicitly asks to schedule, plan, or add something to calendar,
  return PROPOSE_CREATE_CALENDAR_EVENT.
- Extract:
  - title
  - description
  - startISO (ISO datetime)
  - endISO (ISO datetime)
- Do NOT auto-confirm.
- Always ask for confirmation.

Allowed response types:
- NORMAL_REPLY
- ASK_CLARIFICATION
- PROPOSE_TASK_COMPLETION
- PROPOSE_CREATE_CALENDAR_EVENT

Current Active Task:
Title: ${activeTask.title}
Description: ${activeTask.description || "No description"}

Return strictly valid JSON.

If PROPOSE_CREATE_CALENDAR_EVENT:

{
  "type": "PROPOSE_CREATE_CALENDAR_EVENT",
  "message": "Do you want me to add this to your Google Calendar?",
  "payload": {
    "title": "Event title",
    "description": "Event description",
    "startISO": "2026-02-18T09:00:00",
    "endISO": "2026-02-18T11:00:00"
  }
}

Otherwise:

{
  "type": "...",
  "message": "..."
}
`;

      const completion = await client.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        temperature: 0,
        response_format: {type: "json_object"},
        messages: [
          {role: "system", content: systemPrompt},
          ...(history || []).map((m) => ({
            role: m.role,
            content: m.text,
          })),
          {role: "user", content: message},
        ],
      });

      const aiRaw = completion.choices[0].message.content;

      let aiResponse;

      try {
        aiResponse = JSON.parse(aiRaw);
      } catch (err) {
        logger.error("Invalid JSON from AI:", aiRaw);
        return {
          type: "ASK_CLARIFICATION",
          message: "Can you clarify what you mean?",
        };
      }

      const allowedTypes = [
        "NORMAL_REPLY",
        "ASK_CLARIFICATION",
        "PROPOSE_TASK_COMPLETION",
        "PROPOSE_CREATE_CALENDAR_EVENT",
      ];

      if (!allowedTypes.includes(aiResponse.type)) {
        return {
          type: "ASK_CLARIFICATION",
          message: "Tell me more clearly.",
        };
      }

      if (aiResponse.type === "PROPOSE_TASK_COMPLETION") {
        aiResponse.taskId = activeTask.id;
      }

      return aiResponse;
    },
);
