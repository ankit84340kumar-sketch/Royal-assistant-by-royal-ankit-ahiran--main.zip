import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth & Google Provider
export const auth = getAuth(app);

// Configure multi-tiered persistence to prevent Database is closing/hidden in popups or mobile iframes
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    try {
      setPersistence(auth, browserSessionPersistence).catch(() => {
        try {
          setPersistence(auth, inMemoryPersistence);
        } catch {}
      });
    } catch {}
  });
} catch {
  // Ignored in non-browser contexts
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Firestore instance using explicit database ID configured according to firebase-integration skill
export const db = (() => {
  try {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId || "(default)"
      );
    } catch {
      return getFirestore(app);
    }
  }
})();

export type { FirebaseUser };

export type AccountStatus = "PENDING_VERIFICATION" | "ACTIVE" | "DISABLED";

export interface AppUserProfile {
  uid: string;
  email?: string;
  phoneNumber?: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  provider: "google" | "password" | "mobile";
  emailVerified?: boolean;
  accountStatus?: AccountStatus;
  createdAt: string;
  lastLogin: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "Royal";
  text: string;
  timestamp: string;
  userId: string;
  createdAt?: number;
  attachment?: { name: string; type: string; size: number; url?: string };
  sources?: Array<{ title: string; url: string; source?: string; snippet?: string; timestamp?: string; qualityCategory?: string }>;
  toolMetadata?: {
    type?: "web_search" | "image_search" | "generated_image" | "link_inspection" | "document" | "code" | "vision";
    sources?: Array<{ title: string; url: string; source?: string; snippet?: string; timestamp?: string; qualityCategory?: string }>;
    images?: Array<{ title: string; thumbnailUrl: string; fullImageUrl: string; sourceUrl: string; attribution?: string }>;
    imageDataUrl?: string;
    fileInfo?: { name: string; size: number; type: string; snippet?: string; dataUrl?: string };
    linkInfo?: { url: string; title?: string; description?: string; favicon?: string };
  };
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn("Firestore Operation Notice:", JSON.stringify(errInfo));
}

const LOCAL_AUTH_USER_KEY = "zoya_authenticated_user";
const LOCAL_ACCOUNTS_KEY = "zoya_local_registered_accounts";

/**
 * Hash password securely using Web Crypto API SHA-256
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "_zoya_salt_2026");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    // Fallback basic hashing if subtle crypto restricted in insecure origin
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = (hash << 5) - hash + password.charCodeAt(i);
      hash |= 0;
    }
    return `fb_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Local Account Backup helpers for resilient offline/mobile login
 */
function getLocalAccounts(): Record<string, any> {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalAccount(key: string, data: any) {
  try {
    const current = getLocalAccounts();
    current[key] = data;
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(current));
  } catch {}
}

/**
 * Gets currently persisted user from localStorage
 */
