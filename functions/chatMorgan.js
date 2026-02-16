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

      const systemPrompt = `
You are Morgan.

You are part of a deterministic state machine.

You MUST ONLY evaluate the current active task.

You MUST follow these rules strictly:

1. If the user clearly states the task is finished, completed, or fully done,
   you MUST return PROPOSE_TASK_COMPLETION.

   Strong completion phrases include:
   - "I finished"
   - "I completed"
   - "It is done"
   - "I fully completed"
   - "I am completely done"

2. If the user describes partial progress,
   you MUST return ASK_CLARIFICATION.

3. Never assume completion without strong completion language.

4. Never mention other tasks.

5. Return strictly valid JSON.

Allowed response types:
- NORMAL_REPLY
- ASK_CLARIFICATION
- PROPOSE_TASK_COMPLETION

Current Active Task:
Title: ${activeTask.title}
Description: ${activeTask.description || "No description"}

Return JSON in this format:

{
  "type": "NORMAL_REPLY" | "ASK_CLARIFICATION" | "PROPOSE_TASK_COMPLETION",
  "message": "text here"
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
          message: "Can you clarify what you did?",
        };
      }

      const allowedTypes = [
        "NORMAL_REPLY",
        "ASK_CLARIFICATION",
        "PROPOSE_TASK_COMPLETION",
      ];

      if (!allowedTypes.includes(aiResponse.type)) {
        return {
          type: "ASK_CLARIFICATION",
          message: "Tell me more about your progress.",
        };
      }

      if (aiResponse.type === "PROPOSE_TASK_COMPLETION") {
        aiResponse.taskId = activeTask.id;
      }

      return aiResponse;
    },
);
