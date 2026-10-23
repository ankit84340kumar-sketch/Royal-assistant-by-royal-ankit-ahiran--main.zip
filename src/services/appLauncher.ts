/**
 * Direct Native App Launcher with Instant Deep-Linking & Smart Fallback
 * 
 * Logic:
 * 1. Checks if the official app is installed on the user's phone / device.
 * 2. If installed: Directly opens the native installed app (via native scheme / Android intent)
 *    taking the user straight into the app without opening any website or asking for website login.
 * 3. If NOT installed on the device: Automatically falls back to opening the official website.
 * 4. Works directly and immediately without needing any permission.
 */

export interface AppLaunchOptions {
  name: string;
  appScheme?: string;
  androidIntent?: string;
  iosScheme?: string;
  webUrl: string;
  specificScreen?: string;
  message?: string;
  isWebsiteOnly?: boolean;
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || "";
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

export function isAndroid(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  const ua = navigator.userAgent || "";
  return /android/i.test(ua);
}

export function isIOS(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  const ua = navigator.userAgent || "";
  return /ipad|iphone|ipod/i.test(ua);
}

/**
 * Registry of known apps with native deep links, Android package intents, and official website URLs
 */
interface AppRegistryEntry {
  name: string;
  aliases: string[];
  appScheme: string;
  androidPackage: string;
  androidIntent?: string;
  iosScheme?: string;
  defaultWebUrl: string;
  getScreenConfig?: (screen?: string, query?: string, target?: string) => Partial<AppLaunchOptions>;
}

const APP_REGISTRY: Record<string, AppRegistryEntry> = {
  telegram: {
    name: "Telegram",
    aliases: ["telegram", "tele", "tg", "टेलीग्राम", "टेलिग्राम", "टेली"],
    appScheme: "tg://",
    androidPackage: "org.telegram.messenger",
    androidIntent: "intent://#Intent;package=org.telegram.messenger;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "tg://",
    defaultWebUrl: "https://t.me/",
    getScreenConfig: (screen, query, target) => {
      const handle = (target || query || "").replace("@", "").trim();
      if (handle) {
        return {
          appScheme: `tg://resolve?domain=${handle}`,
          androidIntent: `intent://resolve?domain=${handle}#Intent;package=org.telegram.messenger;scheme=tg;end;`,
          iosScheme: `tg://resolve?domain=${handle}`,
          webUrl: `https://t.me/${handle}`,
        };
      }
      return {
        appScheme: "tg://",
        androidIntent: "intent://#Intent;package=org.telegram.messenger;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
        iosScheme: "tg://",
        webUrl: "https://t.me/",
      };
    },
  },
  whatsapp: {
    name: "WhatsApp",
    aliases: ["whatsapp", "wa", "whatsap", "whats app", "व्हाट्सएप", "व्हाट्सएप्प"],
    appScheme: "whatsapp://",
    androidPackage: "com.whatsapp",
    androidIntent: "intent://#Intent;package=com.whatsapp;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "whatsapp://",
    defaultWebUrl: "https://web.whatsapp.com/",
    getScreenConfig: (screen, query, target) => {
      const cleanNumber = target ? target.replace(/[^\d+]/g, "") : "";
      const encodedMsg = query ? encodeURIComponent(query.trim()) : "";
      if (cleanNumber && encodedMsg) {
        return {
          appScheme: `whatsapp://send?phone=${cleanNumber}&text=${encodedMsg}`,
          androidIntent: `intent://send?phone=${cleanNumber}&text=${encodedMsg}#Intent;package=com.whatsapp;scheme=whatsapp;end;`,
          webUrl: `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodedMsg}`,
        };
      } else if (encodedMsg) {
        return {
          appScheme: `whatsapp://send?text=${encodedMsg}`,
          androidIntent: `intent://send?text=${encodedMsg}#Intent;package=com.whatsapp;scheme=whatsapp;end;`,
          webUrl: `https://api.whatsapp.com/send?text=${encodedMsg}`,
        };
      } else if (cleanNumber) {
        return {
          appScheme: `whatsapp://send?phone=${cleanNumber}`,
          androidIntent: `intent://send?phone=${cleanNumber}#Intent;package=com.whatsapp;scheme=whatsapp;end;`,
          webUrl: `https://api.whatsapp.com/send?phone=${cleanNumber}`,
        };
      }
      return {
        appScheme: "whatsapp://",
        androidIntent: "intent://#Intent;package=com.whatsapp;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
        iosScheme: "whatsapp://",
        webUrl: "https://web.whatsapp.com/",
      };
    },
  },
  instagram: {
    name: "Instagram",
    aliases: ["instagram", "insta", "ig", "इंस्टाग्राम", "इंस्टा"],
    appScheme: "instagram://app",
    androidPackage: "com.instagram.android",
    androidIntent: "intent://#Intent;package=com.instagram.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "instagram://app",
    defaultWebUrl: "https://www.instagram.com/",
    getScreenConfig: (screen) => {
      if (screen === "dms" || screen === "messages" || screen === "inbox") {
        return {
          name: "Instagram DMs",
          appScheme: "instagram://direct_inbox",
          androidIntent: "intent://direct_inbox#Intent;package=com.instagram.android;scheme=instagram;end;",
          iosScheme: "instagram://direct_inbox",
          webUrl: "https://www.instagram.com/direct/inbox/",
        };
      }
      return {
        appScheme: "instagram://app",
        androidIntent: "intent://#Intent;package=com.instagram.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
        iosScheme: "instagram://app",
        webUrl: "https://www.instagram.com/",
      };
    },
  },
  youtube: {
    name: "YouTube",
    aliases: ["youtube", "yt", "यूट्यूब"],
    appScheme: "vnd.youtube://",
    androidPackage: "com.google.android.youtube",
    androidIntent: "intent://#Intent;package=com.google.android.youtube;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "youtube://",
    defaultWebUrl: "https://www.youtube.com/",
    getScreenConfig: (screen, query) => {
      if (query) {
        const encoded = encodeURIComponent(query.trim());
        return {
          appScheme: `vnd.youtube://results?search_query=${encoded}`,
          androidIntent: `intent://results?search_query=${encoded}#Intent;package=com.google.android.youtube;scheme=vnd.youtube;end;`,
          iosScheme: `youtube://results?search_query=${encoded}`,
          webUrl: `https://www.youtube.com/results?search_query=${encoded}`,
        };
      }
      return {
        appScheme: "vnd.youtube://",
        androidIntent: "intent://#Intent;package=com.google.android.youtube;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
        iosScheme: "youtube://",
        webUrl: "https://www.youtube.com/",
      };
    },
  },
  spotify: {
    name: "Spotify",
    aliases: ["spotify", "स्पॉटिफाई"],
    appScheme: "spotify://",
    androidPackage: "com.spotify.music",
    androidIntent: "intent://#Intent;package=com.spotify.music;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "spotify://",
    defaultWebUrl: "https://open.spotify.com/",
    getScreenConfig: (screen, query) => {
      if (query) {
        const encoded = encodeURIComponent(query.trim());
        return {
          appScheme: `spotify:search:${encoded}`,
          androidIntent: `intent://search/${encoded}#Intent;package=com.spotify.music;scheme=spotify;end;`,
          iosScheme: `spotify:search:${encoded}`,
          webUrl: `https://open.spotify.com/search/${encoded}`,
        };
      }
      return {
        appScheme: "spotify://",
        androidIntent: "intent://#Intent;package=com.spotify.music;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
        iosScheme: "spotify://",
        webUrl: "https://open.spotify.com/",
      };
    },
  },
  facebook: {
    name: "Facebook",
    aliases: ["facebook", "fb", "फेसबुक"],
    appScheme: "fb://",
    androidPackage: "com.facebook.katana",
    androidIntent: "intent://#Intent;package=com.facebook.katana;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "fb://",
    defaultWebUrl: "https://www.facebook.com/",
  },
  chatgpt: {
    name: "ChatGPT",
    aliases: ["chatgpt", "chat gpt", "openai", "चैटजीपीटी"],
    appScheme: "chatgpt://",
    androidPackage: "com.openai.chatgpt",
    androidIntent: "intent://#Intent;package=com.openai.chatgpt;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "chatgpt://",
    defaultWebUrl: "https://chatgpt.com/",
  },
  gemini: {
    name: "Gemini",
    aliases: ["gemini", "google gemini", "bard", "जेमिनी"],
    appScheme: "gemini://",
    androidPackage: "com.google.android.apps.bard",
    androidIntent: "intent://#Intent;package=com.google.android.apps.bard;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "googleapp://",
    defaultWebUrl: "https://gemini.google.com/",
  },
  claude: {
    name: "Claude",
    aliases: ["claude", "claude ai", "anthropic", "क्लाउड"],
    appScheme: "claude://",
    androidPackage: "com.anthropic.claude",
    androidIntent: "intent://#Intent;package=com.anthropic.claude;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "claude://",
    defaultWebUrl: "https://claude.ai/",
  },
  twitter: {
    name: "X (Twitter)",
    aliases: ["twitter", "x", "ट्विटर"],
    appScheme: "twitter://",
    androidPackage: "com.twitter.android",
    androidIntent: "intent://#Intent;package=com.twitter.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "twitter://",
    defaultWebUrl: "https://x.com/",
  },
  snapchat: {
    name: "Snapchat",
    aliases: ["snapchat", "snap", "स्नैपचैट"],
    appScheme: "snapchat://",
    androidPackage: "com.snapchat.android",
    androidIntent: "intent://#Intent;package=com.snapchat.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "snapchat://",
    defaultWebUrl: "https://www.snapchat.com/",
  },
  reddit: {
    name: "Reddit",
    aliases: ["reddit", "रेडिट"],
    appScheme: "reddit://",
    androidPackage: "com.reddit.frontpage",
    androidIntent: "intent://#Intent;package=com.reddit.frontpage;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "reddit://",
    defaultWebUrl: "https://www.reddit.com/",
  },
  linkedin: {
    name: "LinkedIn",
    aliases: ["linkedin", "लिंक्डइन"],
    appScheme: "linkedin://",
    androidPackage: "com.linkedin.android",
    androidIntent: "intent://#Intent;package=com.linkedin.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "linkedin://",
    defaultWebUrl: "https://www.linkedin.com/",
  },
  gmail: {
    name: "Gmail",
    aliases: ["gmail", "google mail", "email", "जीमेल"],
    appScheme: "googlegmail://",
    androidPackage: "com.google.android.gm",
    androidIntent: "intent://#Intent;package=com.google.android.gm;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "googlegmail://",
    defaultWebUrl: "https://mail.google.com/",
  },
  maps: {
    name: "Google Maps",
    aliases: ["maps", "google maps", "गूगल मैप्स", "नक्शा"],
    appScheme: "comgooglemaps://",
    androidPackage: "com.google.android.apps.maps",
    androidIntent: "intent://#Intent;package=com.google.android.apps.maps;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "comgooglemaps://",
    defaultWebUrl: "https://maps.google.com/",
  },
  netflix: {
    name: "Netflix",
    aliases: ["netflix", "नेटफ्लिक्स"],
    appScheme: "nflx://",
    androidPackage: "com.netflix.mediaclient",
    androidIntent: "intent://#Intent;package=com.netflix.mediaclient;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "nflx://",
    defaultWebUrl: "https://www.netflix.com/",
  },
  discord: {
    name: "Discord",
    aliases: ["discord", "डिस्कॉर्ड"],
    appScheme: "discord://",
    androidPackage: "com.discord",
    androidIntent: "intent://#Intent;package=com.discord;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "discord://",
    defaultWebUrl: "https://discord.com/",
  },
  github: {
    name: "GitHub",
    aliases: ["github", "गिटहब"],
    appScheme: "github://",
    androidPackage: "com.github.android",
    androidIntent: "intent://#Intent;package=com.github.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "github://",
    defaultWebUrl: "https://github.com/",
  },
  amazon: {
    name: "Amazon",
    aliases: ["amazon", "अमेज़न", "अमेजन"],
    appScheme: "amazon://",
    androidPackage: "in.amazon.mShop.android.shopping",
    androidIntent: "intent://#Intent;package=in.amazon.mShop.android.shopping;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "amazon://",
    defaultWebUrl: "https://www.amazon.in/",
  },
  flipkart: {
    name: "Flipkart",
    aliases: ["flipkart", "फ्लिपकार्ट"],
    appScheme: "flipkart://",
    androidPackage: "com.flipkart.android",
    androidIntent: "intent://#Intent;package=com.flipkart.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "flipkart://",
    defaultWebUrl: "https://www.flipkart.com/",
  },
  pinterest: {
    name: "Pinterest",
    aliases: ["pinterest", "पिंटरेस्ट"],
    appScheme: "pinterest://",
    androidPackage: "com.pinterest",
    androidIntent: "intent://#Intent;package=com.pinterest;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "pinterest://",
    defaultWebUrl: "https://www.pinterest.com/",
  },
  tiktok: {
    name: "TikTok",
    aliases: ["tiktok", "टिकटॉक"],
    appScheme: "snssdk1233://",
    androidPackage: "com.zhiliaoapp.musically",
    androidIntent: "intent://#Intent;package=com.zhiliaoapp.musically;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "snssdk1233://",
    defaultWebUrl: "https://www.tiktok.com/",
  },
  zoom: {
    name: "Zoom",
    aliases: ["zoom", "ज़ूम"],
    appScheme: "zoomus://",
    androidPackage: "us.zoom.videomeetings",
    androidIntent: "intent://#Intent;package=us.zoom.videomeetings;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "zoomus://",
    defaultWebUrl: "https://zoom.us/",
  },
  uber: {
    name: "Uber",
    aliases: ["uber", "उबर"],
    appScheme: "uber://",
    androidPackage: "com.ubercab",
    androidIntent: "intent://#Intent;package=com.ubercab;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "uber://",
    defaultWebUrl: "https://m.uber.com/",
  },
  zomato: {
    name: "Zomato",
    aliases: ["zomato", "ज़ोमेटो"],
    appScheme: "zomato://",
    androidPackage: "com.application.zomato",
    androidIntent: "intent://#Intent;package=com.application.zomato;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "zomato://",
    defaultWebUrl: "https://www.zomato.com/",
  },
  swiggy: {
    name: "Swiggy",
    aliases: ["swiggy", "स्विग्गी"],
    appScheme: "swiggy://",
    androidPackage: "in.swiggy.android",
    androidIntent: "intent://#Intent;package=in.swiggy.android;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "swiggy://",
    defaultWebUrl: "https://www.swiggy.com/",
  },
  phonepe: {
    name: "PhonePe",
    aliases: ["phonepe", "phone pe", "फ़ोनपे"],
    appScheme: "phonepe://",
    androidPackage: "com.phonepe.app",
    androidIntent: "intent://#Intent;package=com.phonepe.app;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "phonepe://",
    defaultWebUrl: "https://www.phonepe.com/",
  },
  paytm: {
    name: "Paytm",
    aliases: ["paytm", "पेटीएम"],
    appScheme: "paytmmp://",
    androidPackage: "net.one97.paytm",
    androidIntent: "intent://#Intent;package=net.one97.paytm;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "paytm://",
    defaultWebUrl: "https://paytm.com/",
  },
  notion: {
    name: "Notion",
    aliases: ["notion", "नोशन"],
    appScheme: "notion://",
    androidPackage: "notion.id",
    androidIntent: "intent://#Intent;package=notion.id;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "notion://",
    defaultWebUrl: "https://www.notion.so/",
  },
  duolingo: {
    name: "Duolingo",
    aliases: ["duolingo", "डुओलिंगो"],
    appScheme: "duolingo://",
    androidPackage: "com.duolingo",
    androidIntent: "intent://#Intent;package=com.duolingo;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;",
    iosScheme: "duolingo://",
    defaultWebUrl: "https://www.duolingo.com/",
  },
};

/**
 * Checks whether an input string is asking for a website rather than a native app
 */
export function isWebsiteRequest(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase().trim();

  // 1. Explicit website keywords
  if (
    /\b(website|web\s*site|webpage|web\s*page|site|web|portal|url|link|वेबसाइट|वेब\s*साइट|साइट|वेब)\b/i.test(lower)
  ) {
    return true;
  }

  // 2. Protocols or standard web prefixes
  if (/^https?:\/\//i.test(lower) || /^www\./i.test(lower)) {
    return true;
  }

  // 3. Domain extension pattern (e.g. google.com, wikipedia.org, netlify.app)
  if (/\.(com|org|net|in|co|io|app|ai|me|dev|edu|gov|tech|xyz|site|online|store|info|club)\b/i.test(lower)) {
    return true;
  }

  // 4. Known portfolio / developer website terms
  if (
    /portfolio|royal\s*ankit|ankit\s*ahiran|developer\s*(?:website|portfolio|site)|creator\s*(?:website|portfolio|site)|royalankit|netlify/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Normalizes and builds a dedicated Website-Only AppLaunchOptions config.
 * Guaranteed to have isWebsiteOnly: true and NO fake appSchemes or androidIntents,
 * ensuring browsers open the real website directly instead of failing with missing app intents.
 */
export function getWebsiteLaunchConfig(rawInput: string): AppLaunchOptions {
  const cleanInput = (rawInput || "").trim();
  const lower = cleanInput.toLowerCase();

  // 1. Developer Portfolio & Personal Website: Strict Netlify.app Destination
  if (
    /portfolio|royal\s*ankit|ankit\s*ahiran|developer\s*(?:website|portfolio|site)|creator\s*(?:website|portfolio|site)|royalankit|netlify/i.test(lower)
  ) {
    return {
      name: "Royal Ankit Ahiran Portfolio",
      webUrl: "https://royalankitahiranl.netlify.app",
      isWebsiteOnly: true,
    };
  }

  // 2. Check if rawInput contains a full HTTP/HTTPS URL
  const urlMatch = cleanInput.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    const fullUrl = urlMatch[1];
    let domainName = "Website";
    try {
      const parsed = new URL(fullUrl);
      domainName = parsed.hostname.replace(/^www\./, "");
    } catch (_) {}
    return {
      name: domainName.charAt(0).toUpperCase() + domainName.slice(1),
      webUrl: fullUrl,
      isWebsiteOnly: true,
    };
  }

  // 3. Extract core target keyword by removing command prefixes & "website" / "site" / "app" keywords
  let core = cleanInput
    .replace(/^(?:open|launch|start|visit|browse|go\s+to|khol|kholo|chalu\s+kara|chalu\s+karo)\s+/i, "")
    .replace(/^(?:the\s+|a\s+)/i, "")
    .replace(/^(?:website|web\s*site|webpage|site|web|portal|url|link|वेबसाइट|वेब\s*साइट|साइट|वेब)\s+(?:of\s+|ki\s+|ko\s+|par\s+)?/i, "")
    .replace(/\s+(?:website|web\s*site|site|web|app|portal|khol|kholo|open|chalu\s+karo)$/i, "")
    .trim();

  // If empty or just "website", default to Google
  if (!core || core === "website" || core === "site" || core === "वेबसाइट" || core === "web") {
    return {
      name: "Google",
      webUrl: "https://www.google.com",
      isWebsiteOnly: true,
    };
  }

  const coreLower = core.toLowerCase();

  // 4. Well-known websites lookup
  const KNOWN_WEBSITES: Record<string, { name: string; url: string }> = {
    google: { name: "Google", url: "https://www.google.com" },
    गूगल: { name: "Google", url: "https://www.google.com" },
    wikipedia: { name: "Wikipedia", url: "https://www.wikipedia.org" },
    विकिपीडिया: { name: "Wikipedia", url: "https://www.wikipedia.org" },
    github: { name: "GitHub", url: "https://github.com" },
    गिटहब: { name: "GitHub", url: "https://github.com" },
    chatgpt: { name: "ChatGPT", url: "https://chatgpt.com" },
    openai: { name: "ChatGPT", url: "https://chatgpt.com" },
    gemini: { name: "Google Gemini", url: "https://gemini.google.com" },
    claude: { name: "Claude AI", url: "https://claude.ai" },
    youtube: { name: "YouTube", url: "https://www.youtube.com" },
    यूट्यूब: { name: "YouTube", url: "https://www.youtube.com" },
    facebook: { name: "Facebook", url: "https://www.facebook.com" },
    फेसबुक: { name: "Facebook", url: "https://www.facebook.com" },
    instagram: { name: "Instagram", url: "https://www.instagram.com" },
    इंस्टाग्राम: { name: "Instagram", url: "https://www.instagram.com" },
    twitter: { name: "X (Twitter)", url: "https://x.com" },
    x: { name: "X", url: "https://x.com" },
    reddit: { name: "Reddit", url: "https://www.reddit.com" },
    linkedin: { name: "LinkedIn", url: "https://www.linkedin.com" },
    netflix: { name: "Netflix", url: "https://www.netflix.com" },
    नेटफ्लिक्स: { name: "Netflix", url: "https://www.netflix.com" },
    amazon: { name: "Amazon", url: "https://www.amazon.in" },
    अमेज़न: { name: "Amazon", url: "https://www.amazon.in" },
    flipkart: { name: "Flipkart", url: "https://www.flipkart.com" },
    फ्लिपकार्ट: { name: "Flipkart", url: "https://www.flipkart.com" },
    yahoo: { name: "Yahoo", url: "https://www.yahoo.com" },
    bing: { name: "Bing", url: "https://www.bing.com" },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com" },
    stackoverflow: { name: "Stack Overflow", url: "https://stackoverflow.com" },
    w3schools: { name: "W3Schools", url: "https://www.w3schools.com" },
    geeksforgeeks: { name: "GeeksforGeeks", url: "https://www.geeksforgeeks.org" },
    telegram: { name: "Telegram Web", url: "https://web.telegram.org" },
    whatsapp: { name: "WhatsApp Web", url: "https://web.whatsapp.com" },
    spotify: { name: "Spotify Web", url: "https://open.spotify.com" },
  };

  for (const [key, val] of Object.entries(KNOWN_WEBSITES)) {
    if (coreLower === key || coreLower.includes(key)) {
      return {
        name: val.name,
        webUrl: val.url,
        isWebsiteOnly: true,
      };
    }
  }

  // 5. If domain with dot (e.g. "google.com", "developer.mozilla.org", "mysite.in")
  if (core.includes(".")) {
    const cleanDomain = core.replace(/^(?:https?:\/\/)?(?:www\.)?/, "").replace(/\s+/g, "");
    const siteTitle = cleanDomain.split(".")[0];
    return {
      name: siteTitle.charAt(0).toUpperCase() + siteTitle.slice(1),
      webUrl: `https://${cleanDomain}`,
      isWebsiteOnly: true,
    };
  }

  // 6. Generic slug fallback
  const slug = core.toLowerCase().replace(/[^a-z0-9]/g, "");
  const formattedName = core.charAt(0).toUpperCase() + core.slice(1);
  return {
    name: formattedName || "Website",
    webUrl: `https://www.${slug}.com`,
    isWebsiteOnly: true,
  };
}

/**
 * Dedicated resilient web URL opener.
 * Uses multi-layered activation (hidden anchor with _blank, window.open, and event dispatch)
 * to reliably open URLs across all desktop and mobile browsers, even under strict popup policies.
 */
export function openWebUrl(url: string): boolean {
  if (!url) return false;
  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  console.log(`[AppLauncher] Opening clean web URL: ${cleanUrl}`);

  let opened = false;

  // Layer 1: Programmatic anchor click with target="_blank"
  try {
    const link = document.createElement("a");
    link.href = cleanUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 500);
    opened = true;
  } catch (err) {
    console.warn("[AppLauncher] Anchor click failed:", err);
  }

  // Layer 2: Direct window.open fallback
  try {
    const win = window.open(cleanUrl, "_blank", "noopener,noreferrer");
    if (win) {
      opened = true;
    }
  } catch (err) {
    console.warn("[AppLauncher] window.open failed:", err);
  }

  // Layer 3: Dispatch custom event so UI can show a fallback tap badge if browser popup was blocked
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("zoya:website-opened", {
          detail: { url: cleanUrl },
        })
      );
    }
  } catch (_) {}

  return opened;
}