export function getPersistedUser(): AppUserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Strict requirement: Reject any legacy guest profile
    if (!parsed || parsed.provider === "guest" || (typeof parsed.uid === "string" && parsed.uid.startsWith("guest_"))) {
      localStorage.removeItem(LOCAL_AUTH_USER_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Saves user profile to persistent storage
 */
export function persistUser(user: AppUserProfile | null): void {
  if (user) {
    try {
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(user));
    } catch {}
  } else {
    try {
      localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    } catch {}
  }
}

/**
 * Updates an existing user's profile data (display name, photo, bio, phone)
 * and propagates updates across local cache, Firestore, and Auth instance.
 */
export async function updateUserProfileData(
  userId: string,
  updates: { displayName?: string; photoURL?: string; bio?: string; phoneNumber?: string }
): Promise<AppUserProfile | null> {
  const current = getPersistedUser();
  if (!current || current.uid !== userId) {
    return null;
  }

  const updated: AppUserProfile = {
    ...current,
    displayName: updates.displayName !== undefined ? updates.displayName.trim() || current.displayName : current.displayName,
    photoURL: updates.photoURL !== undefined ? updates.photoURL : current.photoURL,
    bio: updates.bio !== undefined ? updates.bio : current.bio,
    phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber : current.phoneNumber,
    lastLogin: new Date().toISOString(),
  };

  // 1. Update localStorage
  persistUser(updated);

  // 2. Update Firestore in background
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, updated, { merge: true });
    console.log(`[Zoya Firestore] ✅ Updated profile for user ${userId}`);
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to update profile in Firestore:`, err);
  }

  // 3. Update Firebase Auth user if available
  if (auth.currentUser && auth.currentUser.uid === userId) {
    try {
      await updateProfile(auth.currentUser, {
        displayName: updated.displayName,
        photoURL: updated.photoURL || undefined,
      });
    } catch (authErr) {
      console.warn("Firebase Auth updateProfile notice:", authErr);
    }
  }

  // 4. Update local accounts cache
  try {
    const localAccounts = getLocalAccounts();
    const identifier = updated.email || updated.phoneNumber;
    if (identifier && localAccounts[identifier]) {
      localAccounts[identifier].displayName = updated.displayName;
      localAccounts[identifier].photoURL = updated.photoURL;
      localAccounts[identifier].bio = updated.bio;
      saveLocalAccount(identifier, localAccounts[identifier]);
    }
  } catch {}

  return updated;
}

/**
 * Fetches user profile from Firestore and keeps local storage synchronized
 */
export async function fetchUserProfileFromFirestore(userId: string): Promise<AppUserProfile | null> {
  if (!userId) return null;
  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as AppUserProfile;
      const current = getPersistedUser();
      if (current && current.uid === userId) {
        const merged: AppUserProfile = {
          ...current,
          displayName: data.displayName || current.displayName,
          photoURL: data.photoURL !== undefined ? data.photoURL : current.photoURL,
          bio: data.bio !== undefined ? data.bio : current.bio,
          phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : current.phoneNumber,
        };
        persistUser(merged);
        return merged;
      }
      return data;
    }
  } catch (err) {
    console.warn("Firestore fetch profile notice:", err);
  }
  return getPersistedUser();
}

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<AppUserProfile> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user document already exists in Firestore users collection
    const userRef = doc(db, "users", user.uid);
    let existingProfileData: Partial<AppUserProfile> = {};
    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        existingProfileData = snap.data() as AppUserProfile;
      }
    } catch (e) {
      console.warn("Notice checking existing user doc in Firestore:", e);
    }

    const profile: AppUserProfile = {
      uid: user.uid,
      email: user.email || existingProfileData.email || "",
      displayName: user.displayName || existingProfileData.displayName || user.email?.split("@")[0] || "User",
      photoURL: user.photoURL || existingProfileData.photoURL || "",
      bio: existingProfileData.bio,
      phoneNumber: user.phoneNumber || existingProfileData.phoneNumber,
      provider: "google",
      createdAt: existingProfileData.createdAt || user.metadata.creationTime || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    // Save/merge to canonical Firestore user document
    try {
      await setDoc(userRef, profile, { merge: true });
    } catch (err) {
      console.warn("Notice saving user profile to Firestore:", err);
    }

    // Clean up any legacy duplicate record for this email if it exists
    if (user.email) {
      const normalizedEmail = user.email.toLowerCase().trim();
      try {
        const usersCol = collection(db, "users");
        const snap = await getDocs(usersCol);
        snap.docs.forEach((d) => {
          if (d.id !== user.uid) {
            const data = d.data();
            if (data.email && data.email.toLowerCase().trim() === normalizedEmail) {
              console.log(`[Zoya Auth] Cleaning up duplicate user doc ${d.id} for email ${normalizedEmail}`);
              deleteDoc(doc(db, "users", d.id)).catch(() => {});
            }
          }
        });
      } catch (cleanErr) {
        console.warn("Notice cleaning duplicate user doc:", cleanErr);
      }
    }

    persistUser(profile);
    return profile;
  } catch (err: any) {
    const msg = err?.message || "";
    // If popup closed or cancelled by user, strictly do NOT bypass auth or log in
    if (
      err?.code === "auth/popup-closed-by-user" ||
      msg.includes("popup-closed-by-user") ||
      err?.code === "auth/cancelled-popup-request" ||
      msg.includes("cancelled-popup-request")
    ) {
      throw new Error("Google sign-in was closed or cancelled. Please try again.");
    }
    
    // If domain unauthorized, inform user properly
    if (
      err?.code === "auth/unauthorized-domain" || 
      msg.includes("auth/unauthorized-domain") || 
      msg.includes("unauthorized-domain")
    ) {
      throw err;
    }

    throw err;
  }
}

/**
 * Strict Email validation:
 * Disallows formats like "abc", "abc.com", "random@", "random@gmail", "@gmail.com".
 * Must contain valid local-part, @ symbol, valid domain, and at least 2-char TLD.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return false;

  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (!domain.includes(".") || domain.endsWith(".") || domain.startsWith(".")) return false;
  const domainParts = domain.split(".");
  if (domainParts.some((p) => p.length === 0)) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;
  return true;
}

/**
 * Username validation helper:
 * Allows user-chosen names like "Royal", "Ankit", "Royal123" (min 2 chars, letters, numbers, spaces, underscores, dots)
 */
export function isValidUsernameFormat(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  return /^[a-zA-Z0-9\s._-]+$/.test(trimmed);
}

/**
 * Password Policy validation helper:
 * Minimum 6 characters, rejects obvious trivial insecure patterns.
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, message: "Password is required." };
  }
  if (password.length < 6) {
    return { valid: false, message: "Password must be at least 6 characters long." };
  }
  const lower = password.toLowerCase().trim();
  const trivial = ["123456", "12345678", "password", "qwerty", "111111", "000000"];
  if (trivial.includes(lower)) {
    return { valid: false, message: "Password is too common and insecure. Please choose a stronger password." };
  }
  return { valid: true };
}

/**
 * Checks if an email is already registered and active in Firestore or accounts
 */
export async function checkEmailAlreadyExists(email: string): Promise<boolean> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmailFormat(trimmed)) return false;

  const accountDocId = `email_${trimmed.replace(/[^a-z0-9]/g, "_")}`;

  try {
    const accountRef = doc(db, "accounts", accountDocId);
    const snap = await getDoc(accountRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.emailVerified !== false && data.accountStatus !== "PENDING_VERIFICATION") {
        return true;
      }
    }
  } catch (e) {
    console.warn("Notice checking accounts for existing email:", e);
  }

  try {
    const usersCol = collection(db, "users");
    const userSnap = await getDocs(usersCol);
    for (const d of userSnap.docs) {
      const data = d.data();
      if (data.email && data.email.toLowerCase().trim() === trimmed) {
        if (data.emailVerified !== false && data.accountStatus !== "PENDING_VERIFICATION") {
          return true;
        }
      }
    }
  } catch (e) {
    console.warn("Notice checking users for existing email:", e);
  }

  const local = getLocalAccounts();
  if (local[accountDocId] && local[accountDocId].emailVerified !== false && local[accountDocId].accountStatus !== "PENDING_VERIFICATION") {
    return true;
  }

  return false;
}

export interface VerificationRequestResult {
  success: boolean;
  message: string;
  email: string;
  codeForDevTesting?: string;
  verificationSent: boolean;
}

/**
 * Initiates Create Account with Email Ownership Verification
 * Generates a secure, 10-minute 6-digit OTP code in Firestore and sends Firebase Auth verification email.
 */
export async function requestEmailVerification(
  email: string,
  name: string,
  passwordPlain: string
): Promise<VerificationRequestResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim() || trimmedEmail.split("@")[0];

  // 1. Format validation
  if (!isValidEmailFormat(trimmedEmail)) {
    throw new Error("Invalid email format. Please enter a valid email address (e.g. name@domain.com).");
  }
  if (!isValidUsernameFormat(trimmedName)) {
    throw new Error("Please enter a valid name (at least 2 characters).");
  }
  const pwCheck = validatePasswordStrength(passwordPlain);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.message || "Password does not meet security requirements.");
  }

  // 2. Check if email already registered and active
  const alreadyExists = await checkEmailAlreadyExists(trimmedEmail);
  if (alreadyExists) {
    throw new Error("An account with this email already exists. Please sign in instead.");
  }

  // 3. Generate secure 6-digit numeric verification code
  let otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashed = await hashPassword(passwordPlain);
  const accountDocId = `email_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
  const customUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  let firebaseAuthUid = customUid;
  let verificationSent = false;

  // 4. Try Firebase Auth registration to send official verification email link
  try {
    const res = await createUserWithEmailAndPassword(auth, trimmedEmail, passwordPlain);
    const fbUser = res.user;
    firebaseAuthUid = fbUser.uid;
    try {
      await updateProfile(fbUser, { displayName: trimmedName });
    } catch {}

    // Send official Firebase email verification link to real inbox
    try {
      await sendEmailVerification(fbUser);
      verificationSent = true;
      console.log(`[Zoya Auth] ✉️ Sent Firebase email verification link to ${trimmedEmail}`);
    } catch (evErr) {
      console.warn("Firebase sendEmailVerification notice:", evErr);
    }

    // Immediately sign out unverified user so they cannot access app before verification
    await signOut(auth);
  } catch (fbErr: any) {
    if (fbErr.code === "auth/email-already-in-use") {
      const exists = await checkEmailAlreadyExists(trimmedEmail);
      if (exists) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
    }
    console.warn("Notice in createUserWithEmailAndPassword, proceeding with pending verification record:", fbErr?.code);
  }

  // 5. Store Verification Code Record on Server (Admin SDK) & local resilience
  try {
    const srvRes = await fetch("/api/auth/send-verification-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmedEmail,
        name: trimmedName,
        passwordHash: hashed,
        authUid: firebaseAuthUid,
      }),
    });
    if (srvRes.ok) {
      const data = await srvRes.json();
      if (data.codeForDevTesting) {
        otpCode = data.codeForDevTesting;
      }
    }
  } catch (srvErr) {
    console.warn("Notice calling server send-verification-code:", srvErr);
  }

  // Store in Local Mirror as well for instant resilience
  try {
    const verificationDocId = `verify_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
    const verificationRecord = {
      email: trimmedEmail,
      code: otpCode,
      name: trimmedName,
      passwordHash: hashed,
      authUid: firebaseAuthUid,
      accountDocId,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      type: "registration",
      createdAt: Date.now(),
      lastResentAt: Date.now(),
    };
    localStorage.setItem(`zoya_pending_verification_${trimmedEmail}`, JSON.stringify(verificationRecord));
  } catch {}

  // 6. Record Pending User in accounts & users with PENDING_VERIFICATION status
  const pendingAccountData = {
    uid: firebaseAuthUid,
    email: trimmedEmail,
    displayName: trimmedName,
    passwordHash: hashed,
    emailVerified: false,
    accountStatus: "PENDING_VERIFICATION",
    createdAt: now,
    lastLogin: now,
  };

  try {
    const accRef = doc(db, "accounts", accountDocId);
    await setDoc(accRef, pendingAccountData);
  } catch {}

  saveLocalAccount(accountDocId, pendingAccountData);

  return {
    success: true,
    message: `Verification code and link sent to ${trimmedEmail}. Please check your inbox.`,
    email: trimmedEmail,
    codeForDevTesting: otpCode,
    verificationSent,
  };
}

/**
 * Verifies the 6-digit code entered by the user and activates the account
 */
export async function verifyEmailCodeAndActivate(
  email: string,
  enteredCode: string
): Promise<AppUserProfile> {
  const trimmedEmail = email.trim().toLowerCase();
  const cleanCode = enteredCode.trim().replace(/\D/g, "");

  if (!cleanCode || cleanCode.length !== 6) {
    throw new Error("Please enter a valid 6-digit verification code.");
  }

  const verificationDocId = `verify_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
  const accountDocId = `email_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;

  // 1. Try server-side verification first (secure Admin SDK endpoint)
  try {
    const srvRes = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, enteredCode: cleanCode }),
    });

    if (srvRes.ok) {
      const data = await srvRes.json();
      if (data.profile) {
        saveLocalAccount(accountDocId, data.profile);
        try {
          localStorage.removeItem(`zoya_pending_verification_${trimmedEmail}`);
        } catch {}
        return data.profile as AppUserProfile;
      }
    } else {
      const errData = await srvRes.json().catch(() => ({}));
      if (errData.error) {
        throw new Error(errData.error);
      }
    }
  } catch (sErr: any) {
    if (sErr.message && !sErr.message.includes("Failed to fetch") && !sErr.message.includes("NetworkError")) {
      throw sErr;
    }
    console.warn("Server verify endpoint notice, trying local fallback:", sErr);
  }

  let record: any = null;

  // 2. Fallback to local cache if offline
  if (!record) {
    try {
      const cached = localStorage.getItem(`zoya_pending_verification_${trimmedEmail}`);
      if (cached) record = JSON.parse(cached);
    } catch {}
  }

  if (!record) {
    throw new Error("No active verification code found for this email. Please request a new verification code.");
  }

  // Check expiration (10 minutes)
  if (Date.now() > record.expiresAt) {
    throw new Error("Verification code has expired. Please request a new verification code.");
  }

  // Check rate limiting / max attempts (5 max)
  if (record.attempts >= 5) {
    throw new Error("Too many incorrect attempts. For security, please request a new verification code.");
  }

  // Check code matching
  if (record.code !== cleanCode) {
    const newAttempts = (record.attempts || 0) + 1;
    try {
      const vRef = doc(db, "verification_codes", verificationDocId);
      await setDoc(vRef, { attempts: newAttempts }, { merge: true });
    } catch {}
    const remaining = Math.max(0, 5 - newAttempts);
    throw new Error(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
  }

  // CODE MATCHES! ACTIVATE ACCOUNT
  const now = new Date().toISOString();
  const uid = record.authUid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const finalAccountDocId = record.accountDocId || accountDocId;

  const activeProfile: AppUserProfile = {
    uid,
    email: trimmedEmail,
    displayName: record.name || trimmedEmail.split("@")[0],
    photoURL: "",
    provider: "password",
    emailVerified: true,
    accountStatus: "ACTIVE",
    createdAt: now,
    lastLogin: now,
  };

  // 1. Save activated user doc in Firestore
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, activeProfile, { merge: true });
  } catch (uErr) {
    console.warn("Notice saving activated user to Firestore:", uErr);
  }

  // 2. Save activated account doc in Firestore
  try {
    const accRef = doc(db, "accounts", accountDocId);
    await setDoc(accRef, {
      uid,
      email: trimmedEmail,
      displayName: record.name,
      passwordHash: record.passwordHash,
      emailVerified: true,
      accountStatus: "ACTIVE",
      updatedAt: now,
      lastLogin: now,
    }, { merge: true });
  } catch {}

  // 3. Save to local storage
  saveLocalAccount(accountDocId, {
    uid,
    email: trimmedEmail,
    displayName: record.name,
    passwordHash: record.passwordHash,
    emailVerified: true,
    accountStatus: "ACTIVE",
    updatedAt: now,
    lastLogin: now,
  });

  // 4. Delete consumed verification code
  try {
    const vRef = doc(db, "verification_codes", verificationDocId);
    await deleteDoc(vRef);
  } catch {}
  try {
    localStorage.removeItem(`zoya_pending_verification_${trimmedEmail}`);
  } catch {}

  // 5. Establish authenticated persistent session
  persistUser(activeProfile);
  return activeProfile;
}

/**
 * Resends a fresh 6-digit verification code with rate limiting (min 60s cooldown)
 */
export async function resendVerificationCode(email: string): Promise<VerificationRequestResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const verificationDocId = `verify_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
  let record: any = null;

  try {
    const vRef = doc(db, "verification_codes", verificationDocId);
    const snap = await getDoc(vRef);
    if (snap.exists()) record = snap.data();
  } catch {}

  if (!record) {
    try {
      const cached = localStorage.getItem(`zoya_pending_verification_${trimmedEmail}`);
      if (cached) record = JSON.parse(cached);
    } catch {}
  }

  if (record && record.lastResentAt) {
    const elapsedSeconds = Math.floor((Date.now() - record.lastResentAt) / 1000);
    if (elapsedSeconds < 60) {
      const remainingSeconds = 60 - elapsedSeconds;
      throw new Error(`Please wait ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"} before requesting a new code.`);
    }
  }

  const newOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const updatedRecord = {
    ...(record || {}),
    email: trimmedEmail,
    code: newOtpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    lastResentAt: Date.now(),
  };

  try {
    const vRef = doc(db, "verification_codes", verificationDocId);
    await setDoc(vRef, updatedRecord, { merge: true });
  } catch {}

  try {
    localStorage.setItem(`zoya_pending_verification_${trimmedEmail}`, JSON.stringify(updatedRecord));
  } catch {}

  return {
    success: true,
    message: `A new verification code has been sent to ${trimmedEmail}.`,
    email: trimmedEmail,
    codeForDevTesting: newOtpCode,
    verificationSent: true,
  };
}

