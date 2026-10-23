// developerDispatchService.ts - Automated Developer Contact & Telegram Bot Dispatch Service
// Dispatches user inquiries, messages, and contact requests directly to Royal Ankit Ahiran's Telegram via Telegram Bot API
// Also handles fetching and matching developer replies back to the specific user's session

import { getLiveAppUserStats } from "./firebaseService";
import {
  apiDeveloperDispatchSend,
  apiDeveloperDispatchBugReport,
  apiDeveloperDispatchUserQueries,
} from "./api";

export const TELEGRAM_BOT_TOKEN = "";
export const TELEGRAM_CHAT_ID = "";

export const DEVELOPER_EMAIL = "ankit84340kumar@gmail.com";
export const DEVELOPER_PORTFOLIO = "https://royalankitahiranl.netlify.app";
export const DEVELOPER_TELEGRAM = "https://t.me/Royal_ankit_ahiran";
export const DEVELOPER_INSTAGRAM = "https://www.instagram.com/royal_ankit_ahiran";
export const DEVELOPER_YOUTUBE = "https://youtube.com/@royal_ankit_ahiran";

export interface DeveloperLeadPayload {
  name: string;
  phone?: string;
  message: string;
  timestamp?: string;
  requestId?: string;
}

export interface DeveloperReplyItem {
  text: string;
  timestamp: string;
  messageId: number;
  fromName?: string;
}

export interface DispatchedLeadItem extends DeveloperLeadPayload {
  id: string;
  requestId: string;
  telegramMessageId?: number;
  status: "sent" | "failed";
  replyStatus: "pending" | "replied";
  timestamp: string;
  replies: DeveloperReplyItem[];
  rawResponse?: string;
}

export interface CheckReplyResult {
  status: "reply_found" | "waiting_for_reply" | "no_messages_sent" | "error";
  hasReply: boolean;
  requestId?: string;
  senderName?: string;
  originalMessage?: string;
  originalTimestamp?: string;
  developerName?: string;
  latestReply?: string;
  replyTimestamp?: string;
  allReplies?: DeveloperReplyItem[];
  message: string;
}

/**
 * Generates a unique, short, human & machine-readable Request ID
 * Example: "ZYA-2026-7294" or "REQ-7294"
 */
export function generateRequestId(): string {
  const currentYear = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `ZYA-${currentYear}-${num}`;
}

/**
 * Calculates current exact Indian Standard Time (IST = UTC+5:30) timestamp
 * Format: "26 August 2026 | 04:30:10 PM IST"
 */
export function getFormattedISTTimestamp(date = new Date()): string {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utc = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  const istTime = new Date(utc + istOffset);

  const day = String(istTime.getDate()).padStart(2, "0");
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const month = monthNames[istTime.getMonth()];
  const year = istTime.getFullYear();

  let hours = istTime.getHours();
  const minutes = String(istTime.getMinutes()).padStart(2, "0");
  const seconds = String(istTime.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, "0");

  return `${day} ${month} ${year} | ${formattedHours}:${minutes}:${seconds} ${ampm} IST`;
}

/**
 * Get all dispatched leads from LocalStorage
 */
export function getDispatchedLeadsLocally(): DispatchedLeadItem[] {
  try {
    const key = "zoya_developer_dispatches";
    const existing = localStorage.getItem(key);
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    console.error("Failed to read local dispatches:", e);
    return [];
  }
}

/**
 * Save dispatched lead in LocalStorage history
 */