/**
 * Helper to match and build AppLaunchOptions for ANY given app or website name
 */
export function getGenericAppLaunchConfig(
  rawAppName: string,
  query?: string,
  specificScreen?: string,
  targetContact?: string
): AppLaunchOptions {
  const cleanInput = (rawAppName || "").trim();

  // If this is a website request, route to website launcher directly
  if (isWebsiteRequest(cleanInput)) {
    return getWebsiteLaunchConfig(cleanInput);
  }

  const lowerInput = cleanInput.toLowerCase();
  
  // 1. Look for matching entry in registry
  let matchedEntry: AppRegistryEntry | null = null;

  for (const key of Object.keys(APP_REGISTRY)) {
    const entry = APP_REGISTRY[key];
    if (entry.aliases.some((alias) => lowerInput.includes(alias) || alias === lowerInput)) {
      matchedEntry = entry;
      break;
    }
  }

  if (matchedEntry) {
    const customConfig = matchedEntry.getScreenConfig
      ? matchedEntry.getScreenConfig(specificScreen, query, targetContact)
      : {};

    return {
      name: customConfig.name || matchedEntry.name,
      appScheme: customConfig.appScheme || matchedEntry.appScheme,
      androidIntent: customConfig.androidIntent || matchedEntry.androidIntent,
      iosScheme: customConfig.iosScheme || matchedEntry.iosScheme || matchedEntry.appScheme,
      webUrl: customConfig.webUrl || matchedEntry.defaultWebUrl,
      specificScreen,
    };
  }

  // 2. Generic fallback for ANY unlisted app
  const sanitizedName = lowerInput
    .replace(/^(?:open|khol|kholo|chalu\s+kara|chalu\s+karo|launch|start)\s+/i, "")
    .replace(/\s+(?:app|khol|kholo|open)$/i, "")
    .trim();

  const formattedName =
    sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);
  const slug = sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, "");

  let webUrl = `https://www.${slug}.com`;
  if (lowerInput.includes(".") || lowerInput.startsWith("http")) {
    const cleanUrl = lowerInput.startsWith("http") ? lowerInput : `https://${lowerInput.replace(/\s+/g, "")}`;
    webUrl = cleanUrl;
  }

  return {
    name: formattedName || "App",
    appScheme: `${slug}://`,
    androidIntent: `intent://#Intent;package=com.${slug};action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;end;`,
    iosScheme: `${slug}://`,
    webUrl,
    specificScreen,
  };
}

