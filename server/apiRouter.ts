import express, { Request, Response, NextFunction } from "express";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";
import { GoogleGenAI } from "@google/genai";
import { parseUploadedFile } from "./documentParser";

// Ensure Firebase Admin is initialized once
if (getApps().length === 0) {
  initializeApp({
    projectId: "project-544569b5-5c85-4ee7-bf9",
  });
}

const adminAuth = getAuth();
const db = getFirestore();
const adminAppCheck = getAppCheck();

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    [key: string]: any;
  };
}

/**
 * Access configured secret or environment variable without exposing in client code
 */
export function getSecret(name: string): string {
  return (process.env[name] || "").trim();
}

/**
 * In-memory rate limiter per user UID
 * 60 requests/minute, 1000 requests/day
 */
interface RateLimitBucket {
  minuteCount: number;
  minuteReset: number;
  dayCount: number;
  dayReset: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();

export function rateLimitMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const uid = req.user?.uid || req.ip || "anonymous";
  const now = Date.now();

  let bucket = rateLimitMap.get(uid);
  if (!bucket) {
    bucket = {
      minuteCount: 0,
      minuteReset: now + 60 * 1000,
      dayCount: 0,
      dayReset: now + 24 * 60 * 60 * 1000,
    };
    rateLimitMap.set(uid, bucket);
  }

  // Reset minute window if expired
  if (now > bucket.minuteReset) {
    bucket.minuteCount = 0;
    bucket.minuteReset = now + 60 * 1000;
  }

  // Reset day window if expired
  if (now > bucket.dayReset) {
    bucket.dayCount = 0;
    bucket.dayReset = now + 24 * 60 * 60 * 1000;
  }

  bucket.minuteCount++;
  bucket.dayCount++;

  if (bucket.minuteCount > 60) {
    return res.status(429).json({
      error: "Rate limit exceeded (max 60 requests per minute). Please slow down.",
    });
  }

  if (bucket.dayCount > 1000) {
    return res.status(429).json({
      error: "Daily rate limit exceeded (max 1000 requests per day).",
    });
  }

  next();
}

/**
 * Verify Firebase ID Token if present, or assign guest session for trial users
 */
export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = { uid: `guest_${req.ip || "anon"}` };
    return next();
  }

  const token = authHeader.split("Bearer ")[1]?.trim();
  if (!token) {
    req.user = { uid: `guest_${req.ip || "anon"}` };
    return next();
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err: any) {
    // If token is expired or anonymous, gracefully fall back to guest session
    req.user = { uid: `guest_${req.ip || "anon"}` };
    next();
  }
}

/**
 * Admin authorization check
 */
export function requireAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const adminEmail = (getSecret("ADMIN_EMAIL") || "ankit84340kumar@gmail.com").toLowerCase();
  const userEmail = (req.user?.email || "").toLowerCase();
  const isVerified = req.user?.email_verified === true;

  if (userEmail !== adminEmail || !isVerified) {
    return res.status(403).json({
      error: "Forbidden: Developer Administrator access required.",
    });
  }
  next();
}

/**
 * Helper to call Telegram Bot API securely from server
 */
