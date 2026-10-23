import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Send, MessageSquare, CheckCircle2, AlertCircle, RefreshCw, 
  Smartphone, User, ShieldCheck, Mail, Globe, ExternalLink 
} from "lucide-react";
import { 
  dispatchToDeveloperTelegram, 
  checkDeveloperReplyFromTelegram, 
  getDispatchedLeadsLocally, 
  DispatchedLeadItem,
  CheckReplyResult,
  DEVELOPER_PORTFOLIO,
  DEVELOPER_TELEGRAM,
  DEVELOPER_EMAIL
} from "../../services/developerDispatchService";
import LoadingSpinner from "./LoadingSpinner";

interface DeveloperContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
  defaultUserName?: string;
  defaultUserPhone?: string;
}

export default function DeveloperContactModal({
  isOpen,
  onClose,
  initialMessage = "",
  defaultUserName = "",
  defaultUserPhone = "",
}: DeveloperContactModalProps) {
  // User enters their own identity without developer pre-fill
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialMessage);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingReply, setIsCheckingReply] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    requestId?: string;
    timestamp?: string;
    error?: string;
  } | null>(null);

  const [dispatches, setDispatches] = useState<DispatchedLeadItem[]>(() => getDispatchedLeadsLocally());
  const [replyResult, setReplyResult] = useState<CheckReplyResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDispatches(getDispatchedLeadsLocally());
      if (initialMessage && !message) {
        setMessage(initialMessage);
      }
    }
  }, [isOpen, initialMessage]);

  if (!isOpen) return null;

  const handleDirectEmail = () => {
    const subject = encodeURIComponent(`[ZOYA DIRECT INQUIRY] From ${name.trim() || "User"}`);
    const body = encodeURIComponent(
      `User Details / पहचान:\n` +
      `• Name: ${name.trim() || "Not specified"}\n` +
      `• Mobile Number: ${phone.trim() || "Not specified"}\n` +
      `• Email: ${email.trim() || "Not specified"}\n\n` +
      `Message / संदेश:\n` +
      `${message.trim() || "No message provided"}\n\n` +
      `---\nDevice: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web Client"}`
    );
    window.location.href = `mailto:${DEVELOPER_EMAIL}?subject=${subject}&body=${body}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const contactCombined = [phone.trim(), email.trim()].filter(Boolean).join(" | ");
      const res = await dispatchToDeveloperTelegram({
        name: name.trim() || "Anonymous User",
        phone: contactCombined || phone.trim(),
        message: message.trim() + (email.trim() ? `\n(Email: ${email.trim()})` : ""),
      });

      setSubmitResult(res);
      setDispatches(getDispatchedLeadsLocally());

      if (res.success) {
        setMessage("");
      }
    } catch (err: any) {
      setSubmitResult({
        success: false,
        error: err.message || "Failed to send message",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckReplies = async () => {
    setIsCheckingReply(true);
    setReplyResult(null);
    try {
      const res = await checkDeveloperReplyFromTelegram();
      setReplyResult(res);
      setDispatches(getDispatchedLeadsLocally());
    } catch (err: any) {
      setReplyResult({
        status: "error",
        hasReply: false,
        message: "Network error while checking replies. Please try again.",
      });
    } finally {
      setIsCheckingReply(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        className="w-full max-w-lg bg-[#0e0e14] border border-cyan-500/20 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden text-white font-sans max-h-[90vh] flex flex-col"
      >
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-red-600/10 blur-[60px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-cyan-400/40 shadow-lg shadow-cyan-600/30 shrink-0 bg-gradient-to-tr from-cyan-950 via-neutral-900 to-cyan-900/60 relative flex items-center justify-center">
              <MessageSquare size={18} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Message Royal Ankit Ahiran
              </h2>
              <p className="text-xs text-cyan-300/80 font-mono">
                Direct Telegram Bot &amp; Developer Dispatch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
          {/* Submission Status Alerts */}
          <AnimatePresence>
            {submitResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                  submitResult.success
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                    : "bg-red-500/15 border-red-500/40 text-red-200"
                }`}
              >
                {submitResult.success ? (
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {submitResult.success
                      ? "Message Dispatched Successfully to Developer!"
                      : "Dispatch Failed"}
                  </p>
                  {submitResult.success ? (
                    <p className="text-white/80 leading-relaxed">
                      Your message has been delivered directly to Royal Ankit Ahiran's Telegram with{" "}
                      <span className="font-mono text-cyan-300 font-bold">#{submitResult.requestId}</span>.
                      Developer can reply directly to this thread.
                    </p>
                  ) : (
                    <p className="text-white/80">{submitResult.error}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-white/70 mb-1 uppercase tracking-wider">
                  Your Name (आपका नाम)
                </label>
                <div className="relative flex items-center">
                  <User size={14} className="absolute left-3 text-white/40 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={isSubmitting}
                    className="w-full py-2.5 pl-9 pr-3 rounded-xl bg-black/50 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-white/70 mb-1 uppercase tracking-wider">
                  Mobile Number (मोबाइल नंबर)
                </label>
                <div className="relative flex items-center">
                  <Smartphone size={14} className="absolute left-3 text-white/40 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    disabled={isSubmitting}
                    className="w-full py-2.5 pl-9 pr-3 rounded-xl bg-black/50 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-[11px] font-mono text-white/70 mb-1 uppercase tracking-wider">
                Your Email Address (ईमेल आईडी)
              </label>
              <div className="relative flex items-center">
                <Mail size={14} className="absolute left-3 text-white/40 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={isSubmitting}
                  className="w-full py-2.5 pl-9 pr-3 rounded-xl bg-black/50 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-white/70 mb-1 uppercase tracking-wider">
                Your Message / Inquiry (आपका संदेश)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your question, project inquiry, or message..."
                rows={4}
                disabled={isSubmitting}
                className="w-full p-3 rounded-2xl bg-black/50 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors resize-none disabled:opacity-50"
                required
              />
            </div>

            {/* Actions: Telegram Dispatch + Direct Email */}
            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-500 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-600/30 disabled:opacity-60 cursor-pointer active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <LoadingSpinner size="sm" label="Dispatching to Telegram..." showSlowNetworkMessage={true} />
                ) : (
                  <>
                    <span>Send Message to Telegram</span>
                    <Send size={14} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDirectEmail}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/90 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Mail size={14} className="text-cyan-400" />
                <span>डायरेक्ट ईमेल करें (Direct Mail to Developer)</span>
              </button>
            </div>
          </form>

          {/* Previous Dispatches & Developer Reply Check Section */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-cyan-400" />
                <span>Your Sent Requests ({dispatches.length})</span>
              </span>

              <button
                type="button"
                onClick={handleCheckReplies}
                disabled={isCheckingReply || dispatches.length === 0}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {isCheckingReply ? (
                  <LoadingSpinner size="xs" label="Checking..." showSlowNetworkMessage={false} />
                ) : (
                  <>
                    <RefreshCw size={11} className={isCheckingReply ? "animate-spin" : ""} />
                    <span>Check Developer Replies</span>
                  </>
                )}
              </button>
            </div>

            {/* Reply Result banner */}
            {replyResult && (
              <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                <p className="leading-relaxed">{replyResult.message}</p>
              </div>
            )}

            {/* List of Sent Messages */}
            {dispatches.length > 0 && (
              <div className="space-y-2 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {dispatches.slice(0, 5).map((d) => (
                  <div key={d.id} className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
                      <span className="text-cyan-400 font-bold">#{d.requestId}</span>
                      <span>{d.timestamp}</span>
                    </div>
                    <p className="text-white/90 text-[11px] truncate">{d.message}</p>
                    {d.replies && d.replies.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-white/5 text-[11px] text-emerald-300 bg-emerald-950/20 p-1.5 rounded">
                        <span className="font-semibold">Reply:</span> {d.replies[d.replies.length - 1].text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Direct Links */}
        <div className="pt-3 mt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/50 shrink-0">
          <a
            href={DEVELOPER_PORTFOLIO}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <Globe size={12} />
            <span>royalankitahiranl.netlify.app</span>
            <ExternalLink size={10} />
          </a>

          <a
            href={DEVELOPER_TELEGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <Send size={12} />
            <span>@Royal_ankit_ahiran</span>
          </a>
        </div>
      </motion.div>
    </div>
  );
}