export function saveDispatchedLeadLocally(
  payload: DeveloperLeadPayload,
  timestamp: string,
  success: boolean,
  requestId: string,
  telegramMessageId?: number,
  rawResponse?: string
): void {
  try {
    const key = "zoya_developer_dispatches";
    const list = getDispatchedLeadsLocally();
    
    list.unshift({
      id: "lead_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      requestId,
      telegramMessageId,
      name: payload.name,
      phone: payload.phone || "Not Provided (Optional)",
      message: payload.message,
      timestamp,
      status: success ? "sent" : "failed",
      replyStatus: "pending",
      replies: [],
      rawResponse,
    });

    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch (e) {
    console.error("Failed to save lead dispatch log:", e);
  }
}

/**
 * Helper to call Telegram Bot API using Vite proxy first to avoid browser CORS/network blocking,
 * with fallback to direct api.telegram.org.
 */
async function callTelegramApi(_endpoint: string, _options?: RequestInit): Promise<Response> {
  // All Telegram communications are now routed through the server
  return new Response(JSON.stringify({ ok: true, result: { message_id: Date.now() } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Escapes HTML characters for Telegram HTML mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Dispatches the contact information to Royal Ankit Ahiran via Telegram Bot API
 * Tags each outgoing message with a unique Request ID for reply-tracking
 */
export async function dispatchToDeveloperTelegram(
  payload: DeveloperLeadPayload
): Promise<{ success: boolean; timestamp: string; requestId: string; messageId?: number; error?: string }> {
  const timestamp = payload.timestamp || getFormattedISTTimestamp();
  const requestId = payload.requestId || generateRequestId();
  const name = (payload.name || "Anonymous User").trim();
  const phone = payload.phone && payload.phone.trim() ? payload.phone.trim() : "Not Provided (Optional)";
  const message = (payload.message || "").trim();

  try {
    const res = await apiDeveloperDispatchSend({
      name,
      phone,
      message,
      requestId,
    });

    saveDispatchedLeadLocally(payload, timestamp, true, requestId, res.telegramMessageId, JSON.stringify(res));
    return { success: true, timestamp, requestId, messageId: res.telegramMessageId };
  } catch (err: any) {
    console.error("[Telegram Bot Dispatch] Error:", err);
    saveDispatchedLeadLocally(payload, timestamp, false, requestId, undefined, err.message || "Dispatch error");
    return { 
      success: false, 
      timestamp, 
      requestId,
      error: err.message || "Failed to dispatch message to developer" 
    };
  }
}

export interface ProblemReportPayload {
  name?: string;
  email?: string;
  phone?: string;
  contact?: string;
  category?: string;
  description: string;
  errorLog?: string;
  deviceInfo?: string;
  timestamp?: string;
  requestId?: string;
}

/**
 * Dispatches a detailed bug/problem report directly to Royal Ankit Ahiran via Telegram Bot API
 */
export async function dispatchProblemReportToTelegram(
  payload: ProblemReportPayload
): Promise<{ success: boolean; timestamp: string; requestId: string; messageId?: number; error?: string }> {
  const timestamp = payload.timestamp || getFormattedISTTimestamp();
  const requestId = payload.requestId || generateRequestId();
  const name = (payload.name || "App User").trim();
  const email = (payload.email || "").trim();
  const phone = (payload.phone || "").trim();
  const contact = (payload.contact || [phone, email].filter(Boolean).join(" | ") || "Not Provided").trim();
  const category = (payload.category || "General Bug / Issue").trim();
  const description = (payload.description || "No description provided").trim();
  const errorLog = (payload.errorLog || "None recorded").trim();
  const deviceInfo = (payload.deviceInfo || (typeof navigator !== "undefined" ? navigator.userAgent : "Web Client")).trim();
  const onlineStatus = typeof navigator !== "undefined" && navigator.onLine ? "🟢 Online" : "🔴 Offline";

  const formattedHtml = `<b>🚨 ZOYA AI USER REPORT</b>
━━━━━━━━━━━━━━━━━━━━
🔖 <b>Report ID:</b>
<code>${escapeHtml(requestId)}</code>

👤 <b>User Name:</b>
${escapeHtml(name)}

📱 <b>User Mobile Number:</b>
${escapeHtml(phone || "Not Provided")}

📧 <b>User Email:</b>
${escapeHtml(email || "Not Provided")}

📂 <b>Category:</b>
${escapeHtml(category)}

📝 <b>Problem / Bug Description:</b>
${escapeHtml(description)}

💥 <b>System Diagnostics & Device:</b>
• <b>Network State:</b> ${onlineStatus}
• <b>Error Details:</b> <code>${escapeHtml(errorLog.slice(0, 1000))}</code>
• <b>Device:</b> <code>${escapeHtml(deviceInfo.slice(0, 200))}</code>

⏰ <b>Timestamp (IST):</b> ${escapeHtml(timestamp)}
🤖 <b>Dispatched via:</b> Zoya AI Assistant (Profile Report)
━━━━━━━━━━━━━━━━━━━━
<i>💡 Developer Reply: Tap 'Reply' to this message in Telegram to send an answer directly to this user session.</i>`;

  console.log(`[Telegram Bug Dispatch] Sending Report #${requestId} to Chat ID ${TELEGRAM_CHAT_ID}...`);

  const leadPayload: DeveloperLeadPayload = {
    name: `[BUG] ${name} (${category})`,
    phone: contact,
    message: `[${category}] ${description}\nError: ${errorLog}`,
    timestamp,
    requestId,
  };

  try {
    const res = await apiDeveloperDispatchBugReport({
      title: `[${category}] ${name}`,
      description: `${description}\nError: ${errorLog}`,
      category,
      priority: "normal",
      deviceDetails: `${deviceInfo} | ${onlineStatus}`,
      bugReportId: requestId,
    });

    saveDispatchedLeadLocally(leadPayload, timestamp, true, requestId, undefined, JSON.stringify(res));
    return { success: true, timestamp, requestId, messageId: undefined };
  } catch (err: any) {
    console.error("[Telegram Bug Dispatch] Error:", err);
    saveDispatchedLeadLocally(leadPayload, timestamp, false, requestId, undefined, err.message || "Dispatch error");
    return { 
      success: false, 
      timestamp, 
      requestId,
      error: err.message || "Failed to dispatch bug report" 
    };
  }
}

/**
 * Checks for replies from the developer via Telegram Bot API getUpdates
 * Matches replies directly to the user's specific dispatched request(s)
 */
export async function checkDeveloperReplyFromTelegram(
  specificRequestId?: string
): Promise<CheckReplyResult> {
  const leads = getDispatchedLeadsLocally();
  const sentLeads = leads.filter(l => l.status === "sent");

  if (sentLeads.length === 0) {
    return {
      status: "no_messages_sent",
      hasReply: false,
      message: "Aapne abhi tak developer ko koi message nahi bheja hai. Agar aap chahein toh pehle message bhej sakte hain."
    };
  }

  try {
    const serverQueries = await apiDeveloperDispatchUserQueries();
    if (Array.isArray(serverQueries) && serverQueries.length > 0) {
      let hasUpdates = false;
      for (const sq of serverQueries) {
        const matchingLead = sentLeads.find(
          (l) => l.requestId.toLowerCase() === sq.requestId?.toLowerCase()
        );
        if (matchingLead && Array.isArray(sq.replies) && sq.replies.length > 0) {
          matchingLead.replies = sq.replies;
          matchingLead.replyStatus = "replied";
          hasUpdates = true;
        }
      }
      if (hasUpdates) {
        localStorage.setItem("zoya_developer_dispatches", JSON.stringify(leads));
      }
    }
  } catch (err: any) {
    console.debug("[Developer Reply Check] Error fetching server replies:", err?.message || err);
  }

  // Find the targeted lead
  let targetLead = specificRequestId
    ? sentLeads.find(l => l.requestId.toLowerCase() === specificRequestId.toLowerCase())
    : sentLeads[0];

  if (!targetLead) {
    targetLead = sentLeads[0];
  }

  if (targetLead && targetLead.replies && targetLead.replies.length > 0) {
    const latest = targetLead.replies[targetLead.replies.length - 1];
    return {
      status: "reply_found",
      hasReply: true,
      requestId: targetLead.requestId,
      senderName: targetLead.name,
      originalMessage: targetLead.message,
      originalTimestamp: targetLead.timestamp,
      developerName: "Royal Ankit Ahiran",
      latestReply: latest.text,
      replyTimestamp: latest.timestamp,
      allReplies: targetLead.replies,
      message: `Developer Royal Ankit Ahiran has replied to Request #${targetLead.requestId}: "${latest.text}" (Sent at: ${latest.timestamp})`
    };
  }

  return {
    status: "waiting_for_reply",
    hasReply: false,
    requestId: targetLead?.requestId,
    senderName: targetLead?.name,
    originalMessage: targetLead?.message,
    originalTimestamp: targetLead?.timestamp,
    message: `Abhi tak developer Royal Ankit Ahiran ka reply nahi aaya hai (Request #${targetLead?.requestId}). Thoda intezaar karna hoga.`
  };
}

// Alias for backwards compatibility if needed
export const dispatchToDeveloperWhatsApp = dispatchToDeveloperTelegram;

/**
 * Standard 2-Option text presentation when a user asks to contact the developer
 */
export function getDeveloperContactOptionsText(isEnglish: boolean = false): string {
  if (isEnglish) {
    return `You have two ways to connect with my developer **Royal Ankit Ahiran**:

**Option 1:** You can reach out directly on his official social media or portfolio:
• **Portfolio:** [royalankitahiranl.netlify.app](${DEVELOPER_PORTFOLIO})
• **Telegram:** [@Royal_ankit_ahiran](${DEVELOPER_TELEGRAM})
• **YouTube:** [@royal_ankit_ahiran](${DEVELOPER_YOUTUBE})
• **Instagram:** [@royal_ankit_ahiran](${DEVELOPER_INSTAGRAM})
• **Email:** ${DEVELOPER_EMAIL}

**Option 2:** Or you can tell me your message, and I will forward it directly to my developer on Telegram.

Which option would you like to choose — the first or the second?`;
  }

  return `हमार डेवलपर **रॉयल अंकित अहिरान** से संपर्क करे खातिर रउआ लगे ठीक दू गो विकल्प बा:

**पहिला विकल्प (Option 1):** आप खुद मेरे डेवलपर के सोशल मीडिया या पोर्टफोलियो पर जा सकते हैं — लिंक बता देती हूँ:
• **पोर्टफोलियो:** [royalankitahiranl.netlify.app](${DEVELOPER_PORTFOLIO})
• **टेलीग्राम:** [@Royal_ankit_ahiran](${DEVELOPER_TELEGRAM})
• **यूट्यूब:** [@royal_ankit_ahiran](${DEVELOPER_YOUTUBE})
• **इंस्टाग्राम:** [@royal_ankit_ahiran](${DEVELOPER_INSTAGRAM})
• **ईमेल:** ${DEVELOPER_EMAIL}

**दूसरा विकल्प (Option 2):** या फिर जो भी बात है, मुझे बता दीजिए — मैं सीधा अपने डेवलपर तक पहुँचा दूँगी (टेलीग्राम के जरिए)।

कौन सा ऑप्शन चुनेंगे — पहला या दूसरा?`;
}

// -------------------------------------------------------------
// TELEGRAM BOT COMMANDS & DEVELOPER APP STATS QUERY SYSTEM
// -------------------------------------------------------------

const PROCESSED_COMMANDS_KEY = "zoya_processed_telegram_commands";

function getProcessedCommandIds(): number[] {
  try {
    const raw = localStorage.getItem(PROCESSED_COMMANDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markCommandIdProcessed(msgId: number): void {
  try {
    const list = getProcessedCommandIds();
    if (!list.includes(msgId)) {
      list.push(msgId);
      localStorage.setItem(PROCESSED_COMMANDS_KEY, JSON.stringify(list.slice(-100)));
    }
  } catch {}
}

/**
 * Checks if a given text from the developer is a stat or information command
 */
function isUserStatsCommand(text: string): boolean {
  const t = text.toLowerCase().trim();
  
  // Exact command triggers
  const slashCommands = ["/stats", "/users", "/count", "/login", "/logins", "/status", "/usercount", "/stat"];
  if (slashCommands.includes(t)) return true;

  // Natural language query triggers
  const patterns = [
    /kitne\s+(?:log|users?|members?)\s+(?:login|register|istemal|use)/i,
    /kitne\s+log\s+(?:hai|hain|hue\s+hai|hue\s+hain|kiye\s+hai)/i,
    /kitne\s+user\s+(?:hai|hain)/i,
    /how\s+many\s+users(?:\s+logged\s+in|\s+registered|\s+active)?/i,
    /total\s+(?:users?|logins?|accounts?|members?)/i,
    /user\s+count/i,
    /login\s+stats/i,
    /app\s+stats/i,
    /zoya\s+stats/i,
    /system\s+stats/i,
  ];

  return patterns.some((p) => p.test(t));
}

/**
 * Checks if a given text from the developer is a message/inquiries query
 */
function isMessagesStatsCommand(text: string): boolean {
  const t = text.toLowerCase().trim();
  const slashCommands = ["/messages", "/dispatches", "/leads", "/inquiries", "/inbox"];
  if (slashCommands.includes(t)) return true;

  const patterns = [
    /kitne\s+(?:messages?|inquiries|leads?)\s+(?:aaye|bheje|received)/i,
    /total\s+messages/i,
    /check\s+messages/i,
  ];

  return patterns.some((p) => p.test(t));
}

/**
 * Checks if the developer asked for help or start
 */
function isHelpCommand(text: string): boolean {
  const t = text.toLowerCase().trim();
  return t === "/start" || t === "/help" || t === "help";
}

/**
 * Send a reply message directly to the developer's chat
 */
async function sendTelegramReplyToDeveloper(
  replyHtml: string,
  replyToMessageId?: number
): Promise<boolean> {
  try {
    const payload: any = {
      chat_id: TELEGRAM_CHAT_ID,
      text: replyHtml,
      parse_mode: "HTML",
    };

    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }

    const res = await callTelegramApi("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return res.ok && data.ok;
  } catch (e: any) {
    console.debug("[Telegram Command Reply] Could not send reply to developer:", e?.message || e);
    return false;
  }
}

/**
 * Processes incoming developer commands and messages via Two-Way Admin AI
 * Restricts execution ONLY to the verified developer chat ID
 */
export async function processDeveloperTelegramCommands(): Promise<{
  processedCount: number;
  lastCommand?: string;
}> {
  try {
    const { processTelegramAdminUpdates } = await import("./telegramAdminService");
    const result = await processTelegramAdminUpdates();
    return {
      processedCount: result.processedCount,
      lastCommand: result.lastHandled,
    };
  } catch (err: any) {
    console.debug("[Telegram Command Polling] Note:", err?.message || err);
    return { processedCount: 0 };
  }
}

let telegramListenerInterval: any = null;
let consecutivePollErrors = 0;

/**
 * Starts continuous background listener for developer Telegram commands and Two-Way Admin AI
 */
export function startTelegramCommandListener(intervalMs: number = 6000): void {
  if (telegramListenerInterval) return;

  const runPoll = async () => {
    // Only skip if browser is completely offline
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      // Process Two-Way Admin AI commands, slash commands, status & queries
      const { processTelegramAdminUpdates } = await import("./telegramAdminService");
      await processTelegramAdminUpdates();
      consecutivePollErrors = 0;
    } catch {
      consecutivePollErrors++;
    }
  };

  // Run immediately once
  runPoll().catch(() => {});

  // Then poll periodically with backoff on failure
  telegramListenerInterval = setInterval(() => {
    if (consecutivePollErrors > 3 && Math.random() > 0.3) {
      return; // throttle back when offline or blocked
    }
    runPoll().catch(() => {});
  }, intervalMs);
}

/**
 * Stops background listener for developer Telegram commands
 */
export function stopTelegramCommandListener(): void {
  if (telegramListenerInterval) {
    clearInterval(telegramListenerInterval);
    telegramListenerInterval = null;
    consecutivePollErrors = 0;
  }
}


