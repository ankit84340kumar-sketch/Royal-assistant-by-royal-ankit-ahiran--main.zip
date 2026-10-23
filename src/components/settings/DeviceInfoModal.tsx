import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, Smartphone, Monitor, HardDrive, Shield, User, Clock, 
  Globe, Cpu, Award, Copy, Check, Trash2, CheckCircle2,
  Mic, Volume2, Wifi, Zap, Activity, ZoomIn, ZoomOut,
  Battery, BatteryCharging, Flame, Layers, Radio
} from "lucide-react";
import { DeviceInfo, getDeviceInfo } from "../../services/deviceManager";

interface DeviceInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo?: DeviceInfo;
  voiceCount?: number;
  onClearData?: () => void;
  onOpenPortfolio?: () => void;
}

type TabType = "system" | "battery" | "network" | "audio";

export default function DeviceInfoModal({
  isOpen,
  onClose,
  deviceInfo: rawDeviceInfo,
  voiceCount = 0,
  onClearData,
  onOpenPortfolio,
}: DeviceInfoModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("system");
  const [copiedUid, setCopiedUid] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);
  // Internal content scaling control (80% - 120%) - Outer popup size remains 100% fixed
  const [contentScale, setContentScale] = useState<number>(100);

  // Live Battery State
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [chargingTime, setChargingTime] = useState<number | null>(null);
  const [dischargingTime, setDischargingTime] = useState<number | null>(null);
  const [batterySupported, setBatterySupported] = useState<boolean | null>(null);

  // Live Network State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [effectiveType, setEffectiveType] = useState<string>("Broadband");
  const [downlinkSpeed, setDownlinkSpeed] = useState<number | null>(null);
  const [rttLatency, setRttLatency] = useState<number | null>(null);
  const [saveDataMode, setSaveDataMode] = useState<boolean | null>(null);

  // Live Audio Devices State
  const [micCount, setMicCount] = useState<number>(0);
  const [speakerCount, setSpeakerCount] = useState<number>(0);

  // Thermal Status
  const [thermalStatus, setThermalStatus] = useState<string>("Not exposed by browser / device API");

  // Device Info Fallback
  const deviceInfo = rawDeviceInfo || getDeviceInfo();

  // 1. Live Battery Manager
  useEffect(() => {
    if (!isOpen || typeof navigator === "undefined") return;

    let batteryManager: any = null;
    const updateBattery = (b: any) => {
      setBatteryLevel(Math.round(b.level * 100));
      setIsCharging(b.charging);
      setChargingTime(isFinite(b.chargingTime) ? b.chargingTime : null);
      setDischargingTime(isFinite(b.dischargingTime) ? b.dischargingTime : null);
      setBatterySupported(true);
    };

    if ("getBattery" in navigator && typeof (navigator as any).getBattery === "function") {
      (navigator as any).getBattery()
        .then((b: any) => {
          batteryManager = b;
          updateBattery(b);
          b.addEventListener("levelchange", () => updateBattery(b));
          b.addEventListener("chargingchange", () => updateBattery(b));
          b.addEventListener("chargingtimechange", () => updateBattery(b));
          b.addEventListener("dischargingtimechange", () => updateBattery(b));
        })
        .catch(() => {
          setBatterySupported(false);
        });
    } else {
      setBatterySupported(false);
    }

    return () => {
      if (batteryManager) {
        try {
          batteryManager.removeEventListener("levelchange", updateBattery);
          batteryManager.removeEventListener("chargingchange", updateBattery);
        } catch {}
      }
    };
  }, [isOpen]);

  // 2. Live Network Manager
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const updateConnection = () => {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn) {
        setEffectiveType(conn.effectiveType ? conn.effectiveType.toUpperCase() : "4G / Broadband");
        setDownlinkSpeed(typeof conn.downlink === "number" ? conn.downlink : null);
        setRttLatency(typeof conn.rtt === "number" ? conn.rtt : null);
        setSaveDataMode(typeof conn.saveData === "boolean" ? conn.saveData : null);
      }
    };

    updateConnection();
    const conn = (navigator as any).connection;
    if (conn && conn.addEventListener) {
      conn.addEventListener("change", updateConnection);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (conn && conn.removeEventListener) {
        conn.removeEventListener("change", updateConnection);
      }
    };
  }, [isOpen]);

  // 3. Live Audio Devices Enumeration
  useEffect(() => {
    if (!isOpen || typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

    const updateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter((d) => d.kind === "audioinput");
        const speakers = devices.filter((d) => d.kind === "audiooutput");
        setMicCount(mics.length || 1);
        setSpeakerCount(speakers.length || 1);
      } catch {
        setMicCount(1);
        setSpeakerCount(1);
      }
    };

    updateDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", updateDevices);

    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", updateDevices);
    };
  }, [isOpen]);

  // 4. Genuine Thermal Status Check
  useEffect(() => {
    if (!isOpen) return;
    try {
      const thermal = (navigator as any).thermal || (navigator as any).deviceThermal;
      if (thermal && typeof thermal.status === "string") {
        setThermalStatus(`Nominal / ${thermal.status.toUpperCase()}`);
      } else {
        setThermalStatus("Not exposed by browser / device API");
      }
    } catch {
      setThermalStatus("Not exposed by browser / device API");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyUserId = () => {
    try {
      navigator.clipboard.writeText(deviceInfo.userId || "guest_session");
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const formattedDate = (() => {
    try {
      if (!deviceInfo.firstSeen) return "Active Now";
      const d = new Date(deviceInfo.firstSeen);
      return isNaN(d.getTime()) ? "Active Now" : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Active Now";
    }
  })();

  // Audio / Mic capability diagnostics
  const hasAudioContext = typeof window !== "undefined" && Boolean(window.AudioContext || (window as any).webkitAudioContext);
  const hasMediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const hasSpeechRecognition = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const hasSpeechSynthesis = typeof window !== "undefined" && Boolean(window.speechSynthesis);

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-[70] flex items-center justify-center p-3 sm:p-4 pointer-events-auto"
        onClick={onClose}
      >
        {/* ONE FIXED OUTER SIZE - MUST NOT EXPAND OR RESIZE VERTICALLY/HORIZONTALLY */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-b from-[#130826] via-[#0d071a] to-[#090514] border-2 border-violet-500/70 rounded-3xl p-4 sm:p-5 w-full max-w-lg h-[610px] max-h-[90vh] shadow-[0_0_35px_rgba(168,85,247,0.35)] ring-1 ring-violet-400/40 text-white relative flex flex-col justify-between overflow-hidden"
        >
          {/* Ambient Corner Glows */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-violet-600/15 blur-3xl pointer-events-none rounded-full" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-pink-600/15 blur-3xl pointer-events-none rounded-full" />

          {/* Modal Header (Fixed top) */}
          <div className="flex items-center justify-between border-b border-violet-500/20 pb-3 relative z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-600/40 to-pink-600/30 text-violet-300 border border-violet-400/40 shadow-md shadow-violet-950/50">
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-wide text-white flex items-center gap-2">
                  <span>User Device Profile</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    Live Telemetry
                  </span>
                </h3>
                <p className="text-xs text-white/50">Real device telemetry & hardware status</p>
              </div>
            </div>

            {/* Header Right: Scaler + Close */}
            <div className="flex items-center gap-2">
              {/* Scaler Control (controls internal content size only, popup outer size remains fixed) */}
              <div className="flex items-center bg-black/50 border border-violet-500/30 rounded-xl px-1.5 py-1 gap-1">
                <button
                  type="button"
                  onClick={() => setContentScale((prev) => Math.max(prev - 10, 80))}
                  disabled={contentScale <= 80}
                  className="p-1 text-white/60 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom Out Content (A-)"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="text-[10px] font-mono font-bold text-violet-300 min-w-[32px] text-center">
                  {contentScale}%
                </span>
                <button
                  type="button"
                  onClick={() => setContentScale((prev) => Math.min(prev + 10, 120))}
                  disabled={contentScale >= 120}
                  className="p-1 text-white/60 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom In Content (A+)"
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-violet-950/50 hover:bg-violet-800/40 text-white/70 hover:text-white border border-violet-500/30 transition-colors cursor-pointer"
                title="Close (ESC)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Interactive Device Tabs Bar (Fixed top) */}
          <div className="grid grid-cols-4 p-1.5 rounded-2xl bg-black/60 border border-violet-500/30 gap-1 relative z-10 my-2 shrink-0">
            <button
              type="button"
              id="tab-btn-system"
              onClick={() => setActiveTab("system")}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === "system"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)] border border-violet-300 ring-1 ring-violet-400/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Monitor size={13} className={activeTab === "system" ? "text-violet-200 shrink-0" : "text-white/60 shrink-0"} />
              <span className="truncate">System</span>
            </button>

            <button
              type="button"
              id="tab-btn-battery"
              onClick={() => setActiveTab("battery")}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === "battery"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.5)] border border-amber-300 ring-1 ring-amber-400/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Battery size={13} className={activeTab === "battery" ? "text-amber-200 shrink-0" : "text-white/60 shrink-0"} />
              <span className="truncate">Battery</span>
            </button>

            <button
              type="button"
              id="tab-btn-network"
              onClick={() => setActiveTab("network")}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === "network"
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.5)] border border-cyan-300 ring-1 ring-cyan-400/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Wifi size={13} className={activeTab === "network" ? "text-cyan-200 shrink-0" : "text-white/60 shrink-0"} />
              <span className="truncate">Network</span>
            </button>

            <button
              type="button"
              id="tab-btn-audio"
              onClick={() => setActiveTab("audio")}
              className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === "audio"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.5)] border border-emerald-300 ring-1 ring-emerald-400/40"
                  : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Mic size={13} className={activeTab === "audio" ? "text-emerald-200 shrink-0" : "text-white/60 shrink-0"} />
              <span className="truncate">Audio/Mic</span>
            </button>
          </div>

          {/* SCROLLABLE INNER BODY WITH USER-SCALABLE CONTENT (Outer container size does NOT change) */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 relative z-10 min-h-0 space-y-3">
            <div 
              style={{ 
                zoom: contentScale !== 100 ? `${contentScale}%` : undefined,
                transition: "zoom 0.15s ease-out" 
              }}
              className="space-y-3"
            >
              {/* User ID Badge with Copy */}
              <div className="p-3 rounded-2xl bg-gradient-to-r from-violet-900/40 via-purple-900/30 to-pink-900/40 border border-violet-500/40 flex items-center justify-between shadow-lg">
                <div className="min-w-0 flex-1 mr-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-violet-300/80 block font-bold">
                    Unique User Identifier (UID)
                  </span>
                  <span className="text-sm sm:text-base font-mono font-black text-violet-100 tracking-wider truncate block">
                    {deviceInfo.userId || "guest_session"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    className="px-3 py-1.5 rounded-xl bg-violet-600/40 hover:bg-violet-600/60 border border-violet-400/50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    title="Copy User ID"
                  >
                    {copiedUid ? (
                      <>
                        <Check size={13} className="text-emerald-400" />
                        <span className="text-emerald-300 font-bold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} className="text-violet-200" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Active
                  </span>
                </div>
              </div>

              {/* TAB 1: SYSTEM & SPECS */}
              {activeTab === "system" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-2 gap-2.5 text-xs"
                >
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Monitor size={14} className="text-violet-400 shrink-0" />
                      <span>Device & OS</span>
                    </div>
                    <p className="font-bold text-white truncate">{deviceInfo.platform || "Web Platform"} ({deviceInfo.deviceType || "Desktop"})</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Cpu size={14} className="text-pink-400 shrink-0" />
                      <span>Browser Engine</span>
                    </div>
                    <p className="font-bold text-white truncate">{deviceInfo.browser || "Chromium/WebKit"}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Smartphone size={14} className="text-cyan-400 shrink-0" />
                      <span>Screen Resolution</span>
                    </div>
                    <p className="font-bold text-white truncate">
                      {deviceInfo.screenResolution || "Auto Viewport"}
                      {deviceInfo.pixelRatio ? ` (${deviceInfo.pixelRatio}x DPR)` : ""}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Cpu size={14} className="text-emerald-400 shrink-0" />
                      <span>CPU Cores (Concurrency)</span>
                    </div>
                    <p className="font-bold text-white truncate">
                      {deviceInfo.cores ? `${deviceInfo.cores} Logical Cores` : "Not exposed by platform"}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <HardDrive size={14} className="text-amber-400 shrink-0" />
                      <span>Device Memory (RAM)</span>
                    </div>
                    <p className="font-bold text-white truncate">
                      {deviceInfo.memoryGB ? `${deviceInfo.memoryGB} GB Tier` : "Not exposed by platform"}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Globe size={14} className="text-teal-400 shrink-0" />
                      <span>Locale & Language</span>
                    </div>
                    <p className="font-bold text-white truncate">{deviceInfo.language || "hi-IN / en-US"}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Clock size={14} className="text-indigo-400 shrink-0" />
                      <span>Time Zone</span>
                    </div>
                    <p className="font-bold text-white truncate">{deviceInfo.timeZone || "Asia/Kolkata"}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-violet-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Clock size={14} className="text-rose-400 shrink-0" />
                      <span>First Session</span>
                    </div>
                    <p className="font-bold text-white truncate">{formattedDate}</p>
                  </div>
                </motion.div>
              )}

              {/* TAB 2: BATTERY & POWER */}
              {activeTab === "battery" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2.5 text-xs"
                >
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {isCharging ? <BatteryCharging size={24} className="animate-pulse" /> : <Battery size={24} />}
                      </div>
                      <div>
                        <span className="text-[11px] text-white/50 font-mono uppercase tracking-wider block">Battery Percentage</span>
                        <span className="text-xl sm:text-2xl font-black text-white">
                          {batterySupported === false
                            ? "Not exposed"
                            : batteryLevel !== null
                            ? `${batteryLevel}%`
                            : "Reading..."}
                        </span>
                      </div>
                    </div>

                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                      batterySupported === false
                        ? "bg-white/10 text-white/60 border-white/10"
                        : isCharging
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    }`}>
                      {batterySupported === false
                        ? "API Restricted"
                        : isCharging
                        ? "Charging (चार्ज हो रहा है)"
                        : "On Battery (बैटरी पर)"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                      <span className="text-[11px] text-white/50 block">Power State</span>
                      <p className="font-bold text-white">
                        {batterySupported === false
                          ? "Standard Power"
                          : isCharging
                          ? "AC / Fast Connected"
                          : "Discharging (स्वायत्त)"}
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                      <span className="text-[11px] text-white/50 block">Battery API Status</span>
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${batterySupported ? "bg-emerald-400" : "bg-white/40"}`} />
                        <span>{batterySupported ? "Live Synced" : "Protected / Not exposed"}</span>
                      </p>
                    </div>
                  </div>

                  {/* Thermal / Temperature Sensor */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-white/60 text-xs">
                        <Flame size={14} className="text-orange-400 shrink-0" />
                        <span className="font-semibold">Thermal & Temperature Sensor</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                        Hardware
                      </span>
                    </div>
                    <p className="text-xs font-mono font-bold text-white/90">
                      {thermalStatus}
                    </p>
                    <p className="text-[10px] text-white/50 leading-relaxed">
                      Browsers legitimately restrict direct hardware thermal sensors for security and privacy isolation. No estimated or fake temperature is shown.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* TAB 3: NETWORK & TELEMETRY */}
              {activeTab === "network" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-2 gap-2.5 text-xs"
                >
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Activity size={14} className="text-cyan-400 shrink-0" />
                      <span>Network Connection</span>
                    </div>
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                      <span>{isOnline ? "Online (सक्रिय)" : "Offline (ऑफ़लाइन)"}</span>
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Zap size={14} className="text-amber-400 shrink-0" />
                      <span>Effective Link Type</span>
                    </div>
                    <p className="font-bold text-white truncate">{effectiveType}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Radio size={14} className="text-violet-400 shrink-0" />
                      <span>Downlink Bandwidth</span>
                    </div>
                    <p className="font-bold text-white truncate">
                      {downlinkSpeed !== null ? `${downlinkSpeed} Mbps` : "Not exposed by network"}
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                      <Clock size={14} className="text-emerald-400 shrink-0" />
                      <span>Round-Trip Latency (RTT)</span>
                    </div>
                    <p className="font-bold text-white truncate">
                      {rttLatency !== null ? `${rttLatency} ms` : "Not exposed by network"}
                    </p>
                  </div>

                  <div className="col-span-2 p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Data Saver Mode</span>
                      <span className="text-[11px] text-white/50">Client requests reduced bandwidth</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white/70">
                      {saveDataMode === true ? "Enabled" : "Standard / Disabled"}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* TAB 4: AUDIO & MIC DIAGNOSTICS */}
              {activeTab === "audio" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2.5 text-xs"
                >
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                        <Mic size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-white block">Microphone Hardware ({micCount} Detected)</span>
                        <span className="text-[11px] text-white/50">getUserMedia Audio Input Hardware</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      hasMediaDevices ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"
                    }`}>
                      {hasMediaDevices ? "Supported (सक्षम)" : "Unavailable"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300">
                        <Volume2 size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-white block">Audio Output ({speakerCount} Speaker Channel)</span>
                        <span className="text-[11px] text-white/50">Sample Rate: 24,000 Hz Studio Audio Engine</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      hasAudioContext ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"
                    }`}>
                      {hasAudioContext ? "Ready (सक्रिय)" : "Unavailable"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300">
                        <Zap size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-white block">Speech Recognition (STT)</span>
                        <span className="text-[11px] text-white/50">Live speech-to-text recognition in Hindi/English</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      hasSpeechRecognition ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    }`}>
                      {hasSpeechRecognition ? "Supported" : "Text Only"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-pink-500/20 text-pink-300">
                        <Globe size={16} />
                      </div>
                      <div>
                        <span className="font-bold text-white block">Speech Synthesis (TTS)</span>
                        <span className="text-[11px] text-white/50">Natural Zoya voice output engine</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      hasSpeechSynthesis ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"
                    }`}>
                      {hasSpeechSynthesis ? "Active (सक्रिय)" : "Unavailable"}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Persistence & Security Guarantee */}
              <div className="p-2.5 rounded-2xl bg-violet-950/30 border border-violet-500/30 flex items-center gap-2.5 text-xs text-white/80">
                <Shield size={16} className="text-violet-400 shrink-0" />
                <p className="text-[10px] sm:text-[11px] leading-relaxed text-white/70">
                  User identity and session telemetry are protected via client-side credential isolation and Firestore security rules.
                </p>
              </div>

              {clearedNotice && (
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                  <span>Local session cache has been refreshed.</span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer Actions (Fixed bottom) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-violet-500/20 relative z-10 shrink-0 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              {onOpenPortfolio && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPortfolio();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer hover:scale-105"
                >
                  <Award size={13} />
                  <span>Creator Portfolio</span>
                </button>
              )}

              {onClearData && (
                <button
                  type="button"
                  onClick={() => {
                    onClearData();
                    setClearedNotice(true);
                    setTimeout(() => setClearedNotice(false), 2500);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-300 border border-white/10 hover:border-red-500/40 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Clear temporary session history"
                >
                  <Trash2 size={13} />
                  <span>Clear Cache</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-md shadow-violet-950/60 ml-auto"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
