const {defineSecret} = require("firebase-functions/params");
const {OpenAI} = require("openai");
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
        console.log("RAW COMPLETION:", JSON.stringify(completion, null, 2));
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