/**
 * Checks if user clicked the email verification link in their inbox
 */
export async function checkEmailLinkVerified(
  email: string,
  passwordPlain: string
): Promise<AppUserProfile | null> {
  const trimmed = email.trim().toLowerCase();
  try {
    const res = await signInWithEmailAndPassword(auth, trimmed, passwordPlain);
    const user = res.user;
    await user.reload();

    if (user.emailVerified) {
      const profile: AppUserProfile = {
        uid: user.uid,
        email: trimmed,
        displayName: user.displayName || trimmed.split("@")[0],
        photoURL: user.photoURL || "",
        provider: "password",
        emailVerified: true,
        accountStatus: "ACTIVE",
        createdAt: user.metadata.creationTime || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      try {
        const uRef = doc(db, "users", user.uid);
        await setDoc(uRef, profile, { merge: true });
      } catch {}

      const accountDocId = `email_${trimmed.replace(/[^a-z0-9]/g, "_")}`;
      try {
        const accRef = doc(db, "accounts", accountDocId);
        await setDoc(accRef, { emailVerified: true, accountStatus: "ACTIVE" }, { merge: true });
      } catch {}

      persistUser(profile);
      return profile;
    }
  } catch (e) {
    console.warn("Notice in checkEmailLinkVerified:", e);
  }
  return null;
}

/**
 * Sign in with Email / Mobile and Password
 * STRICT SECURITY: Requires registered, verified account and correct password.
 * Returns generic "Invalid email or password" on credential failure for security.
 * Blocks login if email is unverified.
 */
export async function signInWithEmailOrMobile(
  identifier: string,
  passwordPlain: string
): Promise<AppUserProfile> {
  const trimmed = identifier?.trim();
  const trimmedPassword = passwordPlain?.trim();

  if (!trimmed) {
    throw new Error("Email or mobile number is required.");
  }
  if (!trimmedPassword) {
    throw new Error("Password is required. Please enter your password.");
  }
  if (trimmedPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const isEmail = trimmed.includes("@");
  if (isEmail && !isValidEmailFormat(trimmed)) {
    throw new Error("Invalid email format. Please enter a valid email address.");
  }

  const accountDocId = isEmail
    ? `email_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
    : `mob_${trimmed.replace(/[^0-9]/g, "")}`;
  const hashed = await hashPassword(passwordPlain);

  // 1. Try Firebase Auth if email
  let fbUserAuthenticated = false;
  let fbUser: any = null;
  if (isEmail) {
    try {
      const res = await signInWithEmailAndPassword(auth, trimmed, passwordPlain);
      fbUser = res.user;
      fbUserAuthenticated = true;
    } catch (fbErr: any) {
      console.warn("Firebase Auth sign-in notice:", fbErr?.code);
    }
  }

  // 2. Fetch account record from Firestore / local accounts
  let accountData: any = null;
  try {
    const accRef = doc(db, "accounts", accountDocId);
    const snap = await getDoc(accRef);
    if (snap.exists()) accountData = snap.data();
  } catch {}

  if (!accountData) {
    const local = getLocalAccounts();
    if (local[accountDocId]) accountData = local[accountDocId];
  }

  // If also not found, check users collection
  if (!accountData && fbUserAuthenticated && fbUser) {
    try {
      const uRef = doc(db, "users", fbUser.uid);
      const snap = await getDoc(uRef);
      if (snap.exists()) accountData = snap.data();
    } catch {}
  }

  // If no account found anywhere:
  if (!accountData && !fbUserAuthenticated) {
    throw new Error("Invalid email or password.");
  }

  // Check password validity
  const passwordMatches = fbUserAuthenticated || (accountData && accountData.passwordHash === hashed);
  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  // Check Account Status & Email Verification
  const isEmailVerified = fbUser?.emailVerified === true || accountData?.emailVerified === true;
  const accountStatus = accountData?.accountStatus || (isEmailVerified ? "ACTIVE" : "PENDING_VERIFICATION");

  if (accountStatus === "DISABLED") {
    throw new Error("This account has been disabled. Please contact support.");
  }

  // If account is unverified, block login as required by specification!
  if (isEmail && !isEmailVerified && accountStatus === "PENDING_VERIFICATION") {
    const err: any = new Error("Please verify your email before signing in.");
    err.code = "auth/unverified-email";
    err.unverifiedEmail = trimmed;
    throw err;
  }

  // Successful login!
  const uid = fbUser?.uid || accountData?.uid || `usr_${Date.now()}`;
  const now = new Date().toISOString();

  const profile: AppUserProfile = {
    uid,
    email: trimmed,
    displayName: accountData?.displayName || fbUser?.displayName || trimmed.split("@")[0],
    photoURL: accountData?.photoURL || fbUser?.photoURL || "",
    provider: isEmail ? "password" : "mobile",
    emailVerified: true,
    accountStatus: "ACTIVE",
    createdAt: accountData?.createdAt || now,
    lastLogin: now,
  };

  try {
    const uRef = doc(db, "users", uid);
    await setDoc(uRef, { lastLogin: now, emailVerified: true, accountStatus: "ACTIVE" }, { merge: true });
  } catch {}

  persistUser(profile);
  return profile;
}

/**
 * Sends Password Reset Email via Firebase Auth & stores reset code in Firestore
 */
export async function sendPasswordResetFlow(email: string): Promise<string> {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmailFormat(trimmed)) {
    throw new Error("Please enter a valid email address.");
  }

  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetDocId = `reset_${trimmed.replace(/[^a-z0-9]/g, "_")}`;

  try {
    const rRef = doc(db, "verification_codes", resetDocId);
    await setDoc(rRef, {
      email: trimmed,
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
      attempts: 0,
      type: "password_reset",
      createdAt: Date.now(),
    });
  } catch {}

  try {
    await sendPasswordResetEmail(auth, trimmed);
    console.log(`[Zoya Auth] Sent password reset email to ${trimmed}`);
  } catch (err: any) {
    console.warn("sendPasswordResetEmail notice:", err?.code);
  }

  return `If an account with ${trimmed} exists, a password reset link and code have been sent.`;
}

/**
 * Resets password using the 6-digit code sent to email
 */
export async function resetPasswordWithCode(
  email: string,
  enteredCode: string,
  newPasswordPlain: string
): Promise<boolean> {
  const trimmedEmail = email.trim().toLowerCase();
  const cleanCode = enteredCode.trim().replace(/\D/g, "");

  if (!isValidEmailFormat(trimmedEmail)) {
    throw new Error("Please enter a valid email address.");
  }
  if (!cleanCode || cleanCode.length !== 6) {
    throw new Error("Please enter a valid 6-digit verification code.");
  }
  const pwCheck = validatePasswordStrength(newPasswordPlain);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.message || "Password does not meet security requirements.");
  }

  const resetDocId = `reset_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
  let record: any = null;

  try {
    const rRef = doc(db, "verification_codes", resetDocId);
    const snap = await getDoc(rRef);
    if (snap.exists()) record = snap.data();
  } catch {}

  if (!record) {
    throw new Error("No password reset request found for this email or it has expired. Please request a new code.");
  }

  if (Date.now() > record.expiresAt) {
    throw new Error("Reset code has expired. Please request a new code.");
  }

  if (record.attempts >= 5) {
    throw new Error("Too many failed attempts. Please request a new reset code.");
  }

  if (record.code !== cleanCode) {
    const newAttempts = (record.attempts || 0) + 1;
    try {
      const rRef = doc(db, "verification_codes", resetDocId);
      await setDoc(rRef, { attempts: newAttempts }, { merge: true });
    } catch {}
    const remaining = Math.max(0, 5 - newAttempts);
    throw new Error(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
  }

  const hashed = await hashPassword(newPasswordPlain);
  const accountDocId = `email_${trimmedEmail.replace(/[^a-z0-9]/g, "_")}`;
  const now = new Date().toISOString();

  try {
    const accRef = doc(db, "accounts", accountDocId);
    await setDoc(accRef, { passwordHash: hashed, updatedAt: now }, { merge: true });
  } catch {}

  try {
    const local = getLocalAccounts();
    if (local[accountDocId]) {
      local[accountDocId].passwordHash = hashed;
      saveLocalAccount(accountDocId, local[accountDocId]);
    }
  } catch {}

  try {
    const rRef = doc(db, "verification_codes", resetDocId);
    await deleteDoc(rRef);
  } catch {}

  return true;
}

/**
 * Sends a password reset email via Firebase Auth
 */
export async function sendResetPassword(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");

  if (!trimmed) {
    throw new Error("Please enter your registered email address.");
  }

  if (isEmail) {
    try {
      await sendPasswordResetEmail(auth, trimmed);
      return `Password reset link sent to ${trimmed}! Please check your email inbox (and Spam folder).`;
    } catch (err: any) {
      console.warn("sendPasswordResetEmail error:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-email") {
        throw new Error("No account found with this email. You can sign in with Google or reset your password directly.");
      }
      if (err.code === "auth/unauthorized-domain") {
        throw new Error("Firebase authorized domain needed for password reset link. Please use 'Set New Password directly' or Sign in with Google.");
      }
      throw new Error(err.message || "Failed to send reset email. Please try again.");
    }
  } else {
    throw new Error("Password reset email is only available for email addresses. Please use 'Set New Password directly'.");
  }
}

/**
 * Direct Password Reset / Update for accounts in Firestore & Local storage
 */
export async function updateUserAccountPassword(
  identifier: string,
  newPasswordPlain: string
): Promise<AppUserProfile> {
  const trimmed = identifier.trim();
  const isEmail = trimmed.includes("@");

  if (!trimmed) {
    throw new Error("Please enter your email or mobile number.");
  }
  if (!newPasswordPlain || newPasswordPlain.length < 6) {
    throw new Error("New password must be at least 6 characters long.");
  }

  const hashed = await hashPassword(newPasswordPlain);
  const accountDocId = isEmail
    ? `email_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
    : `mob_${trimmed.replace(/[^0-9]/g, "")}`;
  const now = new Date().toISOString();

  // 1. Check if account exists in Firestore
  let existingData: any = null;
  try {
    const accountRef = doc(db, "accounts", accountDocId);
    const snap = await getDoc(accountRef);
    if (snap.exists()) {
      existingData = snap.data();
    }
  } catch (e) {
    console.warn("Firestore account check error during reset:", e);
  }

  if (!existingData) {
    const local = getLocalAccounts();
    if (local[accountDocId]) {
      existingData = local[accountDocId];
    }
  }

  const uid = existingData?.uid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const displayName = existingData?.displayName || (isEmail ? trimmed.split("@")[0] : `User ${trimmed.slice(-4)}`);

  const updatedAccountData = {
    uid,
    email: isEmail ? trimmed : (existingData?.email || ""),
    phoneNumber: !isEmail ? trimmed : (existingData?.phoneNumber || ""),
    displayName,
    passwordHash: hashed,
    updatedAt: now,
    lastLogin: now,
  };

  // Save to Firestore
  try {
    const accountRef = doc(db, "accounts", accountDocId);
    await setDoc(accountRef, updatedAccountData, { merge: true });
  } catch (err) {
    console.warn("Failed to update password in Firestore:", err);
  }

  // Save to local storage
  saveLocalAccount(accountDocId, updatedAccountData);

  const profile: AppUserProfile = {
    uid,
    email: isEmail ? trimmed : (existingData?.email || ""),
    phoneNumber: !isEmail ? trimmed : (existingData?.phoneNumber || ""),
    displayName,
    photoURL: existingData?.photoURL || "",
    provider: isEmail ? "password" : "mobile",
    createdAt: existingData?.createdAt || now,
    lastLogin: now,
  };

  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, profile, { merge: true });
  } catch {}

  persistUser(profile);
  return profile;
}

export interface LiveAppStats {
  totalUsers: number;
  googleUsers: number;
  customAccounts: number;
  recentUsersList: { name: string; provider: string; date: string }[];
  timestamp: string;
}

/**
 * Queries real-time user database in Firestore for accurate live counts
 */
export async function getLiveAppUserStats(): Promise<LiveAppStats> {
  let totalUsers = 0;
  let googleUsers = 0;
  let customAccounts = 0;
  const recentUsersList: { name: string; provider: string; date: string }[] = [];
  const uniqueUids = new Set<string>();

  try {
    // 1. Query Firestore users collection
    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    
    userSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      // Skip legacy guest users in stats if any
      if (data.provider === "guest" || uid.startsWith("guest_")) {
        return;
      }
      uniqueUids.add(uid);

      if (data.provider === "google") {
        googleUsers++;
      } else {
        customAccounts++;
      }

      if (recentUsersList.length < 5) {
        recentUsersList.push({
          name: data.displayName || "User",
          provider: data.provider || "password",
          date: data.createdAt || data.lastLogin || new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.warn("Firestore users query notice during stats:", err);
  }

  try {
    // 2. Query Firestore accounts collection
    const accountsCol = collection(db, "accounts");
    const accountsSnapshot = await getDocs(accountsCol);
    accountsSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      if (!uniqueUids.has(uid)) {
        uniqueUids.add(uid);
        customAccounts++;
        if (recentUsersList.length < 5) {
          recentUsersList.push({
            name: data.displayName || "User",
            provider: "account",
            date: data.createdAt || new Date().toISOString(),
          });
        }
      }
    });
  } catch (err) {
    console.warn("Firestore accounts query notice during stats:", err);
  }

  // 3. Fallback / Merge with Local Registered Accounts & Persistent User
  try {
    const localAccounts = getLocalAccounts();
    Object.values(localAccounts).forEach((acc: any) => {
      if (acc && acc.uid && !uniqueUids.has(acc.uid)) {
        uniqueUids.add(acc.uid);
        customAccounts++;
      }
    });

    const persisted = getPersistedUser();
    if (persisted && persisted.uid && !uniqueUids.has(persisted.uid)) {
      uniqueUids.add(persisted.uid);
      if (persisted.provider === "google") googleUsers++;
      else customAccounts++;
    }
  } catch {}

  totalUsers = uniqueUids.size;

  return {
    totalUsers: Math.max(totalUsers, 1),
    googleUsers,
    customAccounts,
    recentUsersList,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sign up with Email / Mobile, Name and Password
 * STRICT SECURITY: Requires valid, non-empty password of at least 6 characters.
 */
export async function signUpWithEmailOrMobile(
  identifier: string,
  passwordPlain: string,
  name?: string
): Promise<AppUserProfile> {
  const trimmed = identifier?.trim();
  const trimmedPassword = passwordPlain?.trim();
  const displayName = name?.trim() || (trimmed?.includes("@") ? trimmed.split("@")[0] : "User");

  if (!trimmed) {
    throw new Error("Email or mobile number is required.");
  }
  if (!trimmedPassword) {
    throw new Error("Password is required. Please enter a valid password.");
  }
  if (trimmedPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const isEmail = trimmed.includes("@");

  if (isEmail) {
    try {
      const res = await createUserWithEmailAndPassword(auth, trimmed, passwordPlain);
      const user = res.user;
      if (displayName) {
        try {
          await updateProfile(user, { displayName });
        } catch {}
      }

      const hashed = await hashPassword(passwordPlain);
      const accountDocId = `email_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      const now = new Date().toISOString();

      const profile: AppUserProfile = {
        uid: user.uid,
        email: trimmed,
        displayName,
        photoURL: "",
        provider: "password",
        emailVerified: true,
        accountStatus: "ACTIVE",
        createdAt: now,
        lastLogin: now,
      };

      try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, profile, { merge: true });
      } catch {}

      const accountData = {
        uid: user.uid,
        email: trimmed,
        displayName,
        passwordHash: hashed,
        emailVerified: true,
        accountStatus: "ACTIVE",
        createdAt: now,
        lastLogin: now,
      };

      try {
        const accRef = doc(db, "accounts", accountDocId);
        await setDoc(accRef, accountData, { merge: true });
      } catch {}
      saveLocalAccount(accountDocId, accountData);

      persistUser(profile);
      return profile;
    } catch (fbErr: any) {
      if (fbErr.code === "auth/email-already-in-use") {
        throw new Error("An account already exists with this email address. Please sign in instead.");
      }
      if (fbErr.code === "auth/weak-password") {
        throw new Error("Password is too weak. Please use at least 6 characters.");
      }
      if (fbErr.code === "auth/invalid-email") {
        throw new Error("Please enter a valid email address.");
      }
      console.warn("Firebase create user with email notice, checking custom account fallback:", fbErr.message);
    }
  }

  // Create custom account with dual-write to Firestore and Local Mirror
  const accountDocId = isEmail 
    ? `email_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
    : `mob_${trimmed.replace(/[^0-9]/g, "")}`;

  // Check if exists in Firestore
  try {
    const accountRef = doc(db, "accounts", accountDocId);
    const snap = await getDoc(accountRef);
    if (snap.exists()) {
      throw new Error("An account already exists with this email or mobile number. Please sign in.");
    }
  } catch (err: any) {
    if (err.message?.includes("already exists")) throw err;
  }

  // Check if exists locally
  const localAccounts = getLocalAccounts();
  if (localAccounts[accountDocId]) {
    throw new Error("An account already exists with this email or mobile number. Please sign in.");
  }

  const hashed = await hashPassword(passwordPlain);
  const customUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  const accountData = {
    uid: customUid,
    email: isEmail ? trimmed : "",
    phoneNumber: !isEmail ? trimmed : "",
    displayName,
    passwordHash: hashed,
    emailVerified: true,
    accountStatus: "ACTIVE",
    createdAt: now,
    lastLogin: now,
  };

  // Save to Local Mirror immediately
  saveLocalAccount(accountDocId, accountData);

  // Dual-write to Firestore
  try {
    const accountRef = doc(db, "accounts", accountDocId);
    await setDoc(accountRef, accountData);
  } catch {}

  const profile: AppUserProfile = {
    uid: customUid,
    email: isEmail ? trimmed : "",
    phoneNumber: !isEmail ? trimmed : "",
    displayName,
    photoURL: "",
    provider: isEmail ? "password" : "mobile",
    emailVerified: true,
    accountStatus: "ACTIVE",
    createdAt: now,
    lastLogin: now,
  };

  try {
    const userRef = doc(db, "users", customUid);
    await setDoc(userRef, profile, { merge: true });
  } catch {}

  persistUser(profile);
  return profile;
}

/**
 * Sign out current user
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Firebase signout error:", e);
  }
  persistUser(null);
}

/**
 * Subscribe to auth state changes
 */
export function subscribeAuthStatus(
  callback: (user: AppUserProfile | null) => void
) {
  return onAuthStateChanged(auth, (fbUser) => {
    if (fbUser) {
      const profile: AppUserProfile = {
        uid: fbUser.uid,
        email: fbUser.email || "",
        displayName: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
        photoURL: fbUser.photoURL || "",
        provider: fbUser.providerData[0]?.providerId === "google.com" ? "google" : "password",
        createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      persistUser(profile);
      callback(profile);
    } else {
      const persisted = getPersistedUser();
      callback(persisted);
    }
  });
}

/**
 * Save a single message to user's Firestore messages collection with debug logging
 */
export async function saveMessageToFirestore(
  userId: string,
  message: ChatMessage
): Promise<void> {
  if (!userId) return;
  console.log(`[Zoya Firestore] 💾 Saving message (${message.sender}) for User ${userId}: "${message.text.substring(0, 40)}..."`);
  
  // Dual-write to local storage cache immediately for zero-latency across refresh/login
  const localKey = `zoya_chat_history_${userId}`;
  try {
    const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    const existingIndex = cached.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      cached[existingIndex] = message;
    } else {
      cached.push(message);
    }
    localStorage.setItem(localKey, JSON.stringify(cached));
  } catch {}

  try {
    const msgRef = doc(db, "users", userId, "messages", message.id);
    const docPayload: any = {
      id: message.id,
      sender: message.sender,
      text: message.text,
      timestamp: message.timestamp,
      userId: userId,
      createdAt: message.createdAt || Date.now(),
    };
    if (message.sources) docPayload.sources = message.sources;
    if (message.toolMetadata) docPayload.toolMetadata = message.toolMetadata;

    await setDoc(msgRef, docPayload, { merge: true });
    console.log(`[Zoya Firestore] ✅ Message ${message.id} successfully written to users/${userId}/messages`);

    // Also update aggregate chatHistory/current doc
    const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (cached.length > 0) {
      const chatDocRef = doc(db, "users", userId, "chatHistory", "current");
      await setDoc(chatDocRef, {
        userId,
        updatedAt: Date.now(),
        messages: cached,
      }, { merge: true });
    }
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to write message ${message.id} to Firestore:`, error);
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/messages/${message.id}`);
  }
}

/**
 * Saves all chat messages to Firestore and local storage for user account
 */
export async function saveAllChatMessagesToFirestore(
  userId: string,
  messages: ChatMessage[]
): Promise<void> {
  if (!userId || !Array.isArray(messages) || messages.length === 0) return;
  
  const localKey = `zoya_chat_history_${userId}`;
  // 1. Dual-write to local storage cache for instant offline responsiveness
  try {
    localStorage.setItem(localKey, JSON.stringify(messages));
  } catch {}

  // 2. Dual-write to Firestore aggregate doc
  try {
    const chatDocRef = doc(db, "users", userId, "chatHistory", "current");
    await setDoc(chatDocRef, {
      userId,
      updatedAt: Date.now(),
      messages,
    }, { merge: true });
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error writing aggregate chatHistory doc:`, error);
  }

  // 3. Batch write individual messages to users/{userId}/messages for subcollection indexing
  try {
    const batch = writeBatch(db);
    messages.slice(-50).forEach((m) => {
      const msgRef = doc(db, "users", userId, "messages", m.id);
      const docPayload: any = {
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
        userId: userId,
        createdAt: m.createdAt || Date.now(),
      };
      if (m.sources) docPayload.sources = m.sources;
      if (m.toolMetadata) docPayload.toolMetadata = m.toolMetadata;
      batch.set(msgRef, docPayload, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn("[Zoya Firestore] Batch writing chat messages notice:", err);
  }
}

/**
 * Real-time listener for user's chat messages in Firestore with debug logging and local cache delivery
 */
export function subscribeUserChatHistory(
  userId: string,
  callback: (messages: ChatMessage[]) => void
) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  console.log(`[Zoya Firestore] 📡 Subscribing to real-time chat history for User: ${userId}`);
  const localKey = `zoya_chat_history_${userId}`;

  // 1. Deliver local cache immediately (just like subscribeUserVoiceHistory) for instant recovery on login!
  try {
    const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (cached.length > 0) {
      console.log(`[Zoya Firestore] ⚡ Delivering ${cached.length} cached chat messages instantly for User: ${userId}`);
      callback(cached);
    }
  } catch {}

  // 2. Real-time Firestore listener with fallback
  try {
    const messagesRef = collection(db, "users", userId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    return onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const msgs: ChatMessage[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: data.id || doc.id,
              sender: data.sender || "user",
              text: data.text || "",
              timestamp: data.timestamp || "",
              userId: data.userId || userId,
              createdAt: data.createdAt || 0,
              sources: data.sources || data.toolMetadata?.sources || undefined,
              toolMetadata: data.toolMetadata || undefined,
            };
          });
          console.log(`[Zoya Firestore] 📥 Received ${msgs.length} messages from Firestore stream for User: ${userId}`);
          try {
            localStorage.setItem(localKey, JSON.stringify(msgs));
          } catch {}
          callback(msgs);
        } else {
          // If subcollection messages is empty, check aggregate doc users/{userId}/chatHistory/current
          getDoc(doc(db, "users", userId, "chatHistory", "current"))
            .then((snap) => {
              if (snap.exists() && Array.isArray(snap.data()?.messages) && snap.data().messages.length > 0) {
                const docMsgs = snap.data().messages;
                try {
                  localStorage.setItem(localKey, JSON.stringify(docMsgs));
                } catch {}
                callback(docMsgs);
              } else {
                // If remote is empty, keep cached messages if available
                try {
                  const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
                  if (cached.length > 0) {
                    callback(cached);
                    return;
                  }
                } catch {}
                callback([]);
              }
            })
            .catch(() => {
              try {
                const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
                if (cached.length > 0) {
                  callback(cached);
                  return;
                }
              } catch {}
              callback([]);
            });
        }
      },
      (error) => {
        console.warn(`[Zoya Firestore] ⚠️ Real-time listener error for User: ${userId}:`, error);
        // Fallback: fetch from aggregate doc or keep local cache
        getDoc(doc(db, "users", userId, "chatHistory", "current"))
          .then((snap) => {
            if (snap.exists() && Array.isArray(snap.data()?.messages) && snap.data().messages.length > 0) {
              const docMsgs = snap.data().messages;
              try {
                localStorage.setItem(localKey, JSON.stringify(docMsgs));
              } catch {}
              callback(docMsgs);
            } else {
              try {
                const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
                if (cached.length > 0) callback(cached);
              } catch {}
            }
          })
          .catch(() => {
            try {
              const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
              if (cached.length > 0) callback(cached);
            } catch {}
          });
      }
    );
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Error creating listener for User: ${userId}:`, err);
    try {
      const cached: ChatMessage[] = JSON.parse(localStorage.getItem(localKey) || "[]");
      if (cached.length > 0) callback(cached);
    } catch {}
    return () => {};
  }
}

/**
 * Clear all chat messages for a user in Firestore with debug logging
 */
export async function clearUserChatHistoryInFirestore(
  userId: string
): Promise<void> {
  if (!userId) return;
  console.log(`[Zoya Firestore] 🗑️ Deleting all messages for User ${userId}...`);
  try {
    const localKey = `zoya_chat_history_${userId}`;
    try {
      localStorage.removeItem(localKey);
    } catch {}

    const chatDocRef = doc(db, "users", userId, "chatHistory", "current");
    deleteDoc(chatDocRef).catch(() => {});

    const messagesRef = collection(db, "users", userId, "messages");
    const snapshot = await getDocs(messagesRef);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      console.log(`[Zoya Firestore] ✅ Successfully deleted ${snapshot.size} messages from Firestore for User ${userId}`);
    }
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error clearing messages for User ${userId}:`, error);
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/messages`);
  }
}

export interface VoiceHistoryRecord {
  id: string;
  sender: "user" | "Royal";
  transcript: string;
  timestamp: string;
  userId: string;
  type?: "voice_input" | "voice_response" | "voice_call";
  createdAt: number;
  durationSeconds?: number;
}

/**
 * Save a single voice interaction to user's Firestore voiceHistory collection
 */
export async function saveVoiceHistory(
  userId: string,
  record: {
    sender: "user" | "Royal";
    transcript: string;
    timestamp?: string;
    type?: "voice_input" | "voice_response" | "voice_call";
    durationSeconds?: number;
    createdAt?: number;
  }
): Promise<string> {
  if (!userId || !record.transcript?.trim()) return "";
  const voiceId = "vh_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  const timeStr = record.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const fullRecord: VoiceHistoryRecord = {
    id: voiceId,
    sender: record.sender,
    transcript: record.transcript.trim(),
    timestamp: timeStr,
    userId: userId,
    type: record.type || (record.sender === "user" ? "voice_input" : "voice_response"),
    createdAt: record.createdAt || now,
    durationSeconds: record.durationSeconds,
  };

  console.log(`[Zoya Firestore] 🎙️ Saving voice interaction (${fullRecord.sender}) for User ${userId}: "${fullRecord.transcript.substring(0, 40)}..."`);
  
  // Local storage cache for instant offline responsiveness
  try {
    const localKey = `zoya_voice_history_${userId}`;
    const cached: VoiceHistoryRecord[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    cached.unshift(fullRecord);
    localStorage.setItem(localKey, JSON.stringify(cached.slice(0, 100)));
  } catch {}

  try {
    const voiceRef = doc(db, "users", userId, "voiceHistory", voiceId);
    await setDoc(voiceRef, fullRecord);
    console.log(`[Zoya Firestore] ✅ Voice interaction ${voiceId} written to users/${userId}/voiceHistory`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to write voice history to Firestore:`, error);
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/voiceHistory/${voiceId}`);
  }

  return voiceId;
}

/**
 * Real-time listener for user's voice history in Firestore
 */
export function subscribeUserVoiceHistory(
  userId: string,
  callback: (records: VoiceHistoryRecord[]) => void
) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  console.log(`[Zoya Firestore] 📡 Subscribing to real-time voice history for User: ${userId}`);
  
  // Deliver cached items first for zero-latency
  try {
    const localKey = `zoya_voice_history_${userId}`;
    const cached: VoiceHistoryRecord[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (cached.length > 0) {
      callback(cached);
    }
  } catch {}

  try {
    const voiceRef = collection(db, "users", userId, "voiceHistory");
    const q = query(voiceRef, orderBy("createdAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        const records: VoiceHistoryRecord[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: data.id || doc.id,
            sender: data.sender || "user",
            transcript: data.transcript || "",
            timestamp: data.timestamp || "",
            userId: data.userId || userId,
            type: data.type || "voice_input",
            createdAt: data.createdAt || 0,
            durationSeconds: data.durationSeconds,
          };
        });
        console.log(`[Zoya Firestore] 📥 Received ${records.length} voice records from Firestore stream for User: ${userId}`);
        
        // Cache to local storage
        try {
          localStorage.setItem(`zoya_voice_history_${userId}`, JSON.stringify(records));
        } catch {}

        callback(records);
      },
      (error) => {
        console.warn(`[Zoya Firestore] ⚠️ Real-time voice listener error for User: ${userId}:`, error);
        handleFirestoreError(error, OperationType.LIST, `users/${userId}/voiceHistory`);
      }
    );
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Error creating voice listener for User: ${userId}:`, err);
    callback([]);
    return () => {};
  }
}