/**
 * Backward-compatible helper functions
 */
export function getWhatsAppLaunchConfig(query?: string, targetPhone?: string): AppLaunchOptions {
  return getGenericAppLaunchConfig("whatsapp", query, "chat", targetPhone);
}

export function getInstagramLaunchConfig(isDirectMessages = false): AppLaunchOptions {
  return getGenericAppLaunchConfig("instagram", undefined, isDirectMessages ? "dms" : "home");
}

export function getYouTubeLaunchConfig(searchQuery?: string): AppLaunchOptions {
  return getGenericAppLaunchConfig("youtube", searchQuery, searchQuery ? "search" : "home");
}

export function getFacebookLaunchConfig(): AppLaunchOptions {
  return getGenericAppLaunchConfig("facebook");
}

export function getSpotifyLaunchConfig(query?: string): AppLaunchOptions {
  return getGenericAppLaunchConfig("spotify", query, query ? "search" : "home");
}

export function getTelegramLaunchConfig(usernameOrChannel?: string): AppLaunchOptions {
  return getGenericAppLaunchConfig("telegram", undefined, undefined, usernameOrChannel);
}

/**
 * Directly launches native installed app without redirecting to website or asking for website login.
 * 
 * If the app is installed on the user's phone:
 * -> Instantly triggers the app's native URI scheme / Android intent.
 * -> The phone OS directly opens the native app without opening any website or asking for website login!
 * 
 * If the app is NOT installed on the device or if a website was requested:
 * -> Automatically opens the official website or web destination in a new tab.
 */
