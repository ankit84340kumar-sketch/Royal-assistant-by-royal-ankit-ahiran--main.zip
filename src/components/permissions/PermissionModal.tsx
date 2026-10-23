import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mic, ShieldCheck, Cpu, Monitor, MessageSquare, Instagram, CheckCircle2, AlertCircle, RefreshCw, X, Send, Lock, Sparkles } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSwitchToText?: () => void;
  onStartScreenShare?: () => void;
  onRetryVoice?: () => void;
}

export default function PermissionModal({ onClose, onSwitchToText, onStartScreenShare, onRetryVoice }: Props) {
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'permissions' | 'shortcuts'>('permissions');

  const checkPermissionStatus = () => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setMicGranted(result.state === 'granted');
          result.onchange = () => {
            setMicGranted(result.state === 'granted');
          };
        })
        .catch(() => {
          setMicGranted(null);
        });
    }
  };

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const requestMicrophoneAccess = async () => {
    setIsTestingMic(true);
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Successfully granted!
      setMicGranted(true);
      // Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      setIsTestingMic(false);
      
      // If parent provided onRetryVoice, give user 500ms to see the checkmark then start
      if (onRetryVoice) {
        setTimeout(() => {
          onClose();
          onRetryVoice();
        }, 600);
      }
    } catch (err: any) {
      setIsTestingMic(false);
      setMicGranted(false);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
        setPermissionError('Microphone permission was denied by browser. Please click the Lock (🔒) icon in your browser address bar to Allow Microphone, then click Try Again.');
      } else {
        setPermissionError(err?.message || 'Could not access microphone.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl bg-[#0f0f12] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col text-left relative overflow-hidden my-auto text-white"
      >
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-pink-500 to-amber-500" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/20 flex items-center justify-center ring-1 ring-violet-500/30 text-violet-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Microphone & System Control
              </h2>
              <p className="text-xs text-violet-300/70 font-mono">
                ZOYA AI VOICE ASSISTANT • PERMISSION HELPER
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-6 border border-white/10">
          <button
            onClick={() => setActiveTab('permissions')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'permissions'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Permissions & Mic Access
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'shortcuts'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Instagram & WhatsApp Shortcuts
          </button>
        </div>

        {activeTab === 'permissions' ? (
          <div className="space-y-3.5 mb-6">
            {/* 1. Microphone Access with Direct Interactive Trigger */}
            <div className={`border rounded-2xl p-4 transition-colors ${micGranted ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${micGranted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-violet-500/20 text-violet-300'}`}>
                  <Mic size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-sm text-white">Microphone Permission (माइक परमिशन)</span>
                    {micGranted === true ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 size={12} /> Granted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <AlertCircle size={12} /> Action Required
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-white/70 leading-relaxed mb-3">
                    ज़ोया से सीधे आवाज़ में बातचीत करे खातिर ब्राउज़र में <strong>"Allow Microphone"</strong> करीं।
                  </p>

                  {/* Interactive Button to Prompt & Test Mic */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={requestMicrophoneAccess}
                      disabled={isTestingMic}
                      className={`py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
                        micGranted 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                          : 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white'
                      }`}
                    >
                      <Mic size={14} className={isTestingMic ? "animate-pulse" : ""} />
                      <span>{isTestingMic ? "Requesting..." : micGranted ? "Microphone Active • Test Again" : "Grant / Allow Microphone"}</span>
                    </button>
                    
                    {micGranted && onRetryVoice && (
                      <button
                        onClick={() => {
                          onClose();
                          onRetryVoice();
                        }}
                        className="py-2 px-3.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-violet-500/20"
                      >
                        <Sparkles size={14} />
                        <span>Start Voice Session</span>
                      </button>
                    )}
                  </div>

                  {/* Permission Help Box if Denied */}
                  {permissionError && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-start gap-2">
                      <Lock size={15} className="shrink-0 mt-0.5 text-amber-400" />
                      <div className="flex-1 leading-relaxed">
                        <strong className="block text-amber-300 font-semibold mb-0.5">How to unblock in your browser:</strong>
                        1. Look at your browser address bar above.<br/>
                        2. Click the <strong>Lock (🔒)</strong> or <strong>Tune (🎛️)</strong> icon.<br/>
                        3. Toggle <strong>Microphone</strong> to <strong>Allow</strong>.<br/>
                        4. Click the <strong>"Grant / Allow Microphone"</strong> button above or refresh.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Screen Sharing / Screen Vision */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 bg-pink-500/20 rounded-xl text-pink-300 shrink-0 mt-0.5">
                <Monitor size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-white">2. Screen Vision (स्क्रीन विज़न)</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                    Live Stream
                  </span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  स्क्रीन विजन ऑन कइला पर ज़ोया लाइव स्क्रीन देख के कोडिंग गलती, मैसेज, या डॉक्यूमेंट पर लाइव भोजपुरी गाइडेंस दी।
                </p>
              </div>
            </div>

            {/* 3. System Access & WhatsApp / Instagram */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 rounded-xl text-amber-300 shrink-0 mt-0.5">
                <Cpu size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-white">3. System & App Control (JARVIS Access)</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    Authorized
                  </span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  व्हाट्सएप्प मैसेज भेजे, इंस्टाग्राम मैसेज/DMs इनबॉक्स चेक करे अउरी ऐप्स खोले के अनुमति केवल <strong>रॉयल अंकित अहिरान</strong> जी खातिर बा।
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            <div className="bg-gradient-to-r from-pink-900/30 to-purple-900/30 border border-pink-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-pink-300 mb-1">
                <Instagram size={18} /> Instagram Messages & DMs
              </div>
              <p className="text-xs text-white/80 leading-relaxed mb-3">
                इहाँ से सीधे इंस्टाग्राम इनबॉक्स खोल के मैसेज चेक करीं या ज़ोया के बोलीं: <em>"Zoya, open instagram messages"</em>।
              </p>
              <button
                onClick={() => window.open('https://www.instagram.com/direct/inbox/', '_blank')}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <span>Check Instagram Direct Messages</span>
                <Instagram size={14} />
              </button>
            </div>

            <div className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30 border border-emerald-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-emerald-300 mb-1">
                <MessageSquare size={18} /> WhatsApp Web & Messaging
              </div>
              <p className="text-xs text-white/80 leading-relaxed mb-3">
                व्हाट्सएप्प वेब खोल के किसी भी कांटेक्ट के मैसेज भेज़ीं या बोलीं: <em>"Zoya, send a whatsapp message to +91... saying Hello"</em>।
              </p>
              <button
                onClick={() => window.open('https://web.whatsapp.com/', '_blank')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <span>Open WhatsApp Web</span>
                <Send size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Footer Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
          {onSwitchToText && (
            <button
              onClick={() => {
                onClose();
                onSwitchToText();
              }}
              className="py-3 px-4 bg-gradient-to-r from-violet-600 to-pink-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity text-xs flex items-center justify-center gap-2"
            >
              <Send size={14} />
              <span>Type & Chat Mode (No Mic Needed)</span>
            </button>
          )}
          <button 
            onClick={() => {
              checkPermissionStatus();
              requestMicrophoneAccess();
            }}
            className="py-3 px-4 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors text-xs flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} className={isTestingMic ? "animate-spin" : ""} />
            <span>Check & Refresh Permission</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