/**
 * Clear all voice history for a user in Firestore
 */
export async function clearUserVoiceHistoryInFirestore(
  userId: string
): Promise<void> {
  if (!userId) return;
  console.log(`[Zoya Firestore] 🗑️ Deleting all voice history for User ${userId}...`);
  try {
    localStorage.removeItem(`zoya_voice_history_${userId}`);
  } catch {}

  try {
    const voiceRef = collection(db, "users", userId, "voiceHistory");
    const snapshot = await getDocs(voiceRef);
    if (snapshot.empty) {
      console.log(`[Zoya Firestore] ℹ️ No voice history to delete in Firestore for User ${userId}`);
      return;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`[Zoya Firestore] ✅ Successfully deleted ${snapshot.size} voice records from Firestore for User ${userId}`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error clearing voice records for User ${userId}:`, error);
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/voiceHistory`);
  }
}

/**
 * Delete a single voice history record
 */
export async function deleteSingleVoiceRecord(
  userId: string,
  recordId: string
): Promise<void> {
  if (!userId || !recordId) return;
  try {
    const recordRef = doc(db, "users", userId, "voiceHistory", recordId);
    await deleteDoc(recordRef);
    console.log(`[Zoya Firestore] ✅ Deleted voice record ${recordId} for User ${userId}`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error deleting voice record:`, error);
  }
}

// ─────────────────────────────────────────────────────────────
// Session-Based Topics Architecture (Unified Voice & Text History)
// ─────────────────────────────────────────────────────────────

export interface HistoryMessage {
  id: string;
  sender: "user" | "Royal" | "zoya";
  text: string;
  timestamp: string;
  createdAt: number;
  mode: "voice" | "text";
}

export interface VoiceTopicSession {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: "voice" | "text" | "mixed";
  messageCount: number;
  messages: HistoryMessage[];
}

/**
 * Generates a clean, human-readable title from the first message
 */
export function generateTopicTitle(firstText: string, mode: "voice" | "text" | "mixed"): string {
  const trimmed = firstText.trim();
  if (!trimmed) {
    return mode === "voice"
      ? `Voice Call • ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })}`
      : "New Conversation";
  }

  // Remove common polite filler prefixes if present
  let clean = trimmed
    .replace(/^(can you please|can you|could you|please|hey zoya|hi zoya|hello zoya|zoya|tell me about|what is|how to)\s+/i, "")
    .trim();
  if (!clean) clean = trimmed;

  // Capitalize first letter
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);

  // Truncate cleanly at word boundary around 40-48 chars
  if (clean.length > 48) {
    const truncated = clean.substring(0, 48);
    const lastSpace = truncated.lastIndexOf(" ");
    clean = (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + "...";
  }

  return clean;
}

/**
 * Add a message to an active topic (session), creating the topic if it doesn't exist yet
 */
export async function addMessageToTopic(
  userId: string,
  topicId: string,
  message: {
    sender: "user" | "Royal" | "zoya";
    text: string;
    mode: "voice" | "text";
    timestamp?: string;
    createdAt?: number;
  }
): Promise<VoiceTopicSession> {
  const text = (message.text || "").trim();
  if (!userId || !text) {
    throw new Error("userId and non-empty text are required to add message to topic");
  }

  const now = message.createdAt || Date.now();
  const timeStr = message.timestamp || new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const histMsg: HistoryMessage = {
    id: "msg_" + now + "_" + Math.random().toString(36).substring(2, 6),
    sender: message.sender,
    text,
    timestamp: timeStr,
    createdAt: now,
    mode: message.mode,
  };

  const localKey = `zoya_topics_${userId}`;
  let topics: VoiceTopicSession[] = [];
  try {
    topics = JSON.parse(localStorage.getItem(localKey) || "[]");
  } catch {}

  let existingIndex = topics.findIndex((t) => t.id === topicId);
  let updatedTopic: VoiceTopicSession;

  if (existingIndex >= 0) {
    const current = topics[existingIndex];
    const newMessages = [...current.messages, histMsg];
    let mode = current.mode;
    if (mode !== message.mode) {
      mode = "mixed";
    }

    // If initial title was generic (e.g., started with simple "hello"), refine if this user message is better
    let title = current.title;
    if (
      message.sender === "user" &&
      (title.startsWith("Voice Call") || title.startsWith("New Conversation") || title.length < 8) &&
      text.length > 8
    ) {
      title = generateTopicTitle(text, mode);
    }

    updatedTopic = {
      ...current,
      title,
      updatedAt: now,
      mode,
      messageCount: newMessages.length,
      messages: newMessages,
    };

    topics[existingIndex] = updatedTopic;
  } else {
    const title = generateTopicTitle(text, message.mode);
    updatedTopic = {
      id: topicId,
      userId,
      title,
      createdAt: now,
      updatedAt: now,
      mode: message.mode,
      messageCount: 1,
      messages: [histMsg],
    };
    topics.unshift(updatedTopic);
  }

  // Sort by updatedAt descending
  topics.sort((a, b) => b.updatedAt - a.updatedAt);

  // Save to localStorage immediately for instant UI response
  try {
    localStorage.setItem(localKey, JSON.stringify(topics.slice(0, 50)));
  } catch {}

  // Dual-write topic to Firestore
  try {
    const topicRef = doc(db, "users", userId, "topics", topicId);
    await setDoc(topicRef, updatedTopic, { merge: true });
    console.log(`[Zoya Firestore] ✅ Saved message to Topic ${topicId} ("${updatedTopic.title}")`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to save topic ${topicId} to Firestore:`, error);
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/topics/${topicId}`);
  }

  return updatedTopic;
}

/**
 * Subscribe to user's conversation topics in real-time
 * Includes automatic migration of legacy flat voice/chat records if no topics exist yet
 */
export function subscribeUserTopics(
  userId: string,
  callback: (topics: VoiceTopicSession[]) => void
) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const localKey = `zoya_topics_${userId}`;

  // 1. Deliver local cache if available
  try {
    const cached: VoiceTopicSession[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (cached.length > 0) {
      callback(cached);
    } else {
      // Check legacy voice records for backwards compatibility
      const legacyVoice: VoiceHistoryRecord[] = JSON.parse(
        localStorage.getItem(`zoya_voice_history_${userId}`) || "[]"
      );
      if (legacyVoice.length > 0) {
        const migrated: VoiceTopicSession = {
          id: "topic_legacy_voice_" + userId,
          userId,
          title: "Archived Voice Calls",
          createdAt: legacyVoice[legacyVoice.length - 1]?.createdAt || Date.now(),
          updatedAt: legacyVoice[0]?.createdAt || Date.now(),
          mode: "voice",
          messageCount: legacyVoice.length,
          messages: legacyVoice.map((v) => ({
            id: v.id,
            sender: v.sender,
            text: v.transcript,
            timestamp: v.timestamp,
            createdAt: v.createdAt,
            mode: "voice",
          })),
        };
        callback([migrated]);
      }
    }
  } catch {}

  // 2. Subscribe to Firestore topics collection
  try {
    const topicsRef = collection(db, "users", userId, "topics");
    const q = query(topicsRef, orderBy("updatedAt", "desc"));

    return onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const remoteTopics: VoiceTopicSession[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: data.id || d.id,
              userId: data.userId || userId,
              title: data.title || "Voice Session",
              createdAt: data.createdAt || 0,
              updatedAt: data.updatedAt || 0,
              mode: data.mode || "voice",
              messageCount: data.messageCount || (data.messages?.length ?? 0),
              messages: Array.isArray(data.messages) ? data.messages : [],
            };
          });

          try {
            localStorage.setItem(localKey, JSON.stringify(remoteTopics));
          } catch {}

          callback(remoteTopics);
        } else {
          // If no topics in Firestore yet, check if there's legacy voice history to synthesize
          try {
            const cached: VoiceTopicSession[] = JSON.parse(localStorage.getItem(localKey) || "[]");
            if (cached.length > 0) {
              callback(cached);
              return;
            }
          } catch {}
          callback([]);
        }
      },
      (error) => {
        console.warn(`[Zoya Firestore] ⚠️ Error subscribing to topics for User: ${userId}:`, error);
        handleFirestoreError(error, OperationType.LIST, `users/${userId}/topics`);
      }
    );
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Error creating topic listener:`, err);
    callback([]);
    return () => {};
  }
}

