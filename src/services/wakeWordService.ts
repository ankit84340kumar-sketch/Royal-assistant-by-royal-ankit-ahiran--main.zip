// wakeWordService.ts - Hands-Free "Hey Zoya" Wake Word Detection

export class WakeWordDetector {
  private recognition: any = null;
  private isListening = false;
  private onWakeWordDetected: () => void;
  private onError?: (err: any) => void;

  constructor(onWakeWordDetected: () => void, onError?: (err: any) => void) {
    this.onWakeWordDetected = onWakeWordDetected;
    this.onError = onError;
  }

  public isSupported(): boolean {
    return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }

  public start(): boolean {
    if (!this.isSupported()) {
      return false;
    }

    if (this.isListening) return true;

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "hi-IN"; // Supports Hindi/Bhojpuri accents & English wake words

      this.recognition.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && lastResult[0]) {
          const transcript = lastResult[0].transcript.toLowerCase().trim();
          
          // Match "Hey Zoya", "Zoya", "Hello Zoya", "Suno Zoya", "Ae Zoya", "Joya"
          if (
            transcript.includes("zoya") ||
            transcript.includes("joya") ||
            transcript.includes("hey zoya") ||
            transcript.includes("hello zoya") ||
            transcript.includes("suno zoya") ||
            transcript.includes("ae zoya") ||
            transcript.includes("ज़ोया") ||
            transcript.includes("जोया")
          ) {
            console.log("⚡ Wake word detected:", transcript);
            this.stop();
            this.onWakeWordDetected();
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("WakeWord recognition error:", event.error);
          if (this.onError) this.onError(event.error);
        }
      };

      this.recognition.onend = () => {
        // Auto restart if still supposed to listen
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            // Ignore start collisions
          }
        }
      };

      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e) {
      console.error("Failed to start WakeWordDetector:", e);
      if (this.onError) this.onError(e);
      return false;
    }
  }

  public stop(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
      this.recognition = null;
    }
  }

  public getActiveState(): boolean {
    return this.isListening;
  }
}
