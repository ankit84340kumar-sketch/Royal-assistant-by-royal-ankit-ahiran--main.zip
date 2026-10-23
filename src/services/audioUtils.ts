import { getRoyalAudio } from "./geminiService";

let currentActiveAudioSource: AudioBufferSourceNode | null = null;
let currentActiveAudioElement: HTMLAudioElement | null = null;
let currentActiveAudioCtx: AudioContext | null = null;

/**
 * Plays base64 audio (supports both raw PCM 24kHz and MP3)
 */
export async function playPCM(
  audioInput: string | { data: string; format?: "pcm" | "mp3" },
  formatOverride?: "pcm" | "mp3"
): Promise<void> {
  stopAllSpeech();

  const base64Data = typeof audioInput === "string" ? audioInput : audioInput.data;
  const format = formatOverride || (typeof audioInput === "object" ? audioInput.format : "pcm");

  if (!base64Data) return;

  // If format is MP3
  if (format === "mp3" || base64Data.startsWith("//") || base64Data.startsWith("SUQz") || base64Data.startsWith("/+M")) {
    return new Promise<void>((resolve) => {
      try {
        const audio = new Audio(`data:audio/mpeg;base64,${base64Data}`);
        currentActiveAudioElement = audio;
        audio.onended = () => {
          if (currentActiveAudioElement === audio) {
            currentActiveAudioElement = null;
          }
          resolve();
        };
        audio.onerror = (e) => {
          console.warn("Audio element playback error, falling back to WebAudio:", e);
          playAudioViaWebAudio(base64Data).then(resolve);
        };
        audio.play().catch((err) => {
          console.warn("Autoplay blocked or audio play failed:", err);
          playAudioViaWebAudio(base64Data).then(resolve);
        });
      } catch (e) {
        console.error("HTML5 Audio Playback error:", e);
        playAudioViaWebAudio(base64Data).then(resolve);
      }
    });
  }

  // Raw PCM Playback (Default Gemini TTS)
  return playRawPCM(base64Data);
}

async function playAudioViaWebAudio(base64Data: string): Promise<void> {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    currentActiveAudioCtx = audioCtx;

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decodedBuffer = await audioCtx.decodeAudioData(bytes.buffer);
    const source = audioCtx.createBufferSource();
    currentActiveAudioSource = source;
    source.buffer = decodedBuffer;
    source.connect(audioCtx.destination);
    source.start();

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (currentActiveAudioSource === source) {
          currentActiveAudioSource = null;
        }
        resolve();
      };
    });
  } catch (err) {
    console.error("WebAudio decode error:", err);
  }
}

// Gapless 24kHz PCM Player matching Voice Mode (liveService.ts)
export class GaplessPcmPlayer {
  private audioCtx: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  public activeSourcesCount: number = 0;
  public isPlaying: boolean = false;

  public warmup(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioCtx = new AudioContextClass({ sampleRate: 24000 });
        } catch {
          this.audioCtx = new AudioContextClass();
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public async unlock(): Promise<AudioContext | null> {
    const ctx = this.warmup();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("[GaplessPcmPlayer] AudioContext resume failed:", e);
      }
    }
    return ctx;
  }

  public getAudioContext(): AudioContext | null {
    return this.warmup();
  }

  public async scheduleChunk(
    base64Data: string,
    options?: {
      playbackRate?: number;
      volume?: number;
      onStart?: () => void;
      onEnded?: () => void;
    }
  ): Promise<AudioBufferSourceNode | null> {
    const ctx = this.warmup();
    if (!ctx) return null;

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("[GaplessPcmPlayer] AudioContext resume error:", e);
      }
    }

    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const alignedByteCount = Math.floor(bytes.byteLength / 2) * 2;
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, alignedByteCount / 2);
      const audioBuffer = ctx.createBuffer(1, int16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768.0;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const rate = options?.playbackRate || 1.0;
      source.playbackRate.value = rate;

      const gain = ctx.createGain();
      gain.gain.value = options?.volume !== undefined ? options.volume : 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      const duration = audioBuffer.duration / rate;
      const chunkStartTime = this.nextPlayTime;
      this.nextPlayTime += duration;
      this.activeSourcesCount++;
      this.isPlaying = true;
      this.activeSources.push(source);

      if (options?.onStart) {
        const delay = Math.max(0, (chunkStartTime - currentTime) * 1000);
        setTimeout(options.onStart, delay);
      }

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        this.activeSourcesCount = Math.max(0, this.activeSourcesCount - 1);

        if (options?.onEnded) {
          options.onEnded();
        }

        if (this.activeSourcesCount === 0 && (!this.audioCtx || this.audioCtx.currentTime >= this.nextPlayTime - 0.1)) {
          this.isPlaying = false;
        }
      };

      return source;
    } catch (e) {
      console.warn("[GaplessPcmPlayer] Error scheduling PCM chunk:", e);
      return null;
    }
  }

  public stop(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.activeSources = [];
    this.activeSourcesCount = 0;
    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    }
    this.isPlaying = false;
  }
}

export const sharedGaplessPlayer = new GaplessPcmPlayer();

export async function unlockAudioContext(): Promise<void> {
  await sharedGaplessPlayer.unlock();
}