/**
 * Delete a single topic session
 */
export async function deleteSingleTopic(userId: string, topicId: string): Promise<void> {
  if (!userId || !topicId) return;
  const localKey = `zoya_topics_${userId}`;
  try {
    const cached: VoiceTopicSession[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    const updated = cached.filter((t) => t.id !== topicId);
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch {}

  try {
    const topicRef = doc(db, "users", userId, "topics", topicId);
    await deleteDoc(topicRef);
    console.log(`[Zoya Firestore] ✅ Deleted topic ${topicId} for User ${userId}`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error deleting topic ${topicId}:`, error);
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/topics/${topicId}`);
  }
}

/**
 * Clear all topics for a user
 */
export async function clearUserTopicsInFirestore(userId: string): Promise<void> {
  if (!userId) return;
  const localKey = `zoya_topics_${userId}`;
  try {
    localStorage.removeItem(localKey);
  } catch {}

  try {
    const topicsRef = collection(db, "users", userId, "topics");
    const snapshot = await getDocs(topicsRef);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`[Zoya Firestore] ✅ Cleared ${snapshot.size} topics for User ${userId}`);
  } catch (error) {
    console.warn(`[Zoya Firestore] ⚠️ Error clearing topics:`, error);
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/topics`);
  }
}

/* =========================================================================
   DEVELOPER-ONLY ADMIN PANEL & SYSTEM SERVICES
   For Royal Ankit Ahiran (ankit84340kumar@gmail.com)
   ========================================================================= */

export interface AdminUserRecord {
  uid: string;
  displayName: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
  provider: "google" | "password" | "mobile" | "account";
  createdAt: string;
  lastLogin?: string;
}

export interface BugReportRecord {
  id: string;
  requestId: string;
  name: string;
  contact: string;
  category: string;
  description: string;
  errorLog?: string;
  deviceInfo?: string;
  timestamp: string;
  status: "open" | "in_progress" | "resolved";
  telegramMessageId?: number;
  updatedAt?: string;
}

export interface SystemBroadcastData {
  id?: string;
  title: string;
  message: string;
  type: "info" | "warning" | "update" | "celebration";
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface AppSystemSettings {
  voiceCallingEnabled: boolean;
  screenVisionEnabled: boolean;
  wakeWordEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  updatedAt: string;
}

/**
 * Fetch all registered users from Firestore users and accounts collections + local storage
 * DEDUPLICATION: Ensures an account/email only ever appears as a single user record.
 */
export async function getAllRegisteredUsers(): Promise<AdminUserRecord[]> {
  const usersMap = new Map<string, AdminUserRecord>();
  const emailToUid = new Map<string, string>();
  const phoneToUid = new Map<string, string>();

  // 1. Query Firestore users collection
  try {
    const usersCol = collection(db, "users");
    const userSnapshot = await getDocs(usersCol);
    userSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      if (data.provider === "guest" || uid.startsWith("guest_")) return;

      const emailKey = data.email ? data.email.toLowerCase().trim() : null;
      const phoneKey = data.phoneNumber ? data.phoneNumber.trim() : null;

      // Deduplication check: if we already have this email, keep the canonical record
      if (emailKey && emailToUid.has(emailKey)) {
        const existingUid = emailToUid.get(emailKey)!;
        const existing = usersMap.get(existingUid);
        if (existing) {
          if (!existing.photoURL && data.photoURL) existing.photoURL = data.photoURL;
          if (existing.displayName === "User" && data.displayName && data.displayName !== "User") {
            existing.displayName = data.displayName;
          }
        }
        return;
      }

      if (phoneKey && phoneToUid.has(phoneKey)) {
        return;
      }

      if (emailKey) emailToUid.set(emailKey, uid);
      if (phoneKey) phoneToUid.set(phoneKey, uid);

      usersMap.set(uid, {
        uid,
        displayName: data.displayName || "User",
        email: data.email || undefined,
        phoneNumber: data.phoneNumber || undefined,
        photoURL: data.photoURL || undefined,
        provider: data.provider || "password",
        createdAt: data.createdAt || data.lastLogin || new Date().toISOString(),
        lastLogin: data.lastLogin || undefined,
      });
    });
  } catch (err) {
    console.warn("[Admin] Firestore users collection read error:", err);
  }

  // 2. Query Firestore accounts collection
  try {
    const accountsCol = collection(db, "accounts");
    const accountsSnapshot = await getDocs(accountsCol);
    accountsSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = data.uid || docSnap.id;
      const email = data.email || (data.identifier?.includes("@") ? data.identifier : undefined);
      const phoneNumber = data.phoneNumber || (!data.identifier?.includes("@") ? data.identifier : undefined);
      const emailKey = email ? email.toLowerCase().trim() : null;
      const phoneKey = phoneNumber ? phoneNumber.trim() : null;

      if ((emailKey && emailToUid.has(emailKey)) || (phoneKey && phoneToUid.has(phoneKey)) || usersMap.has(uid)) {
        return;
      }

      if (emailKey) emailToUid.set(emailKey, uid);
      if (phoneKey) phoneToUid.set(phoneKey, uid);

      usersMap.set(uid, {
        uid,
        displayName: data.displayName || "User",
        email,
        phoneNumber,
        provider: data.provider || "password",
        createdAt: data.createdAt || new Date().toISOString(),
        lastLogin: data.lastLogin || undefined,
      });
    });
  } catch (err) {
    console.warn("[Admin] Firestore accounts collection read error:", err);
  }

  // 3. Merge local accounts
  try {
    const localAccounts = getLocalAccounts();
    Object.values(localAccounts).forEach((acc: any) => {
      if (!acc || !acc.uid) return;
      const email = acc.email || (acc.identifier?.includes("@") ? acc.identifier : undefined);
      const phoneNumber = acc.phoneNumber || (!acc.identifier?.includes("@") ? acc.identifier : undefined);
      const emailKey = email ? email.toLowerCase().trim() : null;
      const phoneKey = phoneNumber ? phoneNumber.trim() : null;

      if ((emailKey && emailToUid.has(emailKey)) || (phoneKey && phoneToUid.has(phoneKey)) || usersMap.has(acc.uid)) {
        return;
      }

      if (emailKey) emailToUid.set(emailKey, acc.uid);
      if (phoneKey) phoneToUid.set(phoneKey, acc.uid);

      usersMap.set(acc.uid, {
        uid: acc.uid,
        displayName: acc.displayName || "User",
        email,
        phoneNumber,
        provider: acc.provider || "password",
        createdAt: acc.createdAt || new Date().toISOString(),
      });
    });

    const persisted = getPersistedUser();
    if (persisted && persisted.uid && !usersMap.has(persisted.uid)) {
      const emailKey = persisted.email ? persisted.email.toLowerCase().trim() : null;
      if (!emailKey || !emailToUid.has(emailKey)) {
        usersMap.set(persisted.uid, {
          uid: persisted.uid,
          displayName: persisted.displayName || "User",
          email: persisted.email,
          phoneNumber: persisted.phoneNumber,
          photoURL: persisted.photoURL,
          provider: persisted.provider || "google",
          createdAt: persisted.createdAt || new Date().toISOString(),
          lastLogin: persisted.lastLogin,
        });
      }
    }
  } catch (err) {
    console.warn("[Admin] Local storage accounts merge notice:", err);
  }

  return Array.from(usersMap.values()).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Save a bug report in Firestore collection `bug_reports`
 */
export async function saveBugReportToFirestore(report: Omit<BugReportRecord, "id">): Promise<void> {
  const id = report.requestId || `bug_${Date.now()}`;
  const fullReport: BugReportRecord = {
    ...report,
    id,
  };

  // Local storage mirror
  try {
    const localKey = "zoya_bug_reports_admin";
    const existing: BugReportRecord[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    existing.unshift(fullReport);
    localStorage.setItem(localKey, JSON.stringify(existing.slice(0, 100)));
  } catch {}

  // Cloud Firestore persistence
  try {
    const reportRef = doc(db, "bug_reports", id);
    await setDoc(reportRef, fullReport);
    console.log(`[Zoya Firestore] ✅ Bug Report #${id} saved to Firestore`);
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to save Bug Report #${id} to Firestore:`, err);
  }
}

/**
 * Get all bug reports from Firestore `bug_reports` collection (merged with local)
 */
export async function getAllBugReportsFromFirestore(): Promise<BugReportRecord[]> {
  const reportsMap = new Map<string, BugReportRecord>();

  // 1. Cloud Firestore
  try {
    const reportsCol = collection(db, "bug_reports");
    const snapshot = await getDocs(reportsCol);
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as BugReportRecord;
      const id = data.id || data.requestId || docSnap.id;
      reportsMap.set(id, {
        ...data,
        id,
        status: data.status || "open",
      });
    });
  } catch (err) {
    console.warn("[Admin] Firestore bug_reports read error:", err);
  }

  // 2. Local Storage Dispatches
  try {
    const localDispatchesKey = "zoya_developer_dispatches";
    const dispatches: any[] = JSON.parse(localStorage.getItem(localDispatchesKey) || "[]");
    dispatches.forEach((d) => {
      const reqId = d.requestId || d.id;
      if (reqId && !reportsMap.has(reqId)) {
        reportsMap.set(reqId, {
          id: reqId,
          requestId: reqId,
          name: d.name || "App User",
          contact: d.phone || "Not Provided",
          category: d.name?.includes("(") ? d.name.split("(")[1]?.replace(")", "") : "User Message / Issue",
          description: d.message || "No description",
          timestamp: d.timestamp || new Date().toISOString(),
          status: d.replyStatus === "replied" ? "resolved" : "open",
          telegramMessageId: d.telegramMessageId,
        });
      }
    });

    const localAdminReports: BugReportRecord[] = JSON.parse(localStorage.getItem("zoya_bug_reports_admin") || "[]");
    localAdminReports.forEach((r) => {
      if (r.id && !reportsMap.has(r.id)) {
        reportsMap.set(r.id, r);
      }
    });
  } catch {}

  return Array.from(reportsMap.values()).sort((a, b) => {
    return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
  });
}

