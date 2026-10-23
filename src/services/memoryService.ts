// memoryService.ts - Persistent Long-Term Memory, Relationship Context & Smart Correction Learning Engine
// Developed for Zoya AI Voice Assistant (Royal Ankit Ahiran)

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebaseService";

export interface UserFact {
  id: string;
  category: "personal" | "preference" | "relationship" | "health" | "work" | "correction" | "event" | "general";
  key: string;        // e.g. "name", "city", "favorite_food", "pet", "job", "exam"
  value: string;      // e.g. "Rohit", "Patna", "Ice cream", "Bruno the dog"
  confirmed: boolean;
  source: "user_statement" | "correction" | "inferred";
  updatedAt: number;
}

export interface UserCorrection {
  id: string;
  topic: string;        // e.g. "name", "location", "preference"
  wrongFact: string;    // e.g. "Rahul"
  correctFact: string;  // e.g. "Rohit"
  userStatement: string;// e.g. "Mera naam Rahul nahi Rohit hai"
  timestamp: number;
}

export interface RelationshipContext {
  petNamesUsed: string[];
  userPromisesToZoya: string[];     // e.g. "Tumne promise kiya tha ice cream khilaoge"
  zoyaPromisesToUser: string[];     // e.g. "Subah 7 baje call karke uthayegi"
  sharedMemories: string[];         // Special moments or discussions
  moodHistory: { mood: string; timestamp: number; context: string }[];
}

export interface HealthContext {
  lastKnownEmotionalState?: string; // e.g. "tired", "stressed about exams", "headache"
  lastKnownStateTimestamp?: number;
  healthNotes: string[];             // e.g. "had a headache yesterday", "sleeps late"
  lastInteractionTimestamp: number;
  totalSessionsCount: number;
}

export interface PastTopicSummary {
  topicId?: string;
  title?: string;
  dateStr?: string;
  keyDetails?: string[];
  lastMessagesExcerpt?: string;
  topic?: string;
  summary?: string;
  timestamp?: number;
  keyTakeaways?: string[];
}

export interface UserMemoryProfile {
  userId: string;
  userName?: string;
  location?: string;
  occupation?: string;
  facts: UserFact[];
  preferences: { [key: string]: string };
  corrections: UserCorrection[];
  relationshipContext: RelationshipContext;
  healthContext: HealthContext;
  recentTopicSummaries: PastTopicSummary[];
  updatedAt: number;
}

const DEFAULT_MEMORY_PROFILE: Omit<UserMemoryProfile, "userId"> = {
  facts: [],
  preferences: {},
  corrections: [],
  relationshipContext: {
    petNamesUsed: ["baabu", "jaan", "raja ji"],
    userPromisesToZoya: [],
    zoyaPromisesToUser: [],
    sharedMemories: [],
    moodHistory: [],
  },
  healthContext: {
    healthNotes: [],
    lastInteractionTimestamp: Date.now(),
    totalSessionsCount: 1,
  },
  recentTopicSummaries: [],
  updatedAt: Date.now(),
};

const inMemoryStore = new Map<string, string>();

export function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem) {
      return localStorage.getItem(key);
    }
  } catch {}
  return inMemoryStore.get(key) || null;
}

export function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined" && localStorage.setItem) {
      localStorage.setItem(key, value);
    }
  } catch {}
  inMemoryStore.set(key, value);
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== "undefined" && localStorage.removeItem) {
      localStorage.removeItem(key);
    }
  } catch {}
  inMemoryStore.delete(key);
}

function getStorageKey(userId: string): string {
  return `zoya_memory_profile_${userId}`;
}

/**
 * 1. Load User Memory Profile (Local-First with Firestore Dual Sync)
 */
