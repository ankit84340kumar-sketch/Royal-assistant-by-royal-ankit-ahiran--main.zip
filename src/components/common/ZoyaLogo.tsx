import React from "react";

interface ZoyaLogoProps {
  className?: string;
  size?: number;
  showGlow?: boolean;
}

/**
 * ZoyaLogo Component
 * Renders the official ZOYA AI logo in a perfectly circular (1:1 round) badge format
 * with crisp white background, elegant subtle ring, and minimized centered ZOYA wordmark.
 * Directly renders inline vector SVG to guarantee immediate rendering without browser cache delays on Public URL.
 */
export default function ZoyaLogo({ 
  className = "", 
  size = 40, 
  showGlow = false 
}: ZoyaLogoProps) {
  return (
    <div 
      className={`relative shrink-0 rounded-full flex items-center justify-center bg-white overflow-hidden border border-slate-200/90 shadow-md transition-all duration-200 hover:scale-105 ${showGlow ? "shadow-[0_0_20px_rgba(0,163,255,0.4)] ring-2 ring-cyan-400/70" : ""} ${className}`}
      style={{ 
        width: size, 
        height: size,
        backgroundColor: "#FFFFFF"
      }}
      title="ZOYA AI"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 800 800" 
        className="w-full h-full select-none pointer-events-none"
        aria-label="ZOYA AI Logo"
      >
        <defs>
          <clipPath id="zoya_circleClip">
            <circle cx="400" cy="400" r="392"/>
          </clipPath>

          <linearGradient id="zoya_zTopGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0066FF"/>
            <stop offset="45%" stopColor="#0099FF"/>
            <stop offset="100%" stopColor="#0040B0"/>
          </linearGradient>

          <linearGradient id="zoya_zDiagGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00E5FF"/>
            <stop offset="25%" stopColor="#0088FF"/>
            <stop offset="60%" stopColor="#003399"/>
            <stop offset="85%" stopColor="#0A101D"/>
            <stop offset="100%" stopColor="#020408"/>
          </linearGradient>

          <linearGradient id="zoya_zBottomGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0080FF"/>
            <stop offset="60%" stopColor="#0040A0"/>
            <stop offset="100%" stopColor="#080C14"/>
          </linearGradient>

          <linearGradient id="zoya_oLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0080FF"/>
            <stop offset="40%" stopColor="#0044BB"/>
            <stop offset="80%" stopColor="#0E1626"/>
            <stop offset="100%" stopColor="#04060A"/>
          </linearGradient>

          <linearGradient id="zoya_oRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#060910"/>
            <stop offset="35%" stopColor="#0F1829"/>
            <stop offset="75%" stopColor="#0055CC"/>
            <stop offset="100%" stopColor="#0099FF"/>
          </linearGradient>

          <linearGradient id="zoya_yStemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#141A24"/>
            <stop offset="100%" stopColor="#030508"/>
          </linearGradient>

          <linearGradient id="zoya_yLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#141C2B"/>
            <stop offset="70%" stopColor="#080C14"/>
            <stop offset="100%" stopColor="#020306"/>
          </linearGradient>

          <linearGradient id="zoya_yRightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0044BB"/>
            <stop offset="50%" stopColor="#0088FF"/>
            <stop offset="100%" stopColor="#00C8FF"/>
          </linearGradient>

          <linearGradient id="zoya_aArchGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0D131C"/>
            <stop offset="50%" stopColor="#1A2230"/>
            <stop offset="100%" stopColor="#030508"/>
          </linearGradient>

          <linearGradient id="zoya_aSwooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00E5FF"/>
            <stop offset="50%" stopColor="#0080FF"/>
            <stop offset="100%" stopColor="#003399"/>
          </linearGradient>
        </defs>

        {/* Solid Pure White Circle Base */}
        <circle cx="400" cy="400" r="392" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="4"/>

        {/* Centered Minimized ZOYA Wordmark */}
        <g clipPath="url(#zoya_circleClip)">
          <g transform="translate(400, 400) scale(0.63) translate(-575, -430)">
            {/* LETTER Z */}
            <path d="M 100 320 L 320 320 C 335 320 345 324 340 338 L 325 352 L 130 352 C 112 352 102 340 100 320 Z" fill="url(#zoya_zTopGrad)"/>
            <path d="M 80 540 C 115 505 175 440 240 375 L 335 330 L 340 348 C 275 415 200 485 150 540 Z" fill="url(#zoya_zDiagGrad)"/>
            <path d="M 150 515 L 325 515 C 335 515 335 538 320 538 L 140 538 C 125 538 132 526 150 515 Z" fill="url(#zoya_zBottomGrad)"/>

            {/* LETTER O */}
            <path d="M 450 320 C 375 320 335 368 335 430 C 335 492 375 540 450 540 L 458 540 L 458 510 L 450 510 C 395 510 368 475 368 430 C 368 385 395 350 450 350 L 458 350 L 458 320 Z" fill="url(#zoya_oLeftGrad)"/>
            <path d="M 472 320 L 472 350 L 480 350 C 535 350 562 385 562 430 C 562 475 535 510 480 510 L 472 510 L 472 540 L 480 540 C 555 540 595 492 595 430 C 595 368 555 320 480 320 Z" fill="url(#zoya_oRightGrad)"/>

            {/* LETTER Y */}
            <rect x="696" y="470" width="34" height="70" fill="url(#zoya_yStemGrad)"/>
            <path d="M 590 320 L 700 475 L 726 475 L 620 320 Z" fill="url(#zoya_yLeftGrad)"/>
            <path d="M 700 475 L 845 320 L 810 320 L 685 458 Z" fill="url(#zoya_yRightGrad)"/>

            {/* LETTER A */}
            <path d="M 790 540 C 830 460 880 330 930 320 C 980 330 1030 460 1070 540 L 1035 540 C 1005 480 965 365 930 360 C 895 365 855 480 825 540 Z" fill="url(#zoya_aArchGrad)"/>
            <path d="M 850 500 C 895 450 970 445 1025 518 C 985 485 925 470 882 506 Z" fill="url(#zoya_aSwooshGrad)"/>
          </g>
        </g>
      </svg>
    </div>
  );
}
