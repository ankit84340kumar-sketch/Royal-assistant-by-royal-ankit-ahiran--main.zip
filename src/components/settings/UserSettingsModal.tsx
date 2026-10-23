import React, { useState } from "react";
import { 
  X, User, Mail, Shield, LogOut, Award, Sparkles, Volume2, 
  Bell, Smartphone, Clock, CheckCircle2, Globe, Copy, Check,
  History, MessageSquare, ChevronRight, Mic, Bug, Send,
  AlertTriangle, RefreshCw, AlertCircle, ArrowLeft, Loader2,
  Wifi, WifiOff, ExternalLink, Languages, Play, Eye
} from "lucide-react";
import { AppUserProfile, logoutUser } from "../../services/firebaseService";
import { 
  loadUserSettings, 
  saveUserSettings, 
  loadUserReminders, 
  getTodayStudyMinutes,
  UserSettings 
} from "../../services/userStorageService";
import {
  dispatchProblemReportToTelegram,
  checkDeveloperReplyFromTelegram,
  CheckReplyResult,
  DEVELOPER_TELEGRAM,
  DEVELOPER_EMAIL
} from "../../services/developerDispatchService";
import { isCurrentSessionDeveloper } from "../../services/developerVerificationService";
import { motion, AnimatePresence } from "motion/react";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUserProfile;
  voiceCount?: number;
  onLogout: () => void;
  onOpenPortfolio: () => void;
  onOpenVoiceHistory: () => void;
  onOpenAdminPanel?: () => void;
  onOpenDeveloperContact?: () => void;
  onOpenDeviceModal?: () => void;
}

