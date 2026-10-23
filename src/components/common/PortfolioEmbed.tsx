import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ExternalLink, RotateCcw, Globe, AlertCircle } from "lucide-react";

interface PortfolioEmbedProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCAL_PORTFOLIO_URL = "/portfolio.html";
const NETLIFY_PORTFOLIO_URL = "https://royalankitahiranl.netlify.app";

export default function PortfolioEmbed({ isOpen, onClose }: PortfolioEmbedProps) {
  const [activeSource, setActiveSource] = useState<"local" | "netlify">("local");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setHasError(false);
      setIframeKey((prev) => prev + 1);
    }
  }, [isOpen, activeSource]);

  if (!isOpen) return null;

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setIframeKey((prev) => prev + 1);
  };

  const currentIframeSrc = activeSource === "local" ? LOCAL_PORTFOLIO_URL : NETLIFY_PORTFOLIO_URL;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl h-[92vh] max-h-[880px] bg-[#0f0f13] border border-white/15 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Top Navigation & Status Bar */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-black/75 border-b border-white/10 shrink-0 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-red-400 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">
                  Royal Ankit Ahiran Portfolio
                </h3>
              </div>

              {/* Netlify Live Status Badge */}
              <div 
                className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600/15 border border-red-500/30 text-[11px] font-mono text-red-200"
                title="Portfolio embedded & live at royalankitahiranl.netlify.app"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-medium text-white/90">royalankitahiranl.netlify.app</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Source Toggle */}
              <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-medium text-white/70">
                <button
                  onClick={() => setActiveSource("local")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    activeSource === "local" ? "bg-red-600 text-white font-semibold" : "hover:text-white"
                  }`}
                >
                  Built-in
                </button>
                <button
                  onClick={() => setActiveSource("netlify")}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    activeSource === "netlify" ? "bg-red-600 text-white font-semibold" : "hover:text-white"
                  }`}
                >
                  Netlify Live
                </button>
              </div>

              {/* Refresh iframe */}
              <button
                onClick={handleRefresh}
                className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="Reload Website"
              >
                <RotateCcw size={13} className={isLoading ? "animate-spin text-red-400" : ""} />
                <span className="hidden sm:inline">Reload</span>
              </button>

              {/* Open in full browser tab */}
              <a
                id="btn-portfolio-open-external"
                href={NETLIFY_PORTFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white shadow-md text-xs font-semibold transition-all cursor-pointer hover:scale-105 active:scale-95"
                title="Open royalankitahiranl.netlify.app in new browser tab"
              >
                <span>Open Site</span>
                <ExternalLink size={12} />
              </a>

              {/* Close Modal (X) */}
              <button
                id="btn-portfolio-close"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Embedded Portfolio Website Area */}
          <div className="flex-1 w-full h-full bg-[#0a0a0a] relative overflow-hidden">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0e] gap-3">
                <div className="w-9 h-9 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-semibold text-white/90">
                    Loading Royal Ankit Ahiran Portfolio...
                  </p>
                  <p className="text-[11px] text-red-300/80 font-mono mt-0.5">
                    royalankitahiranl.netlify.app
                  </p>
                </div>
              </div>
            )}

            {hasError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0d0d12] p-6 text-center gap-3 text-white">
                <div className="p-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
                  <AlertCircle size={28} />
                </div>
                <h4 className="text-sm font-bold text-white">Site load nahi ho paayi</h4>
                <p className="text-xs text-white/70 max-w-sm">
                  Site load nahi ho paayi, seedha browser mein kholne ke liye Open button dabayein.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href={NETLIFY_PORTFOLIO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <span>Open Site in Browser</span>
                    <ExternalLink size={13} />
                  </a>
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            <iframe
              key={iframeKey}
              src={currentIframeSrc}
              title="Royal Ankit Ahiran Portfolio"
              className="w-full h-full border-0 bg-[#0a0a0a]"
              allow="clipboard-write; encrypted-media; picture-in-picture; web-share"
              loading="eager"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                if (activeSource === "netlify") {
                  setActiveSource("local");
                } else {
                  setHasError(true);
                }
              }}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
