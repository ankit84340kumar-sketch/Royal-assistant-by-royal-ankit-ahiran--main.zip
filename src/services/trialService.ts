// trialService.ts — 2-Minute Free Trial & Device Tracking for Unregistered Users
// Implements multi-layer persistent device tracking (localStorage + IndexedDB + Firestore)
// Enforces 120 seconds (2 minutes) combined voice + chat engagement limit for guest users.

import { doc, getDoc, setDoc, updateDoc, increment, collection, getDocs } from "firebase/firestore";
import { db } from "./firebaseService";

export const TRIAL_TOTAL_DURATION_SECONDS = 120; // 2 minutes total

const LS_DEVICE_KEY = "zoya_trial_device_id";
const LS_USED_SECONDS_KEY = "zoya_trial_seconds_used";
const LS_ENGAGED_KEY = "zoya_trial_has_engaged";
const IDB_NAME = "zoya_trial_vault";
const IDB_STORE = "device_fingerprint";

export interface TrialState {
  deviceId: string;
  usedSeconds: number;
  remainingSeconds: number;
  isEngaged: boolean;
  isExhausted: boolean;
}

// ---------------------------------------------------------------------------
// 1. IndexedDB Helper for Persistent Device Tracking (survives basic LS clear)
// ---------------------------------------------------------------------------
function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getIdbValue(key: string): Promise<any> {
  const db = await openIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.val : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setIdbValue(key: string, val: any): Promise<void> {
  const db = await openIndexedDB();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put({ key, val });
  } catch {}
}

