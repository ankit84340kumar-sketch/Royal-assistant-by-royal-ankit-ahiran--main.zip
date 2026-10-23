import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Zoya ErrorBoundary Caught]:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 w-screen h-[100dvh] bg-[#050505] text-white flex flex-col items-center justify-center p-6 text-center z-50 select-none">
          <div className="max-w-md w-full bg-[#141414] border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">ZOYA AI ASSISTANT</h2>
            <p className="text-xs text-white/70 leading-relaxed">
              An unexpected component error occurred. Zoya was automatically protected from a crash loop.
            </p>
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
            >
              Resume Home Screen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
