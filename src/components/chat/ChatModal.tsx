import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Send, Mic, MicOff, Volume2, VolumeX, MessageSquare, 
  Copy, Check, Trash2, History, Sparkles, PhoneCall, Phone, PhoneOff,
  Search, ArrowLeft, Clock, Square, Play, RefreshCw, RotateCw,
  AlertCircle, Share2, Loader2, MoreVertical, User, 
  Settings as SettingsIcon, Info, Shield, LogOut, CheckCircle2, 
  ExternalLink, Sliders, Bell, Edit3, Image, Radio, HelpCircle,
  Bug, MessageCircle, Heart, Globe, Mail, Activity, Smartphone,
  Plus, Download, Link2, FileText, FileCode, Code, Maximize2,
  Camera, SwitchCamera, Bookmark, FileSpreadsheet, Layers, Award
} from "lucide-react";
import { 
  ChatMessage, 
  AppUserProfile, 
  VoiceTopicSession, 
  logoutUser, 
  saveMessageToFirestore,
  saveResearchReportToFirestore,
  getUserSavedResearchList,
  SavedResearchItem
} from "../../services/firebaseService";
import { stopAllSpeech, sharedGaplessPlayer, unlockAudioContext, getPreferredNaturalFemaleVoice } from "../../services/audioUtils";
import { LiveSessionManager } from "../../services/liveService";
import { getRoyalAudio, shouldAutoTriggerWebSearch } from "../../services/geminiService";
import { apiVision, apiAnalyzeFiles } from "../../services/api";
import { 
  DEVELOPER_TELEGRAM, 
  DEVELOPER_PORTFOLIO, 
  DEVELOPER_EMAIL,
  dispatchProblemReportToTelegram 
} from "../../services/developerDispatchService";
import { isCurrentSessionDeveloper } from "../../services/developerVerificationService";
import {
  executeWebSearch,
  executeDeepResearch,
  searchWebImages,
  generateImageWithPrompt,
  inspectWebUrl,
  analyzeUploadedDocument,
  analyzeCodeFile,
  analyzeZipArchive,
  analyzeVideoOrAudioFile,
} from "../../services/toolsService";
import ZoyaLogo from "../common/ZoyaLogo";

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (
    text: string, 
    attachment?: any, 
    onStreamChunk?: (chunkText: string, msgId?: string) => void
  ) => Promise<void> | void;
  onRegenerateResponse?: (
    userPrompt: string, 
    zoyaMsgId: string, 
    onStreamChunk?: (chunkText: string, msgId?: string) => void
  ) => Promise<void> | void;
  isProcessing?: boolean;
  user: AppUserProfile | null;
  onClearChatHistory: () => Promise<void> | void;
  topics?: VoiceTopicSession[];
  onOpenVoiceCall?: () => void;
  onSwitchToVoice?: () => void;
  onLogout?: () => void;
  onOpenDeviceModal?: () => void;
  isSpeakerMuted?: boolean;
  onToggleSpeaker?: () => void;
  onOpenAdminPanel?: () => void;
}

// =========================================================================
// STEP 1 - CONSTANTS (ChatModal.tsx - Unified STT & TTS latency settings)
// =========================================================================
const FIRST_CHUNK_MIN_CHARS = 12;
const FIRST_CHUNK_MAX_CHARS = 25;
const NEXT_CHUNK_MIN_CHARS = 30;
const NEXT_CHUNK_MAX_CHARS = 60;
const SILENCE_MS_COMPLETE = 300;    // (वाक्य . ? ! । पर ख़त्म हो)
const SILENCE_MS_INCOMPLETE = 600;  // (वाक्य अधूरा लगे)
const TTS_FAILOVER_MS = 2000;

function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*#_~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .trim();
}

// Extract speech chunks cleanly for reliable, ultra-fast-start, and continuous queue playback without stopping
function extractSpeechSentences(rawText: string): string[] {
  if (!rawText) return [];

  const clean = cleanTextForSpeech(rawText);
  if (!clean) return [];

  const chunks: string[] = [];
  let remaining = clean.trim();

  while (remaining.length > 0) {
    const isFirst = chunks.length === 0;
    const minChars = isFirst ? FIRST_CHUNK_MIN_CHARS : NEXT_CHUNK_MIN_CHARS;
    const maxChars = isFirst ? FIRST_CHUNK_MAX_CHARS : NEXT_CHUNK_MAX_CHARS;

    if (remaining.length <= maxChars) {
      chunks.push(remaining.trim());
      break;
    }

    let cutIdx = -1;
    const windowSub = remaining.slice(0, maxChars);

    // Look for sentence/clause boundary [.?!।,;\n] within [minChars, maxChars]
    for (let i = minChars - 1; i < windowSub.length; i++) {
      if (/[,.?!।,;\n]/.test(windowSub[i])) {
        cutIdx = i + 1;
        break;
      }
    }

    // If no punctuation boundary, find word boundary (space)
    if (cutIdx === -1) {
      const lastSpace = windowSub.lastIndexOf(" ");
      if (lastSpace >= minChars) {
        cutIdx = lastSpace;
      } else {
        const nextSpace = remaining.indexOf(" ", minChars);
        if (nextSpace !== -1 && nextSpace <= maxChars + 10) {
          cutIdx = nextSpace;
        } else if (lastSpace > 0) {
          cutIdx = lastSpace;
        } else {
          cutIdx = maxChars;
        }
      }
    }

    const chunk = remaining.slice(0, cutIdx).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cutIdx).trim();
  }

  return chunks.length > 0 ? chunks : [clean];
}


interface WordRange {
  word: string;
  start: number;
  end: number;
}

function getWordRanges(text: string): WordRange[] {
  const ranges: WordRange[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    ranges.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return ranges;
}

function getPreferredIndianVoice(text?: string): SpeechSynthesisVoice | null {
  return getPreferredNaturalFemaleVoice(text);
}

function exportReportToPDF(title: string, content: string, sources?: any[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const html = `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <title>${title} - ZOYA AI Research Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');
    body {
      font-family: 'Inter', 'Noto Sans Devanagari', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 30px;
      background: #ffffff;
    }
    .header {
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 15px;
      margin-bottom: 25px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand { font-size: 22px; font-weight: 700; color: #6d28d9; letter-spacing: 0.5px; }
    .subbrand { font-size: 12px; color: #64748b; margin-top: 2px; }
    .meta { font-size: 12px; color: #64748b; text-align: right; }
    h2 { font-size: 18px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 20px; }
    .content { font-size: 14px; white-space: pre-wrap; word-wrap: break-word; color: #334155; }
    .source-box { margin-top: 30px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; }
    .source-title { font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 10px; }
    .source-item { font-size: 12px; margin-bottom: 6px; }
    .source-item a { color: #2563eb; text-decoration: none; }
    .footer { margin-top: 50px; font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; }
    @media print {
      body { padding: 0; margin: 2cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">ZOYA AI VOICE ASSISTANT</div>
      <div class="subbrand">Web Research & Fact-Grounded Report</div>
    </div>
    <div class="meta">
      <div><strong>Developer:</strong> Royal Ankit Ahiran</div>
      <div><strong>Date:</strong> ${new Date().toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>
  <h2>${title}</h2>
  <div class="content">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  ${sources && sources.length > 0 ? `
    <div class="source-box">
      <div class="source-title">Grounding Citations & Sources (${sources.length})</div>
      ${sources.map((s, i) => `
        <div class="source-item">[${i + 1}] <strong>${s.title || s.sourceName || s.source || s.url}</strong> - <a href="${s.url}">${s.url}</a> ${s.qualityCategory ? `(${s.qualityCategory})` : ""}</div>
      `).join("")}
    </div>
  ` : ""}
  <div class="footer">
    Generated securely by ZOYA AI VOICE ASSISTANT • Created by ROYAL ANKIT AHIRAN
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

function exportReportToTXT(title: string, content: string, sources?: any[]) {
  let text = `==================================================\nZOYA AI VOICE ASSISTANT - RESEARCH REPORT\nDeveloper: ROYAL ANKIT AHIRAN\nDate: ${new Date().toLocaleString()}\nTitle: ${title}\n==================================================\n\n${content}\n\n`;
  if (sources && sources.length > 0) {
    text += `\n=== VERIFIED SOURCES (${sources.length}) ===\n`;
    sources.forEach((s, idx) => {
      text += `[${idx + 1}] ${s.title || s.sourceName || s.source || s.url}\n    URL: ${s.url}\n    Category: ${s.qualityCategory || "Verified Source"}\n\n`;
    });
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zoya-research-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReportToMD(title: string, content: string, sources?: any[]) {
  let text = `# ${title}\n\n*ZOYA AI Research Report • Developer: Royal Ankit Ahiran • ${new Date().toLocaleDateString()}*\n\n---\n\n${content}\n\n`;
  if (sources && sources.length > 0) {
    text += `### Verified Sources (${sources.length})\n\n`;
    sources.forEach((s, idx) => {
      text += `${idx + 1}. [${s.title || s.sourceName || s.source || s.url}](${s.url}) - \`${s.qualityCategory || "Verified Source"}\`\n`;
    });
  }
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zoya-research-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderFactBadgesAndText(text: string) {
  if (!text) return text;
  
  // Highlight fact tags like [सत्यापित / Verified], [पुष्टीकृत / Corroborated], [विवादित / Disputed], [अपुष्ट / Unverified], [असमर्थित / Unsupported]
  const tagRegex = /(\[(?:सत्यापित\s*\/|\s*)Verified\]|\[(?:पुष्टीकृत\s*\/|\s*)Corroborated\]|\[(?:विवादित\s*\/|\s*)Disputed\]|\[(?:अपुष्ट\s*\/|\s*)Unverified\]|\[(?:असमर्थित\s*\/|\s*)Unsupported\])/gi;
  const parts = text.split(tagRegex);

  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (lower.includes("verified") || lower.includes("सत्यापित")) {
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
          <CheckCircle2 size={10} className="text-emerald-400" />
          <span>{part.replace(/[\[\]]/g, "")}</span>
        </span>
      );
    }
    if (lower.includes("corroborated") || lower.includes("पुष्टीकृत")) {
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm">
          <CheckCircle2 size={10} className="text-cyan-400" />
          <span>{part.replace(/[\[\]]/g, "")}</span>
        </span>
      );
    }
    if (lower.includes("disputed") || lower.includes("विवादित")) {
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
          <AlertCircle size={10} className="text-amber-400" />
          <span>{part.replace(/[\[\]]/g, "")}</span>
        </span>
      );
    }
    if (lower.includes("unverified") || lower.includes("अपुष्ट") || lower.includes("unsupported") || lower.includes("असमर्थित")) {
      return (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm">
          <AlertCircle size={10} className="text-rose-400" />
          <span>{part.replace(/[\[\]]/g, "")}</span>
        </span>
      );
    }
    return part;
  });
}

function renderMessageTextWithHighlight(
  msgId: string,
  text: string,
  highlight: { msgId: string; start: number; end: number } | null
) {
  if (
    !highlight ||
    highlight.msgId !== msgId ||
    highlight.start < 0 ||
    highlight.end <= highlight.start ||
    highlight.end > text.length
  ) {
    return renderFactBadgesAndText(text);
  }

  const before = text.slice(0, highlight.start);
  const activeWord = text.slice(highlight.start, highlight.end);
  const after = text.slice(highlight.end);

  return (
    <>
      {renderFactBadgesAndText(before)}
      <span className="bg-violet-500/40 text-white font-bold px-1 py-0.5 rounded shadow-sm border border-violet-400/50 transition-all duration-75 underline decoration-violet-300 decoration-2 underline-offset-2">
        {activeWord}
      </span>
      {renderFactBadgesAndText(after)}
    </>
  );
}