// ---------------------------------------------------------------------------
// 2. Persistent Device ID Generation & Resolution
// ---------------------------------------------------------------------------
export function getStoredDeviceId(): string {
  if (typeof window === "undefined") return "server_device";
  let devId = localStorage.getItem(LS_DEVICE_KEY);
  if (!devId) {
    // Generate new unique device ID
    devId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 6)}`;
    try {
      localStorage.setItem(LS_DEVICE_KEY, devId);
    } catch {}
    setIdbValue("deviceId", devId).catch(() => {});
  }
  return devId;
}

// ---------------------------------------------------------------------------
// 3. IP Hashing (Privacy-Preserving Secondary Signal)
// ---------------------------------------------------------------------------
async function getHashedIp(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return undefined;
    const data = await res.json();
    const ip = data.ip;
    if (!ip) return undefined;

    // Hash IP via SHA-256 for privacy
    const encoder = new TextEncoder();
    const dataBuf = encoder.encode(`zoya_salt_${ip}`);
    const hashBuf = await crypto.subtle.digest("SHA-256", dataBuf);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 4. Initial Trial State Resolution (Synchronous + Background Firestore Sync)
// ---------------------------------------------------------------------------
export function getInitialTrialState(): TrialState {
  const deviceId = getStoredDeviceId();
  let localUsed = 0;
  let isEngaged = false;

  try {
    const rawUsed = localStorage.getItem(LS_USED_SECONDS_KEY);
    if (rawUsed !== null) {
      localUsed = Math.max(0, parseInt(rawUsed, 10) || 0);
    }
    isEngaged = localStorage.getItem(LS_ENGAGED_KEY) === "true";
  } catch {}

  const remainingSeconds = Math.max(0, TRIAL_TOTAL_DURATION_SECONDS - localUsed);
  const isExhausted = remainingSeconds <= 0;

  return {
    deviceId,
    usedSeconds: localUsed,
    remainingSeconds,
    isEngaged,
    isExhausted,
  };
}

/**
 * Reconcile trial state with IndexedDB and Firestore in background
 * Takes highest used time across all sources to prevent simple cache-busting.
 */
export async function syncTrialStateWithRemote(
  onUpdate: (state: TrialState) => void
): Promise<TrialState> {
  const deviceId = getStoredDeviceId();
  let maxUsed = 0;

  // 1. LocalStorage
  try {
    const lsVal = localStorage.getItem(LS_USED_SECONDS_KEY);
    if (lsVal) maxUsed = Math.max(maxUsed, parseInt(lsVal, 10) || 0);
  } catch {}

  // 2. IndexedDB
  try {
    const idbUsed = await getIdbValue("usedSeconds");
    if (typeof idbUsed === "number") maxUsed = Math.max(maxUsed, idbUsed);
  } catch {}

  // 3. Firestore
  try {
    const docRef = doc(db, "trial_devices", deviceId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.usedSeconds === "number") {
        maxUsed = Math.max(maxUsed, data.usedSeconds);
      }
    }
  } catch (e) {
    console.warn("[TrialService] Firestore check notice:", e);
  }

  // Update local storage to highest recognized used seconds
  try {
    localStorage.setItem(LS_USED_SECONDS_KEY, String(maxUsed));
  } catch {}
  setIdbValue("usedSeconds", maxUsed).catch(() => {});

  const remainingSeconds = Math.max(0, TRIAL_TOTAL_DURATION_SECONDS - maxUsed);
  const isExhausted = remainingSeconds <= 0;
  const isEngaged = maxUsed > 0 || localStorage.getItem(LS_ENGAGED_KEY) === "true";

  const updatedState: TrialState = {
    deviceId,
    usedSeconds: maxUsed,
    remainingSeconds,
    isEngaged,
    isExhausted,
  };

  onUpdate(updatedState);
  return updatedState;
}

// ---------------------------------------------------------------------------
// 5. Engagement Recording (First interaction triggers session count)
// ---------------------------------------------------------------------------
let hasRecordedEngagementInSession = false;

export async function markTrialEngagement(deviceId: string): Promise<void> {
  if (hasRecordedEngagementInSession) return;
  hasRecordedEngagementInSession = true;

  try {
    localStorage.setItem(LS_ENGAGED_KEY, "true");
  } catch {}
  setIdbValue("engaged", true).catch(() => {});

  // Dual-write engagement to Firestore & increment Admin Stats
  try {
    const ipHash = await getHashedIp();
    const docRef = doc(db, "trial_devices", deviceId);
    const snap = await getDoc(docRef);

    const now = new Date().toISOString();
    if (!snap.exists()) {
      await setDoc(docRef, {
        deviceId,
        usedSeconds: 0,
        remainingSeconds: TRIAL_TOTAL_DURATION_SECONDS,
        engaged: true,
        firstEngagedAt: now,
        lastUpdatedAt: now,
        ipHash: ipHash || "",
      });

      // Increment global trial sessions count for Admin Panel
      const statsRef = doc(db, "admin_stats", "trial_stats");
      await setDoc(
        statsRef,
        {
          totalTrialSessions: increment(1),
          lastUpdated: now,
        },
        { merge: true }
      );
    } else {
      await updateDoc(docRef, {
        engaged: true,
        lastUpdatedAt: now,
        ...(ipHash ? { ipHash } : {}),
      });
    }
  } catch (e) {
    console.warn("[TrialService] Engagement mark notice:", e);
  }
}

// ---------------------------------------------------------------------------
// 6. Record Periodic Trial Usage (Dual-writes local & Firestore)
// ---------------------------------------------------------------------------
let lastFirestoreWriteTime = 0;

export async function persistTrialUsage(
  deviceId: string,
  newUsedSeconds: number
): Promise<void> {
  const clampedUsed = Math.min(TRIAL_TOTAL_DURATION_SECONDS, Math.max(0, newUsedSeconds));
  const remaining = Math.max(0, TRIAL_TOTAL_DURATION_SECONDS - clampedUsed);
  const isExhausted = remaining <= 0;

  // 1. LocalStorage (immediate, synchronous every second)
  try {
    localStorage.setItem(LS_USED_SECONDS_KEY, String(clampedUsed));
  } catch {}

  // 2. IndexedDB (persistent fallback)
  setIdbValue("usedSeconds", clampedUsed).catch(() => {});

  // 3. Firestore (throttled to every 10 seconds, or immediately when exhausted)
  const now = Date.now();
  if (isExhausted || now - lastFirestoreWriteTime >= 10000) {
    lastFirestoreWriteTime = now;
    try {
      const docRef = doc(db, "trial_devices", deviceId);
      await setDoc(
        docRef,
        {
          deviceId,
          usedSeconds: clampedUsed,
          remainingSeconds: remaining,
          isExhausted,
          lastUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[TrialService] Usage persist notice:", e);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Admin Panel Trial Stats Fetcher
// ---------------------------------------------------------------------------
export async function getAdminTrialSessionCount(): Promise<number> {
  // First attempt: read dedicated aggregator doc
  try {
    const statsRef = doc(db, "admin_stats", "trial_stats");
    const snap = await getDoc(statsRef);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.totalTrialSessions === "number") {
        return data.totalTrialSessions;
      }
    }
  } catch {}

  // Fallback: count documents in trial_devices collection
  try {
    const colRef = collection(db, "trial_devices");
    const snap = await getDocs(colRef);
    return snap.size;
  } catch {
    return 0;
  }
}
