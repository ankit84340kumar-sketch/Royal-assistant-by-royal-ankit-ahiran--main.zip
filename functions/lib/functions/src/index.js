"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.adminEmail = exports.telegramWebhookSecret = exports.telegramChatId = exports.telegramBotToken = exports.geminiApiKey = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const apiRouter_1 = require("./apiRouter");
// Define 2nd gen Firebase Functions Secrets
exports.geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
exports.telegramBotToken = (0, params_1.defineSecret)("TELEGRAM_BOT_TOKEN");
exports.telegramChatId = (0, params_1.defineSecret)("TELEGRAM_CHAT_ID");
exports.telegramWebhookSecret = (0, params_1.defineSecret)("TELEGRAM_WEBHOOK_SECRET");
exports.adminEmail = (0, params_1.defineSecret)("ADMIN_EMAIL");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
// Mount the API router
app.use("/api", (0, apiRouter_1.createApiRouter)());
// Export as Firebase Functions (2nd Gen) HTTPS endpoint
exports.api = (0, https_1.onRequest)({
    secrets: [
        exports.geminiApiKey,
        exports.telegramBotToken,
        exports.telegramChatId,
        exports.telegramWebhookSecret,
        exports.adminEmail,
    ],
    cors: true,
    region: "asia-south1",
    maxInstances: 10,
}, app);
//# sourceMappingURL=index.js.map