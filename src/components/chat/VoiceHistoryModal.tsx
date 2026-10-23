import React, { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Trash2, Mic, Volume2, Search, Copy, Check, 
  ShieldCheck, AlertTriangle, Play, Square, 
  Clock, ArrowLeft, ChevronRight, PhoneCall, 
  MessageSquare, Sparkles, Calendar, Keyboard,
  Layers, RefreshCw
} from "lucide-react";
import { AppUserProfile, VoiceTopicSession, HistoryMessage } from "../../services/firebaseService";
import { speakWithFallback, stopAllSpeech } from "../../services/audioUtils";

interface VoiceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  topics: VoiceTopicSession[];
  user: AppUserProfile | null;
  onClearTopics: () => Promise<void> | void;
  onDeleteTopic?: (topicId: string) => Promise<void> | void;
  onStartVoiceCall?: () => void;
  onSwitchToChat?: () => void;
}

export default function VoiceHistoryModal({
  isOpen,
  onClose,
  topics = [],
  user,
  onClearTopics,
  onDeleteTopic,
  onStartVoiceCall,
  onSwitchToChat,
}: VoiceHistoryModalProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "voice" | "text">("all");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState(false);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);

  const detailScrollRef = useRef<HTMLDivElement>(null);

  // Reset detail view when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTopicId(null);
      setSearchTerm("");
      setFilterMode("all");
      setShowConfirmClearAll(false);
      setDeletingTopicId(null);
      stopAllSpeech();
    }
  }, [isOpen]);

  // Reset state on account switch or logout
  useEffect(() => {
    setSelectedTopicId(null);
    setSearchTerm("");
    setFilterMode("all");
    setShowConfirmClearAll(false);
    setDeletingTopicId(null);
    stopAllSpeech();
  }, [user?.uid]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (selectedTopicId) {
          setSelectedTopicId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedTopicId, onClose]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, []);

  // Auto-scroll detail view to bottom when opened
  useEffect(() => {
    if (selectedTopicId) {
      setTimeout(() => {
        detailScrollRef.current?.scrollTo({
          top: detailScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [selectedTopicId]);

  const selectedTopic = useMemo(() => {
    if (!selectedTopicId) return null;
    return topics.find((t) => t.id === selectedTopicId) || null;
  }, [topics, selectedTopicId]);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handlePlayVoice = async (id: string, text: string) => {
    if (playingMsgId === id) {
      stopAllSpeech();
      setPlayingMsgId(null);
      return;
    }

    try {
      stopAllSpeech();
      setPlayingMsgId(id);
      await speakWithFallback(text);
    } catch (err) {
      console.warn("Audio playback error:", err);
    } finally {
      setPlayingMsgId(null);
    }
  };

  const handleConfirmClearAll = async () => {
    await onClearTopics();
    setShowConfirmClearAll(false);
    setSelectedTopicId(null);
  };

  const handleDeleteSingleTopic = async (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation();
    if (onDeleteTopic) {
      setDeletingTopicId(topicId);
      await onDeleteTopic(topicId);
      setDeletingTopicId(null);
      if (selectedTopicId === topicId) {
        setSelectedTopicId(null);
      }
    }
  };

  // Filter topics by search term and mode
  const filteredTopics = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    return topics.filter((topic) => {
      const matchesMode =
        filterMode === "all" ||
        topic.mode === filterMode ||
        (filterMode === "voice" && topic.mode === "mixed") ||
        (filterMode === "text" && topic.mode === "mixed");

      if (!matchesMode) return false;

      if (!query) return true;

      const titleMatches = topic.title.toLowerCase().includes(query);
      const messageMatches = topic.messages?.some((m) =>
        m.text.toLowerCase().includes(query)
      );

      return titleMatches || messageMatches;
    });
  }, [topics, searchTerm, filterMode]);

  // Format relative or calendar date
  const formatTimestamp = (timestampMs: number): string => {
    if (!timestampMs) return "";
    const date = new Date(timestampMs);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (isToday) {
      return `Today at ${timeStr}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return `Yesterday at ${timeStr}`;
    }

    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeStr}`;
  };

  if (!isOpen) return null;

  const displayName = user?.displayName || "User";
  const totalMessagesCount = topics.reduce((acc, t) => acc + (t.messageCount || t.messages.length), 0);

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl h-[92vh] max-h-[860px] bg-[#101014] border border-white/15 rounded-3xl flex flex-col shadow-2xl overflow-hidden font-sans text-white relative"
        >
          {/* Subtle Ambient Background Gradients */}
          <div className="absolute top-0 right-10 w-72 h-72 bg-cyan-600/10 blur-[90px] rounded-full pointer-events-none" />
          <div className="absolute bottom-10 left-10 w-72 h-72 bg-red-600/10 blur-[90px] rounded-full pointer-events-none" />

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* TOP HEADER */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-black/60 border-b border-white/10 shrink-0 z-10">
            {selectedTopic ? (
              // Header when inside Topic Detail View
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedTopicId(null)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  title="Back to Topics"
                >
                  <ArrowLeft size={16} />
                  <span className="text-xs font-semibold hidden xs:inline">Topics</span>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-white truncate">
                      {selectedTopic.title}
                    </h2>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase shrink-0 border ${
                      selectedTopic.mode === "voice"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        : selectedTopic.mode === "text"
                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    }`}>
                      {selectedTopic.mode}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 truncate flex items-center gap-1.5 mt-0.5">
                    <Clock size={11} className="text-white/40 shrink-0" />
                    <span>{formatTimestamp(selectedTopic.updatedAt || selectedTopic.createdAt)}</span>
                    <span>•</span>
                    <span>{selectedTopic.messages.length} messages</span>
                  </p>
                </div>
              </div>
            ) : (
              // Header when in Topics List View
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-500/10">
                  <Layers size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                      Conversation Topics
                    </h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-semibold border border-cyan-500/30 shrink-0">
                      {topics.length} {topics.length === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 truncate flex items-center gap-1 mt-0.5">
                    <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
                    <span>Account: <strong className="text-white/80">{displayName}</strong> ({totalMessagesCount} total messages)</span>
                  </p>
                </div>
              </div>
            )}

            {/* Right Header Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Delete this topic (if in detail view) */}
              {selectedTopic && onDeleteTopic && (
                <button
                  onClick={(e) => handleDeleteSingleTopic(e, selectedTopic.id)}
                  className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all cursor-pointer"
                  title="Delete this topic"
                >
                  <Trash2 size={15} />
                </button>
              )}

              {/* Clear All History (if on list view and has items) */}
              {!selectedTopic && topics.length > 0 && !showConfirmClearAll && (
                <button
                  onClick={() => setShowConfirmClearAll(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 text-xs font-semibold transition-all cursor-pointer"
                  title="Clear all conversation topics"
                >
                  <Trash2 size={13} />
                  <span className="hidden sm:inline">Clear All</span>
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white border border-white/15 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Close"
                aria-label="Close voice history modal"
              >
                <X size={18} />
                <span className="text-xs font-semibold hidden xs:inline">Close</span>
              </button>
            </div>
          </div>

          {/* Delete All Confirmation Banner */}
          {showConfirmClearAll && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-950/80 border-b border-red-500/40 px-6 py-3 flex items-center justify-between gap-3 text-xs text-red-200 z-10"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <span>Delete all conversation sessions and history for <strong>{displayName}</strong>?</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowConfirmClearAll(false)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClearAll}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* BODY: EITHER DETAIL VIEW OR TOPICS LIST VIEW */}
          {/* ═══════════════════════════════════════════════════════════ */}
          {selectedTopic ? (
            // DETAIL VIEW: Chat Thread for Selected Session
            <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c10]">
              <div
                ref={detailScrollRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth"
              >
                {selectedTopic.messages.length === 0 ? (
                  <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center p-6 text-white/50">
                    <MessageSquare size={32} className="text-white/20 mb-2" />
                    <p className="text-sm">No messages recorded in this session yet.</p>
                  </div>
                ) : (
                  selectedTopic.messages.map((msg, index) => {
                    const isUser = msg.sender === "user";
                    const isPlaying = playingMsgId === msg.id;
                    const isSpoken = msg.mode === "voice";

                    return (
                      <motion.div
                        key={msg.id || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                      >
                        {/* Speaker & Timestamp header */}
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-white/40">
                          {isUser ? (
                            <>
                              <span className="font-mono">{msg.timestamp}</span>
                              <span className="font-semibold text-cyan-300">You</span>
                              {isSpoken ? (
                                <span title="Spoken via microphone"><Mic size={11} className="text-cyan-400" /></span>
                              ) : (
                                <span title="Typed via chat"><Keyboard size={11} className="text-cyan-400" /></span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-bold text-red-400">Zoya</span>
                              {isSpoken ? (
                                <span title="Spoken response"><Volume2 size={11} className="text-red-400" /></span>
                              ) : (
                                <span title="Chat response"><MessageSquare size={11} className="text-red-400" /></span>
                              )}
                              <span className="font-mono">{msg.timestamp}</span>
                            </>
                          )}
                        </div>

                        {/* Chat Bubble Container */}
                        <div className={`relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 text-sm leading-relaxed border group transition-all ${
                          isUser
                            ? "bg-gradient-to-br from-cyan-950/40 via-cyan-900/30 to-black/60 border-cyan-500/30 text-cyan-50 rounded-tr-sm"
                            : "bg-gradient-to-br from-[#1a1820] to-[#121118] border-white/10 text-white/95 rounded-tl-sm shadow-md"
                        }`}>
                          <p className="whitespace-pre-wrap select-text">{msg.text}</p>

                          {/* Quick Message Actions */}
                          <div className={`flex items-center gap-1.5 mt-2 pt-2 border-t ${
                            isUser ? "border-cyan-500/20 justify-end" : "border-white/10 justify-start"
                          }`}>
                            {/* Play / Listen audio */}
                            <button
                              onClick={() => handlePlayVoice(msg.id, msg.text)}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                                isPlaying
                                  ? "bg-cyan-500 text-black border-cyan-400 font-bold"
                                  : "bg-white/5 hover:bg-white/15 text-white/70 hover:text-white border-white/10"
                              }`}
                              title={isPlaying ? "Stop Voice" : "Listen to this message"}
                            >
                              {isPlaying ? <Square size={11} /> : <Play size={11} />}
                              <span>{isPlaying ? "Stop" : "Listen"}</span>
                            </button>

                            {/* Copy Message */}
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.text)}
                              className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white border border-white/10 transition-colors cursor-pointer"
                              title="Copy text"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check size={11} className="text-emerald-400" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            // TOPICS LIST VIEW
            <div className="flex-1 flex flex-col min-h-0">
              {/* Search & Mode Filters Bar */}
              <div className="px-4 sm:px-6 py-3 bg-white/5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                {/* Search box */}
                <div className="relative flex-1 min-w-[190px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search topics or message text..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl text-[11px] shrink-0">
                  <button
                    onClick={() => setFilterMode("all")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      filterMode === "all" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-white/60 hover:text-white"
                    }`}
                  >
                    All ({topics.length})
                  </button>
                  <button
                    onClick={() => setFilterMode("voice")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      filterMode === "voice" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Mic size={11} />
                    <span>Voice</span>
                  </button>
                  <button
                    onClick={() => setFilterMode("text")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      filterMode === "text" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Keyboard size={11} />
                    <span>Text</span>
                  </button>
                </div>
              </div>

              {/* Topics List Feed */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 scroll-smooth">
                {filteredTopics.length === 0 ? (
                  <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-6 text-white/60 space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                      <Layers size={28} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {searchTerm || filterMode !== "all" ? "No Matching Topics" : "No Conversation Topics Yet"}
                      </h3>
                      <p className="text-xs text-white/50 max-w-sm mt-1 leading-relaxed">
                        {searchTerm || filterMode !== "all"
                          ? "Try searching for a different keyword or switch your filter."
                          : "Every voice call or text chat with Zoya creates a topic session with your full conversation history."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {onStartVoiceCall && (
                        <button
                          onClick={() => {
                            onClose();
                            onStartVoiceCall();
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition-transform hover:scale-105 shadow-lg shadow-cyan-600/20 cursor-pointer"
                        >
                          <PhoneCall size={14} />
                          <span>Start Voice Call</span>
                        </button>
                      )}
                      {onSwitchToChat && (
                        <button
                          onClick={() => {
                            onClose();
                            onSwitchToChat();
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all cursor-pointer border border-white/15"
                        >
                          <Keyboard size={14} />
                          <span>Start Text Chat</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  filteredTopics.map((topic) => {
                    const lastMsg = topic.messages[topic.messages.length - 1];
                    const firstMsg = topic.messages[0];
                    const previewText = lastMsg?.text || firstMsg?.text || "No preview available";
                    const isVoice = topic.mode === "voice";
                    const isText = topic.mode === "text";
                    const isMixed = topic.mode === "mixed";

                    return (
                      <motion.div
                        key={topic.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => setSelectedTopicId(topic.id)}
                        className="p-4 rounded-2xl bg-black/40 hover:bg-white/[0.04] border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-sm flex items-center justify-between gap-4"
                      >
                        {/* Topic Main Info */}
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          {/* Mode Icon Badge */}
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border mt-0.5 ${
                            isVoice
                              ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                              : isText
                              ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                              : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          }`}>
                            {isVoice ? <Mic size={18} /> : isText ? <Keyboard size={18} /> : <RefreshCw size={18} />}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Title & Mode */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                                {topic.title}
                              </h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase border shrink-0 ${
                                isVoice
                                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                  : isText
                                  ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              }`}>
                                {topic.mode}
                              </span>
                            </div>

                            {/* Preview Snippet */}
                            <p className="text-xs text-white/60 truncate mt-1 leading-relaxed">
                              {previewText}
                            </p>

                            {/* Metadata */}
                            <div className="flex items-center gap-2.5 mt-2 text-[11px] text-white/40 font-mono">
                              <span className="flex items-center gap-1">
                                <Clock size={11} className="text-white/30" />
                                <span>{formatTimestamp(topic.updatedAt || topic.createdAt)}</span>
                              </span>
                              <span>•</span>
                              <span className="px-1.5 py-0.2 rounded-md bg-white/5 border border-white/10 text-white/60">
                                {topic.messages.length} {topic.messages.length === 1 ? "msg" : "msgs"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons on card right */}
                        <div className="flex items-center gap-2 shrink-0">
                          {onDeleteTopic && (
                            <button
                              onClick={(e) => handleDeleteSingleTopic(e, topic.id)}
                              className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-colors cursor-pointer"
                              title="Delete this topic"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <div className="w-8 h-8 rounded-xl bg-white/5 group-hover:bg-cyan-500/20 text-white/40 group-hover:text-cyan-300 border border-white/10 group-hover:border-cyan-500/30 flex items-center justify-center transition-all">
                            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════ */}
          {/* MODAL FOOTER */}
          {/* ═══════════════════════════════════════════════════════════ */}
          <div className="px-4 sm:px-6 py-3 bg-black/60 border-t border-white/10 flex items-center justify-between gap-3 text-xs text-white/50 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              <span className="truncate">
                Firestore synced under <code className="font-mono text-cyan-300">users/{user?.uid.substring(0, 8)}.../topics</code>
              </span>
            </div>

            <button
              onClick={selectedTopic ? () => setSelectedTopicId(null) : onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer shrink-0"
            >
              {selectedTopic ? "Back to Topics" : "Close"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
