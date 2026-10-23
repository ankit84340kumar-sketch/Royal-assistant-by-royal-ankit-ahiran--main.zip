// userStorageService.ts - Unified Per-User Storage for Zoya AI Voice Assistant
// Manages reminders, journal entries, study logs, settings, and contact birthdays

export interface ReminderItem {
  id: string;
  text: string;
  timestamp: number; // Scheduled time in ms
  timeString: string; // User-readable time
  completed: boolean;
  notified: boolean;
  createdAt: number;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  text: string;
  tags?: string[];
}

export interface StudyLog {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  durationMinutes: number;
  topic?: string;
  notes?: string;
}

export interface UserSettings {
  wakeWordEnabled: boolean;
  dailyGreetingEnabled: boolean;
  dailyQuoteEnabled: boolean;
  soundEffectsEnabled: boolean;
  conversationTone?: "hinglish" | "hindi" | "english";
  remindersEnabled?: boolean;
  systemAlertsEnabled?: boolean;
  replySoundEnabled?: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  wakeWordEnabled: false,
  dailyGreetingEnabled: true,
  dailyQuoteEnabled: true,
  soundEffectsEnabled: true,
  conversationTone: "hinglish",
  remindersEnabled: true,
  systemAlertsEnabled: true,
  replySoundEnabled: true,
};

function getStorageKey(userId: string, section: string): string {
  return `zoya_user_${userId}_${section}`;
}

// 1. Reminders Storage
export function loadUserReminders(userId: string): ReminderItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, "reminders"));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load reminders:", e);
    return [];
  }
}

export function saveUserReminders(userId: string, reminders: ReminderItem[]): void {
  try {
    localStorage.setItem(getStorageKey(userId, "reminders"), JSON.stringify(reminders));
  } catch (e) {
    console.error("Failed to save reminders:", e);
  }
}

export function addUserReminder(userId: string, text: string, timestamp: number, timeString: string): ReminderItem {
  const reminders = loadUserReminders(userId);
  const newReminder: ReminderItem = {
    id: "rem_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    text,
    timestamp,
    timeString,
    completed: false,
    notified: false,
    createdAt: Date.now(),
  };
  reminders.push(newReminder);
  saveUserReminders(userId, reminders);
  return newReminder;
}

// 2. Journal Storage
export function loadUserJournal(userId: string): JournalEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, "journal"));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load journal:", e);
    return [];
  }
}

export function saveUserJournal(userId: string, entries: JournalEntry[]): void {
  try {
    localStorage.setItem(getStorageKey(userId, "journal"), JSON.stringify(entries));
  } catch (e) {
    console.error("Failed to save journal:", e);
  }
}

export function addUserJournalEntry(userId: string, text: string): JournalEntry {
  const entries = loadUserJournal(userId);
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const newEntry: JournalEntry = {
    id: "jnl_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    date: dateStr,
    timestamp: Date.now(),
    text,
  };
  entries.push(newEntry);
  saveUserJournal(userId, entries);
  return newEntry;
}

// 3. Study Log Storage
export function loadUserStudyLogs(userId: string): StudyLog[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, "studylogs"));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load study logs:", e);
    return [];
  }
}

export function saveUserStudyLogs(userId: string, logs: StudyLog[]): void {
  try {
    localStorage.setItem(getStorageKey(userId, "studylogs"), JSON.stringify(logs));
  } catch (e) {
    console.error("Failed to save study logs:", e);
  }
}

export function addStudyLog(userId: string, durationMinutes: number, topic = "Coding & Technology"): StudyLog {
  const logs = loadUserStudyLogs(userId);
  const dateStr = new Date().toISOString().split("T")[0];
  const newLog: StudyLog = {
    id: "std_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    date: dateStr,
    timestamp: Date.now(),
    durationMinutes,
    topic,
  };
  logs.push(newLog);
  saveUserStudyLogs(userId, logs);
  return newLog;
}

export function getTodayStudyMinutes(userId: string): number {
  const logs = loadUserStudyLogs(userId);
  const todayStr = new Date().toISOString().split("T")[0];
  return logs
    .filter((l) => l.date === todayStr)
    .reduce((acc, curr) => acc + curr.durationMinutes, 0);
}

// 4. Settings Storage
export function loadUserSettings(userId: string): UserSettings {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, "settings"));
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function saveUserSettings(userId: string, settings: UserSettings): void {
  try {
    localStorage.setItem(getStorageKey(userId, "settings"), JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

// 5. Daily Greeting & Quote Tracking (Once per day)
export function hasSeenDailyGreetingToday(userId: string): boolean {
  const todayStr = new Date().toISOString().split("T")[0];
  const lastGreeting = localStorage.getItem(getStorageKey(userId, "last_greeting_date"));
  return lastGreeting === todayStr;
}

export function markDailyGreetingSeen(userId: string): void {
  const todayStr = new Date().toISOString().split("T")[0];
  localStorage.setItem(getStorageKey(userId, "last_greeting_date"), todayStr);
}

export function hasSeenDailyQuoteToday(userId: string): boolean {
  const todayStr = new Date().toISOString().split("T")[0];
  const lastQuote = localStorage.getItem(getStorageKey(userId, "last_quote_date"));
  return lastQuote === todayStr;
}

export function markDailyQuoteSeen(userId: string): void {
  const todayStr = new Date().toISOString().split("T")[0];
  localStorage.setItem(getStorageKey(userId, "last_quote_date"), todayStr);
}