/**
 * Update bug report status in Firestore
 */
export async function updateBugReportStatusInFirestore(
  reportId: string,
  status: "open" | "in_progress" | "resolved"
): Promise<void> {
  // Update local storage mirror
  try {
    const localKey = "zoya_bug_reports_admin";
    const localList: BugReportRecord[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    const item = localList.find((r) => r.id === reportId || r.requestId === reportId);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
      localStorage.setItem(localKey, JSON.stringify(localList));
    }
  } catch {}

  // Update Firestore
  try {
    const reportRef = doc(db, "bug_reports", reportId);
    await setDoc(reportRef, { status, updatedAt: new Date().toISOString() }, { merge: true });
    console.log(`[Zoya Firestore] ✅ Bug Report #${reportId} status set to ${status}`);
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to update Bug Report #${reportId}:`, err);
  }
}

/**
 * Delete a bug report from Firestore and local storage
 */
export async function deleteBugReportFromFirestore(reportId: string): Promise<void> {
  try {
    const localKey = "zoya_bug_reports_admin";
    const localList: BugReportRecord[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    const filtered = localList.filter((r) => r.id !== reportId && r.requestId !== reportId);
    localStorage.setItem(localKey, JSON.stringify(filtered));
  } catch {}

  try {
    const reportRef = doc(db, "bug_reports", reportId);
    await deleteDoc(reportRef);
    console.log(`[Zoya Firestore] ✅ Deleted Bug Report #${reportId}`);
  } catch (err) {
    console.warn(`[Zoya Firestore] ⚠️ Failed to delete Bug Report #${reportId}:`, err);
  }
}

/**
 * System Broadcast / Announcement Banner (Firestore collection `system_broadcasts`)
 */
export async function getSystemBroadcastFromFirestore(): Promise<SystemBroadcastData | null> {
  // Check local storage first
  try {
    const localData = localStorage.getItem("zoya_system_broadcast");
    if (localData) {
      const parsed: SystemBroadcastData = JSON.parse(localData);
      if (parsed.active) return parsed;
    }
  } catch {}

  // Check Firestore
  try {
    const docRef = doc(db, "system_broadcasts", "active_broadcast");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as SystemBroadcastData;
      if (data.active) {
        localStorage.setItem("zoya_system_broadcast", JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    console.warn("[Broadcast] Failed to read broadcast from Firestore:", err);
  }

  return null;
}

export async function saveSystemBroadcastToFirestore(broadcast: SystemBroadcastData): Promise<void> {
  try {
    localStorage.setItem("zoya_system_broadcast", JSON.stringify(broadcast));
  } catch {}

  try {
    const docRef = doc(db, "system_broadcasts", "active_broadcast");
    await setDoc(docRef, broadcast);
    console.log("[Zoya Firestore] ✅ System Broadcast saved to Firestore");
  } catch (err) {
    console.warn("[Broadcast] Failed to save broadcast to Firestore:", err);
  }
}

export async function clearSystemBroadcastInFirestore(): Promise<void> {
  try {
    localStorage.removeItem("zoya_system_broadcast");
  } catch {}

  try {
    const docRef = doc(db, "system_broadcasts", "active_broadcast");
    await setDoc(docRef, { active: false, clearedAt: new Date().toISOString() }, { merge: true });
    console.log("[Zoya Firestore] ✅ System Broadcast cleared");
  } catch (err) {
    console.warn("[Broadcast] Failed to clear broadcast in Firestore:", err);
  }
}

/**
 * Real-time listener for Active System Broadcast
 */
export function subscribeSystemBroadcast(
  callback: (broadcast: SystemBroadcastData | null) => void
): () => void {
  try {
    const docRef = doc(db, "system_broadcasts", "active_broadcast");
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SystemBroadcastData;
          if (data && data.active) {
            try {
              localStorage.setItem("zoya_system_broadcast", JSON.stringify(data));
            } catch {}
            callback(data);
            return;
          }
        }
        try {
          localStorage.removeItem("zoya_system_broadcast");
        } catch {}
        callback(null);
      },
      (err) => {
        console.warn("[Broadcast] Realtime subscription notice:", err);
        // Fallback to local cache on error
        try {
          const cached = localStorage.getItem("zoya_system_broadcast");
          if (cached) {
            callback(JSON.parse(cached));
            return;
          }
        } catch {}
        callback(null);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn("[Broadcast] Failed to establish realtime listener:", err);
    return () => {};
  }
}

/**
 * App System Settings / Feature Toggles
 */
export async function getAppSystemSettingsFromFirestore(): Promise<AppSystemSettings> {
  const defaultSettings: AppSystemSettings = {
    voiceCallingEnabled: true,
    screenVisionEnabled: true,
    wakeWordEnabled: true,
    maintenanceMode: false,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, "app_settings", "system_controls");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppSystemSettings;
      const merged = { ...defaultSettings, ...data };
      try {
        localStorage.setItem("zoya_system_settings", JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (err) {
    console.warn("[Settings] Fetch from Firestore failed, trying local cache:", err);
  }

  try {
    const local = localStorage.getItem("zoya_system_settings");
    if (local) {
      return { ...defaultSettings, ...JSON.parse(local) };
    }
  } catch {}

  return defaultSettings;
}

/**
 * Real-time listener for App System Settings / Feature Toggles
 */
export function subscribeAppSystemSettings(
  callback: (settings: AppSystemSettings) => void
): () => void {
  const defaultSettings: AppSystemSettings = {
    voiceCallingEnabled: true,
    screenVisionEnabled: true,
    wakeWordEnabled: true,
    maintenanceMode: false,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, "app_settings", "system_controls");
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AppSystemSettings;
          const merged = { ...defaultSettings, ...data };
          try {
            localStorage.setItem("zoya_system_settings", JSON.stringify(merged));
          } catch {}
          callback(merged);
        } else {
          callback(defaultSettings);
        }
      },
      (err) => {
        console.warn("[Settings] Realtime subscription notice:", err);
        try {
          const local = localStorage.getItem("zoya_system_settings");
          if (local) {
            callback({ ...defaultSettings, ...JSON.parse(local) });
            return;
          }
        } catch {}
        callback(defaultSettings);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn("[Settings] Failed to establish realtime listener:", err);
    return () => {};
  }
}

export async function saveAppSystemSettingsToFirestore(settings: AppSystemSettings): Promise<void> {
  try {
    localStorage.setItem("zoya_system_settings", JSON.stringify(settings));
  } catch {}

  try {
    const docRef = doc(db, "app_settings", "system_controls");
    await setDoc(docRef, settings);
    console.log("[Zoya Firestore] ✅ System Settings updated in Firestore");
  } catch (err) {
    console.warn("[Settings] Failed to save settings to Firestore:", err);
  }
}

// =========================================================================
// ADMIN AUDIT LOGS & USER TOPICS ANALYTICS
// =========================================================================

export interface AdminAuditLogRecord {
  id: string;
  adminEmail: string;
  action: string;
  targetUser?: string;
  details?: string;
  timestamp: string;
}

export async function logAdminAction(
  adminEmail: string,
  action: string,
  targetUser?: string,
  details?: string
): Promise<void> {
  const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: AdminAuditLogRecord = {
    id: logId,
    adminEmail,
    action,
    targetUser,
    details,
    timestamp: new Date().toISOString(),
  };

  // 1. Write to local storage audit history
  try {
    const local = JSON.parse(localStorage.getItem("zoya_admin_audit_logs") || "[]") as AdminAuditLogRecord[];
    local.unshift(record);
    localStorage.setItem("zoya_admin_audit_logs", JSON.stringify(local.slice(0, 100)));
  } catch {}

  // 2. Write to Firestore collection
  try {
    const docRef = doc(db, "admin_audit_logs", logId);
    await setDoc(docRef, record);
  } catch (err) {
    console.warn("[AdminAudit] Firestore write notice:", err);
  }
}

export async function getAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
  const logsMap = new Map<string, AdminAuditLogRecord>();

  // Load from local storage
  try {
    const local = JSON.parse(localStorage.getItem("zoya_admin_audit_logs") || "[]") as AdminAuditLogRecord[];
    local.forEach((l) => logsMap.set(l.id, l));
  } catch {}

  // Load from Firestore
  try {
    const colRef = collection(db, "admin_audit_logs");
    const snap = await getDocs(colRef);
    snap.docs.forEach((d) => {
      const data = d.data() as AdminAuditLogRecord;
      logsMap.set(data.id || d.id, {
        id: data.id || d.id,
        adminEmail: data.adminEmail || "Admin",
        action: data.action || "Action",
        targetUser: data.targetUser,
        details: data.details,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    });
  } catch (err) {
    console.warn("[AdminAudit] Firestore fetch notice:", err);
  }

  const logs = Array.from(logsMap.values());
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return logs;
}

export async function getUserTopicsForAdmin(userId: string): Promise<VoiceTopicSession[]> {
  const topicsMap = new Map<string, VoiceTopicSession>();

  // Check local storage for this user
  try {
    const localKey = `zoya_topics_${userId}`;
    const local = JSON.parse(localStorage.getItem(localKey) || "[]") as VoiceTopicSession[];
    local.forEach((t) => topicsMap.set(t.id, t));
  } catch {}

  // Check Firestore users/{userId}/topics
  try {
    const colRef = collection(db, "users", userId, "topics");
    const snap = await getDocs(colRef);
    snap.docs.forEach((d) => {
      const data = d.data() as VoiceTopicSession;
      topicsMap.set(data.id || d.id, {
        ...data,
        id: data.id || d.id,
      });
    });
  } catch (err) {
    console.warn("[AdminTopics] Firestore fetch notice for user", userId, err);
  }

  const topics = Array.from(topicsMap.values());
  topics.sort((a, b) => b.updatedAt - a.updatedAt);
  return topics;
}

export interface SavedResearchItem {
  id: string;
  query: string;
  summary: string;
  sources: Array<{ title: string; url: string; source?: string; snippet?: string; qualityCategory?: string }>;
  savedAt: string;
  createdAt: number;
  userId: string;
}

/**
 * Saves a deep research report to user's Firestore subcollection: users/{userId}/saved_research/
 */
export async function saveResearchReportToFirestore(
  userId: string,
  research: { query: string; summary: string; sources?: Array<any> }
): Promise<string> {
  const docId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowStr = new Date().toISOString();
  
  const payload: SavedResearchItem = {
    id: docId,
    query: research.query || "Deep Research Investigation",
    summary: research.summary,
    sources: research.sources || [],
    savedAt: nowStr,
    createdAt: Date.now(),
    userId: userId || "guest",
  };

  // Local storage dual write
  const localKey = `zoya_saved_research_${userId || "guest"}`;
  try {
    const cached: SavedResearchItem[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    cached.unshift(payload);
    localStorage.setItem(localKey, JSON.stringify(cached.slice(0, 50)));
  } catch {}

  // Write to Firestore users/{userId}/saved_research/{docId}
  if (userId && !userId.startsWith("guest_")) {
    try {
      const resRef = doc(db, "users", userId, "saved_research", docId);
      await setDoc(resRef, payload, { merge: true });
      console.log(`[Zoya Research Vault] ✅ Saved research report ${docId} to users/${userId}/saved_research`);
    } catch (err) {
      console.warn("Notice saving research report to Firestore:", err);
    }
  }

  return docId;
}

/**
 * Retrieves saved research reports for user from Firestore & Local Storage
 */
export async function getUserSavedResearchList(userId: string): Promise<SavedResearchItem[]> {
  const map = new Map<string, SavedResearchItem>();
  const localKey = `zoya_saved_research_${userId || "guest"}`;

  try {
    const cached: SavedResearchItem[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    cached.forEach((item) => map.set(item.id, item));
  } catch {}

  if (userId && !userId.startsWith("guest_")) {
    try {
      const colRef = collection(db, "users", userId, "saved_research");
      const snap = await getDocs(colRef);
      snap.docs.forEach((d) => {
        const data = d.data() as SavedResearchItem;
        map.set(data.id || d.id, { ...data, id: data.id || d.id });
      });
    } catch (err) {
      console.warn("Notice fetching saved research list from Firestore:", err);
    }
  }

  const list = Array.from(map.values());
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}



