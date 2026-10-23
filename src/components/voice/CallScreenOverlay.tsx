import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Phone, PhoneCall, PhoneOff, User, Volume2, VolumeX, Mic, MicOff, 
  ExternalLink, Search, Check, AlertCircle, ShieldCheck, X, Sparkles
} from "lucide-react";
import { 
  CallOverlayState, 
  ContactEntry, 
  placeNativePhoneCall, 
  clearPendingCallState,
  getStoredContacts
} from "../../services/contactService";
import { startPhoneRingTone, stopPhoneRingTone } from "../../services/audioUtils";

interface CallScreenOverlayProps {
  overlayState: CallOverlayState;
  onClose: () => void;
  onSelectNumber: (contact: ContactEntry) => void;
}

export default function CallScreenOverlay({
  overlayState,
  onClose,
  onSelectNumber,
}: CallScreenOverlayProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const timerRef = useRef<any>(null);

  // Play audio ringtone when status is "calling"
  useEffect(() => {
    if (overlayState.isOpen && overlayState.status === "calling") {
      startPhoneRingTone();
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      stopPhoneRingTone();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      stopPhoneRingTone();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [overlayState.isOpen, overlayState.status]);

  if (!overlayState.isOpen) return null;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleEndCall = () => {
    stopPhoneRingTone();
    clearPendingCallState();
    onClose();
  };

  const handleNativeDialer = (phone: string, name?: string) => {
    placeNativePhoneCall(phone, name);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          className="w-full max-w-md bg-[#0d0d16] border border-red-500/30 rounded-3xl p-6 shadow-2xl text-white relative overflow-hidden flex flex-col items-center text-center space-y-5"
        >
          {/* Subtle Ambient Red/Purple Glow */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

          {/* Close / Dismiss button */}
          <button
            onClick={handleEndCall}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>

          {/* TOP STATE: MULTIPLE MATCHES SELECTION */}
          {overlayState.status === "multiple_matches" && (
            <div className="w-full space-y-4">
              {/* Header Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-mono">
                <Search size={13} />
                <span>Device Contacts Found ({overlayState.multipleMatches?.length || 0} numbers)</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white capitalize">
                  {overlayState.query || "Contact"}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Multiple numbers saved in device storage. Tap or speak the last 2 digits:
                </p>
              </div>

              {/* Number Cards Grid */}
              <div className="w-full space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {overlayState.multipleMatches?.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => onSelectNumber(contact)}
                    className="w-full p-3.5 rounded-2xl bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/40 transition-all flex items-center justify-between group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-600 to-purple-600 flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-md">
                        {contact.lastTwoDigits}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                          <span>{contact.name}</span>
                          {contact.label && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">
                              {contact.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">
                          {contact.phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold font-mono group-hover:scale-105 transition-transform flex items-center gap-1">
                        <PhoneCall size={12} />
                        <span>..{contact.lastTwoDigits}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Bottom Instructions */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-left text-xs text-gray-300 flex items-start gap-2">
                <Sparkles size={16} className="text-red-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> You can say <em>"call the one ending in {overlayState.multipleMatches?.[0]?.lastTwoDigits}"</em> or tap any number above to dial immediately!
                </span>
              </div>
            </div>
          )}

          {/* ACTIVE OUTBOUND CALL SCREEN */}
          {overlayState.status === "calling" && (
            <div className="w-full flex flex-col items-center space-y-4">
              {/* Status pill */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Calling / कॉल लगावल जात बा...</span>
              </div>

              {/* Animated Caller Ring */}
              <div className="relative my-2">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-red-500/30">
                  <User size={42} />
                </div>
                {/* Radar Waves */}
                <div className="absolute inset-0 rounded-full border-2 border-red-500/40 animate-ping pointer-events-none" />
                <div className="absolute -inset-2 rounded-full border border-red-500/20 animate-pulse pointer-events-none" />
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="text-2xl font-bold text-white tracking-wide">
                  {overlayState.query || "Contact"}
                </h3>
                <p className="text-sm font-mono text-emerald-400 mt-1 font-semibold">
                  {overlayState.phoneNumber || "+91 Mobile"}
                </p>
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  Duration: {formatTime(duration)} (Ringing...)
                </p>
              </div>

              {/* Direct Open Native Dialer Button */}
              {overlayState.phoneNumber && (
                <button
                  onClick={() => handleNativeDialer(overlayState.phoneNumber!, overlayState.query)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <ExternalLink size={14} />
                  <span>Open Phone Dialer App (डायलर खोलें)</span>
                </button>
              )}

              {/* Call Controls */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3.5 rounded-full border transition-colors ${
                    isMuted
                      ? "bg-red-500/20 border-red-500 text-red-400"
                      : "bg-white/5 border-white/10 text-gray-300 hover:text-white"
                  }`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                {/* Big End Call Button */}
                <button
                  onClick={handleEndCall}
                  className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/40 hover:scale-105 active:scale-95 transition-all"
                  title="End Call"
                >
                  <PhoneOff size={24} />
                </button>

                <button
                  onClick={() => setIsSpeaker(!isSpeaker)}
                  className={`p-3.5 rounded-full border transition-colors ${
                    isSpeaker
                      ? "bg-purple-500/20 border-purple-500 text-purple-400"
                      : "bg-white/5 border-white/10 text-gray-300 hover:text-white"
                  }`}
                  title={isSpeaker ? "Speaker Off" : "Speaker"}
                >
                  {isSpeaker ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              </div>
            </div>
          )}

          {/* SEARCHING STATE */}
          {overlayState.status === "searching" && (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 animate-spin">
                <Search size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Searching Contacts...</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Looking up saved numbers for "{overlayState.query}"...
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
