# AGENTS.md — Zoya AI Voice Assistant Project Instructions

## LOCK STATUS: UNLOCKED / PERMANENTLY REMOVED

The lock protocol and developer authorization code requirement have been permanently removed as requested by the owner. The AI Assistant has full, unrestricted authorization to make code changes, fixes, and enhancements whenever requested by the user, without asking for any unlock code.

### Core Guidelines for the AI Assistant

1. **Direct Execution:**
   - Execute user requests directly, quickly, and completely without asking for confirmation codes or unlock passwords.
   - Maintain pristine code quality, clean layouts, and stable performance across all features.

2. **Preservation of Existing Functionality:**
   - All core features must remain intact and functional:
     - Authentication & Session Persistence (Google Sign-In, Email/Mobile login)
     - Voice History & Conversation Storage
     - Chat History & Gemini AI Assistant integration
     - Portfolio Embed (`https://royalankitahiranl.netlify.app`)
     - Voice Calling / Dialer
     - Zoya Personality & System Prompt
     - Telegram Dispatch & Verification
     - Audio Visualizer & Mute Controls
     - Admin Panel (Developer email gated)
     - User Profile & Settings

---

## Admin Panel Remote Configuration

- Live feature toggles (Voice Calling, Screen Vision, Wake Word, Maintenance Mode)
- Real-time Maintenance Announcement banner and custom maintenance message
- System Broadcast message creation, editing, and dismissal across active user sessions
- Bug report status updates and triage
These are stored in Cloud Firestore and take effect dynamically across all client sessions.

