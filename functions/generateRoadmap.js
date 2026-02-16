const {defineSecret} = require("firebase-functions/params");
const {OpenAI} = require("openai");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

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

      const {planId, goal, durationMonths, currentStatus} = data;
      const uid = auth.uid;

      if (
        !planId ||
      !goal ||
      !durationMonths ||
      !currentStatus ||
      typeof goal !== "string" ||
      typeof currentStatus !== "string"
      ) {
        throw new HttpsError("invalid-argument", "Missing or invalid fields.");
      }

      const planRef = db
          .collection("users")
          .doc(uid)
          .collection("plans")
          .doc(planId);

      // 🔒 TRANSACTION LOCK
      await db.runTransaction(async (transaction) => {
        const planSnap = await transaction.get(planRef);

        if (!planSnap.exists) {
          throw new HttpsError("not-found", "Plan not found.");
        }

        const planData = planSnap.data();

        if (planData.status !== "generating") {
          throw new HttpsError(
              "failed-precondition",
              "Plan already processed or invalid state.",
          );
        }
      });

      // 🔹 EXTRA SAFETY: Prevent duplicate tasks
      const existingTasks = await planRef.collection("tasks").limit(1).get();
      if (!existingTasks.empty) {
        throw new HttpsError(
            "failed-precondition",
            "Tasks already exist for this plan.",
        );
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
              content: `
You are Morgan.

Generate a full ordered roadmap for a user's goal.

Rules:
- Generate ALL tasks at once.
- Tasks must be sequential and logically ordered.
- Equal weight.
- No optional branches.
- No motivational language.
- No explanations outside JSON.
- DurationMonths only guides how many tasks to generate.
- Use currentStatus to understand starting level.

Return STRICT JSON only.
            `,
            },
            {
              role: "user",
              content: `
Goal: ${goal}
Duration (months): ${durationMonths}
Current Status: ${currentStatus}
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
                required: ["tasks"],
                properties: {
                  tasks: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["orderIndex", "title", "description"],
                      properties: {
                        orderIndex: {type: "integer", minimum: 1},
                        title: {type: "string", minLength: 5},
                        description: {type: "string", minLength: 10},
                      },
                    },
                  },
                },
              },
            },
          },
        });
      } catch (err) {
        console.error("OpenAI error:", err);
        throw new HttpsError("internal", "AI request failed.");
      }

      if (
        completion.status === "incomplete" &&
      completion.incomplete_details?.reason === "max_output_tokens"
      ) {
        throw new HttpsError("internal", "AI response incomplete.");
      }

      const content = completion.output?.[0]?.content?.[0];

      if (!content || content.type !== "output_text") {
        throw new HttpsError("internal", "Invalid AI response.");
      }

      let result;

      try {
        result = JSON.parse(content.text);
      } catch (err) {
        throw new HttpsError("internal", "Invalid AI JSON.");
      }

      if (!Array.isArray(result.tasks) || result.tasks.length === 0) {
        throw new HttpsError("internal", "Invalid roadmap structure.");
      }

      result.tasks.sort((a, b) => a.orderIndex - b.orderIndex);

      // 🔹 Batch write
      const batch = db.batch();

      result.tasks.forEach((task) => {
        const taskRef = planRef.collection("tasks").doc();

        batch.set(taskRef, {
          orderIndex: task.orderIndex,
          title: task.title,
          description: task.description,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          completedAt: null,
        });
      });

      // 🔹 CRITICAL: activate plan AFTER tasks exist
      batch.update(planRef, {
        status: "active",
      });

      try {
        await batch.commit();
      } catch (err) {
        console.error("Firestore write error:", err);
        throw new HttpsError("internal", "Failed to save roadmap.");
      }

      return {success: true};
    },
);
