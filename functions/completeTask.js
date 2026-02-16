const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

exports.completeTask = onCall(
    {
      region: "us-central1",
    },
    async (req) => {
      const {auth, data} = req;

      if (!auth) {
        throw new HttpsError("unauthenticated", "Login required.");
      }

      const {planId, taskId, triggeredByChatId} = data;
      const uid = auth.uid;

      if (!planId || !taskId) {
        throw new HttpsError("invalid-argument", "Missing fields.");
      }

      const planRef = db
          .collection("users")
          .doc(uid)
          .collection("plans")
          .doc(planId);

      const planSnap = await planRef.get();

      if (!planSnap.exists) {
        throw new HttpsError("not-found", "Plan not found.");
      }

      const planData = planSnap.data();

      if (planData.status === "completed") {
        throw new HttpsError("failed-precondition", "Plan already completed.");
      }

      // 🔹 Fetch tasks ordered
      const tasksSnap = await planRef
          .collection("tasks")
          .orderBy("orderIndex")
          .get();

      if (tasksSnap.empty) {
        throw new HttpsError("failed-precondition", "No tasks found.");
      }

      let activeTask = null;
      let completedCount = 0;
      let totalActive = 0;

      tasksSnap.forEach((doc) => {
        const task = doc.data();

        if (task.status !== "deleted") {
          totalActive++;

          if (task.status === "completed") {
            completedCount++;
          }

          if (!activeTask && task.status === "pending") {
            activeTask = {
              id: doc.id,
              ref: doc.ref,
              data: task,
            };
          }
        }
      });

      if (!activeTask) {
        throw new HttpsError("failed-precondition", "No active task.");
      }

      // 🔥 ENFORCE SEQUENTIAL RULE
      if (activeTask.id !== taskId) {
        throw new HttpsError(
            "failed-precondition",
            "Cannot complete task out of order.",
        );
      }

      const batch = db.batch();

      // 1️⃣ Mark task completed
      batch.update(activeTask.ref, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });

      // 2️⃣ Log action
      const actionRef = planRef.collection("actions").doc();

      batch.set(actionRef, {
        type: "TASK_COMPLETED",
        payload: {
          taskId: activeTask.id,
        },
        createdAt: FieldValue.serverTimestamp(),
        triggeredByChatId: triggeredByChatId || null,
      });

      completedCount += 1;

      // 3️⃣ Check if plan complete
      if (completedCount === totalActive) {
        batch.update(planRef, {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      return {
        success: true,
        planCompleted: completedCount === totalActive,
      };
    },
);