export function getPreferredNaturalFemaleVoice(targetText?: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const isHindi = targetText ? /[\u0900-\u097F]/.test(targetText) : true;

    // Filter out known mechanical/espeak/male voices
    const nonRobotic = voices.filter((v) => {
      const name = v.name.toLowerCase();
      return !name.includes("espeak") && !name.includes("robot") && !name.includes("male") && !name.includes("david") && !name.includes("george");
    });

    if (isHindi) {
      // 1. Google / Natural / Neural Hindi Female
      const hiNaturalFemale = nonRobotic.find((v) => {
        const name = v.name.toLowerCase();
        const lang = v.lang.toLowerCase();
        return (lang.includes("hi") || lang.includes("in")) && 
          (name.includes("google") || name.includes("natural") || name.includes("neural") || name.includes("female") || name.includes("हिन्दी") || name.includes("hindi"));
      });
      if (hiNaturalFemale) return hiNaturalFemale;

      // 2. Any hi-IN voice
      const hiVoice = nonRobotic.find((v) => v.lang.toLowerCase().includes("hi"));
      if (hiVoice) return hiVoice;
    } else {
      // English target text
      const enFemale = nonRobotic.find((v) => {
        const name = v.name.toLowerCase();
        const lang = v.lang.toLowerCase();
        return (lang.includes("en") || lang.includes("in")) && 
          (name.includes("female") || name.includes("google") || name.includes("natural") || name.includes("zira") || name.includes("samantha"));
      });
      if (enFemale) return enFemale;
    }

    // Fallback to any en/hi Indian voice
    return nonRobotic.find((v) => v.lang.toLowerCase().includes("in") || v.lang.toLowerCase().includes("hi")) || null;
  } catch {
    return null;
  }
}

export function speakBrowserSpeechSynthesis(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#_~`]/g, "").trim();
      if (!clean) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "hi-IN";
      utterance.pitch = 1.1; // Warm natural female pitch
      utterance.rate = 1.0;
      
      const naturalVoice = getPreferredNaturalFemaleVoice();
      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

async function playRawPCM(base64Data: string): Promise<void> {
  const src = await sharedGaplessPlayer.scheduleChunk(base64Data);
  if (!src) return;
  return new Promise<void>((resolve) => {
    const prevOnEnded = src.onended;
    src.onended = (ev) => {
      if (prevOnEnded) prevOnEnded.call(src, ev);
      resolve();
    };
  });
}

// Preload voices in browser to avoid speech synthesis initialization delay
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  } catch {}
}

export function stopAllSpeech(): void {
  sharedGaplessPlayer.stop();
  if (currentActiveAudioElement) {
    try {
      currentActiveAudioElement.pause();
      currentActiveAudioElement.currentTime = 0;
    } catch (_) {}
    currentActiveAudioElement = null;
  }
  if (currentActiveAudioSource) {
    try {
      currentActiveAudioSource.stop();
    } catch (_) {}
    currentActiveAudioSource = null;
  }
  if (currentActiveAudioCtx) {
    try {
      currentActiveAudioCtx.close();
    } catch (_) {}
    currentActiveAudioCtx = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
}

/**
 * High-Definition Natural Zoya Voice Playback (Gemini Kore Voice).
 * Uses genuine Zoya AI voice engine with playPCM.
 */
export async function speakZoyaVoice(text: string): Promise<void> {
  stopAllSpeech();
  if (!text || !text.trim()) return;

  const cleanText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*#_~>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .trim();

  if (!cleanText) return;

  try {
    const audioRes = await getRoyalAudio(cleanText);
    if (audioRes) {
      await playPCM(audioRes);
    }
  } catch (err) {
    console.warn("Zoya voice playback error:", err);
  }
}

export const speakWithFallback = speakZoyaVoice;
export const playFastChatMessage = speakZoyaVoice;

// Realistic Outbound Phone Call Ringback Tone Synthesizer
let activeRingAudioCtx: AudioContext | null = null;
let activeRingInterval: any = null;

export function startPhoneRingTone(): void {
  stopPhoneRingTone();
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    activeRingAudioCtx = new AudioContextClass();
    const playBurst = () => {
      if (!activeRingAudioCtx || activeRingAudioCtx.state === "closed") return;
      
      const now = activeRingAudioCtx.currentTime;
      const osc1 = activeRingAudioCtx.createOscillator();
      const osc2 = activeRingAudioCtx.createOscillator();
      const gain = activeRingAudioCtx.createGain();

      osc1.frequency.value = 440; // 440 Hz standard dialer tone
      osc2.frequency.value = 480; // 480 Hz standard dialer tone

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.setValueAtTime(0.15, now + 1.2);
      gain.gain.linearRampToValueAtTime(0, now + 1.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(activeRingAudioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.3);
      osc2.stop(now + 1.3);
    };

    playBurst();
    activeRingInterval = setInterval(playBurst, 3500);
  } catch (e) {
    console.warn("Could not start ringback tone audio:", e);
  }
}

export function stopPhoneRingTone(): void {
  if (activeRingInterval) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
  if (activeRingAudioCtx) {
    try {
      activeRingAudioCtx.close();
    } catch (_) {}
    activeRingAudioCtx = null;
  }
}
