import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express from "express";
import cors from "cors";
import { createApiRouter } from "./apiRouter";

// Define 2nd gen Firebase Functions Secrets
export const geminiApiKey = defineSecret("GEMINI_API_KEY");
export const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
export const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");
export const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");
export const adminEmail = defineSecret("ADMIN_EMAIL");

const app = express();
app.use(cors({ origin: true }));

// Mount the API router
app.use("/api", createApiRouter());

// Export as Firebase Functions (2nd Gen) HTTPS endpoint
export const api = onRequest(
  {
    secrets: [
      geminiApiKey,
      telegramBotToken,
      telegramChatId,
      telegramWebhookSecret,
      adminEmail,
    ],
    cors: true,
    region: "asia-south1",
    maxInstances: 10,
  },
  app
);
