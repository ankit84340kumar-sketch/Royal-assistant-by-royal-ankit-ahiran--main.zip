import {
  AppLaunchOptions,
  getGenericAppLaunchConfig,
  getWebsiteLaunchConfig,
  getWhatsAppLaunchConfig,
  getInstagramLaunchConfig,
  getYouTubeLaunchConfig,
  getFacebookLaunchConfig,
  getSpotifyLaunchConfig,
  getTelegramLaunchConfig,
} from "./appLauncher";
import { matchCuratedWebsite } from "./smartWebsiteService";
import {
  searchContacts,
  placeNativePhoneCall,
  setPendingCallState,
  getPendingCallState,
  clearPendingCallState,
  parseLastTwoDigits,
  cleanContactQuery,
  handleBirthdayQuery,
} from "./contactService";

export interface CommandResult {
  action: string;
  url?: string;
  isBrowserAction: boolean;
  type?: "navigation" | "whatsapp" | "instagram" | "screen" | "youtube" | "facebook" | "spotify" | "telegram";
  appLaunchConfig?: AppLaunchOptions;
}

export function processCommand(command: string): CommandResult {
  const lowerCmd = command.toLowerCase().trim();

  // 0.0 Birthday Queries Check
  const bdayResult = handleBirthdayQuery(command);
  if (bdayResult.isBirthdayQuery) {
    return {
      action: bdayResult.response,
      isBrowserAction: false,
    };
  }

  // 0.1 Pending Duplicate Call Resolution (e.g. user says "52", "baawan", "last 75", "ends in 18")
  const pendingCall = getPendingCallState();
  if (pendingCall) {
    const twoDigits = parseLastTwoDigits(lowerCmd);
    if (twoDigits) {
      const match = pendingCall.matches.find(
        (c) => c.lastTwoDigits === twoDigits || c.phone.replace(/\D/g, "").endsWith(twoDigits)
      );
      if (match) {
        clearPendingCallState();
        placeNativePhoneCall(match.phone, match.name);
        return {
          action: `हाँ बाबू, ${match.name} (...${match.lastTwoDigits}) पर कॉल लगा देलीं!`,
          isBrowserAction: false,
        };
      }
    }
  }

  // 0.2 Hacking Refusal & Royal Ankit Ahiran Praise
  if (
    lowerCmd.includes("hack") ||
    lowerCmd.includes("hacking") ||
    lowerCmd.includes("heck") ||
    lowerCmd.includes("spy on") ||
    lowerCmd.includes("crack password") ||
    lowerCmd.includes("wifi hack")
  ) {
    return {
      action:
        "अरे बाबू! हैकिंग-वैकिंग के काम हम ना करीं, हमार काम त रउआ सेवा कईल बा। अगर रउआ साइबर सुरक्षा भा कोडिंग सीखे के बा त हमार निर्माता Royal Ankit Ahiran जी के गाइडेंस लीं!",
      isBrowserAction: false,
    };
  }

  // 0.3 Voice Calling / Phone Dialer Integration
  const isCallIntent =
    /\b(?:make\s+a\s+call|call|phone|dial|milao|milao|laga\s*do|lagao|karo)\b/i.test(lowerCmd) &&
    /\b(?:call|phone|dial)\b/i.test(lowerCmd) &&
    !/(?:history|pehle|kal|pichl|kyun|kyu|record|yaad|baat|batao|kya|bol|sun)/i.test(lowerCmd);

  if (isCallIntent) {
    // A. Check for 10-digit or explicit phone number
    const numberMatch = lowerCmd.match(/(\+?\d[\d\s-]{8,14}\d)/);
    if (numberMatch) {
      const cleanPhone = numberMatch[1].replace(/[\s-]/g, "");
      placeNativePhoneCall(cleanPhone, cleanPhone);
      return {
        action: `हाँ बाबू, ${cleanPhone} पर कॉल लगा देलीं!`,
        isBrowserAction: false,
      };
    }

    // B. Extract Contact Name from Command
    let target = lowerCmd
      .replace(/^(?:please|kripya|zoya|hey zoya|suno zoya)?\s*(?:make\s+a\s+call\s+to|call\s+to|call|phone\s+karo|phone\s+lagao|ko\s+phone\s+lagao|ko\s+call\s+karo|pe\s+call\s+karo|pe\s+phone\s+lagao|dial\s+karo|dial)?\s*/i, "")
      .replace(/\s*(?:ko|par|pe)?\s*(?:call\s+lagao|call\s+karo|phone\s+lagao|phone\s+karo|dial\s+karo|mila\s*do|laga\s*do)$/i, "")
      .trim();

    target = cleanContactQuery(target);

    if (target && target.length >= 2) {
      const matches = searchContacts(target);
      if (matches.length === 1) {
        const contact = matches[0];
        placeNativePhoneCall(contact.phone, contact.name);
        return {
          action: `हाँ बाबू, ${contact.name} (${contact.phone}) पर कॉल लगा देलीं!`,
          isBrowserAction: false,
        };
      } else if (matches.length > 1) {
        setPendingCallState({
          contactName: matches[0].name,
          matches,
          timestamp: Date.now(),
        });
        const listText = matches
          .slice(0, 4)
          .map((m) => `${m.name} (${m.label || "नंबर"} ...${m.lastTwoDigits})`)
          .join(" | ");
        return {
          action: `बाबू, '${target}' के ${matches.length} गो नंबर बा: ${listText}। कौन नंबर पर कॉल लगाईं? लास्ट 2 डिजिट बताईं!`,
          isBrowserAction: false,
        };
      } else {
        return {
          action: `बाबू, राउर कॉन्टैक्ट्स में '${target}' ना मिलल। केहू दोसर नाम या 10 डिजिट के नंबर बताईं!`,
          isBrowserAction: false,
        };
      }
    }

    return {
      action: "हाँ बाबू, केकरा के कॉल लगावे के बा? कॉन्टैक्ट के नाम या नंबर बताईं!",
      isBrowserAction: false,
    };
  }

  // 0.3 Developer Portfolio Command
  if (
    /^(?:open|show|khol|kholo|chalu\s+kara|chalu\s+karo)?\s*(?:royal\s*ankit(?:\s*ahiran)?|ankit(?:\s*ahiran)?|developer|creator)?\s*(?:ka\s*)?(?:portfolio|website|site)(?:\s*(?:khol|kholo|chalu\s+kara|chalu\s+karo|dikhao))?$/i.test(
      lowerCmd
    ) ||
    lowerCmd === "portfolio" ||
    lowerCmd === "portfolio kholo" ||
    lowerCmd === "open portfolio" ||
    lowerCmd.includes("ankit portfolio") ||
    lowerCmd.includes("royal ankit portfolio")
  ) {
    const launchConfig = getWebsiteLaunchConfig("portfolio");
    return {
      action:
        "हाँ बाबू, हमार निर्माता Royal Ankit Ahiran जी के ऑफिशियल पोर्टफोलियो खोल देलीं! रउआ स्क्रीन पर लाइव भी देख सकेनी अउरी न्यू टैब में भी।",
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "navigation",
    };
  }

  // 0.4 Smart Purpose-Based Website Matching (e.g. Bihar caste/residential portal, cricket score, flight booking, etc.)
  const smartWebMatch = matchCuratedWebsite(command);
  if (smartWebMatch) {
    const launchConfig: AppLaunchOptions = {
      name: smartWebMatch.name,
      webUrl: smartWebMatch.url,
      isWebsiteOnly: true,
    };
    return {
      action: `हाँ बाबू, ${smartWebMatch.purposeBihari} (${smartWebMatch.name}) के ऑफिशियल वेबसाइट खोज के सीधे खोल देलीं!`,
      url: smartWebMatch.url,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "navigation",
    };
  }

  // 1. Instagram Messages / DMs
  if (
    lowerCmd.includes("instagram message") ||
    lowerCmd.includes("instagram dm") ||
    lowerCmd.includes("check instagram") ||
    lowerCmd.includes("instagram message dekho") ||
    lowerCmd.includes("instagram khol ke message") ||
    lowerCmd.includes("open instagram message") ||
    lowerCmd.includes("open instagram dm") ||
    lowerCmd.includes("instagram inbox")
  ) {
    const launchConfig = getInstagramLaunchConfig(true);
    return {
      action: "हाँ बाबू, इंस्टाग्राम मैसेज इनबॉक्स खोल देलीं! अगर ऐप इनस्टॉल बा त सीधे ऐप में खुली, ना त ऑफिशियल वेबसाइट में।",
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "instagram",
    };
  }

  // 2. WhatsApp Direct Chat / Message: "Send a WhatsApp message to [number/contact] saying [message]"
  const waMatch =
    lowerCmd.match(
      /^(?:send|bhejo)\s+(?:a\s+)?whatsapp\s+message\s+to\s+([\d\+\s\w]+)\s+(?:saying|baat|likh\s+ke)\s+(.+)$/i
    ) ||
    lowerCmd.match(/^whatsapp\s+message\s+(?:to|pe)\s+([\d\+\s\w]+)\s+(?:saying|bhejo|baat)\s+(.+)$/i);

  if (waMatch) {
    const contactRaw = waMatch[1].trim();
    const cleanNumber = contactRaw.replace(/[^\d\+]/g, "");
    const rawMsg = waMatch[2].trim();

    const launchConfig = getWhatsAppLaunchConfig(rawMsg, cleanNumber || contactRaw);
    return {
      action: `हाँ बाबू, ${contactRaw} खातिर व्हाट्सएप्प में मैसेज तैयार कर देलीं!`,
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "whatsapp",
    };
  }

  // 3. YouTube Search: "Play [song/video] on YouTube"
  const ytMatch =
    lowerCmd.match(/^play\s+(.+?)\s+on\s+youtube$/i) ||
    lowerCmd.match(/^youtube\s+par\s+(.+?)\s+(?:chalao|play\s+karo)$/i);
  if (ytMatch) {
    const query = ytMatch[1].trim();
    const launchConfig = getYouTubeLaunchConfig(query);
    return {
      action: `हाँ बाबू, यूट्यूब पर "${query}" चला देलीं!`,
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "youtube",
    };
  }

  // 4. Spotify Search: "Search/Play [song] on Spotify"
  const spotifyMatch =
    lowerCmd.match(/^(?:search|play)\s+(.+?)\s+on\s+spotify$/i) ||
    lowerCmd.match(/^spotify\s+par\s+(.+?)\s+(?:chalao|bajaao)$/i);
  if (spotifyMatch) {
    const query = spotifyMatch[1].trim();
    const launchConfig = getSpotifyLaunchConfig(query);
    return {
      action: `हाँ बाबू, स्पॉटिफाई पर "${query}" खोज देलीं!`,
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "spotify",
    };
  }

  // 5. Screen analysis command intent
  if (
    lowerCmd.includes("screen dekho") ||
    lowerCmd.includes("check screen") ||
    lowerCmd.includes("what is on my screen") ||
    lowerCmd.includes("screen padho") ||
    lowerCmd.includes("view screen") ||
    lowerCmd.includes("screen share")
  ) {
    return {
      action: "हाँ बाबू, हम राउर स्क्रीन विज़न देख रहल बानी अउरी सब गतिविधि पर नज़र रखले बानी!",
      isBrowserAction: false,
      type: "screen",
    };
  }

  // 6. Generic "Open [App Name]" / "Khol [App Name]" / "[App Name] khol" for ANY app!
  const genericOpenMatch =
    lowerCmd.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i) ||
    lowerCmd.match(/^(?:khol|kholo|chalu\s+kara)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i) ||
    lowerCmd.match(/^(.+?)\s+(?:app\s+)?(?:khol|kholo|open\s+kar|open\s+kara|chalu\s+kar)$/i);

  if (genericOpenMatch) {
    const targetAppName = genericOpenMatch[1].trim();
    const launchConfig = getGenericAppLaunchConfig(targetAppName);
    return {
      action: `हाँ बाबू, ${launchConfig.name} ऐप खोल देलीं! अगर मोबाइल में ऐप इनस्टॉल बा त सीधे ऐप खुली, ना त ऑफिशियल वेबसाइट खुल जाई।`,
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "navigation",
    };
  }

  // 7. Single word app commands (e.g. "whatsapp", "instagram", "youtube", "chatgpt", "gemini", "claude")
  const singleAppAliases = [
    "whatsapp",
    "instagram",
    "youtube",
    "facebook",
    "telegram",
    "spotify",
    "chatgpt",
    "gemini",
    "claude",
    "twitter",
    "snapchat",
    "reddit",
    "linkedin",
    "netflix",
    "gmail",
    "maps",
    "discord",
    "github",
    "amazon",
    "flipkart",
    "pinterest",
    "tiktok",
    "zoom",
    "uber",
    "zomato",
    "swiggy",
    "phonepe",
    "paytm",
    "notion",
    "duolingo",
  ];

  if (singleAppAliases.includes(lowerCmd)) {
    const launchConfig = getGenericAppLaunchConfig(lowerCmd);
    return {
      action: `जी मालिक, ${launchConfig.name} ऐप खोल देलीं! अगर ऐप इनस्टॉल बा त सीधे ऐप खुली, ना त ऑफिशियल वेबसाइट खुल जाई।`,
      url: launchConfig.webUrl,
      appLaunchConfig: launchConfig,
      isBrowserAction: true,
      type: "navigation",
    };
  }

  return { action: "", isBrowserAction: false };
}
