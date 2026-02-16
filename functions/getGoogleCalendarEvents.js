const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {google} = require("googleapis");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

exports.getGoogleCalendarEvents = onCall(
    {
      secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    },
    async (req) => {
      if (!req.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
      }

      const uid = req.auth.uid;

      const integrationSnap = await admin.firestore()
          .collection("users")
          .doc(uid)
          .collection("integrations")
          .doc("google")
          .get();

      if (!integrationSnap.exists) {
        return {events: []};
      }

      const {refreshToken} = integrationSnap.data();

      const oauth2Client = new google.auth.OAuth2(
          GOOGLE_CLIENT_ID.value(),
          GOOGLE_CLIENT_SECRET.value(),
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const calendar = google.calendar({
        version: "v3",
        auth: oauth2Client,
      });

      const now = new Date().toISOString();

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: now,
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (response.data.items || []).map((event) => ({
        id: event.id,
        title: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end?.dateTime || event.end?.date,
      }));

      return {events};
    },
);
