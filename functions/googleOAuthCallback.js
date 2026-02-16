// functions/googleOAuthCallback.js

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {google} = require("googleapis");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

exports.googleOAuthCallback = onRequest(
    {
      secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    },
    async (req, res) => {
      try {
        const code = req.query.code;
        const decodedState = JSON.parse(
            Buffer.from(req.query.state, "base64").toString("utf8"),
        );

        const uid = decodedState.uid;
        const origin = decodedState.origin;


        if (!code || !uid) {
          return res.status(400).send("Missing code or state.");
        }

        // 🔹 Create OAuth2 client
        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID.value(),
            GOOGLE_CLIENT_SECRET.value(),
            // MUST match redirect URI exactly
            "https://googleoauthcallback-zoxcu4jcta-uc.a.run.app",
        );

        // 🔹 Exchange code for tokens
        const {tokens} = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
          return res.status(400).send("No refresh token received.");
        }

        // 🔹 Store tokens securely
        await admin.firestore()
            .collection("users")
            .doc(uid)
            .collection("integrations")
            .doc("google")
            .set({
              refreshToken: tokens.refresh_token,
              accessToken: tokens.access_token,
              expiresAt: tokens.expiry_date,
              connectedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        // 🔹 Redirect back to dashboard
        return res.redirect(origin + "/dashboard.html");
      } catch (error) {
        console.error(error);
        return res.status(500).send("OAuth failed.");
      }
    },
);
