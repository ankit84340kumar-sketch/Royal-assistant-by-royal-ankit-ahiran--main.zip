import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, MicOff, Loader2, Volume2, VolumeX, Send, History, 
  Monitor, PhoneCall, ExternalLink, X, User, MessageSquare, Smartphone, Award,
  Sparkles, Radio, Wrench, AlertTriangle, Bell, Clock, ScreenShare, Share2
} from "lucide-react";
import { 
  getInitialTrialState, 
  syncTrialStateWithRemote, 
  markTrialEngagement, 
  persistTrialUsage, 
  TRIAL_TOTAL_DURATION_SECONDS, 
  TrialState 
} from "./services/trialService";
import { getRoyalResponse, getRoyalAudio, resetRoyalSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { smartSearchAndOpenWebsite, isWebsitePurposeQuery } from "./services/smartWebsiteService";
import { LiveSessionManager } from "./services/liveService";
import { openAppOrWeb } from "./services/appLauncher";
import Visualizer from "./components/voice/Visualizer";
import PermissionModal from "./components/permissions/PermissionModal";
import DeviceInfoModal from "./components/settings/DeviceInfoModal";
import PortfolioEmbed from "./components/common/PortfolioEmbed";
import UserSettingsModal from "./components/settings/UserSettingsModal";
import VoiceHistoryModal from "./components/chat/VoiceHistoryModal";
import AdminPanelModal from "./components/admin/AdminPanelModal";
import DeveloperContactModal from "./components/common/DeveloperContactModal";
import CallScreenOverlay from "./components/voice/CallScreenOverlay";
import LoginView from "./components/auth/LoginView";
import ZoyaLogo from "./components/common/ZoyaLogo";
import ChatModal from "./components/chat/ChatModal";
import FreeTrialTimer from "./components/common/FreeTrialTimer";
import { playPCM, stopAllSpeech } from "./services/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import { getDeviceInfo, loadChatHistory, saveChatHistory, clearChatHistory, 
  ChatMessage, DeviceInfo 
} from "./services/deviceManager";
export interface FileAnalysisAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  extractedText?: string;
}
import { 
  getPersistedUser, 
  subscribeAuthStatus, 
  AppUserProfile, 
  saveMessageToFirestore,
  subscribeUserChatHistory,
  clearUserChatHistoryInFirestore,
  VoiceTopicSession,
  subscribeUserTopics,
  clearUserTopicsInFirestore,
  deleteSingleTopic,
  addMessageToTopic,
  subscribeSystemBroadcast,
  subscribeAppSystemSettings,
  AppSystemSettings,
  SystemBroadcastData
} from "./services/firebaseService";
import { 
  startTelegramCommandListener, 
  stopTelegramCommandListener 
} from "./services/developerDispatchService";
import { 
  registerCallOverlayListener, 
  CallOverlayState, 
  ContactEntry, 
  placeNativePhoneCall, 
  clearPendingCallState 
} from "./services/contactService";
import { isCurrentSessionDeveloper } from "./services/developerVerificationService";

type AppState = "idle" | "listening" | "processing" | "speaking";

// Soft, short "tu-ing" countdown chime for the final 5 seconds
function playSoftTuIngSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {}
}