export function openAppOrWeb(options: AppLaunchOptions): void {
  const { name, appScheme, androidIntent, iosScheme, webUrl, isWebsiteOnly } = options;

  console.log(`[AppLauncher] Executing launch: "${name}" (isWebsiteOnly: ${!!isWebsiteOnly})`);

  // 0. If this is a developer portfolio request, also trigger the in-app modal embed
  if (
    name?.toLowerCase().includes("portfolio") ||
    webUrl?.includes("royalankitahiranl.netlify.app")
  ) {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("zoya:open-portfolio"));
      }
    } catch (_) {}
  }

  // 1. If this is a website-only request, or no native app schemes/intents exist:
  // Open the website immediately without attempting native app schemes!
  if (isWebsiteOnly || (!appScheme && !androidIntent && !iosScheme)) {
    if (webUrl) {
      openWebUrl(webUrl);
    }
    return;
  }

  const android = isAndroid();
  const ios = isIOS();

  let appOpened = false;

  const onAppSwitchedFocus = () => {
    appOpened = true;
  };

  window.addEventListener("pagehide", onAppSwitchedFocus, { once: true });
  window.addEventListener("blur", onAppSwitchedFocus, { once: true });
  document.addEventListener("visibilitychange", onAppSwitchedFocus, { once: true });

  const cleanupListeners = () => {
    window.removeEventListener("pagehide", onAppSwitchedFocus);
    window.removeEventListener("blur", onAppSwitchedFocus);
    document.removeEventListener("visibilitychange", onAppSwitchedFocus);
  };

  // 2. Android Native App Launch with Website Fallback
  if (android) {
    const targetUrl = androidIntent || appScheme || iosScheme;
    
    if (targetUrl) {
      const link = document.createElement("a");
      link.href = targetUrl;
      link.target = "_top";
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = targetUrl;
        } else {
          window.location.href = targetUrl;
        }
      } catch (_) {
        try {
          window.location.href = targetUrl;
        } catch (__) {}
      }

      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);

      // Mobile Fallback: If app is not installed on Android, open the website!
      setTimeout(() => {
        cleanupListeners();
        if (!appOpened && !document.hidden && document.visibilityState === "visible" && webUrl) {
          console.log(`[AppLauncher] App "${name}" not opened on Android. Falling back to website: ${webUrl}`);
          openWebUrl(webUrl);
        }
      }, 1200);
    } else if (webUrl) {
      openWebUrl(webUrl);
    }
    return;
  }

  // 3. iOS Native App Launch with Website Fallback
  if (ios) {
    const targetScheme = iosScheme || appScheme;
    if (targetScheme) {
      const link = document.createElement("a");
      link.href = targetScheme;
      link.target = "_top";
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();

      try {
        if (window.top && window.top !== window) {
          window.top.location.href = targetScheme;
        } else {
          window.location.href = targetScheme;
        }
      } catch (_) {
        try {
          window.location.href = targetScheme;
        } catch (__) {}
      }

      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 1000);

      // Mobile Fallback: If app is not installed on iOS, open the website!
      setTimeout(() => {
        cleanupListeners();
        if (!appOpened && !document.hidden && document.visibilityState === "visible" && webUrl) {
          console.log(`[AppLauncher] App "${name}" not opened on iOS. Falling back to website: ${webUrl}`);
          openWebUrl(webUrl);
        }
      }, 1200);
    } else if (webUrl) {
      openWebUrl(webUrl);
    }
    return;
  }

  // 4. Desktop / General Browser Launch with Website Fallback
  const fallbackUrl = webUrl;
  if (appScheme) {
    const link = document.createElement("a");
    link.href = appScheme;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 1000);

    setTimeout(() => {
      cleanupListeners();
      if (!appOpened && !document.hidden && document.visibilityState === "visible" && fallbackUrl) {
        console.log(`[AppLauncher] App "${name}" not detected on desktop. Opening website: ${fallbackUrl}`);
        openWebUrl(fallbackUrl);
      }
    }, 1200);
  } else if (fallbackUrl) {
    openWebUrl(fallbackUrl);
  }
}