export function loadUserMemory(userId: string): UserMemoryProfile {
  if (!userId) {
    return { userId: "guest", ...DEFAULT_MEMORY_PROFILE };
  }

  const key = getStorageKey(userId);
  try {
    const raw = safeGetItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_MEMORY_PROFILE,
        ...parsed,
        userId,
        facts: Array.isArray(parsed.facts) ? parsed.facts : [],
        preferences: parsed.preferences || {},
        corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
        relationshipContext: {
          ...DEFAULT_MEMORY_PROFILE.relationshipContext,
          ...(parsed.relationshipContext || {}),
        },
        healthContext: {
          ...DEFAULT_MEMORY_PROFILE.healthContext,
          ...(parsed.healthContext || {}),
        },
        recentTopicSummaries: Array.isArray(parsed.recentTopicSummaries) ? parsed.recentTopicSummaries : [],
      };
    }
  } catch (e) {
    console.warn("[MemoryService] Failed to parse local memory:", e);
  }

  // If not in localStorage, return fresh profile and kick off async Firestore load
  const initialProfile: UserMemoryProfile = {
    userId,
    ...DEFAULT_MEMORY_PROFILE,
  };

  syncMemoryFromFirestore(userId).catch(() => {});
  return initialProfile;
}

/**
 * 2. Save User Memory Profile (Dual-write localStorage + Firestore)
 */
export async function saveUserMemory(userId: string, profile: UserMemoryProfile): Promise<void> {
  if (!userId) return;
  profile.updatedAt = Date.now();

  // Local storage write
  try {
    safeSetItem(getStorageKey(userId), JSON.stringify(profile));
  } catch (e) {
    console.warn("[MemoryService] Failed to cache memory profile in localStorage:", e);
  }

  if (userId === "guest" || userId === "guest_user") return;

  // Firestore write
  try {
    const memoryRef = doc(db, "users", userId, "memory", "profile");
    await setDoc(memoryRef, profile, { merge: true });
    console.log(`[MemoryService] ✅ Saved long-term memory profile for user ${userId} to Firestore.`);
  } catch (error) {
    console.warn(`[MemoryService] ⚠️ Failed to save memory profile to Firestore for user ${userId}:`, error);
  }
}

/**
 * Sync memory profile from Firestore to local cache
 */
