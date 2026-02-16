// functions/createCalendarEvent.js

const {onCall} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {google} = require("googleapis");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

exports.createCalendarEvent = onCall(
    {
      secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    },
    async (request) => {
    // 🔒 1️⃣ Require Auth
      if (!request.auth) {
        throw new Error("unauthenticated");
      }

      const uid = request.auth.uid;
      const data = request.data;

      const {
        title,
        description,
        startISO,
        endISO,
        planId,
        triggeredByChatId,
      } = data;

      if (!title || !startISO || !endISO || !planId) {
        throw new Error("invalid-argument");
      }

      try {
      // 🔹 2️⃣ Get stored Google tokens
        const integrationRef = admin.firestore()
            .collection("users")
            .doc(uid)
            .collection("integrations")
            .doc("google");

        const integrationSnap = await integrationRef.get();

        if (!integrationSnap.exists) {
          throw new Error("google-not-connected");
        }

        const {accessToken, refreshToken} = integrationSnap.data();

        // 🔹 3️⃣ Setup OAuth2 Client
        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID.value(),
            GOOGLE_CLIENT_SECRET.value(),
        );

        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // 🔹 4️⃣ Create Calendar API instance
        const calendar = google.calendar({
          version: "v3",
          auth: oauth2Client,
        });

        // 🔹 5️⃣ Create Event
        const event = {
          summary: title,
          description: description || "",
          start: {
            dateTime: startISO,
            timeZone: "Asia/Jakarta", // 🔥 Add this
          },
          end: {
            dateTime: endISO,
            timeZone: "Asia/Jakarta", // 🔥 Add this
          },
        };


        const response = await calendar.events.insert({
          calendarId: "primary",
          resource: event,
        });

        // 🔹 6️⃣ Log Action (deterministic trace)
        await admin.firestore()
            .collection("users")
            .doc(uid)
            .collection("plans")
            .doc(planId)
            .collection("actions")
            .add({
              type: "GOOGLE_CALENDAR_EVENT_CREATED",
              payload: {
                title,
                startISO,
                endISO,
                googleEventId: response.data.id,
              },
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              triggeredByChatId: triggeredByChatId || null,
            });

        return {
          success: true,
          eventId: response.data.id,
        };
      } catch (error) {
        console.error(error);
        throw new Error("calendar-creation-failed");
      }
    },
);
