import React, { useEffect, useRef, useState } from "react";

interface FreeTrialTimerProps {
  remainingSeconds: number;
}

export default function FreeTrialTimer({ remainingSeconds }: FreeTrialTimerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPulse, setIsPulse] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);
  const poolIndexRef = useRef(0);
  const wavUrlRef = useRef<string | null>(null);
  const lastBeepSecondRef = useRef<number>(-1);

  // Synthesize realistic in-memory "tu-ing" WAV audio
  const buildWav = (): string => {
    const sr = 22050;
    const len = Math.floor(sr * 0.5);
    const buf = new ArrayBuffer(44 + len * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));

    w(0, 'RIFF');
    v.setUint32(4, 36 + len * 2, true);
    w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, 'data');
    v.setUint32(40, len * 2, true);

    let ph = 0;
    for (let i = 0; i < len; i++) {
      const x = i / sr;
      let f = x < 0.07 
        ? 420 * Math.pow(1500 / 420, x / 0.07)
        : x < 0.22 
        ? 1500 * Math.pow(880 / 1500, (x - 0.07) / 0.15)
        : 880 * Math.pow(1000 / 880, (x - 0.22) / 0.18);
      f += 35 * Math.sin(2 * Math.PI * 28 * x);
      ph += (2 * Math.PI * f) / sr;
      const s = (2 / Math.PI) * Math.asin(Math.sin(ph)) + 0.25 * Math.sin(2 * ph);
      const env = x < 0.012 ? x / 0.012 : Math.exp((-8.6 * (x - 0.012)) / 0.488);
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.9)) * 32767, true);
    }

    const blob = new Blob([buf], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  // WebAudio oscillator synthesized "tu-ing" ringtone
  const webBeep = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtxClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      const n = ctx.currentTime;
      const g = ctx.createGain();
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, n);
      g.gain.exponentialRampToValueAtTime(0.7, n + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.5);

      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(420, n);
      o.frequency.exponentialRampToValueAtTime(1500, n + 0.07);
      o.frequency.exponentialRampToValueAtTime(880, n + 0.22);
      o.frequency.exponentialRampToValueAtTime(1000, n + 0.4);

      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.setValueAtTime(840, n);
      o2.frequency.exponentialRampToValueAtTime(3000, n + 0.07);
      o2.frequency.exponentialRampToValueAtTime(1760, n + 0.22);

      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o2.connect(g2).connect(g);

      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 28;
      lg.gain.value = 35;
      lfo.connect(lg).connect(o.frequency);

      o.connect(g);
      [o, o2, lfo].forEach((x) => {
        x.start(n);
        x.stop(n + 0.5);
      });
    } catch {}
  };

  const playBeep = () => {
    // 1. Play WebAudio synthesizer immediately
    webBeep();

    // 2. Play HTML5 Audio pool as secondary fallback
    try {
      if (audioPoolRef.current.length > 0) {
        const a = audioPoolRef.current[poolIndexRef.current++ % audioPoolRef.current.length];
        a.currentTime = 0;
        a.volume = 0.85;
        a.play().catch(() => {});
      }
    } catch {}

    // 3. Subtle haptic vibration pulse
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch {}
  };

  // Initialize audio pool on mount or user touch
  useEffect(() => {
    const unlock = () => {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass && !audioCtxRef.current) {
          audioCtxRef.current = new AudioCtxClass();
        }
        if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch {}

      if (!wavUrlRef.current) {
        wavUrlRef.current = buildWav();
      }

      if (audioPoolRef.current.length === 0 && wavUrlRef.current) {
        audioPoolRef.current = [0, 1, 2, 3, 4, 5].map(() => {
          const a = new Audio(wavUrlRef.current!);
          a.preload = "auto";
          return a;
        });
        audioPoolRef.current.forEach((a) => {
          a.muted = true;
          a.play()
            .then(() => {
              a.pause();
              a.currentTime = 0;
              a.muted = false;
            })
            .catch(() => {
              a.muted = false;
            });
        });
      }
    };

    unlock();
    const events = ["pointerdown", "touchstart", "click", "keydown"];
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));

    // Expand pill smoothly after entry
    const openTimer = setTimeout(() => {
      setIsOpen(true);
    }, 450);

    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock));
      clearTimeout(openTimer);
      if (wavUrlRef.current) {
        URL.revokeObjectURL(wavUrlRef.current);
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close().catch(() => {});
        } catch {}
      }
    };
  }, []);

  // Pulse animation & Sound chime on each countdown tick
  useEffect(() => {
    setIsPulse(true);
    const pulseTimer = setTimeout(() => setIsPulse(false), 400);

    // Final 5 seconds: trigger sound and vibration
    if (remainingSeconds <= 5 && remainingSeconds >= 1) {
      if (lastBeepSecondRef.current !== remainingSeconds) {
        lastBeepSecondRef.current = remainingSeconds;
        playBeep();
      }
    }

    return () => clearTimeout(pulseTimer);
  }, [remainingSeconds]);

  const isHot = remainingSeconds <= 5 && remainingSeconds > 0;
  const progressRatio = Math.max(0, Math.min(1, remainingSeconds / 15));

  return (
    <>
      <style>{`
        :root {
          --bar-bg: #15122b;
          --bar-text: #ffffff;
          --bar-sub: #a9a3d6;
          --track: #2b2752;
        }
        .ft-ring {
          position: fixed;
          left: 50%;
          top: max(16vh, calc(env(safe-area-inset-top, 0px) + 55px));
          width: 68px;
          height: 68px;
          margin-left: -34px;
          border-radius: 50%;
          border: 2px solid #7b6cff;
          opacity: 0;
          pointer-events: none;
          z-index: 74;
          animation: ftRing 1.8s ease-out both;
        }
        .ft-ring.r2 {
          animation-delay: 0.45s;
        }
        @keyframes ftRing {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        .ft-wrap {
          position: fixed;
          left: 50%;
          top: max(16vh, calc(env(safe-area-inset-top, 0px) + 55px));
          transform: translateX(-50%);
          width: 68px;
          height: 68px;
          border-radius: 34px;
          transition: width 0.85s cubic-bezier(0.3, 0.8, 0.25, 1);
          z-index: 75;
          pointer-events: none;
          user-select: none;
          animation: ftEnter 0.75s cubic-bezier(0.2, 1.2, 0.4, 1) both;
        }
        @keyframes ftEnter {
          from { transform: translateX(-50%) scale(0.2); opacity: 0; }
          to { transform: translateX(-50%) scale(1); opacity: 1; }
        }
        .ft-wrap.open {
          width: min(92vw, 410px);
        }
        .ft-halo, .ft-clip {
          position: absolute;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
        }
        .ft-halo {
          inset: -3px;
          filter: blur(13px);
          opacity: 0.7;
          transition: opacity 0.6s;
        }
        .ft-clip {
          inset: 0;
        }
        .ft-spin {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 700px;
          height: 700px;
          margin: -350px 0 0 -350px;
          opacity: 1;
          transition: opacity 0.6s;
          background: conic-gradient(#ff3b5c, #ff8a3b, #ffd23b, #9be23b, #2bdc8a, #2bd4d4, #3b8bff, #7b6cff, #c23bff, #ff3bb0, #ff3b5c);
          animation: ftSpin 3.2s linear infinite;
        }
        @keyframes ftSpin {
          to { transform: rotate(360deg); }
        }
        .ft-wrap.hot .ft-spin {
          animation-duration: 1.1s;
        }
        .ft-wrap.hot .ft-halo {
          opacity: 0.95;
        }
        .ft-pulse .ft-halo {
          animation: ftFlash 0.45s ease-out;
        }
        @keyframes ftFlash {
          from { transform: scale(1.08); }
          to { transform: scale(1); }
        }
        .ft-bar {
          position: absolute;
          inset: 2px;
          z-index: 1;
          background: var(--bar-bg);
          border-radius: 32px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding: 0;
          color: var(--bar-text);
          white-space: nowrap;
          transition: padding 0.85s cubic-bezier(0.3, 0.8, 0.25, 1);
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.65);
        }
        .ft-wrap.open .ft-bar {
          padding-left: 14px;
        }
        .ft-num {
          flex: none;
          width: 62px;
          font-size: 32px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          text-align: center;
          transition: width 0.85s cubic-bezier(0.3, 0.8, 0.25, 1), color 0.3s;
        }
        .ft-wrap.open .ft-num {
          width: 50px;
        }
        .ft-wrap.hot .ft-num {
          color: #ff5c7a;
        }
        .ft-pulse .ft-num {
          animation: ftRoll 0.35s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        @keyframes ftRoll {
          from { transform: translateY(-40%) scale(1.15); opacity: 0; }
          to { transform: none; opacity: 1; }
        }
        .ft-txt {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
          opacity: 0;
          max-width: 0;
          overflow: hidden;
          margin-left: 0;
          transition: opacity 0.5s 0.3s, max-width 0.85s, margin-left 0.85s;
        }
        .ft-wrap.open .ft-txt {
          opacity: 1;
          max-width: 280px;
          margin-left: 8px;
        }
        .ft-txt small {
          display: block;
          font-weight: 400;
          color: var(--bar-sub);
          font-size: 11px;
        }
        .ft-prog {
          position: absolute;
          left: 24px;
          right: 24px;
          bottom: 5px;
          height: 3px;
          border-radius: 2px;
          background: var(--track);
          opacity: 0;
          transition: opacity 0.5s 0.4s;
          overflow: hidden;
        }
        .ft-wrap.open .ft-prog {
          opacity: 1;
        }
        .ft-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, #3b8bff, #7b6cff, #ff3b5c);
          transform-origin: left;
          transition: transform 0.4s ease-out;
        }
      `}</style>

      {/* Ripple Rings */}
      <div className="ft-ring" />
      <div className="ft-ring r2" />

      {/* Main Expandable Pill */}
      <div className={`ft-wrap ${isOpen ? "open" : ""} ${isHot ? "hot" : ""} ${isPulse ? "ft-pulse" : ""}`}>
        <div className="ft-halo">
          <div className="ft-spin" />
        </div>
        <div className="ft-clip">
          <div className="ft-spin" />
        </div>
        <div className="ft-bar">
          <div className="ft-num">{remainingSeconds}</div>
          <div className="ft-txt">
            Free time is ending
            <small>Log in to continue</small>
          </div>
          <div className="ft-prog">
            <div 
              className="ft-fill" 
              style={{ transform: `scaleX(${progressRatio})` }} 
            />
          </div>
        </div>
      </div>
    </>
  );
}