export default function App() {
  // Authentication & Persistent User Profile
  const [user, setUser] = useState<AppUserProfile | null>(() => getPersistedUser());
  const [showUserSettingsModal, setShowUserSettingsModal] = useState(false);
  const [showVoiceHistoryModal, setShowVoiceHistoryModal] = useState(false);
  const [showAdminPanelModal, setShowAdminPanelModal] = useState(false);
  const [showDeveloperContactModal, setShowDeveloperContactModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const showChatModalRef = useRef(showChatModal);
  useEffect(() => {
    showChatModalRef.current = showChatModal;
  }, [showChatModal]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginNoticeMessage, setLoginNoticeMessage] = useState<string | undefined>(undefined);
  const [topics, setTopics] = useState<VoiceTopicSession[]>([]);
  const currentVoiceTopicIdRef = useRef<string | null>(null);
  const currentTextTopicIdRef = useRef<string | null>(null);
  const lastTextTimeRef = useRef<number>(0);

  // 2-Minute Free Trial State for Unregistered / Guest Users
  const [trialState, setTrialState] = useState<TrialState>(() => getInitialTrialState());

  // Real-time Phone Call Overlay State
  const [callOverlayState, setCallOverlayState] = useState<CallOverlayState>({
    isOpen: false,
    status: "searching",
    query: "",
  });

  // Real-time Remote System Settings & Broadcasts
  const [systemSettings, setSystemSettings] = useState<AppSystemSettings>({
    voiceCallingEnabled: true,
    screenVisionEnabled: true,
    wakeWordEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: "",
    updatedAt: new Date().toISOString(),
  });
  const [activeBroadcast, setActiveBroadcast] = useState<SystemBroadcastData | null>(null);
  const [dismissedBroadcastTitle, setDismissedBroadcastTitle] = useState<string | null>(null);

  // Subscribe to Call Overlay events
  useEffect(() => {
    const unsubscribe = registerCallOverlayListener((newState) => {
      setCallOverlayState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to real-time system controls and broadcasts from Firestore
  useEffect(() => {
    // Start continuous two-way Telegram Admin AI & developer listener
    startTelegramCommandListener(5000);

    const unsubSettings = subscribeAppSystemSettings((settings) => {
      if (settings) {
        setSystemSettings(settings);
      }
    });

    const unsubBroadcast = subscribeSystemBroadcast((broadcast) => {
      setActiveBroadcast(broadcast);
    });

    return () => {
      unsubSettings();
      unsubBroadcast();
      stopTelegramCommandListener();
    };
  }, []);

  // Sync auth state listener
  useEffect(() => {
    const unsubscribe = subscribeAuthStatus((currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Immediate clean session wipe on logout: hide all private account history
        setMessages([]);
        messagesRef.current = [];
        setTopics([]);
        stopAllSpeech();
        try {
          localStorage.removeItem("Royal_chat_history");
        } catch {}
      }
    });
    return () => unsubscribe();
  }, []);

  const [appState, setAppState] = useState<AppState>("idle");
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => getDeviceInfo());
  
  // Chat messages tied strictly to active authenticated user
  const activeUserId = user ? user.uid : "guest";
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return user?.uid ? loadChatHistory(user.uid) : [];
  });
  const messagesRef = useRef(messages);

  // Sync messages with local storage only for authenticated users (namespaced by user.uid)
  useEffect(() => {
    messagesRef.current = messages;
    if (user?.uid) {
      saveChatHistory(messages, user.uid);
    }
  }, [messages, user?.uid]);

  // ---------------------------------------------------------------------------
  // 2-MINUTE FREE TRIAL ENGINE (Unregistered / Guest Users)
  // ---------------------------------------------------------------------------
  // 1. Sync trial state with IndexedDB & Firestore on load to prevent refresh resetting
  useEffect(() => {
    if (!user) {
      syncTrialStateWithRemote((synced) => {
        setTrialState(synced);
      });
    }
  }, [user]);

  // Load and subscribe to real-time chat history from Firestore strictly for the logged-in account
  useEffect(() => {
    if (user?.uid) {
      // 1. Immediately load local cache for this specific user
      const local = loadChatHistory(user.uid);
      setMessages(local && local.length > 0 ? local : []);
      
      // 2. Subscribe to Firestore updates for this user
      const unsubscribe = subscribeUserChatHistory(user.uid, (firestoreMsgs) => {
        if (firestoreMsgs && firestoreMsgs.length > 0) {
          setMessages(firestoreMsgs);
          saveChatHistory(firestoreMsgs, user.uid);
        } else {
          const cached = loadChatHistory(user.uid);
          setMessages(cached || []);
        }
      });
      return () => unsubscribe();
    } else {
      // Logged out / unauthenticated: Clear chat messages completely from memory and session
      setMessages([]);
      messagesRef.current = [];
    }
  }, [user?.uid]);

  // Load and subscribe to real-time conversation topics from Firestore/local if user is logged in
  useEffect(() => {
    if (user?.uid) {
      const unsubscribe = subscribeUserTopics(user.uid, (userTopics) => {
        if (userTopics) {
          setTopics(userTopics);
        }
      });
      return () => unsubscribe();
    } else {
      setTopics([]);
    }
  }, [user?.uid]);

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    if (liveSessionRef.current) {
      liveSessionRef.current.setMuted(newMuteState);
    }
  };

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [screenErrorMsg, setScreenErrorMsg] = useState<string | null>(null);
  const [liveCaption, setLiveCaption] = useState<{ sender: "user" | "Royal"; text: string } | null>(null);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  useEffect(() => {
    const handleOpenPortfolio = () => {
      setShowPortfolioModal(true);
    };
    window.addEventListener("zoya:open-portfolio", handleOpenPortfolio);
    return () => {
      window.removeEventListener("zoya:open-portfolio", handleOpenPortfolio);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2-MINUTE FREE TRIAL ENGINE (Unregistered / Guest Users)
  // ---------------------------------------------------------------------------
  // Combined trial countdown timer (ticks ONLY when actively engaged: call active OR chat open)
  useEffect(() => {
    // Logged-in users have full, unrestricted access without any timer
    if (user) return;

    const isEngaged = isSessionActive || showChatModal;
    if (!isEngaged) return;

    // Mark trial engagement on first interaction
    markTrialEngagement(trialState.deviceId);

    // If trial was already exhausted from previous visit, terminate immediately & prompt login
    if (trialState.remainingSeconds <= 0) {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
      setIsSessionActive(false);
      setShowChatModal(false);
      setAppState("idle");
      stopAllSpeech();
      setLoginNoticeMessage("Your 2-minute free trial has ended. Please sign in to continue using Zoya.");
      setShowLoginModal(true);
      return;
    }

    const timer = setInterval(() => {
      setTrialState((prev) => {
        if (prev.remainingSeconds <= 0) {
          clearInterval(timer);
          return prev;
        }

        const nextUsed = prev.usedSeconds + 1;
        const nextRemaining = Math.max(0, TRIAL_TOTAL_DURATION_SECONDS - nextUsed);
        const isExhausted = nextRemaining <= 0;

        // Persist periodically across localStorage, IndexedDB, and Firestore
        persistTrialUsage(prev.deviceId, nextUsed);

        if (isExhausted) {
          clearInterval(timer);
          // Immediately terminate active session
          if (liveSessionRef.current) {
            liveSessionRef.current.stop();
          }
          setIsSessionActive(false);
          setShowChatModal(false);
          setAppState("idle");
          stopAllSpeech();
          setLoginNoticeMessage("Your 2-minute free trial has ended. Please continue with Google or Sign In to get unlimited access to Zoya.");
          setShowLoginModal(true);
        }

        return {
          ...prev,
          usedSeconds: nextUsed,
          remainingSeconds: nextRemaining,
          isEngaged: true,
          isExhausted,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [user, isSessionActive, showChatModal, trialState.deviceId]);

  const createMessage = (sender: "user" | "Royal", text: string): ChatMessage => {
    const msg: ChatMessage = {
      id: Date.now().toString() + "-" + Math.random().toString(36).substr(2, 5),
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      userId: activeUserId,
      createdAt: Date.now()
    };
    if (user?.uid) {
      saveMessageToFirestore(user.uid, msg);
    }
    return msg;
  };

  const handleTextCommand = useCallback(async (
    finalTranscript: string, 
    isFromChatModal = false,
    attachment?: FileAnalysisAttachment | null,
    onStreamChunk?: (chunkText: string, msgId?: string) => void
  ) => {
    if (!user) {
      if (trialState.remainingSeconds <= 0) {
        setAppState("idle");
        setLoginNoticeMessage("Your 2-minute free trial has ended. Please sign in to continue chatting with Zoya.");
        setShowLoginModal(true);
        return;
      }
      markTrialEngagement(trialState.deviceId);
    }

    if (!finalTranscript.trim() && !attachment) {
      setAppState("idle");
      return;
    }

    const displayText = finalTranscript || (attachment ? `[Attached file: ${attachment.name}]` : "");
    const userMsg = createMessage("user", displayText);
    if (attachment) {
      userMsg.attachment = {
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
      };
    }
    setMessages((prev) => [...prev, userMsg]);
    
    // Maintain active text topic session (reset after 30 min of inactivity)
    if (!currentTextTopicIdRef.current || Date.now() - lastTextTimeRef.current > 30 * 60 * 1000) {
      currentTextTopicIdRef.current = "topic_text_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    }
    lastTextTimeRef.current = Date.now();
    const activeTextTopicId = currentTextTopicIdRef.current;

    if (user?.uid) {
      addMessageToTopic(user.uid, activeTextTopicId, {
        sender: "user",
        text: displayText,
        mode: "text",
      }).catch((err) => console.warn("Failed to record text message to topic:", err));
    }
    
    // If live session is active and no attachment, send text through it
    if (isSessionActive && liveSessionRef.current && !attachment) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for commands (app opening, calls, quiz, telegram dispatch, hacking refusal, etc.)
    let commandResult: any = (!attachment && finalTranscript) ? processCommand(finalTranscript) : { action: undefined };

    // If no direct command matched, check if user is describing a website by purpose or government scheme
    if (!commandResult.action && !attachment && isWebsitePurposeQuery(finalTranscript)) {
      try {
        const dynamicWeb = await smartSearchAndOpenWebsite(finalTranscript);
        if (dynamicWeb.found && dynamicWeb.appLaunchConfig) {
          commandResult = {
            action: dynamicWeb.responseMessage,
            url: dynamicWeb.url,
            appLaunchConfig: dynamicWeb.appLaunchConfig,
            isBrowserAction: true,
            type: "navigation",
          };
        } else if (dynamicWeb.isAmbiguous && dynamicWeb.clarifyingQuestion) {
          commandResult = {
            action: dynamicWeb.clarifyingQuestion,
            isBrowserAction: false,
          };
        }
      } catch (webErr) {
        console.warn("Smart website search notice:", webErr);
      }
    }

    let responseText = "";

    if (commandResult.action) {
      responseText = commandResult.action;
      const aiMsg = createMessage("Royal", responseText);
      setMessages((prev) => [...prev, aiMsg]);
      
      if (user?.uid && responseText.trim()) {
        addMessageToTopic(user.uid, activeTextTopicId, {
          sender: "Royal",
          text: responseText,
          mode: "text",
        }).catch((err) => console.warn("Failed to record command response to topic:", err));
      }
      
      // CRITICAL AUDIO SEPARATION: Only play background voice if NOT inside the Chat Modal
      const isChatActive = isFromChatModal || showChatModalRef.current;
      if (!isSpeakerMuted && !isChatActive) {
        setAppState("speaking");
        const audioBase64 = await getRoyalAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      if (commandResult.isBrowserAction) {
        setTimeout(() => {
          if (commandResult.appLaunchConfig) {
            openAppOrWeb(commandResult.appLaunchConfig);
          } else if (commandResult.url) {
            window.open(commandResult.url, "_blank");
          }
        }, 1200);
      }
    } else {
      // 2. General Chit-Chat & Research via Gemini
      let aiMsgId: string | null = null;
      let finalSources: Array<{ title: string; url: string; snippet?: string; sourceName?: string }> = [];

      responseText = await getRoyalResponse(
        finalTranscript,
        messagesRef.current,
        user?.email,
        (partialText) => {
          if (!aiMsgId) {
            const initialMsg = createMessage("Royal", partialText);
            aiMsgId = initialMsg.id;
            setMessages((prev) => [...prev, initialMsg]);
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, text: partialText } : m))
            );
          }
          if (onStreamChunk && aiMsgId) {
            onStreamChunk(partialText, aiMsgId);
          }
        },
        attachment,
        (resolvedSources) => {
          finalSources = resolvedSources;
        }
      );

      if (!aiMsgId) {
        const aiMsg = createMessage("Royal", responseText);
        if (finalSources.length > 0) {
          aiMsg.sources = finalSources;
          aiMsg.toolMetadata = {
            type: "web_search",
            sources: finalSources,
          };
          if (user?.uid) {
            saveMessageToFirestore(user.uid, aiMsg).catch(() => {});
          }
        }
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const updatedMetadata = finalSources.length > 0 ? { type: "web_search" as const, sources: finalSources } : undefined;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: responseText,
                  sources: finalSources.length > 0 ? finalSources : m.sources,
                  toolMetadata: updatedMetadata || m.toolMetadata,
                }
              : m
          )
        );
        if (user?.uid) {
          const finalMsgToSave: ChatMessage = {
            id: aiMsgId,
            sender: "Royal",
            text: responseText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            userId: user.uid,
            createdAt: Date.now(),
            sources: finalSources.length > 0 ? finalSources : undefined,
            toolMetadata: updatedMetadata,
          };
          saveMessageToFirestore(user.uid, finalMsgToSave).catch(() => {});
        }
      }
      
      if (user?.uid && responseText.trim()) {
        addMessageToTopic(user.uid, activeTextTopicId, {
          sender: "Royal",
          text: responseText,
          mode: "text",
        }).catch((err) => console.warn("Failed to record AI response to topic:", err));
      }
      
      // CRITICAL AUDIO SEPARATION: If ChatModal is open or message was sent from chat, do NOT play voice in App.tsx!
      const isChatActive = isFromChatModal || showChatModalRef.current;
      if (!isSpeakerMuted && !isChatActive) {
        setAppState("speaking");
        const audioBase64 = await getRoyalAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isSpeakerMuted, isSessionActive, activeUserId, user?.uid, trialState.remainingSeconds, trialState.deviceId]);

  // Regenerate Response handler for Chat Modal
  const handleRegenerateCommand = useCallback(async (
    userPrompt: string, 
    zoyaMsgId: string,
    onStreamChunk?: (chunkText: string, msgId?: string) => void
  ) => {
    if (!userPrompt.trim()) return;
    setAppState("processing");

    try {
      const activeTextTopicId = currentTextTopicIdRef.current || "topic_text_" + Date.now();
      let regenSources: Array<{ title: string; url: string; snippet?: string; sourceName?: string }> = [];

      const newResponseText = await getRoyalResponse(
        userPrompt,
        messagesRef.current.filter((m) => m.id !== zoyaMsgId),
        user?.email,
        (partialText) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === zoyaMsgId
                ? {
                    ...m,
                    text: partialText,
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  }
                : m
            )
          );
          if (onStreamChunk) {
            onStreamChunk(partialText, zoyaMsgId);
          }
        },
        null,
        (resolvedSources) => {
          regenSources = resolvedSources;
        }
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === zoyaMsgId
            ? {
                ...m,
                text: newResponseText,
                sources: regenSources.length > 0 ? regenSources : m.sources,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              }
            : m
        )
      );

      if (user?.uid && newResponseText.trim()) {
        addMessageToTopic(user.uid, activeTextTopicId, {
          sender: "Royal",
          text: newResponseText,
          mode: "text",
        }).catch((err) => console.warn("Failed to record regenerated AI response:", err));
      }
    } catch (err) {
      console.error("Regenerate response error:", err);
    } finally {
      setAppState("idle");
    }
  }, [user?.email, user?.uid]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const startLiveSession = async (withScreenShare = false) => {
    if (!user) {
      if (trialState.remainingSeconds <= 0) {
        setLoginNoticeMessage("Your 2-minute free trial has ended. Please sign in to continue using voice calling.");
        setShowLoginModal(true);
        return;
      }
      markTrialEngagement(trialState.deviceId);
    }
    if (systemSettings.voiceCallingEnabled === false && !isCurrentSessionDeveloper(user?.email)) {
      setScreenErrorMsg("Voice calling is temporarily paused by developer for maintenance. Text chat is active.");
      return;
    }
    if (withScreenShare && systemSettings.screenVisionEnabled === false && !isCurrentSessionDeveloper(user?.email)) {
      setScreenErrorMsg("Screen vision is temporarily paused by developer for maintenance.");
      withScreenShare = false;
    }
    try {
      setIsSessionActive(true);
      resetRoyalSession();
      
      // Initialize a new voice session topic
      const newVoiceTopicId = "topic_voice_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
      currentVoiceTopicIdRef.current = newVoiceTopicId;

      const session = new LiveSessionManager();
      session.setMuted(isMuted);
      liveSessionRef.current = session;
      
      session.onStateChange = (state) => {
        setAppState(state);
      };

      session.onScreenShareChange = (active) => {
        setIsScreenSharing(active);
      };

      session.onLiveCaption = (sender, text) => {
        if (text && text.trim()) {
          setLiveCaption({ sender, text: text.trim() });
        }
      };
      
      session.onMessage = (sender, text) => {
        const msg = createMessage(sender, text);
        setMessages((prev) => [...prev, msg]);
        if (text && text.trim()) {
          setLiveCaption({ sender, text: text.trim() });
        }
        if (user?.uid && text.trim()) {
          const topicId = currentVoiceTopicIdRef.current || ("topic_voice_" + Date.now());
          currentVoiceTopicIdRef.current = topicId;
          addMessageToTopic(user.uid, topicId, {
            sender: sender === "user" ? "user" : "Royal",
            text: text.trim(),
            mode: "voice",
          }).catch((err) => console.warn("Failed to record voice message to topic:", err));
        }
      };
      
      session.onCommand = (launchTarget) => {
        setTimeout(() => {
          if (typeof launchTarget === "string") {
            window.open(launchTarget, "_blank");
          } else {
            openAppOrWeb(launchTarget);
          }
        }, 1000);
      };

      session.onError = (err) => {
        console.error("Live Session error caught:", err);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setIsScreenSharing(false);
        setAppState("idle");
      };

      await session.start();

      if (withScreenShare) {
        setTimeout(async () => {
          if (liveSessionRef.current) {
            try {
              await liveSessionRef.current.startScreenShare();
            } catch (e: any) {
              console.error("Screen share start failed:", e);
              const msg = e?.message || "Screen share is not supported or was denied in this browser context.";
              setScreenErrorMsg(msg);
            }
          }
        }, 800);
      }
    } catch (e) {
      console.error("Failed to start session", e);
      setShowPermissionModal(true);
      setIsSessionActive(false);
      setIsScreenSharing(false);
      setAppState("idle");
    }
  };

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      setIsScreenSharing(false);
      setIsRequestingScreenShare(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      currentVoiceTopicIdRef.current = null;
      setAppState("idle");
      resetRoyalSession();
    } else {
      if (!user && trialState.remainingSeconds <= 0) {
        setLoginNoticeMessage("Your 2-minute free trial has ended. Please sign in to continue using voice calling.");
        setShowLoginModal(true);
        return;
      }
      if (!user) {
        markTrialEngagement(trialState.deviceId);
      }
      await startLiveSession(false);
    }
  };

  const toggleScreenShare = async () => {
    if (systemSettings.screenVisionEnabled === false && !isCurrentSessionDeveloper(user?.email)) {
      setScreenErrorMsg("Screen vision is temporarily paused by developer for maintenance.");
      return;
    }

    if (isScreenSharing) {
      if (liveSessionRef.current) {
        liveSessionRef.current.stopScreenShare();
      }
      setIsScreenSharing(false);
      setIsRequestingScreenShare(false);
      return;
    }

    // If voice session is not active yet, start call and request screen share immediately
    if (!isSessionActive) {
      if (!user && trialState.remainingSeconds <= 0) {
        setLoginNoticeMessage("Your 2-minute free trial has ended. Please sign in to continue using voice calling & screen sharing.");
        setShowLoginModal(true);
        return;
      }
      setIsRequestingScreenShare(true);
      try {
        await startLiveSession(true);
      } finally {
        setIsRequestingScreenShare(false);
      }
      return;
    }

    // Call is already active: trigger getDisplayMedia immediately
    if (liveSessionRef.current) {
      setIsRequestingScreenShare(true);
      setScreenErrorMsg(null);
      try {
        await liveSessionRef.current.startScreenShare();
        setIsScreenSharing(true);
      } catch (err: any) {
        console.error("Screen share start error:", err);
        const msg = err?.message || "Screen share is not supported or was denied in this browser context.";
        setScreenErrorMsg(msg);
        setIsScreenSharing(false);
      } finally {
        setIsRequestingScreenShare(false);
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  const handleClearHistory = async () => {
    clearChatHistory(activeUserId);
    if (user?.uid) {
      await clearUserChatHistoryInFirestore(user.uid);
    }
    setMessages([]);
    resetRoyalSession();
  };

  const getUserInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  // Main Application View (Shown directly to both registered users and new trial guests)
  return (
    <div className="fixed inset-0 w-screen h-[100dvh] overflow-hidden bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative m-0 p-0 select-none">
      {/* 2-Minute Free Trial Login Modal Overlay (shown when trial finishes or user clicks Sign In) */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
          <LoginView
            onLoginSuccess={(loggedInUser) => {
              setUser(loggedInUser);
              setShowLoginModal(false);
              setLoginNoticeMessage(undefined);
            }}
            onOpenPortfolio={() => setShowPortfolioModal(true)}
            initialMessage={loginNoticeMessage}
            onClose={trialState.remainingSeconds > 0 ? () => setShowLoginModal(false) : undefined}
          />
        </div>
      )}

      {/* Final 15-Second Free-Trial Countdown Timer (Centered below Header) */}
      {!user && (isSessionActive || showChatModal || trialState.isEngaged) && trialState.remainingSeconds > 0 && trialState.remainingSeconds <= 15 && (
        <FreeTrialTimer remainingSeconds={trialState.remainingSeconds} />
      )}
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
          onSwitchToText={() => {
            setShowPermissionModal(false);
            setShowTextInput(true);
          }}
          onRetryVoice={() => {
            startLiveSession(false);
          }}
        />
      )}

      {/* User Settings & Profile Modal */}
      {user && (
        <UserSettingsModal
          isOpen={showUserSettingsModal}
          onClose={() => setShowUserSettingsModal(false)}
          user={user}
          voiceCount={topics.length}
          onLogout={() => {
            setUser(null);
            setMessages([]);
            messagesRef.current = [];
            setTopics([]);
            stopAllSpeech();
            try {
              localStorage.removeItem("Royal_chat_history");
            } catch {}
          }}
          onOpenPortfolio={() => {
            setShowUserSettingsModal(false);
            setShowPortfolioModal(true);
          }}
          onOpenVoiceHistory={() => {
            setShowUserSettingsModal(false);
            setShowVoiceHistoryModal(true);
          }}
          onOpenAdminPanel={() => {
            setShowUserSettingsModal(false);
            setShowAdminPanelModal(true);
          }}
          onOpenDeveloperContact={() => {
            setShowUserSettingsModal(false);
            setShowDeveloperContactModal(true);
          }}
          onOpenDeviceModal={() => {
            setShowUserSettingsModal(false);
            setShowDeviceModal(true);
          }}
        />
      )}

      {/* Developer-Only Admin Panel Modal (Restricted to verified developer Royal Ankit Ahiran) */}
      <AdminPanelModal
        isOpen={showAdminPanelModal}
        onClose={() => setShowAdminPanelModal(false)}
        user={user}
      />

      {/* Direct Developer Telegram Contact Modal */}
      <DeveloperContactModal
        isOpen={showDeveloperContactModal}
        onClose={() => setShowDeveloperContactModal(false)}
        defaultUserName=""
        defaultUserPhone=""
      />

      {/* Real-time Phone Call Overlay (Calling, Timer, Duplicates, and Native Dialer) */}
      <CallScreenOverlay
        overlayState={callOverlayState}
        onClose={() => {
          clearPendingCallState();
          setCallOverlayState((prev) => ({ ...prev, isOpen: false }));
        }}
        onSelectNumber={(contact: ContactEntry) => {
          placeNativePhoneCall(contact.phone, contact.name);
        }}
      />

      {/* User Voice History Modal */}
      <VoiceHistoryModal
        isOpen={showVoiceHistoryModal}
        onClose={() => setShowVoiceHistoryModal(false)}
        topics={topics}
        user={user}
        onClearTopics={async () => {
          if (user?.uid) {
            await clearUserTopicsInFirestore(user.uid);
          }
          setTopics([]);
        }}
        onDeleteTopic={async (topicId: string) => {
          if (user?.uid) {
            await deleteSingleTopic(user.uid, topicId);
          }
          setTopics((prev) => prev.filter((t) => t.id !== topicId));
        }}
        onStartVoiceCall={() => {
          setShowVoiceHistoryModal(false);
          if (!isSessionActive) {
            startLiveSession(false);
          }
        }}
        onSwitchToChat={() => {
          setShowVoiceHistoryModal(false);
          setShowChatModal(true);
        }}
      />

      {/* Device Info Modal */}
      <DeviceInfoModal
        isOpen={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
        deviceInfo={deviceInfo}
        voiceCount={topics.length}
        onClearData={handleClearHistory}
        onOpenPortfolio={() => setShowPortfolioModal(true)}
      />

      {/* Creator Portfolio Modal */}
      <PortfolioEmbed
        isOpen={showPortfolioModal}
        onClose={() => setShowPortfolioModal(false)}
      />

      {/* Interactive Text & Voice Chat Modal */}
      <ChatModal
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
        messages={messages}
        onSendMessage={async (text, attachment, onStreamChunk) => {
          await handleTextCommand(text, true, attachment, onStreamChunk);
        }}
        onRegenerateResponse={async (userPrompt, zoyaMsgId, onStreamChunk) => {
          await handleRegenerateCommand(userPrompt, zoyaMsgId, onStreamChunk);
        }}
        isProcessing={appState === "processing"}
        user={user}
        onClearChatHistory={handleClearHistory}
        topics={topics}
        onLogout={() => {
          setUser(null);
          setMessages([]);
          messagesRef.current = [];
          setTopics([]);
          stopAllSpeech();
          try {
            localStorage.removeItem("Royal_chat_history");
          } catch {}
        }}
        onOpenVoiceCall={() => {
          setShowChatModal(false);
          if (!isSessionActive) {
            startLiveSession(false);
          }
        }}
        onSwitchToVoice={() => {
          setShowChatModal(false);
        }}
        onOpenDeviceModal={() => {
          setShowDeviceModal(true);
        }}
        isSpeakerMuted={isSpeakerMuted}
        onToggleSpeaker={() => setIsSpeakerMuted(!isSpeakerMuted)}
        onOpenAdminPanel={() => {
          setShowChatModal(false);
          setShowAdminPanelModal(true);
        }}
      />

      {/* Cinematic Background Gradients - Full Bleed */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-violet-900/20 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-pink-900/20 blur-[130px] rounded-full" />
      </div>

      {/* Header - Full Width with Safe Area & Glass Tint */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-3 sm:px-6 md:px-8 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 bg-black/40 backdrop-blur-md border-b border-white/5">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button 
            id="btn-logo-portfolio"
            onClick={() => setShowPortfolioModal(true)} 
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white relative overflow-hidden flex items-center justify-center shadow-md shadow-cyan-500/25 ring-1.5 ring-cyan-400/60 hover:scale-105 transition-transform shrink-0 cursor-pointer group p-0.5"
            title="Open Royal Ankit Ahiran Portfolio"
          >
            <ZoyaLogo size={36} showGlow={false} className="w-full h-full border-none shadow-none" />
          </button>
          <div className="text-left">
            <h1 className="text-sm sm:text-base md:text-lg font-bold tracking-wider bg-gradient-to-r from-white via-violet-200 to-pink-200 bg-clip-text text-transparent truncate max-w-[170px] sm:max-w-none">
              ZOYA AI VOICE ASSISTANT
            </h1>
            <button 
              id="btn-creator-portfolio-subtitle"
              onClick={() => setShowPortfolioModal(true)}
              className="text-[9px] sm:text-[10px] font-mono tracking-widest text-red-300 hover:text-red-200 hover:underline uppercase transition-colors flex items-center gap-1 text-left cursor-pointer"
              title="Click to view Royal Ankit Ahiran portfolio"
            >
              <span>By Royal Ankit Ahiran</span>
              <Award size={10} className="text-red-400 opacity-90 shrink-0" />
            </button>
          </div>
        </div>

        {/* Header Actions - Clean, Integrated Profile & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Developer Portfolio Link */}
          <button
            id="btn-portfolio-badge"
            onClick={() => setShowPortfolioModal(true)}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full border text-[11px] sm:text-xs font-medium transition-all shadow-sm bg-gradient-to-r from-red-600/30 to-pink-600/30 hover:from-red-600/50 hover:to-pink-600/50 border-red-500/40 text-red-200 cursor-pointer hover:scale-105"
            title="Open Portfolio (https://royalankitahiranl.netlify.app)"
          >
            <Award size={13} className="text-red-400 shrink-0" />
            <span className="hidden xs:inline">Portfolio</span>
          </button>

          {/* User Account Button with Profile Photo / Initials OR Guest Sign In */}
          {user ? (
            <button
              id="btn-user-settings-trigger"
              onClick={() => setShowUserSettingsModal(true)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/15 transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95 shrink-0"
              title={`Logged in as ${user.displayName || user.email || "User"} - Click for settings & logout`}
            >
              <div className="relative">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-cyan-400"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-teal-500 flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-cyan-400/50">
                    {getUserInitials(user.displayName)}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-black" />
              </div>
              <span className="text-xs font-semibold text-white/90 max-w-[80px] sm:max-w-[110px] truncate hidden sm:inline">
                {(user.displayName || user.email?.split("@")[0] || "User").split(" ")[0]}
              </span>
            </button>
          ) : (
            <button
              id="btn-guest-signin-trigger"
              onClick={() => {
                setLoginNoticeMessage(undefined);
                setShowLoginModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-600/80 to-rose-600/80 hover:from-red-500 hover:to-rose-500 border border-red-500/40 text-white text-xs font-semibold shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0"
              title="Sign in or create account for unlimited access"
            >
              <User size={13} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Real-time System Broadcast Banner */}
      {activeBroadcast && activeBroadcast.active && activeBroadcast.title !== dismissedBroadcastTitle && 
       !activeBroadcast.title.toLowerCase().includes("maintenance") &&
       !activeBroadcast.title.toLowerCase().includes("developer admin panel") &&
       !activeBroadcast.message.toLowerCase().includes("developer admin panel") && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-14 sm:top-16 z-30 max-w-lg mx-auto px-3 sm:px-4 w-full pointer-events-auto"
        >
          <div className={`border rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-xl flex items-start justify-between gap-2.5 text-white ${
            activeBroadcast.type === "update"
              ? "bg-amber-950/90 border-amber-500/50 text-amber-100"
              : activeBroadcast.type === "celebration"
              ? "bg-purple-950/90 border-purple-500/50 text-purple-100"
              : "bg-cyan-950/90 border-cyan-500/50 text-cyan-100"
          }`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-white/10 shrink-0 mt-0.5">
                <Radio size={16} className="animate-pulse" />
              </div>
              <div className="text-xs space-y-0.5 min-w-0">
                <p className="font-bold tracking-wide">{activeBroadcast.title}</p>
                <p className="opacity-90 leading-relaxed text-[11px] whitespace-pre-wrap">{activeBroadcast.message}</p>
              </div>
            </div>
            <button
              onClick={() => setDismissedBroadcastTitle(activeBroadcast.title)}
              className="p-1 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Dismiss Announcement"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Screen Sharing Error Banner */}
      {screenErrorMsg && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 z-40 max-w-lg mx-auto px-4 w-full pointer-events-auto"
        >
          <div className="bg-gradient-to-r from-pink-900/90 to-purple-900/90 border border-pink-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex items-start justify-between gap-3 text-white">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-pink-500/20 rounded-xl shrink-0 mt-0.5">
                <Monitor size={20} className="text-pink-300" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-semibold text-pink-200">Screen Vision Alert / स्क्रीन विज़न सूचना</p>
                <p className="text-white/80 leading-relaxed">{screenErrorMsg}</p>
                <div className="pt-1.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 text-white rounded-lg font-medium text-[11px] transition-colors"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setScreenErrorMsg(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* Main Content - Visualizer */}
      <main className="absolute inset-0 flex flex-col items-center justify-center w-full h-full z-10 overflow-hidden pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] px-3 sm:px-6 md:px-12 pointer-events-auto">
        <div className="relative w-full h-full flex flex-row items-center justify-between pointer-events-none">
          {/* Left Column: Royal Status */}
          <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
            <div className="h-6">
              <AnimatePresence>
                {appState === "processing" && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                  >
                    <Loader2 size={16} className="animate-spin" />
                    Replying...
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center Visualizer */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <Visualizer state={appState} />
          </div>

          {/* Right Column: User Status */}
          <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
            <div className="h-6 flex justify-end">
              <AnimatePresence>
                {appState === "listening" && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                  >
                    {isMuted ? (
                      <div className="flex items-center gap-2 text-red-400 font-medium not-italic bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-full text-xs md:text-sm">
                        <MicOff size={14} className="text-red-400" />
                        <span>Muted</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                        <span>Listening...</span>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Live Latest Transcript Preview Floating Bottom Banner */}
          {(() => {
            const activeCaption = liveCaption || (messages.length > 0 ? messages[messages.length - 1] : null);
            if (!activeCaption || !activeCaption.text) return null;
            const isUser = activeCaption.sender === "user";
            return (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-xl w-full px-4 z-20 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isUser ? "bg-cyan-400" : "bg-violet-400"
                      }`}
                    />
                    <span
                      className={`font-semibold shrink-0 ${
                        isUser ? "text-cyan-300" : "text-violet-300"
                      }`}
                    >
                      {isUser ? "You:" : "Zoya:"}
                    </span>
                    <p className="text-white/80 truncate">
                      {activeCaption.text}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-[max(1.25rem,env(safe-area-inset-bottom))] px-3 sm:px-4 z-20 shrink-0 gap-2.5 sm:gap-3">
        {/* Status Pills */}
        {isSessionActive && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center justify-center gap-2 px-4"
          >
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <PhoneCall size={12} />
              <span>Background Call Active</span>
            </div>

            {isMuted && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium backdrop-blur-md">
                <MicOff size={12} className="text-red-400" />
                <span>Microphone Muted</span>
              </div>
            )}

            {isScreenSharing && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-300 text-xs font-medium backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-pink-400 animate-ping" />
                <Monitor size={12} />
                <span>Screen Vision Active</span>
              </div>
            )}
          </motion.div>
        )}

        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Zoya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Bottom Action Controls:
            Layout:
                         [ SHARE SCREEN ]
            [ MUTE ]      [ START CALL ]      [ CHAT ]
        */}
        <div className="flex flex-col items-center justify-center w-full max-w-xl px-2 gap-2">
          {/* Top Row: Share Screen positioned directly above Mute */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 w-full">
            <div className="flex-1 max-w-[105px] sm:max-w-[130px] flex justify-center">
              <button
                id="btn-share-screen"
                onClick={toggleScreenShare}
                disabled={isRequestingScreenShare}
                className={`
                  group w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 md:py-3.5 rounded-full font-medium tracking-wide transition-all duration-300 shadow-xl text-xs sm:text-sm border cursor-pointer select-none whitespace-nowrap disabled:opacity-50
                  ${
                    isScreenSharing
                      ? "bg-pink-600/30 text-pink-300 border-pink-500/60 hover:bg-pink-600/40 ring-2 ring-pink-500/40 shadow-pink-900/30"
                      : isRequestingScreenShare
                      ? "bg-amber-500/20 text-amber-200 border-amber-500/40 animate-pulse"
                      : "bg-white/10 text-white/90 border-white/20 hover:bg-white/20 hover:text-white"
                  }
                `}
                title={
                  isScreenSharing 
                    ? "Stop Screen Sharing / स्क्रीन शेयर रोकें" 
                    : isRequestingScreenShare
                    ? "Requesting Screen Permission..."
                    : "Share Screen / स्क्रीन शेयर करें (Chrome Vision)"
                }
              >
                {isRequestingScreenShare ? (
                  <>
                    <Loader2 size={17} className="animate-spin text-amber-300 sm:w-5 sm:h-5 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Sharing...</span>
                  </>
                ) : isScreenSharing ? (
                  <>
                    <Monitor size={17} className="text-pink-400 animate-pulse sm:w-5 sm:h-5 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Sharing</span>
                  </>
                ) : (
                  <>
                    <ScreenShare size={17} className="text-cyan-400 group-hover:scale-110 transition-transform sm:w-5 sm:h-5 shrink-0" />
                    <span className="hidden xs:inline sm:inline">Share</span>
                  </>
                )}
              </button>
            </div>

            {/* Invisible flex spacers matching Start Call and Chat widths so Share Screen stays exactly aligned with Mute */}
            <div className="flex-1 max-w-[160px] sm:max-w-[190px] invisible pointer-events-none" aria-hidden="true" />
            <div className="flex-1 max-w-[130px] sm:max-w-[155px] invisible pointer-events-none" aria-hidden="true" />
          </div>

          {/* Bottom Row: [ MUTE ] [ START CALL ] [ CHAT ] */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 w-full">
            {/* Mute Button */}
            <button
              id="btn-microphone-mute"
              onClick={toggleMute}
              className={`
                group flex-1 max-w-[105px] sm:max-w-[130px] flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 md:py-3.5 rounded-full font-medium tracking-wide transition-all duration-300 shadow-xl text-xs sm:text-sm border cursor-pointer select-none whitespace-nowrap
                ${
                  isMuted
                    ? "bg-red-500/25 text-red-300 border-red-500/60 hover:bg-red-500/35 ring-2 ring-red-500/30"
                    : "bg-white/10 text-white/90 border-white/20 hover:bg-white/20 hover:text-white"
                }
              `}
              title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
              {isMuted ? (
                <>
                  <MicOff size={17} className="text-red-400 sm:w-5 sm:h-5 shrink-0" />
                  <span className="hidden xs:inline sm:inline">Muted</span>
                </>
              ) : (
                <>
                  <Mic size={17} className="text-emerald-400 group-hover:scale-110 transition-transform sm:w-5 sm:h-5 shrink-0" />
                  <span className="hidden xs:inline sm:inline">Mute</span>
                </>
              )}
            </button>

            {/* Center: Start / End Call Button */}
            <button
              id="btn-call-toggle"
              onClick={toggleListening}
              className={`
                group relative flex-1 max-w-[160px] sm:max-w-[190px] flex items-center justify-center gap-2 px-4 sm:px-5 py-3 md:py-3.5 rounded-full font-semibold tracking-wide transition-all duration-300 shadow-2xl text-xs sm:text-sm md:text-base cursor-pointer select-none whitespace-nowrap
                ${
                  isSessionActive
                    ? "bg-red-500/25 text-red-300 border border-red-500/60 hover:bg-red-500/35 ring-2 ring-red-500/20"
                    : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white border border-white/25 hover:scale-105 active:scale-95 shadow-lg shadow-violet-500/20"
                }
              `}
              title={isSessionActive ? "End Voice Call" : "Start Voice Call"}
            >
              {isSessionActive ? (
                <>
                  <MicOff size={18} className="sm:w-5 sm:h-5 shrink-0" />
                  <span>End Call</span>
                </>
              ) : (
                <>
                  <PhoneCall size={18} className="group-hover:animate-bounce sm:w-5 sm:h-5 shrink-0" />
                  <span>Start Call</span>
                </>
              )}
            </button>

            {/* Right: Chat Button - Radiant Violet Theme & Immediate Opening */}
            <button
              id="btn-open-chat"
              onClick={() => {
                if (!user) {
                  markTrialEngagement(trialState.deviceId);
                }
                if (isSessionActive) {
                  resetRoyalSession();
                }
                setShowChatModal(true);
              }}
              className="group flex-1 max-w-[130px] sm:max-w-[155px] flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 md:py-3.5 rounded-full font-bold tracking-wide transition-all duration-300 shadow-xl text-xs sm:text-sm border border-violet-500/40 bg-gradient-to-r from-violet-600/30 via-indigo-600/30 to-purple-600/30 hover:from-violet-600/50 hover:to-indigo-600/50 text-white shadow-violet-950/40 hover:scale-105 active:scale-95 cursor-pointer select-none whitespace-nowrap"
              title="Open Chat Popup"
            >
              <MessageSquare size={18} className="text-violet-300 group-hover:scale-110 transition-transform sm:w-5 sm:h-5 shrink-0" />
              <span>Chat</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