export default function UserSettingsModal({
  isOpen,
  onClose,
  user,
  voiceCount = 0,
  onLogout,
  onOpenPortfolio,
  onOpenVoiceHistory,
  onOpenAdminPanel,
  onOpenDeveloperContact,
  onOpenDeviceModal,
}: UserSettingsModalProps) {
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings(user.uid));
  const [copiedUid, setCopiedUid] = useState(false);
  const [remindersCount] = useState(() => loadUserReminders(user.uid).length);
  const [studyMinutes] = useState(() => getTodayStudyMinutes(user.uid));

  // Problem / Bug Report State (User enters their own identity)
  const [isReportingIssue, setIsReportingIssue] = useState(false);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [problemCategory, setProblemCategory] = useState("Bug / Error");
  const [problemDescription, setProblemDescription] = useState("");
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState<{
    success: boolean;
    requestId?: string;
    error?: string;
  } | null>(null);
  const [isCheckingReply, setIsCheckingReply] = useState(false);
  const [replyResult, setReplyResult] = useState<CheckReplyResult | null>(null);

  if (!isOpen) return null;

  const handleToggleSetting = (key: keyof UserSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveUserSettings(user.uid, updated);
  };

  const handleToneChange = (tone: "hinglish" | "hindi" | "english") => {
    const updated: UserSettings = { ...settings, conversationTone: tone };
    setSettings(updated);
    saveUserSettings(user.uid, updated);
  };

  const handleCopyUid = () => {
    navigator.clipboard.writeText(user.uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const handleLogoutClick = async () => {
    await logoutUser();
    onLogout();
    onClose();
  };

  // Direct Mail to Developer (User sends report with their own name, phone, email & problem description)
  const handleDirectEmailDeveloper = () => {
    const subject = encodeURIComponent(`[ZOYA USER REPORT] ${problemCategory} - ${userName.trim() || "User"}`);
    const body = encodeURIComponent(
      `User Details / पहचान:\n` +
      `• Name: ${userName.trim() || "Not specified"}\n` +
      `• Mobile Number: ${userPhone.trim() || "Not specified"}\n` +
      `• Email: ${userEmail.trim() || "Not specified"}\n` +
      `• Category: ${problemCategory}\n\n` +
      `Problem Description / समस्या का विवरण:\n` +
      `${problemDescription.trim() || "No description provided"}\n\n` +
      `---\nDevice: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web Client"}`
    );
    window.location.href = `mailto:${DEVELOPER_EMAIL}?subject=${subject}&body=${body}`;
  };

  const handleSendProblemReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingReport) return;
    setIsSendingReport(true);
    setReportResult(null);

    const diagnostics = [
      `Online State: ${typeof navigator !== "undefined" && navigator.onLine ? "Online" : "Offline"}`,
      `User Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web"}`,
      `Platform: ${typeof navigator !== "undefined" ? navigator.platform : "Unknown"}`,
      `UID: ${user.uid}`,
      `Persistence: Dual-write (Local Resilient Cache + Firestore Sync)`,
      `Issue Notice: Continuous retry reported / Firestore backend connectivity check`,
    ].join(" | ");

    try {
      const res = await dispatchProblemReportToTelegram({
        name: userName.trim() || "App User",
        phone: userPhone.trim(),
        email: userEmail.trim(),
        contact: [userPhone.trim(), userEmail.trim()].filter(Boolean).join(" | ") || "Not Provided",
        category: problemCategory,
        description: problemDescription.trim() || "User problem report submitted",
        errorLog: diagnostics,
        deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : "Client Browser",
      });
      setReportResult(res);
      if (res.success) {
        setProblemDescription("");
      }
    } catch (err: any) {
      setReportResult({
        success: false,
        error: err.message || "Failed to dispatch report",
      });
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleCheckDeveloperReplies = async () => {
    setIsCheckingReply(true);
    setReplyResult(null);
    try {
      const res = await checkDeveloperReplyFromTelegram(reportResult?.requestId);
      setReplyResult(res);
    } catch (err: any) {
      setReplyResult({
        status: "error",
        hasReply: false,
        message: "Error checking developer replies. Please try again.",
      });
    } finally {
      setIsCheckingReply(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md max-h-[90vh] sm:max-h-[88vh] bg-[#131316] border border-white/15 rounded-3xl shadow-2xl relative flex flex-col overflow-hidden text-white font-sans"
      >
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-red-600/10 blur-[60px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-600/10 blur-[60px] rounded-full pointer-events-none" />

        {/* Pinned Close Button - Always visible & accessible without scrolling away */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-black/70 hover:bg-white/15 text-white/70 hover:text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer z-30 shadow-lg hover:scale-105"
          title="Close Settings"
          aria-label="Close Settings"
        >
          <X size={18} />
        </button>

        {/* Smooth Scrollable Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 custom-scrollbar focus:outline-none">
          <AnimatePresence mode="wait">
          {isReportingIssue ? (
            /* ========================================================
               BUG & PROBLEM REPORT VIEW (Direct to Developer Telegram)
               ======================================================== */
            <motion.div
              key="bug-report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 pt-1"
            >
              {/* Back Button & Header */}
              <div className="flex items-center gap-3 pr-9">
                <button
                  type="button"
                  onClick={() => {
                    setIsReportingIssue(false);
                    setReportResult(null);
                    setReplyResult(null);
                  }}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors flex items-center justify-center cursor-pointer"
                  title="Back to Settings"
                >
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                      <Bug size={17} className="text-red-400" />
                      <span>डेवलपर को समस्या / बग रिपोर्ट</span>
                    </h3>
                  </div>
                  <p className="text-[11px] text-white/60">
                    रॉयल अंकित अहिरान के टेलीग्राम बॉट पर सीधा संदेश
                  </p>
                </div>
              </div>

              {/* Live Connection Diagnostics Badge */}
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  {typeof navigator !== "undefined" && navigator.onLine ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <Wifi size={13} />
                      <span>ऑनलाइन (Cloud Sync Active)</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400 font-medium">
                      <WifiOff size={13} />
                      <span>ऑफलाइन (Local Resilient Cache)</span>
                    </span>
                  )}
                </div>
                <span className="text-white/40 font-mono text-[10px]">
                  Dual-Storage Cache Active
                </span>
              </div>

              {/* Bug Submission Form */}
              <form onSubmit={handleSendProblemReport} className="space-y-3">
                {/* User Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/70 mb-1 uppercase tracking-wider font-mono">
                    आपका नाम (Your Name)
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="अपना नाम दर्ज करें (Enter your name)"
                    className="w-full bg-black/50 border border-white/15 focus:border-red-500 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/70 mb-1 uppercase tracking-wider font-mono">
                    मोबाइल नंबर (Mobile Number)
                  </label>
                  <input
                    type="tel"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="अपना मोबाइल नंबर दर्ज करें (e.g. 9876543210)"
                    className="w-full bg-black/50 border border-white/15 focus:border-red-500 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/70 mb-1 uppercase tracking-wider font-mono">
                    ईमेल आईडी (Your Email Address)
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="अपना ईमेल पता दर्ज करें (Enter your email)"
                    className="w-full bg-black/50 border border-white/15 focus:border-red-500 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none transition-colors"
                    required
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/70 mb-1.5 uppercase tracking-wider font-mono">
                    समस्या की श्रेणी (Report Category)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {[
                      "Bug / Error",
                      "Feature Problem",
                      "Voice Problem",
                      "Chat Problem",
                      "Call Problem",
                      "Screen Share Problem",
                      "Other",
                    ].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProblemCategory(cat)}
                        className={`py-1.5 px-2.5 rounded-lg text-[11px] font-medium text-left transition-all border cursor-pointer truncate ${
                          problemCategory === cat
                            ? "bg-red-500/25 border-red-500/70 text-red-200 shadow-sm font-semibold"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Problem Description Input */}
                <div>
                  <label className="block text-[11px] font-semibold text-white/70 mb-1 uppercase tracking-wider font-mono">
                    समस्या का विवरण (Problem / Bug Description)
                  </label>
                  <textarea
                    rows={3}
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    placeholder="अपनी समस्या का विवरण विस्तार से लिखें..."
                    className="w-full bg-black/50 border border-white/15 focus:border-red-500 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none transition-colors resize-none leading-relaxed"
                    required
                  />
                </div>

                {/* Action Buttons: Submit via Telegram + Direct Email Developer */}
                <div className="space-y-2 pt-1">
                  <button
                    type="submit"
                    disabled={isSendingReport || !problemDescription.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                  >
                    {isSendingReport ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>रिपोर्ट भेजी जा रही है...</span>
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        <span>Submit Report (टेलीग्राम पर भेजें)</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(`[ZOYA USER REPORT] ${problemCategory} - ${userName || "User"}`)}&body=${encodeURIComponent(
                      `User Name: ${userName}\nMobile Number: ${userPhone}\nEmail: ${userEmail}\nCategory: ${problemCategory}\n\nProblem Description:\n${problemDescription}\n\nDevice: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web"}`
                    )}`}
                    onClick={(e) => {
                      e.preventDefault();
                      handleDirectEmailDeveloper();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/90 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Mail size={15} className="text-cyan-400" />
                    <span>डायरेक्ट ईमेल करें (Direct Mail to Developer)</span>
                  </a>
                </div>
              </form>

              {/* Submission Result Feedback */}
              <AnimatePresence>
                {reportResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`p-3 rounded-2xl border text-xs ${
                      reportResult.success
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                        : "bg-red-500/15 border-red-500/40 text-red-200"
                    }`}
                  >
                    {reportResult.success ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 font-bold text-emerald-300">
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                          <span>रिपोर्ट सफलतापूर्वक टेलीग्राम पर भेज दी गई!</span>
                        </div>
                        <p className="text-[11px] text-white/80 leading-relaxed">
                          आपकी समस्या (Report ID: <span className="font-mono font-bold text-cyan-300">#{reportResult.requestId}</span>) डेवलपर रॉयल अंकित अहिरान के टेलीग्राम बॉट पर पहुंच गई है।
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href={DEVELOPER_TELEGRAM}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-500/50 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors"
                          >
                            <span>टेलीग्राम चैट खोलें</span>
                            <ExternalLink size={12} />
                          </a>
                          <button
                            type="button"
                            onClick={handleCheckDeveloperReplies}
                            disabled={isCheckingReply}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 border border-white/20 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            {isCheckingReply ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            <span>जवाब चेक करें</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-red-300">
                          <AlertCircle size={16} className="text-red-400 shrink-0" />
                          <span>भेजने में समस्या हुई:</span>
                        </div>
                        <p className="text-[11px] text-red-200/90">{reportResult.error}</p>
                        <a
                          href={DEVELOPER_TELEGRAM}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline pt-1"
                        >
                          <span>सीधे टेलीग्राम (@Royal_ankit_ahiran) पर संपर्क करें</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Developer Reply Preview */}
              <AnimatePresence>
                {replyResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px]">
                      <MessageSquare size={13} />
                      <span>डेवलपर रिप्लाई स्टेटस:</span>
                    </div>
                    <p className="text-[11px] text-white/90 leading-relaxed">
                      {replyResult.hasReply
                        ? `डेवलपर रॉयल अंकित अहिरान का संदेश: "${replyResult.latestReply}"`
                        : replyResult.message || "अभी तक कोई नया रिप्लाई नहीं आया है। डेवलपर समीक्षा कर रहे हैं।"}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* ========================================================
               NORMAL USER SETTINGS VIEW
               ======================================================== */
            <motion.div
              key="settings-main"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* User Profile Header */}
              <div className="flex items-center gap-4 pt-1 pr-9">
                <div className="relative">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover ring-2 ring-red-500/70 shadow-lg shadow-red-500/20"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-cyan-500 flex items-center justify-center font-bold text-xl text-white ring-2 ring-white/20 shadow-lg">
                      {getInitials(user.displayName || user.email || "User")}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-[#131316]" title="Online" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white truncate">
                      {user.displayName || user.email || "User"}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                      {user.provider}
                    </span>
                  </div>
                  <p className="text-xs text-white/60 truncate flex items-center gap-1 mt-0.5">
                    <Mail size={12} className="shrink-0 text-white/40" />
                    <span>{user.email || user.phoneNumber || "No contact info"}</span>
                  </p>
                  <button
                    onClick={handleCopyUid}
                    className="mt-1 text-[10px] font-mono text-white/40 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Click to copy User ID"
                  >
                    <span>UID: {user.uid.substring(0, 14)}...</span>
                    {copiedUid ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  </button>
                </div>
              </div>

              {/* Session Status Banner */}
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2.5 text-xs">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-emerald-200">Persistent Active Session</p>
                  <p className="text-[11px] text-emerald-300/80">You will stay permanently logged in on this browser.</p>
                </div>
              </div>

              {/* User Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => {
                    onClose();
                    onOpenVoiceHistory();
                  }}
                  className="p-2.5 rounded-2xl bg-black/40 hover:bg-cyan-950/40 border border-white/10 hover:border-cyan-500/40 text-center transition-all cursor-pointer group"
                  title="Click to view full voice history"
                >
                  <p className="text-base font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors">{voiceCount}</p>
                  <p className="text-[9px] font-mono text-white/50 group-hover:text-cyan-300/80 uppercase">Voice</p>
                </button>
                <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 text-center">
                  <p className="text-base font-bold text-amber-400">{remindersCount}</p>
                  <p className="text-[9px] font-mono text-white/50 uppercase">Remind</p>
                </div>
                <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 text-center">
                  <p className="text-base font-bold text-emerald-400">{studyMinutes}m</p>
                  <p className="text-[9px] font-mono text-white/50 uppercase">Study</p>
                </div>
              </div>

              {/* User Preferences Toggles & Configuration */}
              <div className="space-y-2">
                {/* Conversation Tone Selector */}
                <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-white/80">
                    <div className="flex items-center gap-2">
                      <Languages size={15} className="text-fuchsia-400" />
                      <span className="font-medium">Conversation Tone (बातचीत का लहजा)</span>
                    </div>
                    <span className="text-[10px] text-fuchsia-300/80 font-mono uppercase">
                      {settings.conversationTone || "hinglish"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {(["hinglish", "hindi", "english"] as const).map((tone) => {
                      const isActive = (settings.conversationTone || "hinglish") === tone;
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => handleToneChange(tone)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                            isActive
                              ? "bg-fuchsia-500/25 border border-fuchsia-500/50 text-fuchsia-200 font-semibold shadow-xs"
                              : "bg-white/5 hover:bg-white/10 border border-white/5 text-white/60 hover:text-white/90"
                          }`}
                        >
                          {tone === "hinglish" && "Hinglish (मिक्स)"}
                          {tone === "hindi" && "हिन्दी (Hindi)"}
                          {tone === "english" && "English"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Voice & Sound Effects Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <Volume2 size={15} className="text-cyan-400" />
                    <span>Voice & Sound Effects</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("soundEffectsEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.soundEffectsEnabled ? "bg-cyan-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.soundEffectsEnabled ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Reply Sound Chime Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <Sparkles size={15} className="text-emerald-400" />
                    <span>Response Chime & Tone</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("replySoundEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.replySoundEnabled ?? true ? "bg-emerald-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.replySoundEnabled ?? true ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Daily AI Greeting Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <Bell size={15} className="text-red-400" />
                    <span>Daily AI Greeting</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("dailyGreetingEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.dailyGreetingEnabled ? "bg-red-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.dailyGreetingEnabled ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Wake Word ("Hey Zoya") Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <Mic size={15} className="text-violet-400" />
                    <span>Wake Word ("Hey Zoya")</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("wakeWordEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.wakeWordEnabled ? "bg-violet-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.wakeWordEnabled ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Reminders & Timers Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <Clock size={15} className="text-amber-400" />
                    <span>Reminders & Timer Alerts</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("remindersEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.remindersEnabled ?? true ? "bg-amber-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.remindersEnabled ?? true ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* System Alerts & Health Notifications */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-white/80">
                    <AlertCircle size={15} className="text-blue-400" />
                    <span>System Alerts & Network Notice</span>
                  </div>
                  <button
                    onClick={() => handleToggleSetting("systemAlertsEnabled")}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      settings.systemAlertsEnabled ?? true ? "bg-blue-500" : "bg-white/20"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform ${
                        settings.systemAlertsEnabled ?? true ? "left-4.5" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                {/* DEVELOPER-ONLY ADMIN PANEL (Only visible to verified developer Royal Ankit Ahiran) */}
                {isCurrentSessionDeveloper(user.email) && onOpenAdminPanel && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdminPanel();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600/35 via-rose-600/35 to-amber-600/35 hover:from-red-600/50 hover:to-amber-600/50 border border-red-500/60 text-xs font-semibold flex items-center justify-between text-white transition-all cursor-pointer group shadow-lg shadow-red-950/40 hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-red-400 group-hover:rotate-12 transition-transform" />
                      <span className="font-bold text-red-200">Developer Admin Panel (कंट्रोल सेंटर)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/40 text-red-100 font-mono font-bold border border-red-400/60">
                        Admin Only
                      </span>
                      <ChevronRight size={14} className="text-red-300 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                )}

                {/* DIRECT MESSAGE TO DEVELOPER (Telegram Dispatch & Direct Reply Check) */}
                {onOpenDeveloperContact && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeveloperContact();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600/25 via-blue-600/25 to-indigo-600/25 hover:from-cyan-600/40 hover:to-indigo-600/40 border border-cyan-500/40 text-xs font-semibold flex items-center justify-between text-cyan-200 transition-all cursor-pointer group shadow-sm hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2">
                      <Send size={16} className="text-cyan-400 group-hover:rotate-12 transition-transform" />
                      <span className="font-bold">डेवलपर को संदेश (Message Royal Ankit Ahiran)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/30 text-cyan-300 font-mono font-bold border border-cyan-500/40">
                        Telegram Bot
                      </span>
                      <ChevronRight size={14} className="text-cyan-400/60 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                )}

                {/* PROMINENT ISSUE / BUG REPORT BUTTON (Direct to Telegram) */}
                <button
                  type="button"
                  onClick={() => setIsReportingIssue(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600/25 to-amber-600/25 hover:from-red-600/35 hover:to-amber-600/35 border border-red-500/40 text-xs font-semibold flex items-center justify-between text-red-200 transition-all cursor-pointer group shadow-sm hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-2">
                    <Bug size={16} className="text-red-400 group-hover:rotate-12 transition-transform" />
                    <span className="font-bold">समस्या / बग रिपोर्ट (Report to Developer Telegram)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/30 text-red-300 font-mono font-bold border border-red-500/40">
                      Telegram Direct
                    </span>
                    <ChevronRight size={14} className="text-red-400/60 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                {/* Dedicated Voice History Button */}
                <button
                  onClick={() => {
                    onClose();
                    onOpenVoiceHistory();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-xs font-semibold flex items-center justify-between text-cyan-200 transition-all cursor-pointer group shadow-sm hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-cyan-400 group-hover:rotate-[-20deg] transition-transform" />
                    <span>Voice History</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/30 text-cyan-300 font-mono font-bold border border-cyan-500/40">
                      {voiceCount} {voiceCount === 1 ? "record" : "records"}
                    </span>
                    <ChevronRight size={14} className="text-cyan-400/60 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                {/* Device Profile & Specs Button */}
                {onOpenDeviceModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDeviceModal();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-semibold flex items-center justify-between text-violet-200 transition-all cursor-pointer group shadow-sm hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone size={16} className="text-violet-400 group-hover:scale-110 transition-transform" />
                      <span>Device Profile & Telemetry (डिवाइस जानकारी)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-300 font-mono font-bold border border-violet-500/40">
                        Device
                      </span>
                      <ChevronRight size={14} className="text-violet-400/60 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                )}

                <button
                  onClick={() => {
                    onClose();
                    onOpenPortfolio();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 text-red-300 transition-colors cursor-pointer"
                >
                  <Award size={15} className="text-red-400" />
                  <span>Developer Royal Ankit Ahiran Portfolio</span>
                </button>

                <button
                  onClick={handleLogoutClick}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold flex items-center justify-center gap-2 text-red-400 transition-colors cursor-pointer"
                >
                  <LogOut size={15} />
                  <span>Sign Out of Session</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
