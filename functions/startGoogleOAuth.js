// functions/startGoogleOAuth.js

const {onCall} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {google} = require("googleapis");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

exports.startGoogleOAuth = onCall(
    {
      secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    },
    async (request) => {
    // 🔒 Require Auth
      if (!request.auth) {
        throw new Error("unauthenticated");
      }

      const uid = request.auth.uid;

      // 🔹 OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
          GOOGLE_CLIENT_ID.value(),
          GOOGLE_CLIENT_SECRET.value(),
          // ⚠ Must match Google Cloud Console redirect URI
          "https://googleoauthcallback-zoxcu4jcta-uc.a.run.app",
      );

      const origin = request.rawRequest.headers.origin;

      const statePayload = Buffer
          .from(JSON.stringify({uid, origin}))
          .toString("base64");

      // 🔹 Generate consent screen URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline", // Important for refresh token
        prompt: "consent", // Force refresh token
        scope: [
          "https://www.googleapis.com/auth/calendar.events",
        ],
        state: statePayload, // Pass uid and origin safely
      });

      return {
        authUrl,
      };
    },
);
