// api.ts - Secure Server-Side API Client for Zoya Assistant
// Routes all AI, TTS, Translation, Vision, and Telegram calls through Firebase Functions / Server
// Never exposes API keys or Telegram tokens in the browser bundle

import { auth } from "./firebaseService";

/**
 * Retrieves the current authenticated user's Firebase ID token
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (user) {
      return await user.getIdToken();
    }
  } catch (err) {
    console.warn("[API] Could not retrieve user ID token:", err);
  }
  return null;
}

/**
 * Base fetch wrapper attaching Authorization Bearer token
 */
async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return fetch(cleanEndpoint, {
    ...options,
    headers,
  });
}

/**
 * Streaming Chat API via Server-Sent Events (SSE)
 * Calls /api/chat and invokes onChunk for each incoming token chunk
 */
export async function apiChatStream(
  params: {
    messages: Array<{ role: string; content?: string; text?: string }>;
    systemInstruction?: string;
    model?: string;
  },
  onChunk: (chunkText: string) => void,
  onComplete: () => void,
  onError: (err: any) => void
): Promise<void> {
  try {
    const response = await fetchApi("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Chat request failed [${response.status}]: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") {
          onComplete();
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.text) {
            onChunk(parsed.text);
          }
        } catch {
          // Ignore parse errors on raw tokens
        }
      }
    }

    onComplete();
  } catch (err: any) {
    console.error("[apiChatStream Error]:", err?.message || err);
    onError(err);
  }
}

/**
 * High-speed Server TTS API
 */
export async function apiTTS(
  text: string,
  voice: string = "Puck"
): Promise<{ audioBase64: string; format: "pcm" | "mp3" }> {
  const response = await fetchApi("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `TTS failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Weather & News Briefing API
 */
export async function apiWeatherNews(
  type: "weather" | "news",
  query?: string
): Promise<string> {
  const response = await fetchApi("/api/weather-news", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, query }),
  });

  if (!response.ok) {
    throw new Error(`Weather/News request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.result || "";
}

/**
 * Translation API
 */
export async function apiTranslate(
  text: string,
  targetLang: string
): Promise<{ translated: string; spokenReply: string; sourceText: string; targetLang: string }> {
  const response = await fetchApi("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLang }),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Screen Vision Analysis API
 */
export async function apiVision(
  imageBase64: string,
  userQuery?: string
): Promise<string> {
  const response = await fetchApi("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, userQuery }),
  });

  if (!response.ok) {
    throw new Error(`Vision analysis failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.analysis || "";
}

/**
 * Smart Website Resolution API
 */
export async function apiSmartWebsite(
  userDescription: string
): Promise<{ found: boolean; name: string; url: string; responseMessage: string }> {
  const response = await fetchApi("/api/smart-website", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userDescription }),
  });

  if (!response.ok) {
    throw new Error(`Website resolution failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Web Search & Tools API
 */
export async function apiTools(
  toolName: string,
  params: any
): Promise<any> {
  const response = await fetchApi("/api/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, params }),
  });

  if (!response.ok) {
    throw new Error(`Tool ${toolName} failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Multi-file Universal Analysis API
 */
export async function apiAnalyzeFiles(
  files: Array<{ name: string; type: string; base64Data: string }>,
  userQuery?: string
): Promise<{ success: boolean; analysis: string; fileSummaries?: any[]; error?: string }> {
  const response = await fetchApi("/api/analyze-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, userQuery }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `File analysis failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Gemini Live Ephemeral Token API
 */
export async function apiLiveToken(): Promise<{
  supported: boolean;
  token?: string;
  expireTime?: string;
  note?: string;
  websocketProxyRecommended?: boolean;
}> {
  try {
    const response = await fetchApi("/api/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("[apiLiveToken Error]:", err);
  }

  return {
    supported: false,
    note: "Server live token endpoint unreachable or restricted.",
    websocketProxyRecommended: true,
  };
}

/**
 * Telegram Dispatch: User Inquiry
 */
export async function apiDeveloperDispatchSend(payload: {
  name: string;
  phone?: string;
  message: string;
  requestId?: string;
}): Promise<{ success: boolean; requestId: string; timestamp: string; telegramMessageId?: number }> {
  const response = await fetchApi("/api/developer-dispatch/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to dispatch message to developer.");
  }

  return response.json();
}

/**
 * Telegram Dispatch: Bug Report
 */
export async function apiDeveloperDispatchBugReport(payload: {
  title: string;
  description: string;
  category: string;
  priority: string;
  deviceDetails?: string;
  bugReportId?: string;
}): Promise<{ success: boolean; bugReportId: string }> {
  const response = await fetchApi("/api/developer-dispatch/send-bug-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to submit bug report.");
  }

  return response.json();
}

/**
 * Get User Inquiries & Developer Replies
 */
export async function apiDeveloperDispatchUserQueries(): Promise<any[]> {
  const response = await fetchApi("/api/developer-dispatch/user-queries", {
    method: "GET",
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.queries || [];
}

/**
 * Send Email Verification Code via Server Endpoint
 */
export async function apiSendVerificationCode(payload: {
  email: string;
  name?: string;
  passwordHash?: string;
  authUid?: string;
}): Promise<{ success: boolean; message: string; email: string; codeForDevTesting?: string }> {
  const response = await fetchApi("/api/auth/send-verification-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to send verification code.");
  }

  return response.json();
}

/**
 * Verify Registration Code & Activate Account via Server Endpoint
 */
export async function apiVerifyRegistrationCode(payload: {
  email: string;
  enteredCode: string;
}): Promise<{ success: boolean; profile: any }> {
  const response = await fetchApi("/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to verify code.");
  }

  return response.json();
}

