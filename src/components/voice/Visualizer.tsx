import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type ZoyaMood = "playful" | "serious" | "calming" | "excited" | "neutral";

interface VisualizerProps {
  state: "idle" | "listening" | "processing" | "speaking";
  mood?: ZoyaMood;
}

// Mood-based color palettes for Zoya (AI) speaking mode
const MOOD_PALETTES: Record<ZoyaMood, { color: string; glow: string; border: string }[]> = {
  // Playful / Joking - Warm Yellows, Oranges, Amber
  playful: [
    { color: "rgba(245, 158, 11, 1)", glow: "shadow-amber-500/80", border: "border-amber-400" },
    { color: "rgba(249, 115, 22, 1)", glow: "shadow-orange-500/80", border: "border-orange-500" },
    { color: "rgba(234, 179, 8, 1)", glow: "shadow-yellow-500/80", border: "border-yellow-400" },
    { color: "rgba(251, 191, 36, 1)", glow: "shadow-amber-400/80", border: "border-amber-300" },
  ],
  // Serious / Factual / Coding - Cool Blues, Deep Cyans
  serious: [
    { color: "rgba(59, 130, 246, 1)", glow: "shadow-blue-500/80", border: "border-blue-500" },
    { color: "rgba(6, 182, 212, 1)", glow: "shadow-cyan-500/80", border: "border-cyan-400" },
    { color: "rgba(14, 165, 233, 1)", glow: "shadow-sky-500/80", border: "border-sky-400" },
    { color: "rgba(99, 102, 241, 1)", glow: "shadow-indigo-500/80", border: "border-indigo-400" },
  ],
  // Calming / Empathetic - Soft Purple, Lavender, Teal
  calming: [
    { color: "rgba(168, 85, 247, 1)", glow: "shadow-purple-500/80", border: "border-purple-400" },
    { color: "rgba(20, 184, 166, 1)", glow: "shadow-teal-500/80", border: "border-teal-400" },
    { color: "rgba(192, 132, 252, 1)", glow: "shadow-purple-400/80", border: "border-purple-300" },
    { color: "rgba(45, 212, 191, 1)", glow: "shadow-teal-400/80", border: "border-teal-300" },
  ],
  // Excited / Energetic - Vibrant Magenta, Electric Pink, Neon Crimson
  excited: [
    { color: "rgba(236, 72, 153, 1)", glow: "shadow-pink-500/80", border: "border-pink-500" },
    { color: "rgba(239, 68, 68, 1)", glow: "shadow-red-500/80", border: "border-red-500" },
    { color: "rgba(244, 63, 94, 1)", glow: "shadow-rose-500/80", border: "border-rose-500" },
    { color: "rgba(217, 70, 239, 1)", glow: "shadow-fuchsia-500/80", border: "border-fuchsia-400" },
  ],
  // Neutral - Full Rainbow Cycling
  neutral: [
    { color: "rgba(239, 68, 68, 1)", glow: "shadow-red-500/80", border: "border-red-500" },
    { color: "rgba(59, 130, 246, 1)", glow: "shadow-blue-500/80", border: "border-blue-500" },
    { color: "rgba(34, 197, 94, 1)", glow: "shadow-green-500/80", border: "border-green-500" },
    { color: "rgba(234, 179, 8, 1)", glow: "shadow-yellow-500/80", border: "border-yellow-500" },
    { color: "rgba(168, 85, 247, 1)", glow: "shadow-purple-500/80", border: "border-purple-500" },
    { color: "rgba(236, 72, 153, 1)", glow: "shadow-pink-500/80", border: "border-pink-500" },
  ],
};