function formatMessageTimestamp(msg: ChatMessage): { shortTime: string; fullDate: string } {
  let dateObj: Date | null = null;
  if (msg.createdAt && !isNaN(msg.createdAt)) {
    dateObj = new Date(msg.createdAt);
  } else if (msg.timestamp) {
    const parsed = Date.parse(msg.timestamp);
    if (!isNaN(parsed)) {
      dateObj = new Date(parsed);
    }
  }
  if (!dateObj || isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  const shortTime = msg.timestamp || dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fullDate = `${dateObj.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, ${dateObj.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;

  return { shortTime, fullDate };
}

export default function ChatModal({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onRegenerateResponse,
  isProcessing = false,
  user,
  onClearChatHistory,
  topics = [],
  onOpenVoiceCall,
  onSwitchToVoice,
  onLogout,
  onOpenDeviceModal,
  isSpeakerMuted = false,
  onToggleSpeaker,
  onOpenAdminPanel,
}: ChatModalProps) {
  const [inputText, setTextInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const [regeneratingMsgId, setRegeneratingMsgId] = useState<string | null>(null);

  const [isAutoSpeakEnabled, setIsAutoSpeakEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("zoya_chat_auto_speak");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  // Navigation Views: "chat" | "profile" | "settings" | "history" | "about"
  const [activeView, setActiveView] = useState<"chat" | "profile" | "settings" | "history" | "about">("chat");
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);

  // Persistent Text / Voice Toggle Mode
  const [activeMode, setActiveMode] = useState<"text" | "voice">("text");

  // Highlight & playback
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [speakingHighlight, setSpeakingHighlight] = useState<{ msgId: string; start: number; end: number } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [sharedMsgId, setSharedMsgId] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedTimestamps, setExpandedTimestamps] = useState<Record<string, boolean>>({});
  const [buttonHighlight, setButtonHighlight] = useState<Record<string, boolean>>({});
  const [showExportMenu, setShowExportMenu] = useState<Record<string, boolean>>({});
  const [savedReportMsgIds, setSavedReportMsgIds] = useState<Record<string, boolean>>({});
  const [savedResearchVault, setSavedResearchVault] = useState<SavedResearchItem[]>([]);

  const triggerButtonHighlight = (key: string) => {
    setButtonHighlight((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setButtonHighlight((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 1500);
  };

  const toggleSources = (msgId: string) => {
    triggerButtonHighlight(`${msgId}_sources`);
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleExportMenu = (msgId: string) => {
    triggerButtonHighlight(`${msgId}_export`);
    setShowExportMenu((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleSaveToVault = async (msg: ChatMessage) => {
    if (!user) {
      triggerButtonHighlight(`${msg.id}_vault`);
      alert("Please sign in with Google or Mobile/Email to save research reports to your account!");
      return;
    }
    triggerButtonHighlight(`${msg.id}_vault`);
    const title = msg.text.split("\n")[0].replace(/[#*`]/g, "").slice(0, 60) || "Research Report";
    const res = await saveResearchReportToFirestore(user.uid, {
      query: title,
      summary: msg.text,
      sources: msg.sources || [],
    });
    if (res) {
      setSavedReportMsgIds((prev) => ({ ...prev, [msg.id]: true }));
    }
  };

  // History search, clear confirmation & opened topic view
  const [historySearch, setHistorySearch] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [openedHistoryTopic, setOpenedHistoryTopic] = useState<VoiceTopicSession | null>(null);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(user?.displayName || "");
  const [editBio, setEditBio] = useState(user?.bio || "Zoya AI Companion Explorer");
  const [avatarPreset, setAvatarPreset] = useState(user?.photoURL || "");

  // Settings State
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "cyberpunk" | "amoled">("dark");
  const [uiGlowEnabled, setUiGlowEnabled] = useState(true);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [voiceVolume, setVoiceVolume] = useState<number>(100);
  const [sendOnEnter, setSendOnEnter] = useState(true);

  // Bug report in Settings & Profile (User enters their own identity)
  const [isReportingBug, setIsReportingBug] = useState(false);
  const [bugUserName, setBugUserName] = useState("");
  const [bugUserPhone, setBugUserPhone] = useState("");
  const [bugUserEmail, setBugUserEmail] = useState("");
  const [bugCategory, setBugCategory] = useState("Bug / Error");
  const [bugMessage, setBugMessage] = useState("");
  const [bugSending, setBugSending] = useState(false);
  const [bugSuccess, setBugSuccess] = useState(false);

  // Add to Chat Bottom Sheet & Attachments (Camera, Photos, Files)
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [activeToolMode, setActiveToolMode] = useState<
    "none" | "web_search" | "deep_research" | "image_search" | "generate_image" | "inspect_link"
  >("none");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachedPhoto, setAttachedPhoto] = useState<{
    file: File;
    dataUrl: string;
    source: "camera" | "photos";
  } | null>(null);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [liveCameraStream, setLiveCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"environment" | "user">("environment");
  const [liveCameraError, setLiveCameraError] = useState<string | null>(null);
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [toolStatusMessage, setToolStatusMessage] = useState<string | null>(null);
  const [localToolMessages, setLocalToolMessages] = useState<ChatMessage[]>([]);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAcceptType, setFileAcceptType] = useState<string>("*/*");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const sttSilenceTimerRef = useRef<any>(null);
  const sttTranscriptRef = useRef<string>("");
  const isManuallyStoppingSttRef = useRef<boolean>(false);
  const shouldAutoSubmitSttRef = useRef<boolean>(false);

  // Auto-Play Tracker & Session Ref
  const autoPlayedMsgIdsRef = useRef<Set<string>>(new Set());
  const playbackSessionRef = useRef<number>(0);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeAudioCtxRef = useRef<AudioContext | null>(null);
  const activeAnimFrameRef = useRef<number | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  // Fast Streaming Speech & Queue Refs
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamCharsProcessedRef = useRef<number>(0);
  const streamSessionIdRef = useRef<number>(0);
  const isStreamingTtsActiveRef = useRef<boolean>(false);

  // Parallel prefetch & sequential gapless playback queue
  const ttsQueueRef = useRef<{
    chunkId: number;
    text: string;
    startOffset: number;
    endOffset: number;
    fetchPromise: Promise<string | null>;
    sessionId: number;
    msgId: string;
  }[]>([]);
  const isDrainingQueueRef = useRef<boolean>(false);
  const isSynthesizingRef = useRef<boolean>(false);
  const fallbackSpeakingRef = useRef<boolean>(false);
  const chunkSeqRef = useRef<number>(0);

  // Stop current speech cleanly with instant interruption
  const stopCurrentSpeech = () => {
    playbackSessionRef.current++;
    ttsQueueRef.current = [];
    isDrainingQueueRef.current = false;
    isSynthesizingRef.current = false;
    fallbackSpeakingRef.current = false;
    stopAllSpeech();
    sharedGaplessPlayer.stop();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (activeAnimFrameRef.current) {
      cancelAnimationFrame(activeAnimFrameRef.current);
      activeAnimFrameRef.current = null;
    }
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
      } catch {}
      activeAudioSourceRef.current = null;
    }
    if (activeAudioCtxRef.current) {
      try {
        activeAudioCtxRef.current.close();
      } catch {}
      activeAudioCtxRef.current = null;
    }
    streamingMsgIdRef.current = null;
    streamCharsProcessedRef.current = 0;
    isStreamingTtsActiveRef.current = false;
    setPlayingMessageId(null);
    setSpeakingHighlight(null);
  };

  // Populate historical IDs on initial load and whenever popup opens so old messages are NEVER auto-spoken
  useEffect(() => {
    messages.forEach((m) => autoPlayedMsgIdsRef.current.add(m.id));
    return () => {
      stopCurrentSpeech();
      stopSTT();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Warm up 24kHz AudioContext on modal open for instant subsequent speech
      sharedGaplessPlayer.warmup();
      // Mark all current messages as read so opening modal never triggers unexpected TTS or audio decoding errors
      messages.forEach((m) => autoPlayedMsgIdsRef.current.add(m.id));
      setActiveMode("text"); // ALWAYS open in Text mode!
      stopCurrentSpeech();
      stopSTT();
    } else {
      stopCurrentSpeech();
      stopSTT();
      setShowThreeDotMenu(false);
      setActiveView("chat");
    }
  }, [isOpen]);

  // Sync profile editing fields when user updates
  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName || "");
      setEditBio(user.bio || "Zoya AI Companion Explorer");
      setAvatarPreset(user.photoURL || "");
    }
  }, [user]);

  // Click outside to close three-dot menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false);
      }
    };
    if (showThreeDotMenu) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showThreeDotMenu]);

  // Click outside to close tools plus menu
  useEffect(() => {
    const handleOutsideToolsClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    if (showToolsMenu) {
      document.addEventListener("mousedown", handleOutsideToolsClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideToolsClick);
    };
  }, [showToolsMenu]);

  // Combined messages memo
  const displayMessages = useMemo(() => {
    const combined = [...messages, ...localToolMessages];
    const map = new Map<string, ChatMessage>();
    for (const m of combined) {
      map.set(m.id, m);
    }
    return Array.from(map.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [messages, localToolMessages]);

  useEffect(() => {
    if (isOpen && activeView === "chat") {
      try {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch {}
    }
  }, [displayMessages, isProcessing, isToolExecuting, activeView, isOpen]);

  // =========================================================================
  // TOPIC 1 & 4: MESSAGE INPUT MICROPHONE (STT) VIA LIVE API WITH 800ms SILENCE AUTO-SEND
  // =========================================================================
  const clearSttSilenceTimer = () => {
    if (sttSilenceTimerRef.current) {
      clearTimeout(sttSilenceTimerRef.current);
      sttSilenceTimerRef.current = null;
    }
  };

  // Browser Web Speech STT fallback (Secondary backup if Live API is unavailable)
  const fallbackBrowserSTT = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSttError("Speech recognition is not supported in this browser. Please use Chrome/Edge or type directly.");
      setTimeout(() => setSttError(null), 4000);
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "hi-IN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setSttError(null);
      };

      recognition.onresult = (event: any) => {
        clearSttSilenceTimer();
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = 0; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + " ";
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const combinedText = (finalTranscript + interimTranscript).trim();
        if (combinedText) {
          sttTranscriptRef.current = combinedText;
          setTextInput(combinedText);

          // Adaptive silence detection: 300ms if complete (. ? ! ।), else 600ms
          clearSttSilenceTimer();
          const isComplete = /[.?!।]\s*$/.test(combinedText);
          const silenceMs = isComplete ? SILENCE_MS_COMPLETE : SILENCE_MS_INCOMPLETE;

          sttSilenceTimerRef.current = setTimeout(() => {
            shouldAutoSubmitSttRef.current = true;
            stopSTT();
          }, silenceMs);
        }
      };

      recognition.onerror = (err: any) => {
        console.warn("[Chat STT Fallback] Error:", err);
        clearSttSilenceTimer();
        setIsListening(false);
        if (err.error === "not-allowed" || err.error === "service-not-allowed") {
          setSttError("माइक्रोफोन की अनुमति नहीं मिली (Microphone Permission Denied)। कृपया ब्राउज़र की सेटिंग से माइक ऑन करें।");
        } else if (err.error === "no-speech") {
          setSttError("कोई आवाज़ नहीं सुनाई दी। कृपया माइक बटन दबाकर फिर से बोलें।");
        } else if (err.error === "network") {
          setSttError("नेटवर्क कनेक्शन त्रुटि (Network Error)। कृपया इंटरनेट कनेक्शन जांचें।");
        } else {
          setSttError(`वॉइस इनपुट त्रुटि (${err.error || "Voice Input Error"})। कृपया पुनः प्रयास करें।`);
        }
        setTimeout(() => setSttError(null), 4000);
      };

      recognition.onend = () => {
        clearSttSilenceTimer();
        setIsListening(false);
        if (shouldAutoSubmitSttRef.current && sttTranscriptRef.current.trim()) {
          const spokenText = sttTranscriptRef.current.trim();
          shouldAutoSubmitSttRef.current = false;
          sttTranscriptRef.current = "";
          setTextInput("");
          onSendMessage(spokenText);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("[Chat STT Fallback] Start error:", err);
      setIsListening(false);
    }
  };

  const startSTT = async () => {
    // 1. Interrupt active voice immediately when user taps mic or starts speaking
    stopCurrentSpeech();
    clearSttSilenceTimer();
    sharedGaplessPlayer.warmup();
    isManuallyStoppingSttRef.current = false;
    shouldAutoSubmitSttRef.current = false;
    sttTranscriptRef.current = "";

    // Stop existing instances
    if (liveSessionRef.current) {
      try { liveSessionRef.current.stop(); } catch {}
      liveSessionRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    // 2. Primary Engine: Live API STT (mic audio 16kHz streamed every ~0.25s)
    try {
      const liveSession = new LiveSessionManager();
      liveSession.isSTTOnly = true;
      liveSessionRef.current = liveSession;

      liveSession.onStateChange = (state) => {
        if (state === "listening" || state === "processing") {
          setIsListening(true);
          setSttError(null);
        }
      };

      liveSession.onLiveCaption = (sender, text) => {
        if (sender === "user" && text && text.trim()) {
          stopCurrentSpeech();
          const cleanUserText = text.trim();
          sttTranscriptRef.current = cleanUserText;
          setTextInput(cleanUserText);

          // Adaptive silence detection: 300ms if completed sentence (. ? ! ।), else 600ms
          clearSttSilenceTimer();
          const isComplete = /[.?!।]\s*$/.test(cleanUserText);
          const silenceMs = isComplete ? SILENCE_MS_COMPLETE : SILENCE_MS_INCOMPLETE;

          sttSilenceTimerRef.current = setTimeout(() => {
            console.log(`[Chat STT Live API] Adaptive ${silenceMs}ms silence detected. Auto-submitting:`, cleanUserText);
            shouldAutoSubmitSttRef.current = true;
            stopSTT();
          }, silenceMs);
        }
      };

      liveSession.onMessage = (sender, text) => {
        if (sender === "user" && text && text.trim()) {
          const cleanUserText = text.trim();
          sttTranscriptRef.current = cleanUserText;
          setTextInput(cleanUserText);
          clearSttSilenceTimer();
          const isComplete = /[.?!।]\s*$/.test(cleanUserText);
          const silenceMs = isComplete ? SILENCE_MS_COMPLETE : SILENCE_MS_INCOMPLETE;
          sttSilenceTimerRef.current = setTimeout(() => {
            shouldAutoSubmitSttRef.current = true;
            stopSTT();
          }, silenceMs);
        }
      };

      // Live API turnComplete signal -> instant zero-delay submit without waiting for silence timer!
      liveSession.onTurnComplete = () => {
        clearSttSilenceTimer();
        if (sttTranscriptRef.current && sttTranscriptRef.current.trim()) {
          console.log("[Chat STT Live API] turnComplete received. Immediate zero-delay submit:", sttTranscriptRef.current.trim());
          const spokenText = sttTranscriptRef.current.trim();
          sttTranscriptRef.current = "";
          setTextInput("");
          stopSTT();
          onSendMessage(spokenText);
        }
      };

      liveSession.onError = (err) => {
        console.warn("[Chat STT] Live API notice, falling back to Web Speech:", err);
        const errMsg = String(err?.message || err).toLowerCase();
        if (errMsg.includes("permission") || errMsg.includes("notallowed") || errMsg.includes("denied")) {
          setIsListening(false);
          setSttError("माइक्रोफोन की अनुमति नहीं मिली (Microphone Permission Denied)। कृपया ब्राउज़र की सेटिंग से माइक ऑन करें।");
          setTimeout(() => setSttError(null), 4000);
        } else {
          setSttError("लाइव वॉइस सेवा में रुकावट। ब्राउज़र माइक पर स्विच किया जा रहा है...");
          setTimeout(() => setSttError(null), 2500);
          fallbackBrowserSTT();
        }
      };

      setIsListening(true);
      await liveSession.start();
    } catch (err: any) {
      console.warn("[Chat STT] Live API start error, initiating fallback:", err);
      fallbackBrowserSTT();
    }
  };

  const stopSTT = () => {
    isManuallyStoppingSttRef.current = true;
    clearSttSilenceTimer();

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.stop();
      } catch {}
      liveSessionRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    setIsListening(false);

    if (shouldAutoSubmitSttRef.current && sttTranscriptRef.current.trim()) {
      const spokenText = sttTranscriptRef.current.trim();
      shouldAutoSubmitSttRef.current = false;
      sttTranscriptRef.current = "";
      setTextInput("");
      onSendMessage(spokenText);
    }
  };

  // =========================================================================
  // TOPIC 2, 3, & 4: ULTRA-FAST GAPLESS 24kHz TTS & STREAMING EARLY PLAYBACK
  // =========================================================================
  const isAudioStartingRef = useRef(false);

  const checkAndResetPlayingState = (sessionId?: number, targetMsgId?: string) => {
    if (sessionId !== undefined && playbackSessionRef.current !== sessionId) return;

    const activeMsgId = targetMsgId || playingMessageId;
    const hasQueuedItems = ttsQueueRef.current.length > 0;
    const hasActiveSources = sharedGaplessPlayer.activeSourcesCount > 0;
    const isDraining = isDrainingQueueRef.current;
    const isSynthesizing = isSynthesizingRef.current;
    const isFallbackSpeaking = fallbackSpeakingRef.current || (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking);
    const isStreamingActive = isStreamingTtsActiveRef.current && (streamingMsgIdRef.current === activeMsgId) && isProcessing;

    const isStillPlayingOrQueued = 
      hasQueuedItems || 
      hasActiveSources || 
      isDraining || 
      isSynthesizing || 
      isFallbackSpeaking || 
      isStreamingActive;

    if (!isStillPlayingOrQueued) {
      setSpeakingHighlight(null);
      setPlayingMessageId(null);
      isStreamingTtsActiveRef.current = false;
      fallbackSpeakingRef.current = false;
    }
  };

  // Web Speech synthesis fallback if Gemini TTS fails or times out
  const fallbackSpeechSynthesis = (cleanText: string, msgId: string, sessionId: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      checkAndResetPlayingState(sessionId, msgId);
      isAudioStartingRef.current = false;
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "hi-IN";
      utterance.rate = voiceSpeed;
      utterance.pitch = 1.05;

      const voice = getPreferredIndianVoice(cleanText);
      if (voice) utterance.voice = voice;

      fallbackSpeakingRef.current = true;
      setPlayingMessageId(msgId);

      utterance.onboundary = (e: SpeechSynthesisEvent) => {
        if (playbackSessionRef.current !== sessionId) return;
        if (e.name === "word") {
          const absStart = e.charIndex;
          const absEnd = absStart + (e.charLength || 5);
          setSpeakingHighlight({ msgId, start: absStart, end: absEnd });
        }
      };

      utterance.onend = () => {
        fallbackSpeakingRef.current = false;
        if (playbackSessionRef.current === sessionId) {
          checkAndResetPlayingState(sessionId, msgId);
        }
        isAudioStartingRef.current = false;
      };

      utterance.onerror = () => {
        fallbackSpeakingRef.current = false;
        if (playbackSessionRef.current === sessionId) {
          checkAndResetPlayingState(sessionId, msgId);
        }
        isAudioStartingRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch (synthErr) {
      console.warn("SpeechSynthesis error:", synthErr);
      fallbackSpeakingRef.current = false;
      checkAndResetPlayingState(sessionId, msgId);
      isAudioStartingRef.current = false;
    }
  };

  // Sequential Promise Queue Drainer for Gapless Audio Playback
  const drainTtsQueue = async () => {
    if (isDrainingQueueRef.current) return;
    isDrainingQueueRef.current = true;

    while (ttsQueueRef.current.length > 0) {
      const item = ttsQueueRef.current[0];
      if (playbackSessionRef.current !== item.sessionId) {
        ttsQueueRef.current = [];
        break;
      }

      try {
        isSynthesizingRef.current = true;
        // While chunk i is awaiting or playing, chunk i+1 is ALREADY fetching in parallel
        const b64 = await item.fetchPromise;
        isSynthesizingRef.current = false;

        if (playbackSessionRef.current !== item.sessionId) {
          ttsQueueRef.current = [];
          break;
        }

        if (b64) {
          isAudioStartingRef.current = false;
          const node = await sharedGaplessPlayer.scheduleChunk(b64, {
            playbackRate: voiceSpeed,
            volume: voiceVolume / 100,
            onStart: () => {
              if (playbackSessionRef.current === item.sessionId) {
                setSpeakingHighlight({
                  msgId: item.msgId,
                  start: item.startOffset,
                  end: item.endOffset,
                });
              }
            },
            onEnded: () => {
              checkAndResetPlayingState(item.sessionId, item.msgId);
            },
          });

          if (!node) {
            fallbackSpeechSynthesis(item.text, item.msgId, item.sessionId);
          }
        } else {
          // Fallback to browser SpeechSynthesis if Gemini TTS fails
          fallbackSpeechSynthesis(item.text, item.msgId, item.sessionId);
        }
      } catch (err) {
        console.warn("[Chat TTS Queue] Error, falling back:", err);
        isSynthesizingRef.current = false;
        fallbackSpeechSynthesis(item.text, item.msgId, item.sessionId);
      }

      ttsQueueRef.current.shift();
    }

    isDrainingQueueRef.current = false;
    checkAndResetPlayingState();
  };

  const enqueueTtsChunk = (
    chunkText: string,
    startOffset: number,
    endOffset: number,
    sessionId: number,
    msgId: string
  ) => {
    let fetchPromise: Promise<string | null>;
    const cached = audioCacheRef.current.get(chunkText);
    if (cached) {
      fetchPromise = Promise.resolve(cached);
    } else {
      fetchPromise = getRoyalAudio(chunkText).then(async (res) => {
        if (!res) {
          // Automatic single retry to preserve HD Kore female voice
          res = await getRoyalAudio(chunkText);
        }
        if (!res) return null;
        const b64 = typeof res === "string" ? res : res.data;
        if (b64) {
          audioCacheRef.current.set(chunkText, b64);
        }
        return b64 || null;
      });
    }

    ttsQueueRef.current.push({
      chunkId: ++chunkSeqRef.current,
      text: chunkText,
      startOffset,
      endOffset,
      fetchPromise,
      sessionId,
      msgId,
    });

    drainTtsQueue();
  };

  // Full message playback (used for Manual Speaker icon replay)
  const startSpeakingMessage = async (msgId: string, fullText: string) => {
    if (playingMessageId === msgId) {
      stopCurrentSpeech();
      return;
    }

    stopCurrentSpeech();
    unlockAudioContext().catch(() => {});

    const cleanText = cleanTextForSpeech(fullText);
    if (!cleanText) return;

    const sessionId = ++playbackSessionRef.current;
    ttsQueueRef.current = [];
    isDrainingQueueRef.current = false;
    setPlayingMessageId(msgId);
    isAudioStartingRef.current = true;
    sharedGaplessPlayer.warmup();

    // Split into chunks: first chunk 12-25 chars for instant start, subsequent 30-60 chars
    const chunks = extractSpeechSentences(cleanText);
    if (chunks.length === 0) {
      setPlayingMessageId(null);
      isAudioStartingRef.current = false;
      return;
    }

    let searchPos = 0;
    for (const c of chunks) {
      const idx = cleanText.indexOf(c, searchPos);
      const start = idx !== -1 ? idx : searchPos;
      const end = start + c.length;
      searchPos = end;

      enqueueTtsChunk(c, start, end, sessionId, msgId);
    }
  };

  // Streaming Early-Playback: synthesizes and speaks chunks as text streams in!
  // Does NOT wait for isProcessing to complete; starts within 12-25 chars!
  const processStreamingTTS = async (msgId: string, currentText: string, isStreamDone: boolean) => {
    if (!isOpen || isSpeakerMuted || !isAutoSpeakEnabled || isListening) return;

    const clean = cleanTextForSpeech(currentText);
    if (!clean) return;

    // Detect new message turn OR text replacement (e.g., from tool status text to final answer)
    if (streamingMsgIdRef.current !== msgId) {
      streamingMsgIdRef.current = msgId;
      streamCharsProcessedRef.current = 0;
      streamSessionIdRef.current = ++playbackSessionRef.current;
      ttsQueueRef.current = [];
      isDrainingQueueRef.current = false;
      setPlayingMessageId(msgId);
      isStreamingTtsActiveRef.current = true;
      unlockAudioContext().catch(() => {});
      sharedGaplessPlayer.warmup();
      autoPlayedMsgIdsRef.current.add(msgId);
    } else if (streamCharsProcessedRef.current > 0) {
      const processedPrefix = clean.slice(0, Math.min(streamCharsProcessedRef.current, clean.length));
      if (processedPrefix.length > 0 && !clean.startsWith(processedPrefix.slice(0, Math.min(processedPrefix.length, 12)))) {
        // Text replacement detected! Reset audio queue and restart TTS cleanly from start!
        stopCurrentSpeech();
        streamingMsgIdRef.current = msgId;
        streamCharsProcessedRef.current = 0;
        streamSessionIdRef.current = ++playbackSessionRef.current;
        setPlayingMessageId(msgId);
        isStreamingTtsActiveRef.current = true;
      }
    }

    const currentSessionId = streamSessionIdRef.current;
    if (playbackSessionRef.current !== currentSessionId) return;

    // Extract all ready chunks iteratively
    while (true) {
      const remaining = clean.slice(streamCharsProcessedRef.current);
      if (!remaining.trim()) break;

      const isFirstChunk = streamCharsProcessedRef.current === 0;
      const minChars = isFirstChunk ? FIRST_CHUNK_MIN_CHARS : NEXT_CHUNK_MIN_CHARS;
      const maxChars = isFirstChunk ? FIRST_CHUNK_MAX_CHARS : NEXT_CHUNK_MAX_CHARS;

      let chunkText = "";

      if (isStreamDone) {
        // Stream completed: immediately speak all remaining text!
        chunkText = remaining.trim();
      } else if (remaining.length >= minChars) {
        if (isFirstChunk) {
          // FIRST CHUNK: Between FIRST_CHUNK_MIN_CHARS (12) and FIRST_CHUNK_MAX_CHARS (25)
          // Must cut strictly on a word boundary (space or comma/punctuation), NEVER in the middle of a word
          const windowSub = remaining.slice(0, maxChars);
          let cutIdx = -1;

          for (let i = minChars - 1; i < windowSub.length; i++) {
            if (/[,.?!।,;\n]/.test(windowSub[i])) {
              cutIdx = i + 1;
              break;
            }
          }

          if (cutIdx === -1) {
            const lastSpace = windowSub.lastIndexOf(" ");
            if (lastSpace >= minChars) {
              cutIdx = lastSpace;
            } else if (remaining.length >= maxChars) {
              const nextSpace = remaining.indexOf(" ", maxChars);
              if (nextSpace !== -1 && nextSpace <= maxChars + 8) {
                cutIdx = nextSpace;
              } else if (lastSpace > 0) {
                cutIdx = lastSpace;
              }
            }
          }

          if (cutIdx !== -1) {
            chunkText = remaining.slice(0, cutIdx).trim();
          }
        } else {
          // NEXT CHUNKS: Between NEXT_CHUNK_MIN_CHARS (30) and NEXT_CHUNK_MAX_CHARS (60)
          // On sentence or clause boundary
          const windowSub = remaining.slice(0, maxChars);
          let cutIdx = -1;

          for (let i = minChars - 1; i < windowSub.length; i++) {
            if (/[.?!।,;\n]/.test(windowSub[i])) {
              cutIdx = i + 1;
              break;
            }
          }

          if (cutIdx === -1 && remaining.length >= maxChars) {
            const lastSpace = windowSub.lastIndexOf(" ");
            if (lastSpace >= minChars) {
              cutIdx = lastSpace;
            } else {
              const nextSpace = remaining.indexOf(" ", maxChars);
              if (nextSpace !== -1 && nextSpace <= maxChars + 10) {
                cutIdx = nextSpace;
              }
            }
          }

          if (cutIdx !== -1) {
            chunkText = remaining.slice(0, cutIdx).trim();
          }
        }
      }

      if (!chunkText) {
        // Not enough characters for clean word boundary yet, wait for next token
        break;
      }

      const chunkStartOffset = streamCharsProcessedRef.current;
      const foundIdx = remaining.indexOf(chunkText);
      streamCharsProcessedRef.current += (foundIdx >= 0 ? foundIdx : 0) + chunkText.length;

      enqueueTtsChunk(
        chunkText,
        chunkStartOffset,
        chunkStartOffset + chunkText.length,
        currentSessionId,
        msgId
      );
    }
  };

  // Streaming Auto-Speak Effect: triggers immediately as early chunks arrive!
  useEffect(() => {
    if (!isOpen || isSpeakerMuted || !isAutoSpeakEnabled || isListening || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender !== "Royal") return;
    if (!lastMsg.text || !lastMsg.text.trim()) return;

    // If already fully auto-played and not active stream, do not replay
    if (autoPlayedMsgIdsRef.current.has(lastMsg.id) && streamingMsgIdRef.current !== lastMsg.id) {
      return;
    }

    processStreamingTTS(lastMsg.id, lastMsg.text, !isProcessing);
  }, [messages, isProcessing, isOpen, isSpeakerMuted, isAutoSpeakEnabled, isListening]);

  // Manual Replay on Speaker button click
  const handleToggleSpeak = (msgId: string, fullText: string) => {
    triggerButtonHighlight(`${msgId}_speak`);
    if (playingMessageId === msgId) {
      stopCurrentSpeech();
      return;
    }
    startSpeakingMessage(msgId, fullText);
  };

  // Regenerate Response handler: finds preceding user prompt and triggers regeneration
  const handleRegenerate = async (targetMsg: ChatMessage) => {
    triggerButtonHighlight(`${targetMsg.id}_refresh`);
    if (isProcessing || regeneratingMsgId) return;

    const msgIndex = messages.findIndex((m) => m.id === targetMsg.id);
    let userPrompt = "";

    if (msgIndex > 0) {
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].sender === "user") {
          userPrompt = messages[i].text;
          break;
        }
      }
    }

    if (!userPrompt.trim()) return;

    stopCurrentSpeech();
    setRegeneratingMsgId(targetMsg.id);
    // Remove the message ID from autoPlayedMsgIdsRef so the newly regenerated response can auto-play cleanly
    autoPlayedMsgIdsRef.current.delete(targetMsg.id);

    try {
      if (onRegenerateResponse) {
        await onRegenerateResponse(userPrompt, targetMsg.id);
      } else {
        await onSendMessage(userPrompt);
      }
    } catch (err) {
      console.warn("Regenerate response error:", err);
    } finally {
      setRegeneratingMsgId(null);
    }
  };

  // Copy complete message
  const handleCopyMessage = (id: string, text: string) => {
    triggerButtonHighlight(`${id}_copy`);
    try {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 2000);
    }
  };

  // Share message using native device sharing
  const handleShareMessage = async (id: string, text: string) => {
    triggerButtonHighlight(`${id}_share`);
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Zoya AI Voice Assistant",
          text: text,
        });
        setSharedMsgId(id);
        setTimeout(() => setSharedMsgId(null), 2000);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          try {
            await navigator.clipboard.writeText(text);
            setSharedMsgId(id);
            setTimeout(() => setSharedMsgId(null), 2000);
          } catch {}
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setSharedMsgId(id);
        setTimeout(() => setSharedMsgId(null), 2000);
      } catch {}
    }
  };

  // Helper to add local tool message & persist to Firestore
  const addToolMessage = (msg: ChatMessage) => {
    setLocalToolMessages((prev) => [...prev, msg]);
    if (user?.uid) {
      saveMessageToFirestore(user.uid, msg).catch((err) =>
        console.warn("Error saving tool message to Firestore:", err)
      );
    }
  };

  // Live camera stream effect
  useEffect(() => {
    if (videoRef.current && liveCameraStream) {
      videoRef.current.srcObject = liveCameraStream;
    }
  }, [liveCameraStream]);

  // Cleanup camera stream
  useEffect(() => {
    return () => {
      if (liveCameraStream) {
        liveCameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [liveCameraStream]);

  const handleTriggerCamera = async () => {
    setShowAddSheet(false);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacingMode },
          audio: false,
        });
        setLiveCameraStream(stream);
        setIsLiveCameraOpen(true);
        setLiveCameraError(null);
        return;
      } catch (err: any) {
        console.warn("Live camera access failed, falling back to camera input:", err);
      }
    }
    cameraInputRef.current?.click();
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_snap_${Date.now()}.jpg`, { type: "image/jpeg" });
        setAttachedPhoto({ file, dataUrl, source: "camera" });
      }
    }, "image/jpeg", 0.85);

    closeLiveCamera();
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const closeLiveCamera = () => {
    if (liveCameraStream) {
      liveCameraStream.getTracks().forEach((t) => t.stop());
      setLiveCameraStream(null);
    }
    setIsLiveCameraOpen(false);
  };

  const toggleCameraFacing = async () => {
    if (liveCameraStream) {
      liveCameraStream.getTracks().forEach((t) => t.stop());
    }
    const nextFacing = cameraFacingMode === "environment" ? "user" : "environment";
    setCameraFacingMode(nextFacing);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      setLiveCameraStream(stream);
    } catch {
      setLiveCameraError("Unable to switch camera.");
    }
  };

  const handleTriggerPhotos = () => {
    setShowAddSheet(false);
    photosInputRef.current?.click();
  };

  const handleTriggerFiles = () => {
    setShowAddSheet(false);
    docsInputRef.current?.click();
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>, source: "camera" | "photos") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachedPhoto({ file, dataUrl, source });
      setTimeout(() => inputRef.current?.focus(), 150);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDocFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length === 1) {
      setAttachedFile(files[0]);
      setAttachedFiles([]);
    } else {
      setAttachedFile(null);
      setAttachedFiles(files);
    }
    setTimeout(() => inputRef.current?.focus(), 150);
    e.target.value = "";
  };

  const handleSelectTool = (
    mode: "web_search" | "image_search" | "generate_image" | "inspect_link" | "upload_pdf" | "upload_doc" | "upload_code"
  ) => {
    setShowAddSheet(false);
    setShowToolsMenu(false);
    if (mode === "upload_pdf") {
      setFileAcceptType(".pdf,application/pdf");
      setTimeout(() => docsInputRef.current?.click(), 50);
    } else if (mode === "upload_doc") {
      setFileAcceptType(".txt,.csv,.json,.md,.docx,.xlsx,text/*");
      setTimeout(() => docsInputRef.current?.click(), 50);
    } else if (mode === "upload_code") {
      setFileAcceptType(".py,.js,.ts,.html,.css,.json,.sh,.c,.cpp,.java,.sql,.txt");
      setTimeout(() => docsInputRef.current?.click(), 50);
    } else {
      setActiveToolMode(mode);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Submit message or execute active tool
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isProcessing || isToolExecuting) return;

    stopCurrentSpeech();
    stopSTT();
    unlockAudioContext().catch(() => {});

    const textToSend = inputText.trim();

    // 1. Process Attached Photo (Camera Snap or Gallery Image) via Gemini Vision
    if (attachedPhoto) {
      const currentPhoto = attachedPhoto;
      setAttachedPhoto(null);
      setTextInput("");
      setIsToolExecuting(true);
      setToolStatusMessage("Zoya Vision analyzing photo...");

      const base64Clean = currentPhoto.dataUrl.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "");

      const userMsg: ChatMessage = {
        id: "msg_user_" + Date.now(),
        sender: "user",
        text: textToSend || (currentPhoto.source === "camera" ? "[Camera Photo Captured]" : `[Photo: ${currentPhoto.file.name}]`),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        userId: user?.uid || "guest",
        createdAt: Date.now(),
        toolMetadata: {
          type: "vision" as any,
          imageDataUrl: currentPhoto.dataUrl,
          fileInfo: {
            name: currentPhoto.file.name,
            size: currentPhoto.file.size,
            type: currentPhoto.file.type || "image/jpeg",
          },
        },
      };
      addToolMessage(userMsg);

      try {
        const query = textToSend || "कृपया इस तस्वीर को ध्यान से देखकर बताएं कि इसमें क्या दिख रहा है और क्या खास है। Please explain what is visible in detail.";
        const analysis = await apiVision(base64Clean, query);

        const aiMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: analysis || "मालिक, तस्वीर देख ली! इसमें मुख्य जानकारी पहचान ली गई है।",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
          toolMetadata: {
            type: "vision" as any,
            imageDataUrl: currentPhoto.dataUrl,
          },
        };
        addToolMessage(aiMsg);

        if (isAutoSpeakEnabled && !isSpeakerMuted) {
          handleToggleSpeak(aiMsg.id, aiMsg.text);
        }
      } catch (err: any) {
        console.error("Vision error:", err);
        const errMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: `माफ़ करें, तस्वीर का विश्लेषण करने में समस्या आई: ${err?.message || "Vision service unavailable"}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(errMsg);
      } finally {
        setIsToolExecuting(false);
        setToolStatusMessage(null);
      }
      return;
    }

    // 2. Process Multi-File Attachments (if multiple files attached)
    if (attachedFiles.length > 1) {
      const currentFiles = [...attachedFiles];
      setAttachedFiles([]);
      setTextInput("");
      setActiveToolMode("none");
      setIsToolExecuting(true);
      setToolStatusMessage(`Analyzing ${currentFiles.length} files together...`);

      const fileListText = currentFiles.map((f) => f.name).join(", ");
      const userMsg: ChatMessage = {
        id: "msg_user_" + Date.now(),
        sender: "user",
        text: textToSend ? `[Attached ${currentFiles.length} files: ${fileListText}] ${textToSend}` : `[Attached ${currentFiles.length} files: ${fileListText}]`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        userId: user?.uid || "guest",
        createdAt: Date.now(),
        toolMetadata: {
          type: "code" as any,
          fileInfo: {
            name: `${currentFiles.length} Files Project (${currentFiles[0].name} + ${currentFiles.length - 1} more)`,
            size: currentFiles.reduce((acc, f) => acc + f.size, 0),
            type: "Multi-file Project",
          },
        },
      };
      addToolMessage(userMsg);

      try {
        const payloadFiles: Array<{ name: string; type: string; base64Data: string }> = [];
        for (const f of currentFiles) {
          const buf = await f.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          payloadFiles.push({
            name: f.name,
            type: f.type || "application/octet-stream",
            base64Data: btoa(binary),
          });
        }

        const analysisRes = await apiAnalyzeFiles(
          payloadFiles,
          textToSend || "Please analyze all these attached files together, explain architecture, find any bugs or security issues, and answer questions."
        );

        const aiMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: analysisRes.analysis || "सभी फाइलों का संयुक्त विश्लेषण पूरा हो गया है बाबू!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
          toolMetadata: {
            type: "code" as any,
            fileInfo: {
              name: `${currentFiles.length} Files Analyzed`,
              size: currentFiles.reduce((acc, f) => acc + f.size, 0),
              type: "Multi-file Synthesis",
            },
          },
        };
        addToolMessage(aiMsg);

        if (isAutoSpeakEnabled && !isSpeakerMuted) {
          handleToggleSpeak(aiMsg.id, aiMsg.text);
        }
      } catch (err: any) {
        console.error("Multi-file analysis error:", err);
        const errMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: `माफ़ करें बाबू, फाइलों का विश्लेषण करने में समस्या आई: ${err?.message || "File analysis failed"}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(errMsg);
      } finally {
        setIsToolExecuting(false);
        setToolStatusMessage(null);
      }
      return;
    }

    // 2.1 Process Single Attached Document / Code / ZIP / Media File
    if (attachedFile || attachedFiles.length === 1) {
      const currentFile = attachedFile || attachedFiles[0];
      setAttachedFile(null);
      setAttachedFiles([]);
      setTextInput("");
      setActiveToolMode("none");
      setIsToolExecuting(true);
      setToolStatusMessage(`Analyzing ${currentFile.name}...`);

      const isZipFile = /\.zip$/i.test(currentFile.name);
      const isMediaFile = /\.(mp4|webm|mov|mkv|avi|mp3|wav|m4a|ogg)$/i.test(currentFile.name) || currentFile.type.startsWith("video/") || currentFile.type.startsWith("audio/");
      const isCodeFile = /\.(py|js|ts|tsx|jsx|html|css|json|sh|c|cpp|h|java|sql|go|rs|cs|kt|php|yml|yaml|toml|xml)$/i.test(currentFile.name);
      const fileTypeLabel = isZipFile ? "zip" : isMediaFile ? "media" : isCodeFile ? "code" : "document";

      const userMsg: ChatMessage = {
        id: "msg_user_" + Date.now(),
        sender: "user",
        text: textToSend ? `[Attached: ${currentFile.name}] ${textToSend}` : `[Attached: ${currentFile.name}]`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        userId: user?.uid || "guest",
        createdAt: Date.now(),
        toolMetadata: {
          type: (fileTypeLabel === "zip" ? "code" : fileTypeLabel) as any,
          fileInfo: {
            name: currentFile.name,
            size: currentFile.size,
            type: currentFile.type || fileTypeLabel.toUpperCase(),
          },
        },
      };
      addToolMessage(userMsg);

      try {
        let resultText = "";
        if (isZipFile) {
          const res = await analyzeZipArchive(currentFile, textToSend || "Inspect this ZIP archive, explain project structure and source code.");
          resultText = res.summary;
        } else if (isMediaFile) {
          const res = await analyzeVideoOrAudioFile(currentFile, textToSend || "Summarize this media content and list key points.");
          resultText = res.summary;
        } else if (isCodeFile) {
          const res = await analyzeCodeFile(currentFile, textToSend || "Explain this code, spot bugs, and suggest improvements.");
          resultText = res.summary;
        } else {
          const res = await analyzeUploadedDocument(currentFile, textToSend || "Summarize this document and list key points.");
          resultText = res.summary;
        }

        const aiMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: resultText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
          toolMetadata: {
            type: (fileTypeLabel === "zip" ? "code" : fileTypeLabel) as any,
            fileInfo: {
              name: currentFile.name,
              size: currentFile.size,
              type: currentFile.type || fileTypeLabel.toUpperCase(),
            },
          },
        };
        addToolMessage(aiMsg);

        if (isAutoSpeakEnabled && !isSpeakerMuted) {
          handleToggleSpeak(aiMsg.id, aiMsg.text);
        }
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: "msg_zoya_" + Date.now(),
          sender: "Royal",
          text: "माफ़ करें, फ़ाइल प्रोसेस करने में कुछ अड़चन आ गई!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(errMsg);
      } finally {
        setIsToolExecuting(false);
        setToolStatusMessage(null);
      }
      return;
    }

    // 3. Intelligent Background Tool Routing
    if (textToSend) {
      // 3.0 Explicit or Auto-detected Deep Research Intent
      const isDeepResearchIntent =
        activeToolMode === "deep_research" ||
        /^(deep research|डीप रिसर्च|गहन शोध|research deeply|deeply research|investigate)[:\s]*/i.test(textToSend);

      if (isDeepResearchIntent) {
        const queryClean = textToSend
          .replace(/^(deep research|डीप रिसर्च|गहन शोध|research deeply|deeply research|investigate)[:\s]*/i, "")
          .trim() || textToSend;
        setTextInput("");
        setActiveToolMode("none");
        setIsToolExecuting(true);
        setToolStatusMessage(`Deep Research in progress: Analyzing multi-source evidence for "${queryClean}"...`);

        const userMsg: ChatMessage = {
          id: "msg_user_" + Date.now(),
          sender: "user",
          text: `[Deep Research] ${textToSend}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(userMsg);

        try {
          const researchRes = await executeDeepResearch(queryClean);
          const formattedSources =
            researchRes.sources && researchRes.sources.length > 0
              ? researchRes.sources.map((s) => ({
                  title: s.title,
                  url: s.url,
                  sourceName: s.source || new URL(s.url).hostname.replace(/^www\./, ""),
                  snippet: s.snippet,
                  qualityCategory: s.qualityCategory,
                }))
              : undefined;

          const aiMsg: ChatMessage = {
            id: "msg_zoya_" + Date.now(),
            sender: "Royal",
            text: researchRes.aiSummary,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userId: user?.uid || "guest",
            createdAt: Date.now(),
            sources: formattedSources,
            toolMetadata: {
              type: "web_search",
              sources: formattedSources,
            },
          };
          addToolMessage(aiMsg);

          if (isAutoSpeakEnabled && !isSpeakerMuted) {
            handleToggleSpeak(aiMsg.id, aiMsg.text);
          }
        } catch (err) {
          console.error("Deep Research error:", err);
        } finally {
          setIsToolExecuting(false);
          setToolStatusMessage(null);
        }
        return;
      }
      // 3.1 Background Image Generation Intent
      const isImageGen = /^(image|photo|picture|तस्वीर|फोटो|चित्र)\s+(बनाओ|generate|create|draw|make)|(generate|create|draw|make)\s+(an\s+)?(image|photo|picture|art)/i.test(textToSend);
      if (isImageGen) {
        setTextInput("");
        setIsToolExecuting(true);
        setToolStatusMessage(`Generating image for "${textToSend}"...`);

        const userMsg: ChatMessage = {
          id: "msg_user_" + Date.now(),
          sender: "user",
          text: textToSend,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(userMsg);

        try {
          const cleanPrompt = textToSend.replace(/^(image|photo|picture|तस्वीर|फोटो|चित्र)\s+(बनाओ|generate|create|draw|make)|(generate|create|draw|make)\s+(an\s+)?(image|photo|picture|art)\s*(of|की)?/i, "").trim() || textToSend;
          const genRes = await generateImageWithPrompt(cleanPrompt);
          const aiMsg: ChatMessage = {
            id: "msg_zoya_" + Date.now(),
            sender: "Royal",
            text: genRes.success 
              ? `लो बाबू! आपकी फ़रमाइश पर खूबसूरत तस्वीर तैयार कर दी!`
              : `माफ़ करें, तस्वीर बनाने में रुकावट आई: ${genRes.error || "Generation error"}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userId: user?.uid || "guest",
            createdAt: Date.now(),
            toolMetadata: {
              type: "generated_image",
              imageDataUrl: genRes.imageDataUrl,
            },
          };
          addToolMessage(aiMsg);
        } catch (err) {
          console.error("Image gen error:", err);
        } finally {
          setIsToolExecuting(false);
          setToolStatusMessage(null);
        }
        return;
      }

      // 3.2 Background URL / Link Reading Intent
      const urlMatch = textToSend.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        setTextInput("");
        setIsToolExecuting(true);
        setToolStatusMessage(`Reading & analyzing link "${urlMatch[0]}"...`);

        const userMsg: ChatMessage = {
          id: "msg_user_" + Date.now(),
          sender: "user",
          text: textToSend,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(userMsg);

        try {
          const linkRes = await inspectWebUrl(urlMatch[0]);
          let domain = "";
          try {
            domain = new URL(urlMatch[0]).hostname.replace(/^www\./, "");
          } catch {
            domain = "web";
          }
          const verifiedSources = linkRes.url ? [{
            title: linkRes.title || domain,
            url: linkRes.url,
            sourceName: domain,
            snippet: linkRes.description || linkRes.summary?.slice(0, 150),
          }] : [];

          const replyText = linkRes.success
            ? (linkRes.summary || linkRes.description || "वेबसाइट लिंक का विवरण प्राप्त हो गया है बाबू!")
            : `माफ़ करना बाबू, ई लिंक (${urlMatch[0]}) हम पढ़ नहीं पा रहे हैं: ${linkRes.error || "पेज लोड नहीं हुआ"}। हम गलत या मनगढंत अंदाज़ा नहीं लगाएंगे!`;

          const aiMsg: ChatMessage = {
            id: "msg_zoya_" + Date.now(),
            sender: "Royal",
            text: replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userId: user?.uid || "guest",
            createdAt: Date.now(),
            sources: verifiedSources.length > 0 ? verifiedSources : undefined,
            toolMetadata: {
              type: "link_inspection",
              linkInfo: {
                url: linkRes.url || urlMatch[0],
                title: linkRes.title,
                description: linkRes.description,
              },
              sources: verifiedSources.length > 0 ? verifiedSources : undefined,
            },
          };
          addToolMessage(aiMsg);

          if (isAutoSpeakEnabled && !isSpeakerMuted) {
            handleToggleSpeak(aiMsg.id, aiMsg.text);
          }
        } catch (err) {
          console.error("Link inspect error:", err);
        } finally {
          setIsToolExecuting(false);
          setToolStatusMessage(null);
        }
        return;
      }

      // 3.3 Explicit & Auto-detected Real Web Search Intent
      const isSearchIntent = shouldAutoTriggerWebSearch(textToSend);
      if (isSearchIntent) {
        const queryClean = textToSend.replace(/^(search|गूगल|सर्च|खोजो|find on web|search on web|इंटरनेट पर खोजो)[:\s]*/i, "").trim() || textToSend;
        setTextInput("");
        setIsToolExecuting(true);
        setToolStatusMessage(`Searching Google for verified facts on "${queryClean}"...`);

        const userMsg: ChatMessage = {
          id: "msg_user_" + Date.now(),
          sender: "user",
          text: textToSend,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userId: user?.uid || "guest",
          createdAt: Date.now(),
        };
        addToolMessage(userMsg);

        try {
          const searchRes = await executeWebSearch(queryClean);
          const formattedSources = searchRes.sources && searchRes.sources.length > 0 ? searchRes.sources.map(s => ({
            title: s.title,
            url: s.url,
            sourceName: s.source || new URL(s.url).hostname.replace(/^www\./, ''),
            snippet: s.snippet,
          })) : undefined;

          const aiMsg: ChatMessage = {
            id: "msg_zoya_" + Date.now(),
            sender: "Royal",
            text: searchRes.aiSummary,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userId: user?.uid || "guest",
            createdAt: Date.now(),
            sources: formattedSources,
            toolMetadata: {
              type: "web_search",
              sources: searchRes.sources,
            },
          };
          addToolMessage(aiMsg);

          if (isAutoSpeakEnabled && !isSpeakerMuted) {
            handleToggleSpeak(aiMsg.id, aiMsg.text);
          }
        } catch (err) {
          console.error("Search error:", err);
        } finally {
          setIsToolExecuting(false);
          setToolStatusMessage(null);
        }
        return;
      }
    }

    // Standard conversation
    if (!textToSend) return;
    stopCurrentSpeech();
    sharedGaplessPlayer.warmup();
    setTextInput("");
    onSendMessage(textToSend);
  };

  // Step 4: Handle Text / Voice toggle selection with 1-second 360° light sweep
  // Step 3 & 4: Handle Text / Voice toggle selection
  // Tapping Voice directly returns to the original Voice/Home UI!
  const handleToggleMode = (mode: "text" | "voice") => {
    if (mode === "voice") {
      stopCurrentSpeech();
      stopSTT();
      if (onSwitchToVoice) {
        onSwitchToVoice();
      } else {
        onClose();
      }
    } else {
      setActiveMode("text");
      stopCurrentSpeech();
      stopSTT();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  // Filtered topics for current user
  const userFilteredTopics = useMemo(() => {
    const userTopics = user 
      ? topics.filter((t) => t.userId === user.uid)
      : topics.filter((t) => t.userId.startsWith("guest_") || !t.userId);
    
    if (!historySearch.trim()) return userTopics;
    const query = historySearch.toLowerCase();
    return userTopics.filter((t) => 
      t.title.toLowerCase().includes(query) ||
      t.messages.some((m) => m.text.toLowerCase().includes(query))
    );
  }, [topics, user, historySearch]);

  // Group topics into Today, Yesterday, Older
  const groupedTopics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { today: VoiceTopicSession[]; yesterday: VoiceTopicSession[]; older: VoiceTopicSession[] } = {
      today: [],
      yesterday: [],
      older: [],
    };

    userFilteredTopics.forEach((t) => {
      const topicDate = new Date(t.updatedAt || t.createdAt);
      if (topicDate >= today) {
        groups.today.push(t);
      } else if (topicDate >= yesterday) {
        groups.yesterday.push(t);
      } else {
        groups.older.push(t);
      }
    });

    return groups;
  }, [userFilteredTopics]);

  // Send Bug report to Telegram
  const handleSendBugReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugMessage.trim() || bugSending) return;
    setBugSending(true);

    try {
      await dispatchProblemReportToTelegram({
        name: bugUserName.trim() || "User",
        phone: bugUserPhone.trim(),
        email: bugUserEmail.trim(),
        contact: [bugUserPhone.trim(), bugUserEmail.trim()].filter(Boolean).join(" | ") || "Not Provided",
        category: bugCategory,
        description: bugMessage.trim(),
        deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent : "Web Client",
      });
      setBugSuccess(true);
      setBugMessage("");
      setTimeout(() => {
        setBugSuccess(false);
        setIsReportingBug(false);
      }, 2500);
    } catch {
      setBugSuccess(false);
    } finally {
      setBugSending(false);
    }
  };

  // Direct Mail Bug Report to Developer
  const handleDirectEmailBugReport = () => {
    const subject = encodeURIComponent(`[ZOYA USER REPORT] ${bugCategory} - ${bugUserName.trim() || "User"}`);
    const body = encodeURIComponent(
      `User Details / पहचान:\n` +
      `• Name: ${bugUserName.trim() || "Not specified"}\n` +
      `• Mobile Number: ${bugUserPhone.trim() || "Not specified"}\n` +
      `• Email: ${bugUserEmail.trim() || "Not specified"}\n` +
      `• Category: ${bugCategory}\n\n` +
      `Problem Description / समस्या का विवरण:\n` +
      `${bugMessage.trim() || "No description provided"}\n\n` +
      `---\nDevice: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web Client"}`
    );
    window.location.href = `mailto:${DEVELOPER_EMAIL}?subject=${subject}&body=${body}`;
  };

  // Sign out handler
  const handleSignOut = async () => {
    stopCurrentSpeech();
    stopSTT();
    await logoutUser();
    if (onLogout) {
      onLogout();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
          onClick={(e) => {
            e.stopPropagation();
            sharedGaplessPlayer.warmup();
          }}
          className="w-full h-full sm:h-[92vh] sm:max-w-2xl sm:rounded-3xl bg-[#070b19] border-2 border-indigo-500/40 shadow-[0_0_50px_rgba(79,70,229,0.3)] flex flex-col overflow-hidden relative"
        >
          {/* Subtle Grid Background Pattern */}
          <div 
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
              `,
              backgroundSize: "26px 26px",
              backgroundPosition: "0 0",
            }}
          />

          {/* =========================================================================
              STEP 1: CHAT POPUP HEADER
              - Kept slightly larger height (~64px, 2-line message vertical size)
              - 4-sided themed border with violet glow styling
              - Contains ONLY:
                • Existing Zoya Logo
                • "Zoya AI Chat"
                • Green online indicator (continuous subtle zoom-in / zoom-out pulse)
                • Three-dot menu button
                • Existing close (X) button
              - No Chat, Chat History, or Speaker controls directly in header.
              ========================================================================= */}
          <div className="p-2 sm:p-3 pb-0 z-30 shrink-0">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-2 border-violet-500/80 rounded-2xl sm:rounded-3xl flex items-center justify-between bg-gradient-to-r from-[#28114f]/95 via-[#1d0e3a]/95 to-[#2a1154]/95 backdrop-blur-2xl relative shadow-[0_0_30px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/50">
              {/* Left: Logo + Title + Green Pulsing Online Indicator */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden shadow-lg shadow-violet-500/30 ring-1.5 ring-violet-400 flex items-center justify-center bg-white shrink-0 p-0.5">
                  <ZoyaLogo size={32} showGlow={false} className="w-full h-full border-none shadow-none" />
                </div>
                
                <div className="flex items-center gap-2.5 truncate">
                  <h2 className="text-sm sm:text-base font-black tracking-wide truncate bg-gradient-to-r from-white via-violet-200 to-pink-200 bg-clip-text text-transparent drop-shadow-sm">
                    Zoya AI Chat
                  </h2>
                  
                  {/* Green online indicator with continuous subtle zoom-in / zoom-out pulse */}
                  <div className="flex h-3.5 w-3.5 relative items-center justify-center shrink-0 ml-0.5" title="Zoya Online">
                    <motion.span
                      animate={{ scale: [1, 1.45, 1], opacity: [0.8, 0.25, 0.8] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-md shadow-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Right: Three-Dot Menu Button + Close Button ONLY */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative" ref={menuRef}>
                {/* Three-Dot Menu Button */}
                <button
                  type="button"
                  id="btn-chat-three-dot-menu"
                  onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
                  className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    showThreeDotMenu
                      ? "bg-violet-600/50 border-violet-400 text-white shadow-lg shadow-violet-500/40 ring-2 ring-violet-400/50"
                      : "bg-violet-950/60 hover:bg-violet-900/60 text-white border-violet-400/40 hover:border-violet-400 shadow-sm"
                  }`}
                  title="Options Menu"
                  aria-label="Open menu"
                >
                  <MoreVertical size={17} />
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  id="btn-chat-close"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-violet-950/60 hover:bg-red-500/30 text-white/80 hover:text-white border border-violet-400/40 hover:border-red-400/50 transition-colors cursor-pointer shadow-sm"
                  title="Close (ESC)"
                  aria-label="Close chat"
                >
                  <X size={17} />
                </button>

                {/* =========================================================================
                    STEP 2: THREE-DOT DROPDOWN MENU
                    Contains: Profile, Settings, Chat History, About Zoya
                    ========================================================================= */}
                <AnimatePresence>
                  {showThreeDotMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-12 w-56 rounded-2xl bg-[#111118]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5 z-50 flex flex-col gap-1 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView("profile");
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                      >
                        <User size={15} className="text-violet-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block font-semibold">Profile</span>
                          <span className="block text-[10px] text-white/50 truncate">
                            {user?.displayName || user?.email || "Account & Status"}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveView("settings");
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                      >
                        <SettingsIcon size={15} className="text-cyan-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block font-semibold">Settings</span>
                          <span className="block text-[10px] text-white/50">Voice, Theme & Privacy</span>
                        </div>
                      </button>

                      {/* User Device Profile (डिवाइस टैब) */}
                      {onOpenDeviceModal && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowThreeDotMenu(false);
                            onOpenDeviceModal();
                          }}
                          className="w-full px-3 py-2 rounded-xl hover:bg-emerald-600/20 text-white/90 hover:text-emerald-200 flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer group"
                        >
                          <Smartphone size={15} className="text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                          <div className="flex-1 min-w-0">
                            <span className="block font-semibold text-emerald-300">Device Profile (डिवाइस टैब)</span>
                            <span className="block text-[10px] text-white/50">Hardware & Telemetry</span>
                          </div>
                        </button>
                      )}

                      {/* Speaker Voice Output Toggle */}
                      {onToggleSpeaker && (
                        <button
                          type="button"
                          onClick={() => {
                            onToggleSpeaker();
                          }}
                          className="w-full px-3 py-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                        >
                          {isSpeakerMuted ? (
                            <VolumeX size={15} className="text-red-400 shrink-0" />
                          ) : (
                            <Volume2 size={15} className="text-cyan-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="block font-semibold">Speaker Voice Output</span>
                            <span className="block text-[10px] text-white/50">
                              {isSpeakerMuted ? "Muted (आवाज बंद)" : "Active (आवाज चालू)"}
                            </span>
                          </div>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveView("history");
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                      >
                        <History size={15} className="text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block font-semibold">Chat History</span>
                          <span className="block text-[10px] text-white/50">
                            {userFilteredTopics.length} saved sessions
                          </span>
                        </div>
                      </button>

                      {isCurrentSessionDeveloper(user?.email) && onOpenAdminPanel && (
                        <button
                          type="button"
                          id="btn-admin-final-menu"
                          onClick={() => {
                            setShowThreeDotMenu(false);
                            onOpenAdminPanel();
                          }}
                          className="w-full px-3 py-2 rounded-xl hover:bg-red-600/20 text-red-300 hover:text-red-200 flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                        >
                          <Shield size={15} className="text-red-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="block font-semibold">Developer Admin Panel</span>
                            <span className="block text-[10px] text-white/50">Live controls & analytics</span>
                          </div>
                        </button>
                      )}

                      <div className="h-px bg-white/10 my-0.5" />

                      <button
                        type="button"
                        onClick={() => {
                          setActiveView("about");
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-white/10 text-white/90 hover:text-white flex items-center gap-2.5 font-medium transition-colors text-left cursor-pointer"
                      >
                        <Sparkles size={15} className="text-rose-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block font-semibold">About Zoya</span>
                          <span className="block text-[10px] text-white/50">Developer & Community</span>
                        </div>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* =========================================================================
              STEP 4: TEXT / VOICE TOGGLE (HelloJio-style Separated Boxes)
              - Permanently visible below the header
              - Increased height/length slightly, width approximately same
              - Look like two clearly separated boxes with a gap
              - ONLY selected button may glow (never both)
              - 1-second 360° light sweep around the border on selection
              ========================================================================= */}
          <div className="sticky top-0 z-20 w-full flex justify-center py-2.5 px-3 bg-[#0c061a]/95 backdrop-blur-md border-b border-violet-500/20 shrink-0">
            <div className="relative p-1.5 rounded-2xl bg-gradient-to-r from-[#170a2f]/95 via-[#0e071c]/95 to-[#1a0a33]/95 border-2 border-violet-500/50 shadow-[0_0_24px_rgba(168,85,247,0.3)] flex items-center gap-3 sm:gap-4">
              {/* Text Button Box (Separated Card) */}
              <div className="relative rounded-xl">
                <button
                  type="button"
                  id="toggle-btn-text"
                  onClick={() => handleToggleMode("text")}
                  className={`relative z-10 min-w-[120px] sm:min-w-[140px] h-10 sm:h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                    activeMode === "text"
                      ? "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.85)] border-2 border-violet-300 ring-2 ring-violet-400/50 scale-[1.02]"
                      : "bg-white/[0.04] text-white/60 border border-white/15 hover:text-white hover:bg-white/10 hover:border-white/30 shadow-none font-medium scale-100"
                  }`}
                >
                  <MessageSquare size={16} className={activeMode === "text" ? "text-white" : "text-white/60"} />
                  <span>Text Chat</span>
                  {activeMode === "text" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-300 shadow-sm shadow-violet-300 animate-pulse ml-0.5" />
                  )}
                </button>
              </div>

              {/* Voice Button Box (Separated Card) */}
              <div className="relative rounded-xl">
                <button
                  type="button"
                  id="toggle-btn-voice"
                  onClick={() => handleToggleMode("voice")}
                  className={`relative z-10 min-w-[120px] sm:min-w-[140px] h-10 sm:h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                    activeMode === "voice"
                      ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.85)] border-2 border-emerald-300 ring-2 ring-emerald-400/50 scale-[1.02]"
                      : "bg-white/[0.04] text-white/60 border border-white/15 hover:text-white hover:bg-white/10 hover:border-white/30 shadow-none font-medium scale-100"
                  }`}
                >
                  <PhoneCall size={16} className={activeMode === "voice" ? "text-white" : "text-white/60"} />
                  <span>Voice Call</span>
                  {activeMode === "voice" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-sm shadow-emerald-300 animate-pulse ml-0.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* =========================================================================
              VIEW 1: ACTIVE LIVE CHAT (Default)
              ========================================================================= */}
          {activeView === "chat" && (
            <>
              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar z-10 relative">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/50">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/30 to-pink-600/20 border border-violet-500/30 flex items-center justify-center mb-4 text-violet-300 shadow-xl shadow-violet-900/20">
                      <Sparkles size={28} />
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">
                      नमस्ते! मैं ज़ोया (Zoya) हूँ
                    </h3>
                    <p className="text-xs text-white/60 max-w-sm mb-6">
                      आप मुझसे चैट में कुछ भी पूछ सकते हैं। टाइप करें या माइक दबाकर बोलें, और ज़ोया तुरंत जवाब देगी!
                    </p>

                    {/* Suggested Prompt Chips */}
                    <div className="w-full max-w-md flex flex-wrap justify-center gap-2">
                      {[
                        "Royal Ankit Ahiran के बारे में बताओ",
                        "मेरी यादें (Memory) क्या-क्या सेव हैं?",
                        "आप क्या-क्या कर सकती हो?",
                        "YouTube पर प्रोग्रामिंग ट्यूटोरियल चलाओ",
                        "एक मजेदार जोक सुनाओ",
                      ].map((prompt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            stopCurrentSpeech();
                            onSendMessage(prompt);
                          }}
                          className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all text-left flex items-center gap-1.5 cursor-pointer hover:border-violet-500/40"
                        >
                          <MessageSquare size={12} className="text-violet-400 shrink-0" />
                          <span>{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => {
                      const isUser = msg.sender === "user";
                      const isPlaying = playingMessageId === msg.id;
                      const { shortTime, fullDate } = formatMessageTimestamp(msg);
                      const sourcesList = msg.toolMetadata?.sources || msg.sources || [];
                      const hasSources = sourcesList.length > 0;

                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22 }}
                          className={`w-full flex items-start gap-2.5 sm:gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {/* Avatar: Zoya Logo for Zoya (tilted +6° towards message), User Icon for User (tilted -6° towards message) */}
                          {!isUser ? (
                            <div 
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl overflow-hidden shrink-0 ring-2 ring-purple-500/60 bg-gradient-to-br from-purple-900 via-indigo-950 to-purple-950 shadow-[0_0_16px_rgba(168,85,247,0.45)] mt-1 p-0.5 flex items-center justify-center transform rotate-[6deg] hover:rotate-0 hover:scale-105 transition-all duration-300 select-none cursor-pointer"
                              title="Zoya AI Assistant"
                            >
                              <ZoyaLogo size={32} showGlow={false} className="w-full h-full border-none shadow-none" />
                            </div>
                          ) : (
                            <div 
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl overflow-hidden shrink-0 ring-2 ring-cyan-400/60 bg-gradient-to-br from-blue-900 via-indigo-950 to-cyan-950 shadow-[0_0_16px_rgba(59,130,246,0.45)] mt-1 flex items-center justify-center transform -rotate-[6deg] hover:rotate-0 hover:scale-105 transition-all duration-300 select-none cursor-pointer"
                              title={user?.displayName || "User"}
                            >
                              {user?.photoURL ? (
                                <img 
                                  src={user.photoURL} 
                                  alt={user.displayName || "User"} 
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-cyan-600/40 via-blue-600/40 to-indigo-600/40 text-cyan-200">
                                  <User size={16} className="shrink-0 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Outer Enclosing Container wrapping Message Content and Action Bar */}
                          <div className={`max-w-[90%] sm:max-w-[80%] w-full flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                            <div
                              className={`w-full rounded-2xl sm:rounded-3xl p-3 sm:p-4 border transition-all duration-300 relative shadow-xl backdrop-blur-xl ${
                                isUser
                                  ? "bg-gradient-to-br from-[#0c1432]/95 via-[#0e173a]/95 to-[#0a122e]/95 border-blue-500/40 hover:border-blue-400/60 shadow-[0_0_24px_rgba(59,130,246,0.18)] ring-1 ring-blue-400/30 rounded-tr-sm"
                                  : "bg-gradient-to-br from-[#0a1028]/95 via-[#101636]/95 to-[#0c1230]/95 border-purple-500/40 hover:border-purple-400/60 shadow-[0_0_28px_rgba(168,85,247,0.18)] ring-1 ring-purple-400/30 rounded-tl-sm"
                              }`}
                            >
                              {/* Header inside Enclosing Card: Sender Label + Interactive Time/Date Toggle */}
                              <div className={`flex items-center justify-between pb-2 mb-2 border-b ${
                                isUser ? "border-blue-500/20" : "border-purple-500/20"
                              }`}>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[11px] font-bold tracking-wider uppercase ${
                                    isUser ? "text-cyan-300" : "bg-gradient-to-r from-purple-300 via-pink-300 to-indigo-300 bg-clip-text text-transparent"
                                  }`}>
                                    {isUser ? (user?.displayName || "You") : "Zoya AI"}
                                  </span>
                                  {!isUser && (
                                    <Sparkles size={11} className="text-purple-400 shrink-0 animate-pulse" />
                                  )}
                                </div>

                                {/* Real Time / Date: Tap to toggle full date/month/year/time */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    triggerButtonHighlight(`${msg.id}_time`);
                                    setExpandedTimestamps((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }));
                                  }}
                                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono transition-all duration-200 cursor-pointer flex items-center gap-1 shrink-0 ${
                                    buttonHighlight[`${msg.id}_time`]
                                      ? "border-violet-300 bg-violet-500/30 text-white ring-2 ring-violet-400/80 shadow-[0_0_12px_rgba(168,85,247,0.7)]"
                                      : expandedTimestamps[msg.id]
                                      ? "border-cyan-400/60 bg-cyan-950/50 text-cyan-200 shadow-sm"
                                      : "border-white/10 bg-white/[0.04] text-white/50 hover:text-white/80 hover:border-white/25"
                                  }`}
                                  title="Tap to toggle full date, month, year & time"
                                >
                                  <Clock size={10} className="shrink-0 opacity-70" />
                                  <span>{expandedTimestamps[msg.id] ? fullDate : shortTime}</span>
                                </button>
                              </div>

                              {/* Message Text Body */}
                              <div className="text-xs sm:text-sm leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                                {!isUser ? renderMessageTextWithHighlight(msg.id, msg.text, speakingHighlight) : msg.text}
                                {isProcessing && !isUser && messages[messages.length - 1]?.id === msg.id && (
                                  <span className="inline-block w-1.5 h-3.5 bg-violet-400 ml-1 translate-y-0.5 animate-pulse rounded-full" />
                                )}
                              </div>

                              {/* 1. Image Search Gallery (if present) */}
                              {msg.toolMetadata?.type === "image_search" && msg.toolMetadata.images && msg.toolMetadata.images.length > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-white/10">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {msg.toolMetadata.images.map((img, iIdx) => (
                                      <div
                                        key={iIdx}
                                        className="group relative rounded-xl overflow-hidden border border-white/15 bg-black/50 aspect-square cursor-pointer hover:border-violet-400 transition-all shadow-md"
                                        onClick={() => setSelectedFullImage(img.fullImageUrl)}
                                      >
                                        <img
                                          src={img.thumbnailUrl}
                                          alt={img.title}
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                          loading="lazy"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400";
                                          }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-1.5 sm:p-2 flex flex-col justify-end text-[10px] text-white">
                                          <span className="truncate font-semibold">{img.title}</span>
                                          <div className="flex items-center justify-between mt-0.5 text-[9px] text-cyan-300">
                                            <span>View HD</span>
                                            <a
                                              href={img.sourceUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="hover:underline flex items-center gap-0.5"
                                            >
                                              <span>Source</span>
                                              <ExternalLink size={9} />
                                            </a>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 2. Image Display (Generated Art or Attached Camera/Photo) */}
                              {msg.toolMetadata?.imageDataUrl && (
                                <div className="mt-2.5 rounded-2xl overflow-hidden border border-violet-500/40 bg-black/60 shadow-xl max-w-sm">
                                  <div 
                                    className="relative cursor-pointer group"
                                    onClick={() => setSelectedFullImage(msg.toolMetadata?.imageDataUrl || null)}
                                  >
                                    <img
                                      src={msg.toolMetadata.imageDataUrl}
                                      alt="Visual Media"
                                      className="w-full h-auto object-cover rounded-t-2xl transition-transform group-hover:scale-[1.01]"
                                    />
                                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] text-white flex items-center gap-1 font-medium">
                                      <Sparkles size={10} className="text-pink-400" />
                                      <span>{msg.toolMetadata.type === "vision" ? "Vision Photo" : "Imagen 3"}</span>
                                    </div>
                                  </div>
                                  <div className="p-2 sm:p-2.5 bg-black/80 flex items-center justify-between border-t border-white/10 text-xs">
                                    <span className="text-violet-300 font-semibold text-[11px] truncate max-w-[150px]">
                                      {msg.toolMetadata.type === "vision" ? "Analyzed Image" : "AI Generated Artwork"}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedFullImage(msg.toolMetadata?.imageDataUrl || null)}
                                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                                        title="View Full Size"
                                      >
                                        <Maximize2 size={13} />
                                      </button>
                                      <a
                                        href={msg.toolMetadata.imageDataUrl}
                                        download={`zoya-img-${Date.now()}.jpg`}
                                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-medium flex items-center gap-1 text-[11px] shadow-sm transition-all cursor-pointer"
                                      >
                                        <Download size={12} />
                                        <span>Save</span>
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 3. Document / Code File Attachment Info Card */}
                              {msg.toolMetadata?.fileInfo && (
                                <div className="mt-2 p-2.5 rounded-xl bg-black/40 border border-white/15 flex items-center gap-2.5 text-xs">
                                  <div className="p-2 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/30 shrink-0">
                                    {msg.toolMetadata.type === "code" ? <Code size={16} /> : <FileText size={16} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-white block truncate">{msg.toolMetadata.fileInfo.name}</span>
                                    <span className="text-[10px] text-white/50 block">
                                      {Math.round(msg.toolMetadata.fileInfo.size / 1024)} KB • {msg.toolMetadata.fileInfo.type || "Document"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 4. Link Inspection Card */}
                              {msg.toolMetadata?.linkInfo && (
                                <div className="mt-2 p-2.5 rounded-xl bg-black/60 border border-cyan-500/30 flex items-start gap-2.5 text-xs shadow-md">
                                  {msg.toolMetadata.linkInfo.favicon ? (
                                    <img
                                      src={msg.toolMetadata.linkInfo.favicon}
                                      alt="Favicon"
                                      className="w-5 h-5 rounded shrink-0 mt-0.5"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="p-1.5 rounded-lg bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 shrink-0 mt-0.5">
                                      <Link2 size={14} />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <a
                                      href={msg.toolMetadata.linkInfo.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold text-cyan-300 hover:underline flex items-center gap-1 truncate"
                                    >
                                      <span>{msg.toolMetadata.linkInfo.title || msg.toolMetadata.linkInfo.url}</span>
                                      <ExternalLink size={11} className="shrink-0" />
                                    </a>
                                    {msg.toolMetadata.linkInfo.description && (
                                      <span className="text-[11px] text-white/70 block mt-0.5 line-clamp-2">
                                        {msg.toolMetadata.linkInfo.description}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 5. Source More UI (Collapsible Drawer under the message content) */}
                              {hasSources && (
                                <AnimatePresence>
                                  {expandedSources[msg.id] && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="mt-3 pt-3 border-t border-cyan-500/30 flex flex-col gap-2 overflow-hidden"
                                    >
                                      <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-300 px-0.5">
                                        <div className="flex items-center gap-1.5">
                                          <Globe size={13} className="shrink-0 text-cyan-400" />
                                          <span>Research Sources ({sourcesList.length})</span>
                                        </div>
                                        <span className="text-[10px] text-cyan-200/60 font-mono">Verified Citations</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {sourcesList.map((src, sIdx) => {
                                          let domain = "";
                                          try {
                                            domain = new URL(src.url).hostname.replace(/^www\./, "");
                                          } catch {
                                            domain = src.source || "web";
                                          }
                                          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                                          return (
                                            <a
                                              key={sIdx}
                                              href={src.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-black/75 hover:bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400/80 text-white/90 hover:text-white transition-all shadow-md group cursor-pointer"
                                              title={src.title}
                                            >
                                              <img
                                                src={faviconUrl}
                                                alt={domain}
                                                className="w-4 h-4 rounded shrink-0 mt-0.5"
                                                onError={(e) => {
                                                  (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                              />
                                              <div className="min-w-0 flex-1">
                                                <span className="block text-[11px] font-semibold truncate text-cyan-100 group-hover:text-cyan-300">
                                                  {src.title || domain}
                                                </span>
                                                <div className="flex items-center gap-1.5 text-[9px] text-cyan-300/80 truncate font-mono mt-0.5">
                                                  <span>{src.source || domain}</span>
                                                  {src.qualityCategory && (
                                                    <span className={`px-1 py-0.2 rounded text-[8px] font-bold border ${
                                                      src.qualityCategory === "Official"
                                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                                        : src.qualityCategory === "Primary Research"
                                                        ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                                        : src.qualityCategory === "Established News"
                                                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                                        : src.qualityCategory === "Specialist"
                                                        ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                                                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                                    }`}>
                                                      {src.qualityCategory}
                                                    </span>
                                                  )}
                                                  {src.timestamp && <span>• {src.timestamp}</span>}
                                                </div>
                                                {src.snippet && (
                                                  <span className="block text-[9px] text-white/60 line-clamp-2 mt-0.5">
                                                    {src.snippet}
                                                  </span>
                                                )}
                                              </div>
                                              <ExternalLink size={11} className="shrink-0 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              )}

                              {/* Action Bar (Inside the outer enclosing card, with individual mini-borders) */}
                              {isUser ? (
                                <div className="mt-2.5 pt-2 border-t border-blue-500/20 flex items-center justify-end">
                                  {/* User Message Action Bar: ONLY Copy Button with its own separate small border */}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                      buttonHighlight[`${msg.id}_copy`]
                                        ? "border-cyan-300 bg-cyan-600/40 text-white ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)] scale-[1.03]"
                                        : copiedMsgId === msg.id
                                        ? "border-emerald-400 bg-emerald-500/25 text-emerald-300 font-semibold ring-1 ring-emerald-400/60 shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                                        : "border-blue-500/30 hover:border-cyan-400/60 bg-blue-950/30 hover:bg-blue-900/50 text-blue-200 hover:text-white"
                                    }`}
                                    title="Copy message text"
                                  >
                                    {copiedMsgId === msg.id ? (
                                      <>
                                        <Check size={12} className="text-emerald-400 shrink-0" />
                                        <span className="text-emerald-300">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={12} className="shrink-0 text-cyan-300" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="mt-3 pt-2.5 border-t border-purple-500/20 flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    {/* Speaker Button: reads this message aloud */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSpeak(msg.id, msg.text)}
                                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                        buttonHighlight[`${msg.id}_speak`]
                                          ? "border-violet-300 bg-violet-600/40 text-white ring-2 ring-violet-400 shadow-[0_0_14px_rgba(168,85,247,0.8)] scale-[1.03]"
                                          : isPlaying
                                          ? "border-emerald-400 bg-emerald-500/25 text-emerald-300 ring-2 ring-emerald-400/50 shadow-[0_0_12px_rgba(52,211,153,0.5)] font-bold"
                                          : "border-purple-500/30 hover:border-purple-400/70 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200"
                                      }`}
                                      title={isPlaying ? "Stop Speaking" : "Listen (Text-to-Speech)"}
                                    >
                                      {isPlaying ? (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                                          <Square size={11} className="fill-emerald-400 shrink-0" />
                                          <span>Playing</span>
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 size={12} className="shrink-0" />
                                          <span>Speaker</span>
                                        </>
                                      )}
                                    </button>

                                    {/* Copy Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleCopyMessage(msg.id, msg.text)}
                                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                        buttonHighlight[`${msg.id}_copy`]
                                          ? "border-cyan-300 bg-cyan-600/40 text-white ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)] scale-[1.03]"
                                          : copiedMsgId === msg.id
                                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm"
                                          : "border-white/15 hover:border-white/35 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white"
                                      }`}
                                      title="Copy message text"
                                    >
                                      {copiedMsgId === msg.id ? (
                                        <>
                                          <Check size={12} className="text-emerald-400 shrink-0" />
                                          <span className="text-emerald-300">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy size={12} className="shrink-0" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>

                                    {/* Share Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleShareMessage(msg.id, msg.text)}
                                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                        buttonHighlight[`${msg.id}_share`]
                                          ? "border-cyan-300 bg-cyan-600/40 text-white ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)] scale-[1.03]"
                                          : sharedMsgId === msg.id
                                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm"
                                          : "border-white/15 hover:border-white/35 bg-white/[0.04] hover:bg-white/10 text-white/80 hover:text-white"
                                      }`}
                                      title="Share message"
                                    >
                                      {sharedMsgId === msg.id ? (
                                        <>
                                          <Check size={12} className="text-emerald-400 shrink-0" />
                                          <span className="text-emerald-300">Shared</span>
                                        </>
                                      ) : (
                                        <>
                                          <Share2 size={12} className="shrink-0" />
                                          <span>Share</span>
                                        </>
                                      )}
                                    </button>

                                    {/* Refresh Button (Only for Zoya's answers) */}
                                    <button
                                      type="button"
                                      onClick={() => handleRegenerate(msg)}
                                      disabled={isProcessing || regeneratingMsgId === msg.id}
                                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 disabled:opacity-40 ${
                                        buttonHighlight[`${msg.id}_refresh`]
                                          ? "border-violet-300 bg-violet-600/40 text-white ring-2 ring-violet-400 shadow-[0_0_14px_rgba(168,85,247,0.8)] scale-[1.03]"
                                          : regeneratingMsgId === msg.id
                                          ? "border-violet-400 bg-violet-950/60 text-violet-300 font-semibold shadow-sm"
                                          : "border-indigo-500/30 hover:border-indigo-400/70 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-200 hover:text-white"
                                      }`}
                                      title="Regenerate this response"
                                    >
                                      <RotateCw
                                        size={12}
                                        className={regeneratingMsgId === msg.id ? "animate-spin text-violet-400 shrink-0" : "shrink-0"}
                                      />
                                      <span>{regeneratingMsgId === msg.id ? "Regenerating..." : "Refresh"}</span>
                                    </button>

                                    {/* Source More Button (Only if verified sources exist) */}
                                    {hasSources && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSources(msg.id)}
                                        className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                          buttonHighlight[`${msg.id}_sources`]
                                            ? "border-cyan-300 bg-cyan-600/40 text-white ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)] scale-[1.03]"
                                            : expandedSources[msg.id]
                                            ? "border-cyan-400 bg-cyan-500/25 text-cyan-200 shadow-sm"
                                            : "border-cyan-500/40 hover:border-cyan-400/80 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300"
                                        }`}
                                        title="Toggle sources panel"
                                      >
                                        <Globe size={12} className="shrink-0 text-cyan-400" />
                                        <span>{expandedSources[msg.id] ? "Hide Sources" : `Source More (${sourcesList.length})`}</span>
                                      </button>
                                    )}
                                    {/* Export Dropdown Button */}
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={() => toggleExportMenu(msg.id)}
                                        className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                          showExportMenu[msg.id]
                                            ? "border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm"
                                            : "border-amber-500/30 hover:border-amber-400/70 bg-amber-950/30 hover:bg-amber-900/50 text-amber-300"
                                        }`}
                                        title="Export report"
                                      >
                                        <Download size={12} className="shrink-0 text-amber-400" />
                                        <span>Export</span>
                                      </button>
                                      {showExportMenu[msg.id] && (
                                        <div className="absolute bottom-full mb-2 right-0 w-36 bg-[#0f0923] border border-amber-500/40 rounded-xl shadow-2xl p-1.5 z-30 flex flex-col gap-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              toggleExportMenu(msg.id);
                                              exportReportToPDF(msg.text.slice(0, 40) + "...", msg.text, msg.sources);
                                            }}
                                            className="px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 text-white text-[11px] font-medium flex items-center gap-2 transition-colors cursor-pointer text-left"
                                          >
                                            <FileText size={12} className="text-rose-400" />
                                            <span>Export PDF</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              toggleExportMenu(msg.id);
                                              exportReportToTXT(msg.text.slice(0, 40) + "...", msg.text, msg.sources);
                                            }}
                                            className="px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 text-white text-[11px] font-medium flex items-center gap-2 transition-colors cursor-pointer text-left"
                                          >
                                            <FileCode size={12} className="text-cyan-400" />
                                            <span>Export TXT</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              toggleExportMenu(msg.id);
                                              exportReportToMD(msg.text.slice(0, 40) + "...", msg.text, msg.sources);
                                            }}
                                            className="px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 text-white text-[11px] font-medium flex items-center gap-2 transition-colors cursor-pointer text-left"
                                          >
                                            <FileCode size={12} className="text-violet-400" />
                                            <span>Export Markdown</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Save Vault Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleSaveToVault(msg)}
                                      className={`px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                                        savedReportMsgIds[msg.id]
                                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 font-semibold"
                                          : "border-pink-500/30 hover:border-pink-400/70 bg-pink-950/30 hover:bg-pink-900/50 text-pink-300"
                                      }`}
                                      title="Save to Research Vault"
                                    >
                                      {savedReportMsgIds[msg.id] ? (
                                        <>
                                          <Check size={12} className="text-emerald-400 shrink-0" />
                                          <span>Saved</span>
                                        </>
                                      ) : (
                                        <>
                                          <Bookmark size={12} className="shrink-0 text-pink-400" />
                                          <span>Save Vault</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}

                    {isProcessing && !(messages.length > 0 && messages[messages.length - 1].sender === "Royal" && messages[messages.length - 1].text?.trim()) && (
                      <div className="flex items-start gap-3 animate-in fade-in duration-200">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl overflow-hidden shrink-0 ring-2 ring-purple-500/60 bg-gradient-to-br from-purple-900 to-indigo-950 shadow-[0_0_15px_rgba(168,85,247,0.4)] p-0.5 flex items-center justify-center">
                          <ZoyaLogo size={32} showGlow={false} className="w-full h-full border-none shadow-none" />
                        </div>
                        <div className="bg-[#0d122b]/95 border border-purple-500/40 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-1 ring-purple-400/20">
                          <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          <span className="text-xs font-semibold text-purple-200/90 ml-1">Zoya is thinking... / ज़ोया सोच रही है...</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area with Dark Navy & Neon Glow */}
              <div className="p-3 sm:p-4 bg-[#070b19]/95 border-t border-indigo-500/25 backdrop-blur-xl shrink-0 z-20">
                {sttError && (
                  <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-1.5">
                    <AlertCircle size={13} className="text-amber-400 shrink-0" />
                    <span>{sttError}</span>
                  </div>
                )}

                {/* Tool Executing Status Indicator */}
                {isToolExecuting && toolStatusMessage && (
                  <div className="mb-2 p-3 rounded-2xl bg-gradient-to-r from-violet-950/80 via-purple-900/60 to-indigo-950/80 border border-violet-500/40 text-violet-100 text-xs flex flex-col gap-2 shadow-lg backdrop-blur-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-violet-200">
                        <Sparkles size={14} className="text-violet-400 animate-spin shrink-0" />
                        <span>{toolStatusMessage}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-400/30">
                        {toolStatusMessage.includes("Plan") ? "Stage 2/6" :
                         toolStatusMessage.includes("Retrieval") || toolStatusMessage.includes("Search") ? "Stage 3/6" :
                         toolStatusMessage.includes("Extract") || toolStatusMessage.includes("Analyzing") ? "Stage 4/6" :
                         toolStatusMessage.includes("Verif") || toolStatusMessage.includes("Fact") ? "Stage 5/6" :
                         toolStatusMessage.includes("Report") || toolStatusMessage.includes("Synthesiz") ? "Stage 6/6" : "Stage 1/6"}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-violet-950 border border-violet-500/20 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 via-pink-500 to-cyan-400 transition-all duration-300 rounded-full animate-pulse"
                        style={{
                          width: toolStatusMessage.includes("Plan") ? "33%" :
                                 toolStatusMessage.includes("Retrieval") || toolStatusMessage.includes("Search") ? "50%" :
                                 toolStatusMessage.includes("Extract") || toolStatusMessage.includes("Analyzing") ? "66%" :
                                 toolStatusMessage.includes("Verif") || toolStatusMessage.includes("Fact") ? "83%" :
                                 toolStatusMessage.includes("Report") || toolStatusMessage.includes("Synthesiz") ? "95%" : "15%"
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Active Photo Preview Chip */}
                {attachedPhoto && (
                  <div className="mb-2.5 px-3 py-2 rounded-2xl bg-violet-950/70 border border-violet-500/40 text-white text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={attachedPhoto.dataUrl}
                        alt="Photo Preview"
                        className="w-12 h-12 rounded-xl object-cover border border-violet-400/50 shrink-0 shadow-md"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-violet-200 block truncate">
                          {attachedPhoto.source === "camera" ? "Camera Photo Captured" : attachedPhoto.file.name}
                        </span>
                        <span className="text-[10px] text-white/50 block">
                          {Math.round(attachedPhoto.file.size / 1024)} KB • Ready for Vision Analysis
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {attachedPhoto.source === "camera" && (
                        <button
                          type="button"
                          onClick={handleTriggerCamera}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Retake
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAttachedPhoto(null)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 hover:text-red-300 text-white/70 transition-colors cursor-pointer"
                        title="Remove photo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Active Attached Document Chip */}
                {attachedFile && (
                  <div className="mb-2.5 px-3 py-2 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 text-white text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-cyan-200 block truncate">{attachedFile.name}</span>
                        <span className="text-[10px] text-white/50 block">
                          {Math.round(attachedFile.size / 1024)} KB • Document / Code File
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTriggerFiles}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 hover:text-red-300 text-white/70 transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Active Attached Multi-Files Chip */}
                {attachedFiles.length > 1 && (
                  <div className="mb-2.5 px-3 py-2 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 text-white text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 flex items-center justify-center shrink-0">
                        <FileCode size={18} />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-cyan-200 block truncate">
                          {attachedFiles.length} Files Selected ({attachedFiles[0].name} + {attachedFiles.length - 1} more)
                        </span>
                        <span className="text-[10px] text-white/50 block">
                          {Math.round(attachedFiles.reduce((acc, f) => acc + f.size, 0) / 1024)} KB total • Ready for Multi-File Analysis
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTriggerFiles}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Add/Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles([])}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 hover:text-red-300 text-white/70 transition-colors cursor-pointer"
                        title="Remove all files"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Hidden File Inputs for Native Camera Fallback, Photos & Documents */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoSelected(e, "camera")}
                  className="hidden"
                />
                <input
                  ref={photosInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => handlePhotoSelected(e, "photos")}
                  className="hidden"
                />
                <input
                  ref={docsInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.csv,.json,.md,.py,.js,.ts,.tsx,.jsx,.html,.css,.c,.cpp,.h,.java,.sql,.rtf,.xls,.xlsx,.xml,.yaml,.yml,.toml,.sh,.go,.rs,.cs,.kt,.php,.zip,.mp4,.webm,.mov,.mp3,.wav,.m4a,text/*,application/*"
                  onChange={handleDocFileSelected}
                  className="hidden"
                />

                <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                  {/* Plus / Add to Chat Button */}
                  <div className="relative">
                    <button
                      type="button"
                      id="btn-chat-tools-plus"
                      onClick={() => setShowAddSheet((prev) => !prev)}
                      className={`p-3 rounded-full border transition-all cursor-pointer shrink-0 ${
                        showAddSheet || attachedPhoto || attachedFile || attachedFiles.length > 0
                          ? "bg-violet-600/40 border-violet-400 text-violet-200 ring-2 ring-violet-500/40 shadow-lg shadow-violet-900/30"
                          : "bg-white/5 hover:bg-white/15 border-white/10 text-white/70 hover:text-white"
                      }`}
                      title="Add to Chat (Camera, Photos, Files)"
                      disabled={isProcessing || isToolExecuting}
                    >
                      <Plus size={18} className={`transition-transform duration-200 ${showAddSheet ? "rotate-45 text-violet-300" : ""}`} />
                    </button>
                  </div>

                  <div className="flex-1 relative flex items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && sendOnEnter) {
                          handleSubmit(e);
                        }
                      }}
                      placeholder={
                        isListening
                          ? "Listening... बोलिए (STT Active)..."
                          : activeToolMode === "web_search"
                          ? "Search web... (e.g. Latest Bihar news, cricket score)"
                          : activeToolMode === "deep_research"
                          ? "Deep research topic... (e.g. Artificial Intelligence report, Quantum computing)"
                          : activeToolMode === "image_search"
                          ? "Search images... (e.g. Taj Mahal photos, Python logo)"
                          : activeToolMode === "generate_image"
                          ? "Describe image to create... (e.g. Futuristic Patna city)"
                          : activeToolMode === "inspect_link"
                          ? "Enter website link to inspect... (https://...)"
                          : attachedFiles.length > 1
                          ? `Ask about these ${attachedFiles.length} files...`
                          : attachedFile
                          ? `Ask about ${attachedFile.name}...`
                          : "Type a message or tap mic / मैसेज लिखें या बोलें..."
                      }
                      disabled={isProcessing || isToolExecuting}
                      className={`w-full py-2.5 pl-4 pr-10 rounded-full bg-white/5 border text-sm text-white placeholder:text-white/30 focus:outline-none transition-colors ${
                        isListening
                          ? "border-red-500/60 ring-2 ring-red-500/20 bg-red-950/15"
                          : activeToolMode !== "none" || attachedFile || attachedFiles.length > 0
                          ? "border-violet-500/60 ring-2 ring-violet-500/20 bg-violet-950/15"
                          : "border-white/10 focus:border-violet-500/50"
                      }`}
                    />
                    {inputText && (
                      <button
                        type="button"
                        onClick={() => setTextInput("")}
                        className="absolute right-3 p-1 text-white/40 hover:text-white/80 cursor-pointer"
                        title="Clear input"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Restored Microphone Button Beside Input */}
                  <button
                    type="button"
                    id="btn-chat-mic"
                    onClick={isListening ? stopSTT : startSTT}
                    className={`p-3 rounded-full border transition-all cursor-pointer shrink-0 ${
                      isListening
                        ? "bg-red-600/30 border-red-500 text-red-300 ring-2 ring-red-500/50 animate-pulse shadow-lg shadow-red-900/40"
                        : "bg-white/5 hover:bg-white/15 border-white/10 text-white/70 hover:text-white"
                    }`}
                    title={isListening ? "Listening... बोलिए (Tap to stop)" : "Speak to Zoya (Voice Input)"}
                  >
                    {isListening ? (
                      <MicOff size={18} className="text-red-400" />
                    ) : (
                      <Mic size={18} />
                    )}
                  </button>

                  {/* Send Button */}
                  <button
                    type="submit"
                    id="btn-chat-send"
                    disabled={(!inputText.trim() && !attachedFile && attachedFiles.length === 0) || isProcessing || isToolExecuting}
                    className="p-3 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white transition-all shadow-lg shadow-violet-900/30 cursor-pointer shrink-0 disabled:cursor-not-allowed"
                    title="Send Message"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          )}

          {/* =========================================================================
              VIEW 2: PROFILE
              ========================================================================= */}
          {activeView === "profile" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar z-10 flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveView("chat")}
                    className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Chat</span>
                  </button>
                  <span className="text-xs font-mono uppercase tracking-wider text-violet-400">User Profile</span>
                </div>

                {/* Profile Card */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="relative group shrink-0">
                    <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-violet-500/50 shadow-xl bg-black flex items-center justify-center">
                      {avatarPreset || user?.photoURL ? (
                        <img 
                          src={avatarPreset || user?.photoURL} 
                          alt={user?.displayName || "Profile"} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-violet-600 to-pink-600 flex items-center justify-center text-2xl font-bold text-white">
                          {(user?.displayName || user?.email || "ZO").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 text-center sm:text-left min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <h3 className="text-lg font-bold text-white truncate">
                        {editDisplayName || user?.displayName || "Zoya Explorer"}
                      </h3>
                      {user ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 w-fit mx-auto sm:mx-0">
                          <CheckCircle2 size={11} />
                          <span>Active Account</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 w-fit mx-auto sm:mx-0">
                          <Clock size={11} />
                          <span>Trial Session</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-white/60 mt-1 truncate">
                      {user?.email || user?.phoneNumber || "Unauthenticated Guest"}
                    </p>

                    <p className="text-xs text-white/50 mt-1 italic">
                      "{editBio || "Living life with curiosity & AI"}"
                    </p>
                  </div>
                </div>

                {/* Edit Profile Form */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                      <Edit3 size={14} className="text-violet-400" />
                      <span>Edit Profile</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(!isEditingProfile)}
                      className="text-xs text-violet-400 hover:text-violet-300 font-semibold cursor-pointer"
                    >
                      {isEditingProfile ? "Done" : "Edit Info"}
                    </button>
                  </div>

                  {isEditingProfile && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-[11px] text-white/60 mb-1">Display Name</label>
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          placeholder="Your Name"
                          className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-white/60 mb-1">Status / Bio</label>
                        <input
                          type="text"
                          value={editBio}
                          onChange={(e) => setEditBio(e.target.value)}
                          placeholder="Your short bio..."
                          className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-white/60 mb-1">Change Profile Picture (Avatar URL)</label>
                        <input
                          type="text"
                          value={avatarPreset}
                          onChange={(e) => setAvatarPreset(e.target.value)}
                          placeholder="https://..."
                          className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Google Account Information */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                    <Shield size={14} className="text-cyan-400" />
                    <span>Google & Security Authentication</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-white/40 block text-[10px]">Provider</span>
                      <span className="text-white font-semibold flex items-center gap-1 mt-0.5">
                        <Globe size={12} className="text-cyan-400" />
                        <span>{user?.provider === "google" ? "Google Identity Services" : "Standard Account"}</span>
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-white/40 block text-[10px]">Security Clearance</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                        <CheckCircle2 size={12} />
                        <span>Verified Session</span>
                      </span>
                    </div>
                  </div>
                </div>
                {/* User Device Profile & Telemetry (डिवाइस टैब) */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                      <Smartphone size={14} className="text-violet-400" />
                      <span>Device & Hardware Profile (डिवाइस जानकारी)</span>
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      Device Tab
                    </span>
                  </div>
                  <p className="text-xs text-white/60">
                    View complete device hardware specs, display resolution, audio/mic capability & network telemetry.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenDeviceModal) {
                        onOpenDeviceModal();
                      }
                    }}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-[1.01]"
                  >
                    <Smartphone size={14} />
                    <span>Open Device Specifications / डिवाइस विवरण खोलें</span>
                  </button>
                </div>

                {/* Report a Problem / Bug Report (Direct to Developer Telegram) */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/30 via-black/40 to-amber-950/30 border border-red-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-2">
                      <Bug size={14} className="text-red-400" />
                      <span>Report a Problem (समस्या / बग रिपोर्ट)</span>
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                      Telegram Bot
                    </span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Facing an issue with Voice, Chat, Calls, or Screen Share? Submit a direct report to Developer Royal Ankit Ahiran's Telegram.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsReportingBug(!isReportingBug);
                      setActiveView("settings");
                    }}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-red-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-[1.01]"
                  >
                    <Bug size={14} />
                    <span>🐞 Report a Problem / समस्या रिपोर्ट करें</span>
                  </button>
                </div>

                {/* DEVELOPER-ONLY ADMIN PANEL (Only visible to verified developer Royal Ankit Ahiran) */}
                {isCurrentSessionDeveloper(user?.email) && onOpenAdminPanel && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 via-purple-950/30 to-red-950/40 border border-red-500/50 space-y-2.5 shadow-lg shadow-red-950/30">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider flex items-center gap-2">
                        <Shield size={14} className="text-red-400" />
                        <span>Developer Admin Panel (कंट्रोल सेंटर)</span>
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/30 text-red-200 border border-red-400/40">
                        Admin Final
                      </span>
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Real-time user analytics, system toggles, broadcast publisher, and bug reports triage.
                    </p>
                    <button
                      type="button"
                      id="btn-admin-final-profile"
                      onClick={() => {
                        onClose();
                        onOpenAdminPanel();
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600/80 via-rose-600/80 to-purple-600/80 hover:from-red-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:scale-[1.01]"
                    >
                      <Shield size={14} />
                      <span>Open Admin Final / Developer Control Center</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Sign Out Button */}
              <div className="pt-6 border-t border-white/10 mt-6">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full py-3 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 hover:text-red-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut size={16} />
                  <span>Sign Out / लॉगआउट</span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 3: SETTINGS
              ========================================================================= */}
          {activeView === "settings" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar z-10 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveView("chat")}
                  className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                >
                  <ArrowLeft size={16} />
                  <span>Back to Chat</span>
                </button>
                <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">Settings</span>
              </div>

              {/* APPEARANCE */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-violet-400" />
                  <span>Appearance</span>
                </h4>
                <div className="flex items-center justify-between text-xs py-1">
                  <div>
                    <span className="font-semibold text-white block">Theme Mode</span>
                    <span className="text-[11px] text-white/50">Current aesthetic style</span>
                  </div>
                  <div className="flex gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
                    {(["dark", "cyberpunk", "amoled"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThemeMode(t)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold transition-colors cursor-pointer ${
                          themeMode === t ? "bg-violet-600 text-white" : "text-white/50 hover:text-white"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* VOICE */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <Volume2 size={14} className="text-emerald-400" />
                  <span>Voice & Speech Synthesis</span>
                </h4>

                {/* Auto-Speak ON/OFF */}
                <div className="flex items-center justify-between text-xs py-1">
                  <div>
                    <span className="font-semibold text-white block">Auto-Speak Responses (TTS)</span>
                    <span className="text-[11px] text-white/50">Zoya speaks incoming replies out loud</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isAutoSpeakEnabled;
                      setIsAutoSpeakEnabled(next);
                      try {
                        localStorage.setItem("zoya_chat_auto_speak", String(next));
                      } catch {}
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      isAutoSpeakEnabled ? "bg-emerald-600" : "bg-white/20"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      isAutoSpeakEnabled ? "left-6" : "left-1"
                    }`} />
                  </button>
                </div>

                {/* Master Speaker Mute Toggle */}
                {onToggleSpeaker && (
                  <div className="flex items-center justify-between text-xs py-1 border-t border-white/5 pt-2">
                    <div>
                      <span className="font-semibold text-white block">Master Speaker Audio Output</span>
                      <span className="text-[11px] text-white/50">{isSpeakerMuted ? "Speaker is Muted (आवाज बंद)" : "Speaker is Active (आवाज चालू)"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleSpeaker}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSpeakerMuted
                          ? "bg-red-500/20 border-red-500/40 text-red-300"
                          : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      }`}
                    >
                      {isSpeakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      <span>{isSpeakerMuted ? "Unmute" : "Mute"}</span>
                    </button>
                  </div>
                )}

                {/* Speech Speed */}
                <div className="flex items-center justify-between text-xs py-1 border-t border-white/5 pt-2">
                  <div>
                    <span className="font-semibold text-white block">Speech Speed</span>
                    <span className="text-[11px] text-white/50">{voiceSpeed}x normal playback</span>
                  </div>
                  <div className="flex gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
                    {[0.8, 1.0, 1.2, 1.5].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setVoiceSpeed(spd)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                          voiceSpeed === spd ? "bg-emerald-600 text-white" : "text-white/50 hover:text-white"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-t border-white/5 pt-2">
                  <div>
                    <span className="font-semibold text-white block">Voice Model</span>
                    <span className="text-[11px] text-white/50">Gemini Live Kore Voice Engine</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                    Kore (Zoya Voice)
                  </span>
                </div>
              </div>

              {/* PRIVACY & DATA */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} className="text-amber-400" />
                  <span>Privacy & Data</span>
                </h4>
                <div className="flex items-center justify-between text-xs py-1">
                  <div>
                    <span className="font-semibold text-white block">Clear Active Chat Session</span>
                    <span className="text-[11px] text-white/50">Removes messages on current screen</span>
                  </div>
                  <button
                    type="button"
                    onClick={onClearChatHistory}
                    className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-semibold cursor-pointer text-xs"
                  >
                    Clear Chat
                  </button>
                </div>
              </div>

              {/* DEVICE & HARDWARE TELEMETRY (डिवाइस टैब) */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                    <Smartphone size={14} className="text-cyan-400" />
                    <span>Device Diagnostics & Specs (डिवाइस टैब)</span>
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Device
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-1">
                  <div>
                    <span className="font-semibold text-white block">System Hardware & Audio Diagnostics</span>
                    <span className="text-[11px] text-white/50">Microphone, STT/TTS engine, display & network specs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenDeviceModal) {
                        onOpenDeviceModal();
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold cursor-pointer text-xs transition-colors shrink-0 shadow-sm"
                  >
                    View Device Tab
                  </button>
                </div>
              </div>

              {/* DEVELOPER-ONLY ADMIN PANEL (Only visible to verified developer Royal Ankit Ahiran) */}
              {isCurrentSessionDeveloper(user?.email) && onOpenAdminPanel && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/40 via-purple-950/30 to-red-950/40 border border-red-500/50 space-y-3 shadow-lg shadow-red-950/30">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider flex items-center gap-2">
                      <Shield size={14} className="text-red-400" />
                      <span>Developer Admin Panel (कंट्रोल सेंटर)</span>
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/30 text-red-200 border border-red-400/40">
                      Admin Final
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs py-1">
                    <div>
                      <span className="font-semibold text-white block">Developer Control Center</span>
                      <span className="text-[11px] text-white/50">System broadcasts, triage, and live toggles</span>
                    </div>
                    <button
                      type="button"
                      id="btn-admin-final-settings"
                      onClick={() => {
                        onClose();
                        onOpenAdminPanel();
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white font-bold cursor-pointer text-xs transition-colors shrink-0 shadow-sm"
                    >
                      Open Admin Panel
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: HELP AND FEEDBACK (Opens email to developer's configured email) */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                  <HelpCircle size={14} className="text-rose-400" />
                  <span>Help & Developer Support</span>
                </h4>

                <div className="space-y-2">
                  {/* Help Option -> Opens device's email composer addressed to DEVELOPER_EMAIL */}
                  <a
                    href={`mailto:${DEVELOPER_EMAIL}?subject=Zoya%20AI%20Assistant%20Support%20Request&body=Hello%20Royal%20Ankit%20Ahiran%2C%0A%0AMy%20question%20or%20problem%3A%0A`}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Mail size={14} className="text-cyan-400" />
                      <span>Help / Email Developer</span>
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">Open Email</span>
                  </a>

                  {/* Send Feedback / Telegram report */}
                  <button
                    type="button"
                    onClick={() => setIsReportingBug(!isReportingBug)}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Bug size={14} className="text-rose-400" />
                      <span>🐞 Report a Problem / Telegram Developer</span>
                    </span>
                    <span className="text-[10px] text-rose-400 font-mono">Direct Telegram</span>
                  </button>

                  {isReportingBug && (
                    <form onSubmit={handleSendBugReport} className="p-3.5 rounded-xl bg-black/60 border border-white/15 space-y-3 text-xs">
                      {/* Name */}
                      <div>
                        <label className="block text-[11px] font-semibold text-white/70 mb-1">Your Name (आपका नाम)</label>
                        <input
                          type="text"
                          value={bugUserName}
                          onChange={(e) => setBugUserName(e.target.value)}
                          placeholder="अपना नाम दर्ज करें (Enter your name)"
                          className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-red-500"
                          required
                        />
                      </div>

                      {/* Mobile Number */}
                      <div>
                        <label className="block text-[11px] font-semibold text-white/70 mb-1">Mobile Number (मोबाइल नंबर)</label>
                        <input
                          type="tel"
                          value={bugUserPhone}
                          onChange={(e) => setBugUserPhone(e.target.value)}
                          placeholder="अपना मोबाइल नंबर दर्ज करें (e.g. 9876543210)"
                          className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-red-500"
                          required
                        />
                      </div>

                      {/* Email Address */}
                      <div>
                        <label className="block text-[11px] font-semibold text-white/70 mb-1">Email Address (ईमेल आईडी)</label>
                        <input
                          type="email"
                          value={bugUserEmail}
                          onChange={(e) => setBugUserEmail(e.target.value)}
                          placeholder="अपना ईमेल पता दर्ज करें (Enter your email)"
                          className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-red-500"
                          required
                        />
                      </div>

                      {/* Report Category */}
                      <div>
                        <label className="block text-[11px] font-semibold text-white/70 mb-1.5">Problem Category (श्रेणी)</label>
                        <div className="grid grid-cols-2 gap-1.5">
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
                              onClick={() => setBugCategory(cat)}
                              className={`py-1 px-2 rounded-lg text-[10px] font-medium text-left transition-all border cursor-pointer truncate ${
                                bugCategory === cat
                                  ? "bg-red-500/25 border-red-500/70 text-red-200 font-semibold"
                                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Problem Description */}
                      <div>
                        <label className="block text-[11px] font-semibold text-white/70 mb-1">Problem Description (समस्या का विवरण)</label>
                        <textarea
                          rows={3}
                          value={bugMessage}
                          onChange={(e) => setBugMessage(e.target.value)}
                          placeholder="अपनी समस्या का विवरण विस्तार से लिखें..."
                          className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs text-white placeholder-white/30 focus:outline-none focus:border-red-500 resize-none"
                          required
                        />
                      </div>

                      {/* Submit Actions: Telegram + Direct Email */}
                      <div className="space-y-2 pt-1">
                        <button
                          type="submit"
                          disabled={bugSending || !bugMessage.trim()}
                          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all cursor-pointer shadow-md"
                        >
                          {bugSending ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>Sending Report...</span>
                            </>
                          ) : (
                            <>
                              <Send size={13} />
                              <span>Submit Report (टेलीग्राम पर भेजें)</span>
                            </>
                          )}
                        </button>

                        <a
                          href={`mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(`[ZOYA USER REPORT] ${bugCategory} - ${bugUserName || "User"}`)}&body=${encodeURIComponent(
                            `User Name: ${bugUserName}\nMobile Number: ${bugUserPhone}\nEmail: ${bugUserEmail}\nCategory: ${bugCategory}\n\nProblem Description:\n${bugMessage}\n\nDevice: ${typeof navigator !== "undefined" ? navigator.userAgent : "Web"}`
                          )}`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleDirectEmailBugReport();
                          }}
                          className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-white/90 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Mail size={13} className="text-cyan-400" />
                          <span>डायरेक्ट ईमेल करें (Direct Mail to Developer)</span>
                        </a>
                      </div>

                      {bugSuccess && (
                        <p className="text-[11px] text-emerald-400 font-bold text-center">
                          ✓ Report successfully dispatched to Developer Telegram!
                        </p>
                      )}
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 4: CHAT HISTORY
              ========================================================================= */}
          {activeView === "history" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar z-10 flex flex-col justify-between">
              {openedHistoryTopic ? (
                /* OPENED TOPIC CONVERSATION VIEW */
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <button
                      type="button"
                      onClick={() => setOpenedHistoryTopic(null)}
                      className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                    >
                      <ArrowLeft size={16} />
                      <span>Back to History List</span>
                    </button>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      {openedHistoryTopic.mode} Session
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <h4 className="text-sm font-bold text-white">{openedHistoryTopic.title}</h4>
                    <p className="text-[11px] text-white/50 mt-1 font-mono">
                      {new Date(openedHistoryTopic.createdAt).toLocaleString()} • {openedHistoryTopic.messageCount || openedHistoryTopic.messages.length} messages recorded
                    </p>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {openedHistoryTopic.messages.length === 0 ? (
                      <p className="text-xs text-white/40 text-center py-8">No message transcript saved for this topic.</p>
                    ) : (
                      openedHistoryTopic.messages.map((m, idx) => {
                        const isUser = m.sender === "user";
                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                              isUser ? "bg-violet-950/20 border-violet-500/30 ml-6" : "bg-white/5 border-white/10 mr-6"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] text-white/40 font-mono">
                              <span className={isUser ? "text-violet-300 font-bold" : "text-emerald-300 font-bold"}>
                                {isUser ? (user?.displayName || "You") : "Zoya AI"}
                              </span>
                              <span>{m.timestamp || "Transcript"}</span>
                            </div>
                            <p className="text-white/90 whitespace-pre-wrap leading-relaxed">{m.text}</p>
                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                              {!isUser && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSpeak(`hist_${idx}`, m.text)}
                                  className="text-white/40 hover:text-white flex items-center gap-1 text-[10px] cursor-pointer"
                                  title="Listen"
                                >
                                  <Volume2 size={11} />
                                  <span>Listen</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(`hist_${idx}`, m.text)}
                                className="text-white/40 hover:text-white flex items-center gap-1 text-[10px] cursor-pointer"
                                title="Copy"
                              >
                                {copiedMsgId === `hist_${idx}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareMessage(`hist_${idx}`, m.text)}
                                className="text-white/40 hover:text-white flex items-center gap-1 text-[10px] cursor-pointer"
                                title="Share"
                              >
                                {sharedMsgId === `hist_${idx}` ? <Check size={11} className="text-emerald-400" /> : <Share2 size={11} />}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenedHistoryTopic(null);
                        setActiveView("chat");
                      }}
                      className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors cursor-pointer text-center"
                    >
                      Return to Live Chat / चैट पर जाएं
                    </button>
                  </div>
                </div>
              ) : (
                /* ALL HISTORY TOPICS LIST */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <button
                      type="button"
                      onClick={() => setActiveView("chat")}
                      className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                    >
                      <ArrowLeft size={16} />
                      <span>Back to Chat</span>
                    </button>
                    <span className="text-xs font-mono uppercase tracking-wider text-amber-400">Chat History</span>
                  </div>

                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search past conversations..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50"
                    />
                    {historySearch && (
                      <button
                        type="button"
                        onClick={() => setHistorySearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {userFilteredTopics.length === 0 ? (
                    <div className="py-12 text-center text-white/40 space-y-2">
                      <History size={32} className="mx-auto opacity-40" />
                      <p className="text-xs">No saved conversations found for this account.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {groupedTopics.today.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase font-bold text-amber-400/90 tracking-wider">
                            Today
                          </span>
                          <div className="space-y-1.5">
                            {groupedTopics.today.map((t) => (
                              <div
                                key={t.id}
                                onClick={() => setOpenedHistoryTopic(t)}
                                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                              >
                                <div className="min-w-0">
                                  <h5 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                    {t.title}
                                  </h5>
                                  <p className="text-[10px] text-white/50 mt-0.5">
                                    {new Date(t.updatedAt || t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • {t.messageCount} messages
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                  {t.mode}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {groupedTopics.yesterday.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase font-bold text-white/50 tracking-wider">
                            Yesterday
                          </span>
                          <div className="space-y-1.5">
                            {groupedTopics.yesterday.map((t) => (
                              <div
                                key={t.id}
                                onClick={() => setOpenedHistoryTopic(t)}
                                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                              >
                                <div className="min-w-0">
                                  <h5 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                    {t.title}
                                  </h5>
                                  <p className="text-[10px] text-white/50 mt-0.5">
                                    {t.messageCount} messages
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-white/10 text-white/70 border border-white/10 shrink-0">
                                  {t.mode}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {groupedTopics.older.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase font-bold text-white/40 tracking-wider">
                            Older Conversations
                          </span>
                          <div className="space-y-1.5">
                            {groupedTopics.older.map((t) => (
                              <div
                                key={t.id}
                                onClick={() => setOpenedHistoryTopic(t)}
                                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                              >
                                <div className="min-w-0">
                                  <h5 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                    {t.title}
                                  </h5>
                                  <p className="text-[10px] text-white/40 mt-0.5">
                                    {new Date(t.createdAt).toLocaleDateString()} • {t.messageCount} messages
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-white/10 text-white/60 border border-white/10 shrink-0">
                                  {t.mode}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Clear History Control */}
              {!openedHistoryTopic && (
                <div className="pt-4 border-t border-white/10 mt-6">
                  {!showConfirmClear ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmClear(true)}
                      className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Clear All Chat History</span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-center space-y-2">
                      <p className="text-xs text-red-200">Are you sure you want to clear your saved history?</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          type="button"
                          onClick={async () => {
                            await onClearChatHistory();
                            setShowConfirmClear(false);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Yes, Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConfirmClear(false)}
                          className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 5: ABOUT ZOYA
              ========================================================================= */}
          {activeView === "about" && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar z-10 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveView("chat")}
                  className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium transition-colors cursor-pointer"
                >
                  <ArrowLeft size={16} />
                  <span>Back to Chat</span>
                </button>
                <span className="text-xs font-mono uppercase tracking-wider text-rose-400">About Zoya</span>
              </div>

              {/* Hero Branding */}
              <div className="text-center py-4 space-y-3">
                <div className="w-20 h-20 rounded-full overflow-hidden shadow-2xl shadow-rose-500/20 ring-2 ring-rose-500/60 mx-auto flex items-center justify-center bg-white p-1">
                  <ZoyaLogo size={76} showGlow={false} className="w-full h-full border-none shadow-none" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-wider">
                    ZOYA AI VOICE ASSISTANT
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 mt-1 inline-block">
                    Version 3.4.2 (Production Release)
                  </span>
                </div>
                <p className="text-xs text-white/70 max-w-md mx-auto leading-relaxed">
                  Zoya is an advanced multilingual AI assistant built with real-time bidirectional audio streaming, long-term memory synthesis, vision integration, and natural emotional comprehension.
                </p>
              </div>

              {/* Main Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <PhoneCall size={13} className="text-emerald-400" />
                    <span>Real-Time Voice Calling</span>
                  </span>
                  <p className="text-[11px] text-white/60">
                    Live bidirectional speech powered by Gemini Kore voice models.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Heart size={13} className="text-rose-400" />
                    <span>Long-Term Memory Engine</span>
                  </span>
                  <p className="text-[11px] text-white/60">
                    Remembers user promises, facts, and past conversations seamlessly.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Globe size={13} className="text-cyan-400" />
                    <span>Multilingual Intelligence</span>
                  </span>
                  <p className="text-[11px] text-white/60">
                    Natural conversational fluency in Hindi, English, Hinglish, and Bhojpuri.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Shield size={13} className="text-violet-400" />
                    <span>Secure Cloud Sync</span>
                  </span>
                  <p className="text-[11px] text-white/60">
                    Encrypted user profiles with Firestore authorization rules.
                  </p>
                </div>
              </div>

              {/* Terms & Privacy Policies */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-white/80 block uppercase tracking-wider text-[11px]">
                  Terms of Service & Privacy
                </span>
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Your conversations and memories are stored securely under individual account isolation. No personal data, passwords, or authentication secrets are exposed or sold.
                </p>
              </div>

              {/* DEVELOPER SECTION & THEMED SOCIAL LINKS */}
              <div className="p-5 rounded-2xl bg-gradient-to-b from-white/10 to-black/60 border border-white/15 space-y-4 shadow-xl">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400 font-bold block">
                    Developer
                  </span>
                  <h4 className="text-base font-black text-white mt-0.5">
                    Royal Ankit Ahiran
                  </h4>
                  <p className="text-xs text-white/60">
                    Python Developer & Security Explorer • Bihar, India
                  </p>
                </div>

                {/* Heading: CONNECT WITH DEVELOPER */}
                <div className="pt-2 border-t border-white/10">
                  <h5 className="text-xs font-mono uppercase font-black text-white/90 tracking-wider mb-3 flex items-center gap-2">
                    <Sparkles size={13} className="text-rose-400" />
                    <span>Connect with Developer</span>
                  </h5>

                  {/* Themed Social Platform Cards (NO raw URLs visible!) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <a
                      href="https://t.me/Royal_ankit_ahiran"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Send size={15} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-cyan-300">Telegram</span>
                        <span className="block text-[10px] text-white/40">Direct Message</span>
                      </div>
                    </a>

                    <a
                      href="https://t.me/+XhTI-i0gXHU3ZmQ1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Radio size={15} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-cyan-300">Channel</span>
                        <span className="block text-[10px] text-white/40">Updates & Tools</span>
                      </div>
                    </a>

                    <a
                      href="https://youtube.com/@royal_ankit_ahiran?si=dIw5oi-NheHHUPmx"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Play size={15} className="fill-red-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-red-300">YouTube</span>
                        <span className="block text-[10px] text-white/40">Tutorials</span>
                      </div>
                    </a>

                    <a
                      href="https://wa.me/royalankitahiran"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <MessageCircle size={15} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-emerald-300">WhatsApp</span>
                        <span className="block text-[10px] text-white/40">Quick Chat</span>
                      </div>
                    </a>

                    <a
                      href="https://www.instagram.com/royal_ankit_ahiran?igsh=bGZ4ODRyaTE0b2Nq"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-pink-500/20 border border-white/10 hover:border-pink-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Heart size={15} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-pink-300">Instagram</span>
                        <span className="block text-[10px] text-white/40">Follow Profile</span>
                      </div>
                    </a>

                    <a
                      href="https://royalankitahiranl.netlify.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-white/5 hover:bg-violet-500/20 border border-white/10 hover:border-violet-500/50 transition-all flex items-center gap-2.5 text-white group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Globe size={15} />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-xs group-hover:text-violet-300">Portfolio</span>
                        <span className="block text-[10px] text-white/40">Official Website</span>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full Screen Image Viewer Lightbox Modal */}
          <AnimatePresence>
            {selectedFullImage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                onClick={() => setSelectedFullImage(null)}
              >
                <div
                  className="relative max-w-4xl max-h-[90vh] bg-black/60 rounded-2xl border border-white/20 p-2 overflow-hidden flex flex-col items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFullImage(null)}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/70 hover:bg-white/20 text-white z-10 transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <img
                    src={selectedFullImage}
                    alt="Full View"
                    className="max-h-[80vh] w-auto object-contain rounded-xl"
                  />
                  <div className="mt-2 w-full flex justify-end gap-2 px-2">
                    <a
                      href={selectedFullImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink size={13} />
                      <span>Open Original</span>
                    </a>
                    <a
                      href={selectedFullImage}
                      download={`zoya-image-${Date.now()}.jpg`}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* =========================================================================
              ADD TO CHAT BOTTOM SHEET (Camera, Photos, Files)
              ========================================================================= */}
          <AnimatePresence>
            {showAddSheet && (
              <>
                {/* Backdrop to prevent click-through & enable clean dismissal */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    setShowAddSheet(false);
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 cursor-pointer"
                />

                {/* Bottom Sheet Card */}
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 320 }}
                  className="fixed inset-x-0 bottom-0 max-w-lg mx-auto bg-[#13082a]/98 backdrop-blur-2xl border-t border-violet-500/40 rounded-t-[30px] p-5 pb-8 shadow-[0_-15px_50px_rgba(139,92,246,0.3)] z-50 text-white"
                >
                  {/* Top Drag / Swipe Handle */}
                  <div
                    className="w-12 h-1.5 rounded-full bg-white/20 hover:bg-white/40 mx-auto mb-3.5 cursor-grab active:cursor-grabbing transition-colors"
                    onClick={() => {
                      setShowAddSheet(false);
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    title="Swipe down to close"
                  />

                  {/* Header Title & Close Button */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                      <span className="font-bold text-sm sm:text-base tracking-wide text-white">Add to Chat</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddSheet(false);
                        setTimeout(() => inputRef.current?.focus(), 100);
                      }}
                      className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors cursor-pointer"
                      title="Close"
                      aria-label="Close add menu"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* 3 Large Card-Style Action Buttons ONLY */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {/* 1. Camera */}
                    <button
                      type="button"
                      onClick={handleTriggerCamera}
                      className="group flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-white/5 hover:bg-violet-950/60 border border-white/10 hover:border-violet-400/60 transition-all duration-200 active:scale-95 shadow-sm hover:shadow-violet-900/40 hover:shadow-lg cursor-pointer"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white mb-2.5 shadow-md shadow-violet-900/40 group-hover:scale-105 transition-transform">
                        <Camera size={24} />
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white/95 group-hover:text-violet-200">Camera</span>
                    </button>

                    {/* 2. Photos */}
                    <button
                      type="button"
                      onClick={handleTriggerPhotos}
                      className="group flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-white/5 hover:bg-violet-950/60 border border-white/10 hover:border-violet-400/60 transition-all duration-200 active:scale-95 shadow-sm hover:shadow-violet-900/40 hover:shadow-lg cursor-pointer"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center text-white mb-2.5 shadow-md shadow-pink-900/40 group-hover:scale-105 transition-transform">
                        <Image size={24} />
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white/95 group-hover:text-pink-200">Photos</span>
                    </button>

                    {/* 3. Files */}
                    <button
                      type="button"
                      onClick={handleTriggerFiles}
                      className="group flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-white/5 hover:bg-violet-950/60 border border-white/10 hover:border-violet-400/60 transition-all duration-200 active:scale-95 shadow-sm hover:shadow-violet-900/40 hover:shadow-lg cursor-pointer"
                    >
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white mb-2.5 shadow-md shadow-cyan-900/40 group-hover:scale-105 transition-transform">
                        <FileText size={24} />
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white/95 group-hover:text-cyan-200">Files</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* =========================================================================
              IN-APP LIVE CAMERA VIEWFINDER MODAL
              ========================================================================= */}
          <AnimatePresence>
            {isLiveCameraOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between p-4 sm:p-6"
              >
                {/* Top bar: title + switch camera + close */}
                <div className="flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <Camera className="text-violet-400" size={20} />
                    <span className="font-bold text-white text-sm">Zoya Camera</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      title="Flip Camera"
                    >
                      <SwitchCamera size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={closeLiveCamera}
                      className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                      title="Close Camera"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Viewfinder Canvas & Video */}
                <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden rounded-2xl bg-black border border-white/10">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {liveCameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-red-300 text-sm">
                      {liveCameraError}
                    </div>
                  )}
                </div>

                {/* Capture Shutter Button */}
                <div className="flex items-center justify-center gap-6 pb-4">
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    className="w-18 h-18 rounded-full border-4 border-white bg-violet-600 hover:bg-violet-500 active:scale-95 shadow-xl shadow-violet-900/60 flex items-center justify-center cursor-pointer transition-all"
                    title="Capture Photo"
                  >
                    <div className="w-12 h-12 rounded-full bg-white" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