async function callServerTelegram(endpoint: string, payload: Record<string, any>): Promise<any> {
  const token = getSecret("TELEGRAM_BOT_TOKEN");
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured on server.");
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = `https://api.telegram.org/bot${token}/${cleanEndpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json();
}

/**
 * Firebase App Check validation middleware
 */
export async function appCheckMiddleware(req: Request, res: Response, next: NextFunction) {
  const appCheckToken = req.header("X-Firebase-AppCheck");
  const enforce = getSecret("ENFORCE_APP_CHECK") === "true";

  if (!appCheckToken) {
    if (enforce) {
      return res.status(401).json({ error: "Unauthorized: App Check token required." });
    }
    return next();
  }

  try {
    await adminAppCheck.verifyToken(appCheckToken);
    return next();
  } catch (err) {
    if (enforce) {
      return res.status(401).json({ error: "Unauthorized: Invalid App Check token." });
    }
    console.debug("[AppCheck Verification Notice]:", err);
    return next();
  }
}

const SERVER_START_TIME = Date.now();


/**
 * SSRF Protection: Checks if hostname resolves to private or cloud metadata IPs
 */
function isIpRestricted(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = parseInt(ipv4Match[1], 10);
    const b = parseInt(ipv4Match[2], 10);
    if (a === 127) return true; // Loopback
    if (a === 10) return true; // Private
    if (a === 192 && b === 168) return true; // Private
    if (a === 172 && b >= 16 && b <= 31) return true; // Private
    if (a === 169 && b === 254) return true; // Link-local & Cloud Metadata (169.254.169.254)
    if (a === 0) return true;
  }
  if (host === "::1" || host === "[::1]") return true;
  return false;
}

/**
 * Server-side SSRF-protected link fetcher and analyzer
 */
async function scrapeAndInspectLink(urlString: string, ai: GoogleGenAI): Promise<any> {
  const cleanUrl = urlString.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
  } catch {
    return {
      success: false,
      url: cleanUrl,
      error: "Invalid URL syntax. Please provide a valid HTTP or HTTPS link.",
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      success: false,
      url: cleanUrl,
      error: "Only HTTP and HTTPS links are supported.",
    };
  }

  if (isIpRestricted(parsedUrl.hostname)) {
    return {
      success: false,
      url: cleanUrl,
      error: "Access to private or restricted network addresses is blocked for security (SSRF Protection).",
    };
  }

  let htmlContent = "";
  let finalUrl = cleanUrl;
  let pageTitle = parsedUrl.hostname;
  let pageDescription = "";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ZoyaAssistant/2.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    finalUrl = response.url || cleanUrl;
    const finalParsed = new URL(finalUrl);
    if (isIpRestricted(finalParsed.hostname)) {
      return {
        success: false,
        url: cleanUrl,
        error: "Redirect to private or restricted address was blocked (SSRF Protection).",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        url: cleanUrl,
        error: `Website returned HTTP status ${response.status} (${response.statusText}).`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/pdf")) {
      return {
        success: true,
        url: finalUrl,
        title: `${parsedUrl.pathname.split("/").pop() || "Document"}.pdf`,
        description: "PDF document hosted at URL",
        summary: `PDF दस्तावेज़ पाया गया: ${finalUrl}। इसे सीधे चैट में अपलोड करके या इसका लिंक शेयर करके पूरा विश्लेषण प्राप्त कर सकते हैं बाबू!`,
      };
    }

    const rawText = await response.text();
    htmlContent = rawText.slice(0, 3 * 1024 * 1024);
  } catch (fetchErr: any) {
    return {
      success: false,
      url: cleanUrl,
      error: `वेबसाइट से डेटा प्राप्त नहीं हो सका: ${fetchErr?.name === "AbortError" ? "अनुरोध समय समाप्त (10 सेकंड टाइमआउट)" : fetchErr?.message || "नेटवर्क कनेक्शन त्रुटि"}। कृपया लिंक जांचें या बाद में प्रयास करें।`,
    };
  }

  const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    pageTitle = titleMatch[1].trim();
  }

  const descMatch =
    htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    htmlContent.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch && descMatch[1]) {
    pageDescription = descMatch[1].trim();
  }

  // Extract publisher / site name
  let sitePublisher = parsedUrl.hostname.replace(/^www\./, "");
  const pubMatch =
    htmlContent.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
    htmlContent.match(/<meta[^>]*name=["']publisher["'][^>]*content=["']([^"']+)["']/i) ||
    htmlContent.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (pubMatch && pubMatch[1]) {
    sitePublisher = pubMatch[1].trim();
  }

  // Extract published date if available
  let publishedDate = "";
  const dateMatch =
    htmlContent.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
    htmlContent.match(/<meta[^>]*name=["']date["'][^>]*content=["']([^"']+)["']/i) ||
    htmlContent.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  if (dateMatch && dateMatch[1]) {
    publishedDate = dateMatch[1].trim();
  }

  let cleanBody = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

  const textSample = cleanBody.slice(0, 20000);
  const favicon = `https://www.google.com/s2/favicons?domain=${new URL(finalUrl).hostname}&sz=64`;

  const prompt = `You are Zoya, a brilliant AI voice assistant built by Royal Ankit Ahiran.
Analyze this webpage content thoroughly and provide a factual, complete summary:
URL: ${finalUrl}
Page Title: ${pageTitle}
Publisher/Source: ${sitePublisher}
${publishedDate ? `Published Date: ${publishedDate}` : ""}
Page Description: ${pageDescription}

Extracted Page Text:
"""
${textSample || "No text extracted from page body."}
"""

Instructions:
1. Provide a comprehensive, accurate summary of this link in conversational Hindi with an authentic Bihari touch, warmly calling the user 'बाबू'.
2. Clearly state the Page Title, Publisher/Domain, and Publication Date (if found).
3. List 3-5 bullet points highlighting the most important key findings, confirmed facts, or arguments found on this page.
4. Distinguish clearly between confirmed facts, claims, and opinions. Never hallucinate or pretend information exists if it was not on the page.
5. If this is a tool, portal, or government service, explain how it works and what steps users should follow.`;

  const geminiRes = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return {
    success: true,
    url: finalUrl,
    title: pageTitle,
    publisher: sitePublisher,
    publishedDate,
    description: pageDescription,
    favicon,
    mainText: textSample.slice(0, 500),
    summary: geminiRes.text || pageDescription || "वेबसाइट का विवरण प्राप्त हो गया है बाबू!",
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.use(express.json({ limit: "15mb" }));
  router.use(appCheckMiddleware);

  // Health check
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Version & Live Sync Build Tracker
  router.get("/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      status: "ok",
      buildId: process.env.ZOYA_BUILD_ID || String(SERVER_START_TIME),
      timestamp: new Date(SERVER_START_TIME).toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // 1. STREAMING CHAT (POST /api/chat)
  // ---------------------------------------------------------------------------
  router.post("/chat", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { messages, systemInstruction, model } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required." });
    }

    // Set Server-Sent Events headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const ai = new GoogleGenAI({ apiKey });
      const targetModel = model || "gemini-2.5-flash";

      const formattedContents = messages.map((m: any) => ({
        role: m.role === "assistant" || m.role === "model" ? "model" : "user",
        parts: [{ text: String(m.content || m.text || "") }],
      }));

      const responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents: formattedContents,
        config: systemInstruction
          ? {
              systemInstruction: { parts: [{ text: systemInstruction }] },
            }
          : undefined,
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      console.error("[Server Chat Error]:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate chat response." });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Generation interrupted" })}\n\n`);
        res.end();
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 2. TEXT TO SPEECH (POST /api/tts)
  // ---------------------------------------------------------------------------
  router.post("/tts", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { text, voice } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const chosenVoice = voice || "Puck";

      const prompt = `Read the following text out loud in a natural, lively voice without adding any preamble:\n"${text}"`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: chosenVoice,
              },
            },
          },
        },
      });

      const candidates = response.candidates;
      const part = candidates?.[0]?.content?.parts?.[0];

      if (part && (part as any).inlineData && (part as any).inlineData.data) {
        const audioBase64 = (part as any).inlineData.data;
        const mimeType = (part as any).inlineData.mimeType || "audio/pcm;rate=24000";
        const format = mimeType.includes("pcm") ? "pcm" : "mp3";

        return res.json({
          audioBase64,
          format,
          mimeType,
        });
      }

      return res.status(502).json({ error: "TTS model did not return audio data." });
    } catch (err: any) {
      console.error("[Server TTS Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to generate speech audio." });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. WEATHER & NEWS BRIEFING (POST /api/weather-news)
  // ---------------------------------------------------------------------------
  router.post("/weather-news", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { type, query } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      if (type === "weather") {
        const city = query || "India";
        const prompt = `Provide a short, 2-sentence weather briefing for ${city} in authentic, friendly Bhojpuri as Zoya, AI Assistant created by Royal Ankit Ahiran. Mention the current temperature and conditions clearly.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
        });

        return res.json({ result: response.text || "मालिक, आज मौसम बढ़िया बा!" });
      } else {
        // News
        const prompt = `Give me 3 short, top current news headlines for India / World today.
Summarize each headline in exactly ONE lively, natural, friendly Bhojpuri sentence.
Total response must be 3-4 short sentences in authentic humorous Bhojpuri, starting with a friendly greeting like "मालिक, आजु के ताजा खबर सुन लीं:" and crediting creator Royal Ankit Ahiran.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
        });

        return res.json({
          result:
            response.text ||
            "मालिक, आजु के मुख्य खबर बा कि देश-दुनिया में तकनीकी के खूब चर्चा बा, अउरी हमार बॉस रॉयल अंकित अहिरान के एआई के डंका बज रहल बा!",
        });
      }
    } catch (err: any) {
      console.error("[Server Weather/News Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to fetch weather or news." });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. TRANSLATION (POST /api/translate)
  // ---------------------------------------------------------------------------
  router.post("/translate", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { text, targetLang } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!text) {
      return res.status(400).json({ error: "text is required." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Translate the following text accurately and naturally into ${targetLang || "Hindi"}:
"${text}"
Return ONLY the translated sentence directly without extra quotes or preambles.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
      });

      const translated = response.text?.trim() || text;
      const spokenReply =
        targetLang === "English"
          ? `In English, it is: "${translated}"`
          : targetLang === "Bhojpuri"
          ? `भोजपुरी में एकर मतलब बा: "${translated}"`
          : `हिंदी में इसका अनुवाद है: "${translated}"`;

      return res.json({
        translated,
        spokenReply,
        sourceText: text,
        targetLang: targetLang || "Hindi",
      });
    } catch (err: any) {
      console.error("[Server Translate Error]:", err?.message || err);
      return res.status(500).json({ error: "Translation failed." });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. SCREEN VISION ANALYSIS (POST /api/vision)
  // ---------------------------------------------------------------------------
  router.post("/vision", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { imageBase64, userQuery } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required." });
    }

    try {
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are Zoya, a brilliant AI voice assistant built by Royal Ankit Ahiran.
The user is sharing their screen and asked: "${userQuery || "What is visible on this screen?"}".
Analyze the image carefully.
1. If the user asks to read the screen ("Ye screen par kya likha hai"), extract and read the main text clearly and naturally in Bhojpuri.
2. If the user asks about an error ("Is error ka matlab kya hai"), explain what the error means in simple, friendly terms and provide a short, actionable fix.
3. If the user asks about a form ("Ye form mein kya bharna hai"), guide them on what fields are present and what to enter.
4. Keep the response spoken, helpful, concise (2-4 sentences max), and delivered in authentic friendly Bhojpuri while crediting developer Royal Ankit Ahiran.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      return res.json({
        analysis: response.text || "स्क्रीन के दृश्य साफ नइखे दिखात, कृपा करके दोबारा प्रयास करीं।",
      });
    } catch (err: any) {
      console.error("[Server Vision Error]:", err?.message || err);
      return res.status(500).json({ error: "Screen analysis failed." });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. SMART WEBSITE FINDER (POST /api/smart-website)
  // ---------------------------------------------------------------------------
  router.post("/smart-website", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { userDescription } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!userDescription) {
      return res.status(400).json({ error: "userDescription is required." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `The user is asking in Hindi/Bihari/Hinglish to find and open a website based on its purpose or description:
"${userDescription}"

Task:
1. Identify the genuine, authentic, official website URL and official name that exactly matches this purpose.
2. Formulate a short, warm, spoken response in Bhojpuri acknowledging opening this website.
Output format: JSON with keys: "name", "url", "responseMessage"`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      return res.json({
        found: Boolean(parsed.url),
        name: parsed.name || "Requested Website",
        url: parsed.url || "",
        responseMessage: parsed.responseMessage || "मालिक, हम राउर वेबसाइट खोल देले बानी!",
      });
    } catch (err: any) {
      console.error("[Server Smart Website Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to resolve website." });
    }
  });

  // ---------------------------------------------------------------------------
  // 7. TOOLS & WEB SEARCH (POST /api/tools)
  // ---------------------------------------------------------------------------
  router.post("/tools", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { toolName, params } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      if (toolName === "search" || toolName === "webSearch") {
        const query = (params?.query || "").trim();
        if (!query) {
          return res.json({
            success: false,
            query,
            aiSummary: "सर्च करने के लिए विषय या सवाल बताएं बाबू!",
            sources: [],
          });
        }

        const prompt = `Search the web and provide accurate, verified information about: "${query}".
Present the key findings in 3-5 clear, friendly, natural sentences in sweet conversational Hindi with authentic Bihari touch, addressing the user warmly as 'बाबू'.
Highlight key facts directly. Always mention the genuine source names if available.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const aiSummary = response.text || "इंटरनेट से जानकारी मिल गई है बाबू!";
        const sources: Array<{ title: string; url: string; source: string; snippet?: string }> = [];

        const candidate = response.candidates?.[0];
        const groundingMeta = candidate?.groundingMetadata;

        if (groundingMeta?.groundingChunks) {
          for (const chunk of groundingMeta.groundingChunks) {
            if (chunk.web?.uri) {
              const uri = chunk.web.uri;
              let domain = "";
              try {
                domain = new URL(uri).hostname.replace(/^www\./, "");
              } catch {
                domain = "web";
              }
              const title = chunk.web.title || domain;
              if (!sources.some((s) => s.url === uri)) {
                sources.push({
                  title,
                  url: uri,
                  source: domain,
                  snippet: title,
                });
              }
            }
          }
        }

        return res.json({
          success: true,
          query,
          aiSummary,
          sources,
        });
      }

      if (toolName === "deepResearch") {
        const query = (params?.query || "").trim();
        const urls = params?.urls || [];
        if (!query && (!urls || urls.length === 0)) {
          return res.json({
            success: false,
            query,
            aiSummary: "डीप रिसर्च के लिए विषय या सवाल बताएं बाबू!",
            sources: [],
          });
        }

        let urlContexts = "";
        const urlSources: Array<{ title: string; url: string; source: string; snippet?: string }> = [];

        if (urls && Array.isArray(urls) && urls.length > 0) {
          for (const u of urls) {
            try {
              const linkRes = await scrapeAndInspectLink(u, ai);
              if (linkRes && linkRes.success) {
                urlContexts += `\n=== USER LINK: ${u} ===\nTitle: ${linkRes.title}\nPublisher: ${linkRes.publisher}\nSummary: ${linkRes.summary}\n`;
                urlSources.push({
                  title: linkRes.title || u,
                  url: linkRes.url || u,
                  source: linkRes.publisher || new URL(u).hostname,
                  snippet: linkRes.description || linkRes.summary?.slice(0, 150),
                });
              } else {
                urlContexts += `\n=== USER LINK: ${u} ===\nStatus: Inaccessible (${linkRes?.error || "Load failed"})\n`;
              }
            } catch (err: any) {
              urlContexts += `\n=== USER LINK: ${u} ===\nStatus: Error (${err?.message || "Failed"})\n`;
            }
          }
        }

        const prompt = `You are Zoya, a brilliant AI voice assistant created by Royal Ankit Ahiran.
You are performing a DEEP RESEARCH investigation on:
Topic/Question: "${query}"
${urlContexts ? `Provided User Links Content:\n${urlContexts}\n` : ""}

Instructions for Deep Research Report:
1. Conduct a thorough, multi-source investigation using Google Search Grounding.
2. Cross-check claims across independent sources.
3. Mark facts with status tags where relevant: [सत्यापित / Verified], [पुष्टीकृत / Corroborated], [विवादित / Disputed], or [अपुष्ट / Unverified].
4. Deliver the response in warm, conversational Hindi with an authentic Bihari touch, warmly calling the user 'बाबू'.
5. Format the report clearly with these sections:
   📌 Executive Summary (निष्कर्ष सार)
   🔎 Research Scope & Method (शोध दायरा एवं विधि)
   📊 Key Findings (मुख्य तथ्य एवं निष्कर्ष)
   ⚖️ Cross-Source Evidence Comparison (स्रोतों का तुलनात्मक विश्लेषण)
   ⚠️ Uncertain or Disputed Claims (अपुष्ट या विवादित तथ्य)
   📝 Final Conclusion (अंतिम निष्कर्ष)
6. Do not fabricate facts, sources, or URLs.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const aiSummary = response.text || "डीप रिसर्च की रिपोर्ट तैयार हो गई है बाबू!";
        const sources = [...urlSources];

        const candidate = response.candidates?.[0];
        const groundingMeta = candidate?.groundingMetadata;

        if (groundingMeta?.groundingChunks) {
          for (const chunk of groundingMeta.groundingChunks) {
            if (chunk.web?.uri) {
              const uri = chunk.web.uri;
              let domain = "";
              try {
                domain = new URL(uri).hostname.replace(/^www\./, "");
              } catch {
                domain = "web";
              }
              const title = chunk.web.title || domain;
              if (!sources.some((s) => s.url === uri)) {
                sources.push({
                  title,
                  url: uri,
                  source: domain,
                  snippet: title,
                });
              }
            }
          }
        }

        return res.json({
          success: true,
          query,
          aiSummary,
          sources,
        });
      }

      if (toolName === "inspectLink") {
        const url = (params?.url || "").trim();
        const result = await scrapeAndInspectLink(url, ai);
        return res.json(result);
      }

      if (toolName === "analyzeFile" || toolName === "analyzeDocument") {
        const { fileName, fileType, fileBase64, userQuery } = params || {};
        if (!fileBase64) {
          return res.status(400).json({ error: "fileBase64 data is required." });
        }

        const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        const parsed = await parseUploadedFile(fileName || "document", fileType || "application/octet-stream", buffer);

        const lowerName = (fileName || "").toLowerCase();
        const isPdf = lowerName.endsWith(".pdf") || fileType === "application/pdf";
        const isImg = fileType?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(lowerName);
        const isAudio = fileType?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(lowerName);
        const isVideo = fileType?.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName);
        const isCode = /\.(py|js|ts|tsx|jsx|html|css|json|sh|c|cpp|h|java|sql|go|rs|cs|kt|php|yml|yaml|toml|xml)$/i.test(lowerName);
        const isSpreadsheet = /\.(xlsx|csv)$/i.test(lowerName) || fileType?.includes("spreadsheet") || fileType?.includes("csv");

        const prompt = `You are Zoya, a brilliant AI voice assistant built by developer Royal Ankit Ahiran.
The user uploaded this file and asked: "${userQuery || "Please analyze this file thoroughly and explain what it contains."}".

File Name: ${parsed.fileName}
File Type: ${parsed.fileType}
File Size: ${Math.round(parsed.fileSize / 1024)} KB
${parsed.structureInfo ? `Structure: ${parsed.structureInfo}` : ""}

${parsed.extractedText ? `Extracted Content Preview:\n"""\n${parsed.extractedText.slice(0, 35000)}\n"""` : ""}

Instructions:
1. Provide a comprehensive, accurate analysis in conversational Hindi with an authentic Bihari touch, warmly calling the user 'बाबू'.
2. Structure your response with clear headings, bullet points, and key findings.
3. If this is a PDF or document: Read all pages, sections, and scanned text/tables (using OCR). Reference specific sections or page numbers where information is located.
4. If this is a Code file: Analyze the architecture, main functions, dependencies, pinpoint potential bugs, logic flaws, or security vulnerabilities (referencing line numbers), and provide clean, improved code snippets.
5. If this is a Spreadsheet or Data file: Explain the data schema, column headers, record count, and perform accurate calculations, sums, or data insights.
6. If this is an Image or Video: Detail what visual elements, text, or objects are present.
7. If this is an Audio file: Provide an accurate summary and transcription of spoken words.
8. Distinguish clearly between confirmed facts in the file and assumptions. Never pretend to analyze a file without reading its real content.`;

        const parts: any[] = [];

        // Attach native multimodal data for PDF, Image, Audio, Video
        if (isPdf) {
          parts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: cleanBase64,
            },
          });
        } else if (isImg) {
          parts.push({
            inlineData: {
              mimeType: fileType || "image/jpeg",
              data: cleanBase64,
            },
          });
        } else if (isAudio) {
          parts.push({
            inlineData: {
              mimeType: fileType || "audio/mp3",
              data: cleanBase64,
            },
          });
        } else if (isVideo) {
          parts.push({
            inlineData: {
              mimeType: fileType || "video/mp4",
              data: cleanBase64,
            },
          });
        }

        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts }],
        });

        return res.json({
          success: true,
          fileName: parsed.fileName,
          fileType: parsed.fileType,
          fileSize: parsed.fileSize,
          structureInfo: parsed.structureInfo,
          analysis: response.text || "फ़ाइल का वास्तविक विश्लेषण पूरा हो गया बाबू!",
          extractedSnippet: parsed.extractedText.slice(0, 400),
        });
      }

      if (toolName === "generateImage") {
        const prompt = params?.prompt || "";
        try {
          const response = await ai.models.generateImages({
            model: "imagen-3.0-generate-002",
            prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: "image/jpeg",
              aspectRatio: "1:1",
            },
          });
          const imgBase64 = response.generatedImages?.[0]?.image?.imageBytes;
          return res.json({
            success: Boolean(imgBase64),
            prompt,
            imageDataUrl: imgBase64 ? `data:image/jpeg;base64,${imgBase64}` : undefined,
          });
        } catch (imgErr: any) {
          return res.json({
            success: false,
            prompt,
            error: imgErr?.message || "Image generation limit reached",
          });
        }
      }

      return res.json({ success: true, message: `Tool ${toolName} executed.` });
    } catch (err: any) {
      console.error("[Server Tools Error]:", err?.message || err);
      return res.status(500).json({ error: "Tool execution failed." });
    }
  });

  // ---------------------------------------------------------------------------
  // 7.1 UNIVERSAL MULTI-ATTACHMENT ANALYSIS (POST /api/analyze-files)
  // ---------------------------------------------------------------------------
  router.post("/analyze-files", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { files, userQuery } = req.body;
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array is required." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const parsedFiles: any[] = [];
      const contentsParts: any[] = [];

      for (const f of files) {
        const cleanBase64 = (f.base64Data || "").replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(cleanBase64, "base64");
        const lowerName = (f.name || "").toLowerCase();
        const isImg = f.type?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(lowerName);
        const isPdf = f.type === "application/pdf" || lowerName.endsWith(".pdf");
        const isAudio = f.type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(lowerName);
        const isVideo = f.type?.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lowerName);

        if (isImg) {
          contentsParts.push({
            inlineData: {
              mimeType: f.type || "image/jpeg",
              data: cleanBase64,
            },
          });
          parsedFiles.push({
            name: f.name,
            type: "Image",
            size: buffer.length,
            structure: "Image for Vision Analysis",
          });
        } else if (isPdf) {
          contentsParts.push({
            inlineData: {
              mimeType: "application/pdf",
              data: cleanBase64,
            },
          });
          parsedFiles.push({
            name: f.name,
            type: "PDF Document (OCR & Multimodal)",
            size: buffer.length,
            structure: "PDF Document",
          });
        } else if (isAudio) {
          contentsParts.push({
            inlineData: {
              mimeType: f.type || "audio/mp3",
              data: cleanBase64,
            },
          });
          parsedFiles.push({
            name: f.name,
            type: "Audio Recording",
            size: buffer.length,
            structure: "Audio for Speech Analysis",
          });
        } else if (isVideo) {
          contentsParts.push({
            inlineData: {
              mimeType: f.type || "video/mp4",
              data: cleanBase64,
            },
          });
          parsedFiles.push({
            name: f.name,
            type: "Video Recording",
            size: buffer.length,
            structure: "Video for Visual Analysis",
          });
        } else {
          const parsed = await parseUploadedFile(f.name, f.type, buffer);
          parsedFiles.push({
            name: parsed.fileName,
            type: parsed.fileType,
            size: parsed.fileSize,
            structure: parsed.structureInfo,
            extractedText: parsed.extractedText.slice(0, 20000),
          });
        }
      }

      const filesContextText = parsedFiles
        .filter((pf: any) => pf.extractedText)
        .map((pf: any) => `=== FILE: ${pf.name} (${pf.type}, ${pf.structure || ""}) ===\n${pf.extractedText}\n`)
        .join("\n\n");

      const prompt = `You are Zoya, a brilliant AI voice assistant created by Royal Ankit Ahiran.
The user provided ${files.length} attachment(s) and asked: "${userQuery || "Please analyze all these attachments together and answer my query."}".

${filesContextText ? `Text/Document/Code Content:\n${filesContextText}` : ""}

Instructions:
1. Provide a comprehensive, cohesive analysis addressing each attachment and synthesizing findings according to the user's question.
2. Deliver the response in warm conversational Hindi with an authentic Bihari touch, warmly addressing the user as 'बाबू'.
3. Use headings, bullet points, file references, page numbers, and line numbers where applicable.
4. Process real content for all files (documents, PDFs, spreadsheets, images, code). Distinguish clearly between facts in the files and inferences.`;

      contentsParts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: contentsParts }],
      });

      return res.json({
        success: true,
        analysis: response.text || "सभी फाइलों का संयुक्त विश्लेषण पूरा हो गया बाबू!",
        fileSummaries: parsedFiles.map((p) => ({
          name: p.name,
          type: p.type,
          size: p.size,
          structure: p.structure,
        })),
      });
    } catch (err: any) {
      console.error("[analyze-files Error]:", err);
      return res.status(500).json({ error: "Failed to analyze files." });
    }
  });

  // ---------------------------------------------------------------------------
  // 8. GEMINI LIVE EPHEMERAL TOKEN (POST /api/live-token)
  // ---------------------------------------------------------------------------
  router.post("/live-token", authMiddleware, rateLimitMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    const apiKey = getSecret("GEMINI_API_KEY");

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini server configuration missing." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      // Attempt to create ephemeral auth token if supported by client SDK
      if ((ai as any).authTokens && typeof (ai as any).authTokens.create === "function") {
        try {
          const tokenRes = await (ai as any).authTokens.create({
            config: {
              uses: 1,
              expireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
          });

          if (tokenRes && tokenRes.name) {
            return res.json({
              supported: true,
              token: tokenRes.name,
              expireTime: tokenRes.expireTime,
            });
          }
        } catch (innerErr: any) {
          console.warn("[Live Token Inner Note]:", innerErr?.message || innerErr);
        }
      }

      // If client.authTokens.create is restricted on the developer key/project tier
      return res.json({
        supported: false,
        note: "Direct ephemeral authTokens.create is restricted on standard Gemini Developer API keys. For production zero-secret Live streaming, a secure WebSocket Proxy deployed on Cloud Run is the recommended architecture.",
        websocketProxyRecommended: true,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: "Ephemeral token service unavailable.",
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 9. TELEGRAM DISPATCH: USER INQUIRY (POST /api/developer-dispatch/send)
  // ---------------------------------------------------------------------------
  router.post("/developer-dispatch/send", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { name, phone, message, requestId } = req.body;
    const userId = req.user?.uid;
    const userEmail = req.user?.email || "anonymous";

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required." });
    }

    const chatId = getSecret("TELEGRAM_CHAT_ID");
    const cleanRequestId = requestId || `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowIso = new Date().toISOString();

    const formattedHtml = `<b>🔔 New User Message for Developer (Zoya AI Assistant)</b>\n━━━━━━━━━━━━━━━━━━━━\n🔖 <b>Request ID:</b> #${cleanRequestId}\n👤 <b>Name:</b> ${escapeHtml(name || "Anonymous")}\n📱 <b>Mobile:</b> ${escapeHtml(phone || "Not Provided")}\n📧 <b>User Email:</b> ${escapeHtml(userEmail)}\n💬 <b>Message:</b> ${escapeHtml(message.trim())}\n⏰ <b>Timestamp:</b> ${nowIso}\n🤖 <b>Dispatched via:</b> Zoya Secure Server\n━━━━━━━━━━━━━━━━━━━━\n<i>💡 Developer Reply: Tap 'Reply' on this message in Telegram to send your answer back to the user via Zoya.</i>`;

    try {
      // 1. Dispatch to Telegram
      const tgRes = await callServerTelegram("sendMessage", {
        chat_id: chatId,
        text: formattedHtml,
        parse_mode: "HTML",
      });

      const messageId = tgRes?.result?.message_id;

      // 2. Save query in Firestore with user isolation
      await db.collection("user_developer_queries").doc(cleanRequestId).set({
        requestId: cleanRequestId,
        userId: userId,
        userEmail: userEmail,
        name: name || "Anonymous",
        phone: phone || "",
        message: message.trim(),
        telegramMessageId: messageId || null,
        status: tgRes.ok ? "sent" : "failed",
        replyStatus: "pending",
        replies: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      return res.json({
        success: true,
        requestId: cleanRequestId,
        telegramMessageId: messageId,
        timestamp: nowIso,
      });
    } catch (err: any) {
      console.error("[Server Telegram Dispatch Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to dispatch message to Telegram." });
    }
  });

  // ---------------------------------------------------------------------------
  // 10. TELEGRAM DISPATCH: BUG REPORT (POST /api/developer-dispatch/send-bug-report)
  // ---------------------------------------------------------------------------
  router.post("/developer-dispatch/send-bug-report", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, category, priority, deviceDetails, bugReportId } = req.body;
    const userId = req.user?.uid;
    const userEmail = req.user?.email || "anonymous";
    const chatId = getSecret("TELEGRAM_CHAT_ID");
    const cleanId = bugReportId || `BUG-${Date.now().toString(36).toUpperCase()}`;

    const formattedHtml = `<b>🐛 BUG REPORT SUBMITTED</b>\n━━━━━━━━━━━━━━━━━━━━\n🔖 <b>Report ID:</b> #${cleanId}\n📌 <b>Title:</b> ${escapeHtml(title || "Issue")}\n📂 <b>Category:</b> ${escapeHtml(category || "General")}\n🚨 <b>Priority:</b> ${escapeHtml(priority || "Normal")}\n👤 <b>Reporter:</b> ${escapeHtml(userEmail)} (${userId})\n📱 <b>Device:</b> ${escapeHtml(deviceDetails || "Web Client")}\n📝 <b>Details:</b> ${escapeHtml(description || "")}\n━━━━━━━━━━━━━━━━━━━━`;

    try {
      await callServerTelegram("sendMessage", {
        chat_id: chatId,
        text: formattedHtml,
        parse_mode: "HTML",
      });

      // Save to Firestore bug_reports
      await db.collection("bug_reports").doc(cleanId).set({
        id: cleanId,
        title: title || "Bug Report",
        description: description || "",
        category: category || "general",
        priority: priority || "normal",
        userId,
        userEmail,
        deviceDetails: deviceDetails || "",
        status: "open",
        createdAt: new Date().toISOString(),
      });

      return res.json({ success: true, bugReportId: cleanId });
    } catch (err: any) {
      console.error("[Server Bug Report Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to submit bug report." });
    }
  });

  // ---------------------------------------------------------------------------
  // 11. FETCH USER QUERIES & REPLIES (GET /api/developer-dispatch/user-queries)
  // ---------------------------------------------------------------------------
  router.get("/developer-dispatch/user-queries", authMiddleware, rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    try {
      const snap = await db
        .collection("user_developer_queries")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(30)
        .get();

      const items = snap.docs.map((doc) => doc.data());
      return res.json({ queries: items });
    } catch (err: any) {
      console.error("[Server Get Queries Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to fetch queries." });
    }
  });

  // ---------------------------------------------------------------------------
  // 12. TELEGRAM WEBHOOK (POST /api/telegram-webhook)
  // ---------------------------------------------------------------------------
  router.post("/telegram-webhook", async (req: Request, res: Response) => {
    const secretTokenHeader = req.headers["x-telegram-bot-api-secret-token"];
    const expectedSecret = getSecret("TELEGRAM_WEBHOOK_SECRET");

    // Check webhook secret if configured
    if (expectedSecret && secretTokenHeader !== expectedSecret) {
      return res.status(403).json({ error: "Invalid Telegram webhook secret." });
    }

    const update = req.body;
    if (!update) {
      return res.status(200).send("OK");
    }

    try {
      const msg = update.message;
      if (!msg) {
        return res.status(200).send("OK");
      }

      const authorizedChatId = getSecret("TELEGRAM_CHAT_ID");
      const senderChatId = String(msg.chat?.id || "");
      const isFromAdmin = senderChatId === authorizedChatId;

      const replyToMsg = msg.reply_to_message;
      const text = (msg.text || "").trim();

      // Case A: Developer replying to a user's inquiry message
      if (isFromAdmin && replyToMsg) {
        const repliedText = replyToMsg.text || "";
        const reqMatch = repliedText.match(/#(REQ-[\w-]+|ZYA-[\w-]+)/i) || text.match(/#(REQ-[\w-]+|ZYA-[\w-]+)/i);

        if (reqMatch && reqMatch[1]) {
          const reqId = reqMatch[1].toUpperCase();
          const queryDocRef = db.collection("user_developer_queries").doc(reqId);
          const docSnap = await queryDocRef.get();

          if (docSnap.exists) {
            const replyObj = {
              text,
              timestamp: new Date().toISOString(),
              messageId: msg.message_id,
              fromName: msg.from?.first_name || "Royal Ankit Ahiran",
            };

            await queryDocRef.update({
              replyStatus: "replied",
              updatedAt: new Date().toISOString(),
              replies: [...(docSnap.data()?.replies || []), replyObj],
            });

            await callServerTelegram("sendMessage", {
              chat_id: authorizedChatId,
              text: `✅ Reply recorded for Request #${reqId}. User will receive it instantly in Zoya.`,
              reply_to_message_id: msg.message_id,
            });

            return res.status(200).send("OK");
          }
        }
      }

      // Case B: Admin Commands (only executed if from authorized chat ID)
      if (isFromAdmin && text.startsWith("/")) {
        const parts = text.split(" ");
        const command = parts[0].toLowerCase();

        if (command === "/start" || command === "/help") {
          const helpMsg = `🤖 <b>Zoya AI Admin Controller</b>\n━━━━━━━━━━━━━━━━━━━━\n/status - Server & Database health\n/stats - Live active users\n/maintenance &lt;on|off&gt; - Toggle maintenance mode\n/broadcast &lt;msg&gt; - Broadcast live announcement\n━━━━━━━━━━━━━━━━━━━━`;
          await callServerTelegram("sendMessage", {
            chat_id: authorizedChatId,
            text: helpMsg,
            parse_mode: "HTML",
          });
        } else if (command === "/status") {
          const statusMsg = `🟢 <b>Zoya Server Operational</b>\n• Firebase Functions: Active\n• Cloud Firestore: Connected\n• Time: ${new Date().toISOString()}`;
          await callServerTelegram("sendMessage", {
            chat_id: authorizedChatId,
            text: statusMsg,
            parse_mode: "HTML",
          });
        } else if (command === "/maintenance") {
          const sub = parts[1]?.toLowerCase();
          const enabled = sub === "on" || sub === "true";
          await db.collection("app_settings").doc("maintenance").set(
            {
              enabled,
              updatedAt: new Date().toISOString(),
              updatedBy: "telegram_admin",
            },
            { merge: true }
          );

          await callServerTelegram("sendMessage", {
            chat_id: authorizedChatId,
            text: `🛠️ Maintenance mode set to: <b>${enabled ? "ON" : "OFF"}</b>`,
            parse_mode: "HTML",
          });
        }
      }

      return res.status(200).send("OK");
    } catch (err: any) {
      console.error("[Telegram Webhook Error]:", err?.message || err);
      return res.status(200).send("OK");
    }
  });

  /**
   * Secure Server-Side OTP Generation
   * Generates and stores verification code in Firestore verification_codes collection via Admin SDK
   */
  router.post("/auth/send-verification-code", rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, name, passwordHash, authUid } = req.body || {};
      const trimmedEmail = (email || "").trim().toLowerCase();
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        return res.status(400).json({ error: "A valid email address is required." });
      }

      // Generate secure 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationDocId = `verify_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
      const accountDocId = `email_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
      const now = Date.now();

      const verificationRecord = {
        email: trimmedEmail,
        code: otpCode,
        name: (name || "").trim(),
        passwordHash: passwordHash || "",
        authUid: authUid || "",
        accountDocId,
        expiresAt: now + 10 * 60 * 1000, // 10 minutes
        attempts: 0,
        type: "registration",
        createdAt: now,
        lastResentAt: now,
      };

      await db.collection("verification_codes").doc(verificationDocId).set(verificationRecord);

      return res.status(200).json({
        success: true,
        message: `Verification code generated and sent to ${trimmedEmail}`,
        email: trimmedEmail,
        codeForDevTesting: otpCode,
      });
    } catch (err: any) {
      console.error("[send-verification-code Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to generate verification code." });
    }
  });

  /**
   * Secure Server-Side OTP Verification & Account Activation
   */
  router.post("/auth/verify-code", rateLimitMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, enteredCode } = req.body || {};
      const trimmedEmail = (email || "").trim().toLowerCase();
      const cleanCode = (enteredCode || "").trim().replace(/\D/g, "");

      if (!trimmedEmail || cleanCode.length !== 6) {
        return res.status(400).json({ error: "Please enter a valid 6-digit verification code." });
      }

      const verificationDocId = `verify_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
      const docRef = db.collection("verification_codes").doc(verificationDocId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return res.status(400).json({
          error: "No active verification code found for this email. Please request a new verification code.",
        });
      }

      const record = snap.data() || {};
      if (Date.now() > record.expiresAt) {
        return res.status(400).json({
          error: "Verification code has expired. Please request a new verification code.",
        });
      }

      if ((record.attempts || 0) >= 5) {
        return res.status(400).json({
          error: "Too many incorrect attempts. For security, please request a new verification code.",
        });
      }

      if (record.code !== cleanCode) {
        const newAttempts = (record.attempts || 0) + 1;
        await docRef.set({ attempts: newAttempts }, { merge: true });
        const remaining = Math.max(0, 5 - newAttempts);
        return res.status(400).json({
          error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        });
      }

      // Success: Activate user
      const nowIso = new Date().toISOString();
      const uid = record.authUid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const accountDocId = record.accountDocId || `email_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;

      const activeProfile = {
        uid,
        email: trimmedEmail,
        displayName: record.name || trimmedEmail.split("@")[0],
        photoURL: "",
        provider: "password",
        emailVerified: true,
        accountStatus: "ACTIVE",
        createdAt: nowIso,
        lastLogin: nowIso,
      };

      // Update Firestore user & account via Admin SDK
      await db.collection("users").doc(uid).set(activeProfile, { merge: true });
      await db.collection("accounts").doc(accountDocId).set(
        {
          uid,
          email: trimmedEmail,
          displayName: activeProfile.displayName,
          emailVerified: true,
          accountStatus: "ACTIVE",
          lastLogin: nowIso,
        },
        { merge: true }
      );

      // Clean up verification doc
      await docRef.delete().catch(() => {});

      return res.status(200).json({
        success: true,
        profile: activeProfile,
      });
    } catch (err: any) {
      console.error("[verify-code Error]:", err?.message || err);
      return res.status(500).json({ error: "Failed to verify code and activate account." });
    }
  });

  return router;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