function VisualizerComponent({ state = "idle", mood = "neutral" }: VisualizerProps) {
  const [colorIndex, setColorIndex] = useState(0);

  const activePalette = MOOD_PALETTES[mood] || MOOD_PALETTES.neutral;

  // Auto color cycle every 2 seconds within active mood palette during speaking mode
  useEffect(() => {
    if (state === "speaking") {
      const interval = setInterval(() => {
        setColorIndex((prev) => (prev + 1) % activePalette.length);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [state, activePalette.length]);

  const getRingAnimation = (index: number, reverse: boolean = false) => {
    const baseSpeed = state === "listening" ? 3 : state === "processing" ? 1.5 : state === "speaking" ? 2 : 15;
    return {
      rotate: reverse ? [-360, 0] : [0, 360],
      transition: { duration: baseSpeed + index * 2, repeat: Infinity, ease: "linear" as const }
    };
  };

  const getPulseAnimation = () => {
    if (state === "speaking") {
      return {
        scale: [1, 1.05, 0.98, 1.02, 1],
        opacity: [0.8, 1, 0.8, 1, 0.8],
        transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" as const }
      };
    }
    if (state === "listening") {
      return {
        scale: [1, 1.02, 1],
        opacity: [0.7, 1, 0.7],
        transition: { duration: 1, repeat: Infinity, ease: "easeInOut" as const }
      };
    }
    if (state === "processing") {
      return {
        scale: [0.98, 1.02, 0.98],
        opacity: [0.6, 0.9, 0.6],
        transition: { duration: 0.8, repeat: Infinity, ease: "linear" as const }
      };
    }
    return {
      scale: [1, 1.01, 1],
      opacity: [0.4, 0.6, 0.4],
      transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const }
    };
  };

  const getTheme = () => {
    switch (state) {
      case "listening":
        // User is speaking - fixed single color (Violet), no color cycling
        return { color: "rgba(139, 92, 246, 1)", glow: "shadow-violet-500/60", border: "border-violet-400" };
      case "processing":
        // Thinking / processing - fixed single color (Sky Blue)
        return { color: "rgba(56, 189, 248, 1)", glow: "shadow-sky-400/80", border: "border-sky-400" };
      case "speaking":
        // Zoya (AI) is speaking - auto color-cycle animation every 2 seconds
        return activePalette[colorIndex % activePalette.length];
      default:
        // Idle - fixed single color (Cyan)
        return { color: "rgba(6, 182, 212, 0.8)", glow: "shadow-cyan-500/40", border: "border-cyan-500/50" };
    }
  };

  const theme = getTheme();

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
      {/* Ambient Glow */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[60%] h-[60%] rounded-full blur-[80px] ${theme.glow} transition-all duration-1000 ease-in-out`}
        style={{ backgroundColor: theme.color, opacity: 0.15 }}
      />

      {/* Ring 1: Massive Outer Dashed */}
      <motion.div
        animate={getRingAnimation(4, false)}
        className={`absolute w-[100%] h-[100%] rounded-full border-[1px] border-dashed ${theme.border} opacity-20 transition-all duration-1000 ease-in-out`}
      />

      {/* Ring 2: Segmented Thick Ring */}
      <motion.div
        animate={getRingAnimation(3, true)}
        className={`absolute w-[85%] h-[85%] rounded-full border-[2px] border-dotted ${theme.border} opacity-30 transition-all duration-1000 ease-in-out`}
      />

      {/* Ring 3: Scanner Ring (Solid with gaps) */}
      <motion.div
        animate={getRingAnimation(2, false)}
        className={`absolute w-[70%] h-[70%] rounded-full border-[1px] ${theme.border} border-t-transparent border-b-transparent opacity-40 transition-all duration-1000 ease-in-out`}
      />

      {/* Ring 4: Inner Dashed */}
      <motion.div
        animate={getRingAnimation(1, true)}
        className={`absolute w-[55%] h-[55%] rounded-full border-[2px] border-dashed ${theme.border} opacity-50 transition-all duration-1000 ease-in-out`}
      />
      
      {/* Ring 5: Core HUD Ring */}
      <motion.div
        animate={getRingAnimation(0, false)}
        className={`absolute w-[40%] h-[40%] rounded-full border-[4px] border-dotted ${theme.border} opacity-70 transition-all duration-1000 ease-in-out`}
      />

      {/* Core Circle */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[25%] h-[25%] rounded-full border-[1px] ${theme.border} bg-black/40 backdrop-blur-md flex items-center justify-center shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] transition-all duration-1000 ease-in-out`}
        style={{ boxShadow: `0 0 40px ${theme.color}, inset 0 0 30px ${theme.color}` }}
      >
        {/* Center Text */}
        <div 
          className="font-bold tracking-[0.3em] text-xl md:text-3xl lg:text-4xl text-white transition-all duration-1000 ease-in-out"
          style={{ textShadow: `0 0 15px ${theme.color}, 0 0 30px ${theme.color}` }}
        >
          ROYAL
        </div>
      </motion.div>
    </div>
  );
}

export const Visualizer = React.memo(VisualizerComponent);
export default Visualizer;
