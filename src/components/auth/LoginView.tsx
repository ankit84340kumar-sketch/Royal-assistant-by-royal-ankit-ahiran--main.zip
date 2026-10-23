import React, { useState } from "react";
import { 
  Award, ShieldCheck, CheckCircle2, Globe, X,
  Copy, Check, AlertTriangle
} from "lucide-react";
import ZoyaLogo from "../common/ZoyaLogo";
import LoadingSpinner from "../common/LoadingSpinner";
import { 
  signInWithGoogle, 
  AppUserProfile 
} from "../../services/firebaseService";
import { motion, AnimatePresence } from "motion/react";

interface LoginViewProps {
  onLoginSuccess: (user: AppUserProfile) => void;
  onOpenPortfolio: () => void;
  initialMessage?: string;
  onClose?: () => void;
}

export default function LoginView({ onLoginSuccess, onOpenPortfolio, initialMessage, onClose }: LoginViewProps) {
  // Modal state: null or "domain_helper"
  const [activeModal, setActiveModal] = useState<"domain_helper" | null>(null);

  // States
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const currentHostname = typeof window !== "undefined" ? window.location.hostname : "current-domain";

  const closeModal = () => {
    setActiveModal(null);
  };

  const handleCopyDomain = () => {
    try {
      navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    } catch {}
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      setSuccessMsg(`Welcome, ${user.displayName}!`);
      setTimeout(() => {
        onLoginSuccess(user);
      }, 500);
    } catch (err: any) {
      console.error("Google sign in error:", err);
      const isDomainError = 
        err?.code === "auth/unauthorized-domain" || 
        err?.message?.includes("unauthorized-domain") ||
        err?.message?.includes("Firebase domain unauthorized");

      if (isDomainError) {
        setActiveModal("domain_helper");
      } else {
        setErrorMsg(err.message || "Google sign-in was cancelled or failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full min-w-full bg-[#070709] text-white flex flex-col items-center justify-center p-3 sm:p-4 relative overflow-y-auto overflow-x-hidden font-sans select-none">
      {/* Cinematic Ambient Glow Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-15%] w-[65%] h-[65%] bg-red-600/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[65%] h-[65%] bg-cyan-500/15 blur-[140px] rounded-full" />
        <div className="absolute top-[40%] right-[30%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      {/* 360-Degree Rotating Neon Glow Card - Max Width ~390px, Radius 33px */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[390px] neon-glow-border shadow-2xl shadow-black/80 my-auto z-10 relative"
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors cursor-pointer z-20"
            title="Close"
          >
            <X size={17} />
          </button>
        )}

        <div className="neon-card-body p-6 sm:p-7 text-white flex flex-col items-center">
          {/* Header Brand Section */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-3.5 group cursor-pointer" onClick={onOpenPortfolio}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden p-1 relative flex items-center justify-center bg-white shadow-xl shadow-cyan-500/25 ring-2 ring-cyan-400/80 group-hover:scale-105 transition-transform">
                <ZoyaLogo size={72} showGlow={false} className="w-full h-full border-none shadow-none" />
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider bg-gradient-to-r from-white via-cyan-100 to-red-200 bg-clip-text text-transparent">
              ZOYA AI VOICE ASSISTANT
            </h1>

            <button 
              onClick={onOpenPortfolio}
              className="mt-1 flex items-center gap-1.5 text-xs font-mono tracking-widest text-red-400 hover:text-red-300 transition-colors uppercase cursor-pointer group"
              title="View Creator Royal Ankit Ahiran Portfolio"
            >
              <span>By Royal Ankit Ahiran</span>
              <Award size={13} className="text-red-400 group-hover:rotate-12 transition-transform" />
            </button>
          </div>

          {/* Initial / Free Trial Expiry Notice Banner */}
          {initialMessage && !activeModal && (
            <div className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5 text-left leading-relaxed">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span>{initialMessage}</span>
            </div>
          )}

          {/* Error / Success Notifications on Main Screen if Google fails */}
          <AnimatePresence>
            {errorMsg && !activeModal && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-start gap-2 text-left"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <span className="flex-1 leading-relaxed">{errorMsg}</span>
              </motion.div>
            )}

            {successMsg && !activeModal && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 text-left"
              >
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                <span className="flex-1 font-medium">{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Continue with Google button */}
          <div className="w-full">
            <button
              id="btn-google-signin"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white text-gray-900 hover:bg-gray-100 font-semibold text-sm flex items-center justify-center gap-3 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-75 cursor-pointer active:scale-[0.98]"
            >
              {googleLoading ? (
                <LoadingSpinner size="sm" color="cyan" label="Connecting..." />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>
          </div>

          {/* Persistent Security Guarantee Badge */}
          <div className="mt-6 pt-3.5 border-t border-white/10 w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-emerald-400/90 text-center">
            <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
            <span>Persistent Session • Stays Logged In Permanently</span>
          </div>

          {/* Direct Live Portfolio Link */}
          <button
            onClick={onOpenPortfolio}
            className="mt-2.5 text-[11px] text-white/50 hover:text-red-300 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Globe size={11} />
            <span>royalankitahiranl.netlify.app</span>
          </button>
        </div>
      </motion.div>

      {/* FOCUSED MODAL POPUP FOR DOMAIN HELPER */}
      <AnimatePresence>
        {activeModal === "domain_helper" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              className="w-full max-w-sm bg-[#141418] border border-white/15 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-white font-sans"
            >
              {/* Glow accent */}
              <div className="absolute top-0 right-0 w-40 h-40 blur-[50px] rounded-full pointer-events-none bg-amber-600/15" />

              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl text-white bg-amber-500/20 text-amber-400">
                    <Globe size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Authorize Domain for Google
                    </h3>
                    <p className="text-[11px] text-white/50">
                      Firebase requires this domain to be whitelisted
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* DOMAIN HELPER MODAL CONTENT */}
              <div className="space-y-4 text-left">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5 leading-relaxed">
                  <AlertTriangle size={17} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Google Sign-In requires your current Cloud Run domain to be added to Firebase Authorized Domains list.
                  </span>
                </div>

                {/* Domain Copy Box */}
                <div>
                  <label className="block text-[11px] font-mono text-white/60 mb-1.5 uppercase tracking-wider">
                    Current Domain to Whitelist:
                  </label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-black/60 border border-white/15">
                    <code className="text-xs text-cyan-300 font-mono flex-1 truncate select-all">
                      {currentHostname}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      {copiedDomain ? (
                        <>
                          <Check size={13} className="text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 3 Step Instructions */}
                <div className="text-[11px] text-white/70 space-y-1.5 bg-white/5 p-3 rounded-xl border border-white/10">
                  <p className="font-semibold text-white/90 mb-1">To enable Google Sign-In:</p>
                  <p>1. Open <b>Firebase Console ➔ Authentication ➔ Settings</b></p>
                  <p>2. Go to <b>Authorized domains</b> ➔ Click <b>Add domain</b></p>
                  <p>3. Paste <code>{currentHostname}</code> &amp; Save</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
