// remindersService.ts - Natural Voice Reminders for Zoya AI
import { ReminderItem, loadUserReminders, saveUserReminders, addUserReminder } from "./userStorageService";

export interface ReminderParseResult {
  isReminderIntent: boolean;
  isQueryIntent: boolean;
  reminder?: ReminderItem;
  text?: string;
  response: string;
}

/**
 * Parses user speech/text into a reminder or reminder list query
 */
export function handleReminderCommand(userId: string, input: string): ReminderParseResult {
  const lower = input.toLowerCase().trim();

  // 1. Querying pending reminders
  const isQuery =
    /mera kya kya reminder|kya reminder hai|reminders dikhao|kya yaad dilana|pending reminder|list reminder|show reminder|reminders/i.test(
      lower
    ) && !/yaad dilana|set reminder|remind me/i.test(lower);

  if (isQuery) {
    const reminders = loadUserReminders(userId).filter((r) => !r.completed && r.timestamp > Date.now());
    if (reminders.length === 0) {
      return {
        isReminderIntent: false,
        isQueryIntent: true,
        response:
          "मालिक, अभी राउर कवनो पेंडिंग रिमाइंडर नइखे! अगर कवनो काम याद दिलावे के बा त बोलीं, हम तुरंत नोट क लेब!",
      };
    }

    const items = reminders
      .map((r, idx) => `${idx + 1}. ${r.text} (${new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`)
      .join("\n");

    return {
      isReminderIntent: false,
      isQueryIntent: true,
      response: `मालिक, राउर ई रिमाइंडर पेंडिंग बा:\n${items}\n\nसमय अइला पर हम खुद याद दिला देब!`,
    };
  }

  // 2. Setting a reminder
  const isSetReminder =
    /yaad dilana|yaad dila do|remind me|set reminder|reminder lagao|yaad dilaiha/i.test(lower);

  if (!isSetReminder) {
    return {
      isReminderIntent: false,
      isQueryIntent: false,
      response: "",
    };
  }

  const now = new Date();
  let targetTime: Date | null = null;
  let label = "काम";

  // Case A: Relative time - "X minute baad" / "X minutes later" / "X ghanta baad" / "X hours later"
  const relMinMatch = lower.match(/(\d+)\s*(?:minute|min|m)\s*(?:baad|me|later|after)/i);
  const relHourMatch = lower.match(/(\d+)\s*(?:ghanta|ghante|hour|hours|hr|hrs)\s*(?:baad|me|later|after)/i);

  if (relMinMatch) {
    const mins = parseInt(relMinMatch[1], 10);
    targetTime = new Date(now.getTime() + mins * 60 * 1000);
  } else if (relHourMatch) {
    const hrs = parseInt(relHourMatch[1], 10);
    targetTime = new Date(now.getTime() + hrs * 60 * 60 * 1000);
  }

  // Case B: Absolute time - "5 baje", "shaam 6 baje", "subah 8 baje", "5:30 baje", "at 5 pm"
  if (!targetTime) {
    const absTimeMatch =
      lower.match(/(?:subah|dopahar|shaam|raat)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:baje|am|pm|o'clock)?/i);

    if (absTimeMatch && absTimeMatch[1]) {
      let hour = parseInt(absTimeMatch[1], 10);
      const min = absTimeMatch[2] ? parseInt(absTimeMatch[2], 10) : 0;
      const isEvening = /shaam|raat|pm/i.test(lower);
      const isMorning = /subah|am/i.test(lower);

      if (isEvening && hour < 12) {
        hour += 12;
      } else if (isMorning && hour === 12) {
        hour = 0;
      } else if (!isMorning && !isEvening && hour >= 1 && hour <= 7 && now.getHours() >= 12) {
        // If it's already afternoon and user says "5 baje", default to 5 PM
        hour += 12;
      }

      const temp = new Date(now);
      temp.setHours(hour, min, 0, 0);

      // If time has already passed today, set for tomorrow
      if (temp.getTime() <= now.getTime()) {
        temp.setDate(temp.getDate() + 1);
      }
      targetTime = temp;
    }
  }

  // If still no time, default to 10 minutes from now
  if (!targetTime) {
    targetTime = new Date(now.getTime() + 10 * 60 * 1000);
  }

  // Extract reminder label / purpose
  // e.g. "Mujhe 5 baje yaad dilana ki medicine lena hai"
  const labelMatch =
    lower.match(/(?:ki|that|for|to)\s+(.+)$/i) ||
    lower.match(/yaad\s+dilana\s+(.+)$/i) ||
    lower.match(/^(.+?)\s+(?:yaad\s+dila|remind)/i);

  if (labelMatch && labelMatch[1]) {
    label = labelMatch[1]
      .replace(/ki|mujhe|humko|yaad|dilana|dila do|baje|minute|baad/gi, "")
      .trim();
    if (!label) label = "खास काम";
  }

  const timeString = targetTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const created = addUserReminder(userId, label, targetTime.getTime(), timeString);

  return {
    isReminderIntent: true,
    isQueryIntent: false,
    reminder: created,
    text: label,
    response: `जी मालिक, हम ${timeString} बजे खातिर "${label}" के रिमाइंडर सेट क देलीं! समय अइला पर हम बोल के याद दिला देब!`,
  };
}

/**
 * Request browser notification permissions
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

/**
 * Checks for due reminders and fires callback/notification
 */
export function checkDueReminders(
  userId: string,
  onDueReminder: (reminder: ReminderItem) => void
): void {
  const reminders = loadUserReminders(userId);
  const now = Date.now();
  let updated = false;

  reminders.forEach((r) => {
    if (!r.notified && !r.completed && r.timestamp <= now) {
      r.notified = true;
      r.completed = true;
      updated = true;

      // Trigger browser notification if available
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("🔔 Zoya Reminder", {
            body: `राजा जी! याद बा न: ${r.text}`,
            icon: "/favicon.ico",
          });
        } catch (e) {
          console.warn("Notification error:", e);
        }
      }

      onDueReminder(r);
    }
  });

  if (updated) {
    saveUserReminders(userId, reminders);
  }
}