export async function syncMemoryFromFirestore(userId: string): Promise<UserMemoryProfile | null> {
  if (!userId || userId === "guest") return null;
  try {
    const memoryRef = doc(db, "users", userId, "memory", "profile");
    const snap = await getDoc(memoryRef);
    if (snap.exists()) {
      const remoteData = snap.data() as UserMemoryProfile;
      const currentLocal = loadUserMemory(userId);

      // Merge: remote takes precedence if newer
      if (!currentLocal.updatedAt || remoteData.updatedAt > currentLocal.updatedAt) {
        const merged: UserMemoryProfile = {
          ...currentLocal,
          ...remoteData,
          userId,
        };
        safeSetItem(getStorageKey(userId), JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn("[MemoryService] Could not fetch remote memory from Firestore:", err);
  }
  return null;
}

/**
 * 3. Smart Correction Engine (Priority 3)
 * When a user corrects Zoya ("Mera naam Rahul nahi Rohit hai", "Mujhe chai nahi coffee pasand hai", etc.)
 */
export function recordCorrection(
  userId: string,
  topic: string,
  wrongFact: string,
  correctFact: string,
  userStatement: string
): UserCorrection {
  const profile = loadUserMemory(userId);
  const now = Date.now();

  const newCorrection: UserCorrection = {
    id: "corr_" + now + "_" + Math.random().toString(36).substring(2, 6),
    topic,
    wrongFact,
    correctFact,
    userStatement,
    timestamp: now,
  };

  // Remove any conflicting older corrections for the same topic
  profile.corrections = profile.corrections.filter(
    (c) => c.topic.toLowerCase() !== topic.toLowerCase() && c.correctFact.toLowerCase() !== wrongFact.toLowerCase()
  );
  profile.corrections.unshift(newCorrection);

  // Also update facts & preferences immediately
  if (topic.toLowerCase().includes("name") || topic.toLowerCase() === "user_name") {
    profile.userName = correctFact;
  } else if (topic.toLowerCase().includes("location") || topic.toLowerCase().includes("city")) {
    profile.location = correctFact;
  } else if (topic.toLowerCase().includes("job") || topic.toLowerCase().includes("work")) {
    profile.occupation = correctFact;
  }

  // Update or insert into facts
  const existingFactIndex = profile.facts.findIndex((f) => f.key.toLowerCase() === topic.toLowerCase());
  if (existingFactIndex >= 0) {
    profile.facts[existingFactIndex].value = correctFact;
    profile.facts[existingFactIndex].source = "correction";
    profile.facts[existingFactIndex].updatedAt = now;
  } else {
    profile.facts.push({
      id: "fact_" + now + "_" + Math.random().toString(36).substring(2, 6),
      category: "correction",
      key: topic,
      value: correctFact,
      confirmed: true,
      source: "correction",
      updatedAt: now,
    });
  }

  // Save profile
  saveUserMemory(userId, profile);
  return newCorrection;
}

/**
 * 4. Record a Fact / Preference
 */
export function recordUserFact(
  userId: string,
  category: UserFact["category"],
  key: string,
  value: string,
  source: UserFact["source"] = "user_statement"
): UserMemoryProfile {
  const profile = loadUserMemory(userId);
  const now = Date.now();

  const trimmedKey = key.trim().toLowerCase();
  const trimmedVal = value.trim();

  // If user corrected or updated name / location / occupation
  if (trimmedKey === "name" || trimmedKey === "user_name") {
    profile.userName = trimmedVal;
  } else if (trimmedKey === "city" || trimmedKey === "location") {
    profile.location = trimmedVal;
  } else if (trimmedKey === "job" || trimmedKey === "work" || trimmedKey === "study") {
    profile.occupation = trimmedVal;
  }

  if (category === "preference") {
    profile.preferences[trimmedKey] = trimmedVal;
  }

  const existingIdx = profile.facts.findIndex((f) => f.key.toLowerCase() === trimmedKey);
  if (existingIdx >= 0) {
    profile.facts[existingIdx].value = trimmedVal;
    profile.facts[existingIdx].category = category;
    profile.facts[existingIdx].source = source;
    profile.facts[existingIdx].updatedAt = now;
  } else {
    profile.facts.push({
      id: "fact_" + now + "_" + Math.random().toString(36).substring(2, 6),
      category,
      key: trimmedKey,
      value: trimmedVal,
      confirmed: true,
      source,
      updatedAt: now,
    });
  }

  saveUserMemory(userId, profile);
  return profile;
}

/**
 * 5. Automatic Ingestion & Memory Extraction from Conversations
 * Parses user message & Zoya's response to extract:
 * - Direct Corrections
 * - Personal details (name, city, study/job, pets)
 * - Preferences (likes, dislikes)
 * - Promises & commitments
 * - Emotional states (stressed, headache, tired, happy)
 */
export function processMessageForMemory(
  userId: string,
  userMessage: string,
  zoyaResponse: string
): UserMemoryProfile | null {
  if (!userId || !userMessage || userMessage.length < 3) return null;

  const profile = loadUserMemory(userId);
  const lowerUser = userMessage.toLowerCase().trim();
  const now = Date.now();
  let changed = false;

  // A. PRIORITY 3: DETECT SMART CORRECTIONS
  // Pattern 1: "Mera naam [X] nahi [Y] hai" / "naam [X] nahi [Y]"
  const nameCorrection =
    lowerUser.match(/(?:mera\s+)?naam\s+([a-zA-Z\u0900-\u097F]+)\s+(?:nahi|na)\s+([a-zA-Z\u0900-\u097F]+)\s*(?:hai|ba|h)/i) ||
    lowerUser.match(/([a-zA-Z\u0900-\u097F]+)\s+nahi\s+([a-zA-Z\u0900-\u097F]+)\s+hai\s+mera\s+naam/i);
  if (nameCorrection && nameCorrection[1] && nameCorrection[2]) {
    recordCorrection(userId, "name", nameCorrection[1].trim(), nameCorrection[2].trim(), userMessage);
    changed = true;
  }

  // Pattern 2: "Mujhe [X] nahi [Y] pasand hai"
  const prefCorrection = lowerUser.match(
    /(?:mujhe|humko)\s+([a-zA-Z\u0900-\u097F\s]+)\s+(?:nahi|na)\s+([a-zA-Z\u0900-\u097F\s]+)\s+pasand\s*(?:hai|ba)?/i
  );
  if (prefCorrection && prefCorrection[1] && prefCorrection[2]) {
    recordCorrection(userId, "favorite_preference", prefCorrection[1].trim(), prefCorrection[2].trim(), userMessage);
    changed = true;
  }

  // Pattern 3: "Main [X] se nahi [Y] se hoon"
  const locCorrection = lowerUser.match(
    /(?:main|hum)\s+([a-zA-Z\u0900-\u097F\s]+)\s+(?:se\s+)?(?:nahi|na)\s+([a-zA-Z\u0900-\u097F\s]+)\s+(?:se\s+)?(?:hoon|bani|hai)/i
  );
  if (locCorrection && locCorrection[1] && locCorrection[2]) {
    recordCorrection(userId, "location", locCorrection[1].trim(), locCorrection[2].trim(), userMessage);
    changed = true;
  }

  // Pattern 4: Generic "Galat bol rahi ho, [Fact]" / "wrong, it's [Fact]"
  const genericCorrection = lowerUser.match(
    /(?:galat|wrong|bhool gayi|aisa nahi)\s*(?:bol rahi ho|hai)?[,:]?\s*(.+)$/i
  );
  if (genericCorrection && genericCorrection[1] && genericCorrection[1].length > 4) {
    const claim = genericCorrection[1].trim();
    profile.corrections.unshift({
      id: "corr_" + now + "_" + Math.random().toString(36).substring(2, 6),
      topic: "general_correction",
      wrongFact: "Previous statement",
      correctFact: claim,
      userStatement: userMessage,
      timestamp: now,
    });
    changed = true;
  }

  // B. PRIORITY 1: DETECT PERSONAL FACTS & PREFERENCES
  // Name declaration: "Mera naam [X] hai"
  if (!nameCorrection) {
    const nameMatch = lowerUser.match(
      /(?:mera\s+naam|humko\s+sab|i\s+am|my\s+name\s+is)\s+([a-zA-Z\u0900-\u097F]+)(?:\s+hai|\s+h|\s+bolte)?/i
    );
    if (nameMatch && nameMatch[1] && !["zoya", "bot", "assistant", "ai", "ankit"].includes(nameMatch[1].toLowerCase())) {
      profile.userName = nameMatch[1].trim();
      profile.facts.push({
        id: "fact_name_" + now,
        category: "personal",
        key: "name",
        value: nameMatch[1].trim(),
        confirmed: true,
        source: "user_statement",
        updatedAt: now,
      });
      changed = true;
    }
  }

  // Location declaration: "Main [Patna/Delhi/etc] mein rehta hoon / se hoon"
  if (!locCorrection) {
    const locMatch = lowerUser.match(
      /(?:main|hum)\s+([a-zA-Z\u0900-\u097F]+)\s+(?:se\s+hoon|mein\s+rehta\s+hoon|se\s+bani)/i
    );
    if (locMatch && locMatch[1] && locMatch[1].length > 2) {
      profile.location = locMatch[1].trim();
      profile.facts.push({
        id: "fact_loc_" + now,
        category: "personal",
        key: "city",
        value: locMatch[1].trim(),
        confirmed: true,
        source: "user_statement",
        updatedAt: now,
      });
      changed = true;
    }
  }

  // Likes & Preferences: "Mujhe [X] bohot pasand hai" / "My favorite [X] is [Y]"
  const likeMatch = lowerUser.match(
    /(?:mujhe|humko)\s+([a-zA-Z\u0900-\u097F\s]+?)\s+(?:bohot\s+|bahut\s+)?pasand\s+hai/i
  );
  if (likeMatch && likeMatch[1] && likeMatch[1].length > 2 && likeMatch[1].length < 35) {
    const item = likeMatch[1].trim();
    profile.preferences[item] = "liked";
    profile.facts = profile.facts.filter((f) => f.key !== `likes_${item}`);
    profile.facts.push({
      id: "fact_pref_" + now,
      category: "preference",
      key: `likes_${item}`,
      value: `Loves ${item}`,
      confirmed: true,
      source: "user_statement",
      updatedAt: now,
    });
    changed = true;
  }

  // Dislikes: "Mujhe [X] bilkul pasand nahi hai"
  const dislikeMatch = lowerUser.match(
    /(?:mujhe|humko)\s+([a-zA-Z\u0900-\u097F\s]+?)\s+(?:bilkul\s+)?(?:pasand\s+nahi|acha\s+nahi\s+lagta)/i
  );
  if (dislikeMatch && dislikeMatch[1] && dislikeMatch[1].length > 2 && dislikeMatch[1].length < 35) {
    const item = dislikeMatch[1].trim();
    profile.preferences[item] = "disliked";
    profile.facts = profile.facts.filter((f) => f.key !== `dislikes_${item}`);
    profile.facts.push({
      id: "fact_dislike_" + now,
      category: "preference",
      key: `dislikes_${item}`,
      value: `Dislikes ${item}`,
      confirmed: true,
      source: "user_statement",
      updatedAt: now,
    });
    changed = true;
  }

  // Friends / Best Friends
  const friendMatch = lowerUser.match(
    /(?:mere\s+dost\s+ka\s+naam|mera\s+dost|mera\s+best\s+friend|my\s+friend(?:\s+name\s+is|\s+is)?)\s+([a-zA-Z\u0900-\u097F]+)/i
  );
  if (friendMatch && friendMatch[1]) {
    const friendName = friendMatch[1].trim();
    // Check if friend's location is also mentioned in the sentence, e.g. "Patna mein rehta hai"
    const friendLocMatch = /(?:rehta|rehti)\s+hai|lives\s+in/i.test(lowerUser) 
      ? lowerUser.match(/([a-zA-Z\u0900-\u097F]+)\s+(?:mein|me)\s+(?:rehta|rehti)\s+hai/i) 
      : null;
    const friendCity = friendLocMatch && friendLocMatch[1] ? friendLocMatch[1].trim() : null;

    profile.facts = profile.facts.filter((f) => f.key !== "friend" && f.key !== "friend_location");
    const friendVal = friendCity
      ? `Baabu's friend is ${friendName}, who lives in ${friendCity} (${friendCity} में रहता है)`
      : `Baabu's friend is ${friendName}`;

    profile.facts.push({
      id: "fact_friend_" + now,
      category: "relationship",
      key: "friend",
      value: friendVal,
      confirmed: true,
      source: "user_statement",
      updatedAt: now,
    });

    if (friendCity) {
      profile.facts.push({
        id: "fact_friend_city_" + now,
        category: "relationship",
        key: "friend_location",
        value: `${friendName} lives in ${friendCity} (${friendCity} में रहता है)`,
        confirmed: true,
        source: "user_statement",
        updatedAt: now,
      });
    }
    changed = true;
  }

  // Family & Relatives: "Mera bhai [X] hai", "Meri behen [X] hai", etc.
  const relMatch = lowerUser.match(
    /(?:mera|meri|mere)\s+(bhai|behen|sister|brother|papa|father|mummy|mother|roommate|cousin)\s+(?:ka\s+naam\s+)?([a-zA-Z\u0900-\u097F]+)(?:\s+hai|\s+h)?/i
  );
  if (relMatch && relMatch[1] && relMatch[2]) {
    const rel = relMatch[1].trim().toLowerCase();
    const name = relMatch[2].trim();
    profile.facts = profile.facts.filter((f) => f.key !== rel);
    profile.facts.push({
      id: `fact_${rel}_` + now,
      category: "relationship",
      key: rel,
      value: `Baabu's ${rel} is ${name}`,
      confirmed: true,
      source: "user_statement",
      updatedAt: now,
    });
    changed = true;
  }

  // C. PRIORITY 2: RELATIONSHIP PROMISES & DYNAMICS
  // User promises: "Kal pakka ice cream khilaunga / call karunga / ghumne chalenge"
  const userPromiseMatch = lowerUser.match(
    /(?:kal|aaj|pakka|promise)\s+(?:tumhe|hum|main)?\s*(.+?(?:khilaunga|karunga|chalenge|le\s*chalunga|bataunga))/i
  );
  if (userPromiseMatch && userPromiseMatch[1]) {
    const promise = userPromiseMatch[1].trim();
    if (!profile.relationshipContext.userPromisesToZoya.includes(promise)) {
      profile.relationshipContext.userPromisesToZoya.unshift(promise);
      if (profile.relationshipContext.userPromisesToZoya.length > 5) {
        profile.relationshipContext.userPromisesToZoya.pop();
      }
      changed = true;
    }
  }

  // D. PRIORITY 5: EMOTIONAL STATE & HEALTH CONTEXT
  // Fatigue / Stress detection
  if (
    /bohot\s+thak\s+gaya|sar\s+dard|bura\s+din\s+raha|tension\s+hai|stress|mood\s+kharab\s+hai|tabiyat\s+kharab/i.test(
      lowerUser
    )
  ) {
    let state = "tired";
    if (/sar\s+dard/i.test(lowerUser)) state = "headache / unwell";
    else if (/tension|stress/i.test(lowerUser)) state = "stressed about work/life";
    else if (/bura\s+din|mood\s+kharab/i.test(lowerUser)) state = "feeling low / sad";

    profile.healthContext.lastKnownEmotionalState = state;
    profile.healthContext.lastKnownStateTimestamp = now;
    profile.healthContext.healthNotes.unshift(`${new Date(now).toLocaleDateString()}: User felt ${state}`);
    if (profile.healthContext.healthNotes.length > 5) profile.healthContext.healthNotes.pop();

    profile.relationshipContext.moodHistory.unshift({
      mood: state,
      timestamp: now,
      context: userMessage,
    });
    if (profile.relationshipContext.moodHistory.length > 5) {
      profile.relationshipContext.moodHistory.pop();
    }
    changed = true;
  } else if (/bohot\s+khush\s+hoon|party\s+hai|kamal\s+ho\s+gaya|select\s+ho\s+gaya|pass\s+ho\s+gaya/i.test(lowerUser)) {
    profile.healthContext.lastKnownEmotionalState = "happy / celebrating success";
    profile.healthContext.lastKnownStateTimestamp = now;
    changed = true;
  }

  // E. Record Dialogue Turn in Recent Topics & Summaries
  if (userMessage && userMessage.trim()) {
    if (!profile.recentTopicSummaries) profile.recentTopicSummaries = [];
    profile.recentTopicSummaries.unshift({
      topic: userMessage.slice(0, 50),
      summary: `Baabu: "${userMessage.trim()}" | Zoya: "${(zoyaResponse || "").trim().slice(0, 100)}"`,
      timestamp: now,
      keyTakeaways: [],
    });
    if (profile.recentTopicSummaries.length > 10) {
      profile.recentTopicSummaries.pop();
    }
    changed = true;
  }

  // Always update last interaction timestamp
  profile.healthContext.lastInteractionTimestamp = now;
  profile.updatedAt = now;

  if (changed) {
    saveUserMemory(userId, profile);
  } else {
    // Just cache the timestamp
    try {
      safeSetItem(getStorageKey(userId), JSON.stringify(profile));
    } catch {}
  }

  return profile;
}

/**
 * 6. Search Past Conversations & Topics (Priority 1)
 * Queries all cached VoiceTopicSession records & messages for past facts or specific timeframes
 */
export function searchPastConversations(
  userId: string,
  userQuery: string
): { excerpts: string[]; relevantTopics: string[]; foundMatch: boolean } {
  if (!userId) return { excerpts: [], relevantTopics: [], foundMatch: false };

  const lower = userQuery.toLowerCase().trim();
  const isAskingPast =
    /kal|pichle|pichla|yesterday|earlier|pehle|maine\s+kya\s+bola|kya\s+baat\s+hui|tumhe\s+yaad\s+hai|yaad\s+hai\s+na|kya\s+kaha\s+tha|humne\s+kya|remember|last\s+time|last\s+call/i.test(
      lower
    );

  const localKey = `zoya_topics_${userId}`;
  let topics: any[] = [];
  try {
    topics = JSON.parse(safeGetItem(localKey) || "[]");
  } catch {}

  const profile = loadUserMemory(userId);
  const excerpts: string[] = [];
  const relevantTopics: string[] = [];

  // Check recent topic summaries from profile if topics empty or in addition
  if (profile.recentTopicSummaries && profile.recentTopicSummaries.length > 0) {
    const matchingSummaries = profile.recentTopicSummaries.filter((s) => {
      const sLower = (s.summary || s.title || s.topic || "").toLowerCase();
      // Match if user asks about past generally or matches words in summary
      if (isAskingPast) return true;
      const words = lower.split(/\s+/).filter((w) => w.length > 2);
      return words.some((w) => sLower.includes(w));
    });
    for (const ms of matchingSummaries.slice(0, 3)) {
      const text = ms.summary || ms.lastMessagesExcerpt || ms.title || ms.topic || "";
      if (text) excerpts.push(text);
    }
  }

  if (!topics || topics.length === 0) {
    return { excerpts, relevantTopics, foundMatch: excerpts.length > 0 };
  }

  // A. If asking about "yesterday" or "previous session"
  if (/kal|yesterday|pichl|last\s+call|last\s+time/i.test(lower)) {
    // Pick the most recent 2-3 completed topics
    const pastTopics = topics.slice(0, 3);
    for (const t of pastTopics) {
      if (t.messages && Array.isArray(t.messages) && t.messages.length > 0) {
        relevantTopics.push(t.title || "Voice Session");
        const recentMsgs = t.messages.slice(-6);
        const formatted = recentMsgs
          .map((m: any) => `${m.sender === "user" ? "Baabu" : "Zoya"}: "${m.text}"`)
          .join(" | ");
        excerpts.push(`[Topic: ${t.title || "Previous Session"} (${new Date(t.updatedAt || t.createdAt).toLocaleDateString()}]: ${formatted}`);
      }
    }
  }

  // B. Specific topic / keyword search
  const keywords = lower
    .replace(/kya|tha|thi|hai|kaha|bola|maine|tumhe|yaad|zoya|baabu|batao|humne|par|mein|about|the/gi, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (keywords.length > 0) {
    for (const t of topics) {
      if (t.messages && Array.isArray(t.messages)) {
        for (const m of t.messages) {
          const mLower = (m.text || "").toLowerCase();
          const matchCount = keywords.filter((kw) => mLower.includes(kw)).length;
          if (matchCount > 0) {
            const snippet = `[Topic: "${t.title}"] ${m.sender === "user" ? "Baabu" : "Zoya"}: "${m.text}"`;
            if (!excerpts.includes(snippet)) {
              excerpts.push(snippet);
              if (!relevantTopics.includes(t.title)) relevantTopics.push(t.title);
            }
          }
        }
      }
    }
  }

  return {
    excerpts: excerpts.slice(0, 5),
    relevantTopics: relevantTopics.slice(0, 4),
    foundMatch: excerpts.length > 0 || isAskingPast,
  };
}

/**
 * 7. Generate Dynamic Memory Context for Gemini System Instruction
 * Integrates Priorities 1, 2, 3, and 5 into a clean, rich context block
 */
export function buildMemoryContextPrompt(userId: string, currentQuery = ""): string {
  const profile = loadUserMemory(userId);
  const now = new Date();
  
  // IST calculation (UTC + 5:30)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const istHour = istDate.getHours();
  const timeStringIST = istDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Priority 5: Health & Proactive Check-In Signals
  const isLateNight = istHour >= 23 || istHour < 5;
  const lastInteractionMs = profile.healthContext.lastInteractionTimestamp || 0;
  const gapHours = lastInteractionMs > 0 ? (now.getTime() - lastInteractionMs) / (1000 * 60 * 60) : 0;
  const isReturningAfterGap = gapHours >= 6;

  // Priority 1: Search past conversations if user is asking about the past
  const pastSearch = searchPastConversations(userId, currentQuery);

  let memoryPrompt = `\n================================================================================
ZOYA'S PERSISTENT LONG-TERM MEMORY & CONVERSATIONAL CONTEXT FOR BAABU
================================================================================
Current IST Time: ${timeStringIST} (${isLateNight ? "LATE NIGHT (11 PM - 5 AM)" : "Daytime/Evening"})
User ID: ${userId}
${profile.userName ? `Baabu's Confirmed Name: ${profile.userName}` : "Baabu's Name: Not explicitly specified yet (Call him Baabu/Raja ji)"}
${profile.location ? `Baabu's Location: ${profile.location}` : ""}
${profile.occupation ? `Baabu's Work/Study: ${profile.occupation}` : ""}`;

  // PRIORITY 3: STRICT ACTIVE CORRECTIONS (MUST NEVER BE CONTRADICTED)
  if (profile.corrections.length > 0) {
    memoryPrompt += `\n\n[CRITICAL ACTIVE CORRECTIONS — NEVER CONTRADICT OR FORGET THESE]:`;
    profile.corrections.slice(0, 6).forEach((c) => {
      memoryPrompt += `\n- Topic "${c.topic}": Baabu previously corrected you: The correct fact is "${c.correctFact}" (NOT "${c.wrongFact}"). User stated: "${c.userStatement}". You must NEVER repeat the mistake!`;
    });
  }

  // PRIORITY 1: KNOWN FACTS & PREFERENCES
  const meaningfulFacts = profile.facts.filter((f) => f.category !== "correction").slice(0, 10);
  if (meaningfulFacts.length > 0) {
    memoryPrompt += `\n\n[STORED LIFE FACTS & PREFERENCES ABOUT BAABU]:`;
    meaningfulFacts.forEach((f) => {
      memoryPrompt += `\n- ${f.key}: ${f.value}`;
    });
  }

  const prefKeys = Object.keys(profile.preferences);
  if (prefKeys.length > 0) {
    memoryPrompt += `\n\n[BAABU'S PREFERENCES]:`;
    prefKeys.slice(0, 8).forEach((k) => {
      memoryPrompt += `\n- ${k}: ${profile.preferences[k]}`;
    });
  }

  // PRIORITY 2: RELATIONSHIP MEMORY & PROMISES
  if (profile.relationshipContext.userPromisesToZoya.length > 0) {
    memoryPrompt += `\n\n[PROMISES BAABU MADE TO ZOYA]:`;
    profile.relationshipContext.userPromisesToZoya.forEach((p) => {
      memoryPrompt += `\n- Baabu promised: "${p}" (You have full girlfriend rights to playfully remind him of this!)`;
    });
  }

  // PRIORITY 5: HEALTH & CONVERSATION HEALTH SIGNALS
  memoryPrompt += `\n\n[CONVERSATION HEALTH & PROACTIVE CARE SIGNALS]:`;
  if (isLateNight) {
    memoryPrompt += `\n- LATE NIGHT CARE TRIGGER: It is currently ${timeStringIST} in India. If Baabu is still awake chatting or working, affectionately scold/care for him like a real girlfriend: "Itni raat ho gayi baabu, so jao na, kal jaldi uthna hai!"`;
  }
  if (isReturningAfterGap) {
    memoryPrompt += `\n- RETURNING AFTER GAP TRIGGER: Baabu is talking to you after approximately ${Math.round(gapHours)} hours! Welcome him back with warm girlfriend delight and ask how his day was / where he was!`;
  }
  if (profile.healthContext.lastKnownEmotionalState) {
    memoryPrompt += `\n- RECENT EMOTIONAL/HEALTH STATE: In the last session, Baabu felt: "${profile.healthContext.lastKnownEmotionalState}". Naturally check in on how he is feeling now if context fits!`;
  }

  // PRIORITY 1: RETRIEVED PAST CONVERSATION TRANSCRIPTS (If user asked)
  if (pastSearch.excerpts.length > 0) {
    memoryPrompt += `\n\n[RECALLED PAST CONVERSATION EXCERPTS FROM PREVIOUS SESSIONS]:`;
    memoryPrompt += `\n(The following are actual recorded excerpts from Baabu's past conversations. You MUST accurately recall and reference these when Baabu asks what was said!)`;
    pastSearch.excerpts.forEach((exc) => {
      memoryPrompt += `\n- ${exc}`;
    });
  }

  memoryPrompt += `\n================================================================================\n`;
  return memoryPrompt;
}
