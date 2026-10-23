import React, { useState, useEffect } from "react";
import { motion } from "motion/react";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  sublabel?: string;
  showSlowNetworkMessage?: boolean;
  slowNetworkDelayMs?: number;
  className?: string;
  variant?: "inline" | "card" | "fullscreen" | "overlay";
  color?: "cyan" | "teal" | "gradient" | "white" | "red";
}

const sizeMap: Record<SpinnerSize, { dim: number; stroke: number; textClass: string; subTextClass: string }> = {
  xs: { dim: 14, stroke: 2, textClass: "text-[10px]", subTextClass: "text-[9px]" },
  sm: { dim: 18, stroke: 2.2, textClass: "text-xs", subTextClass: "text-[10px]" },
  md: { dim: 26, stroke: 2.8, textClass: "text-sm", subTextClass: "text-xs" },
  lg: { dim: 38, stroke: 3.2, textClass: "text-base", subTextClass: "text-xs" },
  xl: { dim: 54, stroke: 3.8, textClass: "text-lg", subTextClass: "text-xs" },
  "2xl": { dim: 72, stroke: 4.2, textClass: "text-xl", subTextClass: "text-sm" },
};

export default function LoadingSpinner({
  size = "md",
  label,
  sublabel,
  showSlowNetworkMessage = true,
  slowNetworkDelayMs = 4500,
  className = "",
  variant = "inline",
  color = "gradient",
}: LoadingSpinnerProps) {
  const [isSlow, setIsSlow] = useState(false);
  const { dim, stroke, textClass, subTextClass } = sizeMap[size];

  useEffect(() => {
    if (!showSlowNetworkMessage) return;
    const timer = setTimeout(() => {
      setIsSlow(true);
    }, slowNetworkDelayMs);

    return () => clearTimeout(timer);
  }, [showSlowNetworkMessage, slowNetworkDelayMs]);

  // Unique ID for SVG gradient definitions
  const gradientId = `zoya-spinner-grad-${size}-${color}`;

  const spinnerGraphic = (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: dim, height: dim }}>
      {/* Soft Ambient Glow Behind Spinner */}
      {(size === "lg" || size === "xl" || size === "2xl") && (
        <div 
          className="absolute inset-0 rounded-full bg-cyan-500/20 blur-md animate-pulse pointer-events-none"
          style={{ transform: "scale(1.35)" }}
        />
      )}

      {/* Main Continuous 360-Degree Rotating Spinner */}
      <svg
        className="animate-spin"
        style={{
          width: dim,
          height: dim,
          animationDuration: "0.85s",
          filter: "drop-shadow(0 0 6px rgba(6, 182, 212, 0.45))",
        }}
        viewBox="0 0 50 50"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {color === "red" ? (
              <>
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#f87171" />
              </>
            ) : color === "teal" ? (
              <>
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#2dd4bf" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#38bdf8" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* Faint Background Track Ring */}
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={stroke * 1.5}
        />

        {/* Active Rotating Gradient Arc */}
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke={color === "white" ? "#ffffff" : `url(#${gradientId})`}
          strokeWidth={stroke * 1.5}
          strokeLinecap="round"
          strokeDasharray="95, 150"
          strokeDashoffset="0"
        />
      </svg>

      {/* Center Micro Dot for lg/xl sizes */}
      {(size === "xl" || size === "2xl") && (
        <div className="absolute w-2 h-2 rounded-full bg-cyan-400 animate-ping opacity-75" />
      )}
    </div>
  );

  // 1. Fullscreen / Modal Overlay Loading View
  if (variant === "fullscreen") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050508]/85 backdrop-blur-md p-4 text-center select-none"
      >
        <div className="relative p-8 rounded-3xl bg-[#0c0c12]/90 border border-cyan-500/20 shadow-2xl shadow-cyan-950/50 flex flex-col items-center max-w-sm w-full">
          {/* Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 bg-cyan-500/15 blur-2xl rounded-full pointer-events-none" />

          {/* Spinner */}
          <div className="mb-4">
            <LoadingSpinner size={size === "xs" || size === "sm" ? "xl" : size} showSlowNetworkMessage={false} />
          </div>

          {/* Labels */}
          {label && (
            <h3 className={`font-semibold text-white tracking-wide mb-1 ${textClass}`}>
              {label}
            </h3>
          )}

          {sublabel && (
            <p className={`text-white/60 leading-relaxed max-w-xs ${subTextClass}`}>
              {sublabel}
            </p>
          )}

          {/* Slow connection notification badge */}
          {isSlow && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3.5 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>Slow network connection. Still connecting, please hold on...</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  // 2. Card / Block View with optional text
  if (variant === "card") {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center ${className}`}>
        {spinnerGraphic}
        {label && (
          <p className={`mt-3 font-medium text-white/90 tracking-wide ${textClass}`}>
            {label}
          </p>
        )}
        {sublabel && (
          <p className={`mt-1 text-white/50 ${subTextClass}`}>
            {sublabel}
          </p>
        )}
        {isSlow && (
          <p className="mt-2 text-[11px] text-cyan-400/80 italic animate-pulse">
            Connecting... Thoda ruko...
          </p>
        )}
      </div>
    );
  }

  // 3. Overlay (e.g. over an iframe, component or button)
  if (variant === "overlay") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center ${className}`}
      >
        {spinnerGraphic}
        {label && (
          <span className={`mt-2.5 font-medium text-cyan-200 tracking-wide ${textClass}`}>
            {label}
          </span>
        )}
        {isSlow && (
          <span className="mt-1 text-[11px] text-cyan-400/90 italic">
            Taking longer than usual, please wait...
          </span>
        )}
      </motion.div>
    );
  }

  // 4. Default Inline with optional label side-by-side or stacked
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {spinnerGraphic}
      {label && (
        <span className={`font-medium tracking-wide ${textClass}`}>
          {label}
        </span>
      )}
    </div>
  );
}
