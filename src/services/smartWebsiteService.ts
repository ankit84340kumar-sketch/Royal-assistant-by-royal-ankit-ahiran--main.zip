/**
 * Smart Website Search-and-Open Service for Zoya AI Assistant
 * 
 * Enables Zoya to understand requests when a user describes a website by its
 * purpose, utility, or government scheme (e.g., "Bihar sarkar ke jaati praman patra ki website",
 * "jahan pe cricket score dekhte hain", "flight ticket book karne ki website", etc.)
 * rather than giving an exact URL or technical domain.
 * 
 * Matches against a verified directory of high-frequency Indian & global portals
 * and dynamically queries Gemini for generic or specialized requests, then opens the site directly.
 */

import { apiSmartWebsite } from "./api";
import { AppLaunchOptions, openAppOrWeb } from "./appLauncher";

export interface SmartWebsiteResult {
  found: boolean;
  name: string;
  url: string;
  purpose: string;
  responseMessage: string;
  isAmbiguous?: boolean;
  clarifyingQuestion?: string;
  appLaunchConfig?: AppLaunchOptions;
}

interface VerifiedWebsiteEntry {
  name: string;
  url: string;
  keywords: string[];
  purposeHindi: string;
  purposeBihari: string;
}

// Curated verified knowledge base for instant zero-latency matching of top services & portals
const VERIFIED_WEBSITES: VerifiedWebsiteEntry[] = [
  // Bihar Government Portals
  {
    name: "RTPS Bihar (Service Online)",
    url: "https://serviceonline.bihar.gov.in/",
    keywords: [
      "jaati", "jati", "caste", "awasiya", "niwas", "aay", "income", "residential",
      "rtps", "bihar sarkar", "praman patra", "certificate", "character certificate",
      "aacharan", "bihar caste", "bihar awasiya", "bihar rtps"
    ],
    purposeHindi: "बिहार सरकार का जाति, आवासीय, आय एवं अन्य प्रमाण पत्र पोर्टल",
    purposeBihari: "बिहार सरकार के जाति, आवासीय अउरी आय प्रमाण पत्र बनावे वाला RTPS पोर्टल"
  },
  {
    name: "Bihar School Examination Board (BSEB)",
    url: "http://biharboardonline.bihar.gov.in/",
    keywords: ["bseb", "bihar board", "10th result", "12th result", "matric result", "inter result", "bihar board exam", "matric admit card"],
    purposeHindi: "बिहार बोर्ड (BSEB) मैट्रिक और इंटर रिजल्ट एवं परीक्षा पोर्टल",
    purposeBihari: "बिहार बोर्ड मैट्रिक अउरी इंटर रिजल्ट देखे वाला ऑफिशियल पोर्टल"
  },
  {
    name: "Bihar Bhumi (Land Records)",
    url: "https://biharbhumi.bihar.gov.in/",
    keywords: ["bihar bhumi", "dakhil kharij", "land record", "khatiyan", "jamabandi", "lagan", "mutation", "zamin rasid", "bhoomi"],
    purposeHindi: "बिहार भूमि एवं दाखिल-खारिज (Land Records / Jamabandi) पोर्टल",
    purposeBihari: "बिहार जमीन के दाखिल-खारिज, खतियान अउरी रसीद काटे वाला पोर्टल"
  },
  {
    name: "EPDS Bihar (Ration Card)",
    url: "https://epds.bihar.gov.in/",
    keywords: ["ration card", "rashan card", "epds", "bihar ration", "ration card apply", "ration list", "rashan list"],
    purposeHindi: "बिहार राशन कार्ड सूची एवं ऑनलाइन आवेदन पोर्टल (EPDS)",
    purposeBihari: "बिहार राशन कार्ड लिस्ट देखे अउरी नया राशन कार्ड आवेदन करे वाला पोर्टल"
  },
  {
    name: "MNSSBY (Bihar Student Credit Card)",
    url: "https://www.7nishchay-yuvaupmission.bihar.gov.in/",
    keywords: ["student credit card", "7 nishchay", "mnssby", "bihar student loan", "shiksha rin", "student card"],
    purposeHindi: "बिहार स्टूडेंट क्रेडिट कार्ड एवं 7 निश्चय युवा मिशन पोर्टल",
    purposeBihari: "बिहार स्टूडेंट क्रेडिट कार्ड अउरी 7 निश्चय योजना पोर्टल"
  },

  // Central Government & Civic Essentials
  {
    name: "UIDAI MyAadhaar Portal",
    url: "https://myaadhaar.uidai.gov.in/",
    keywords: ["aadhaar", "aadhar", "uidai", "aadhar download", "aadhaar card", "aadhar update", "pvc aadhar", "adhar"],
    purposeHindi: "आधार कार्ड डाउनलोड, स्टेटस व अपडेट पोर्टल (UIDAI)",
    purposeBihari: "आधार कार्ड डाउनलोड करे अउरी अपडेट करे वाला ऑफिशियल UIDAI पोर्टल"
  },
  {
    name: "NSDL PAN Card Portal",
    url: "https://www.onlineservices.nsdl.com/paam/endConsumerRegisterContact.html",
    keywords: ["pan card", "pan apply", "nsdl", "utiitsl", "pan card download", "new pan card", "pancard"],
    purposeHindi: "नया पैन कार्ड ऑनलाइन अप्लाई व सुधार पोर्टल (NSDL / Protean)",
    purposeBihari: "नया पैन कार्ड बनवावे अउरी सुधार करे वाला ऑफिशियल पोर्टल"
  },
  {
    name: "Parivahan Sarathi (Driving License)",
    url: "https://sarathi.parivahan.gov.in/",
    keywords: ["driving licence", "driving license", "dl apply", "learning licence", "sarathi", "parivahan", "dl renew", "driving test"],
    purposeHindi: "ड्राइविंग लाइसेंस (DL) एवं लर्निंग लाइसेंस पोर्टल (सारथी परिवहन)",
    purposeBihari: "ड्राइविंग लाइसेंस (DL) ऑनलाइन बनवावे अउरी टेस्ट बुक करे वाला सारथी पोर्टल"
  },
  {
    name: "Parivahan Vahan (Vehicle RC & Challan)",
    url: "https://vahan.parivahan.gov.in/",
    keywords: ["vehicle rc", "vahan", "traffic challan", "gadi registration", "rc transfer", "road tax", "echallan"],
    purposeHindi: "वाहन रजिस्ट्रेशन (RC), ओनरशिप ट्रांसफर व चालान पोर्टल (वाहन)",
    purposeBihari: "गाड़ी के RC, ओनरशिप ट्रांसफर अउरी चालान भरे वाला वाहन पोर्टल"
  },
  {
    name: "National Voter Services (ECI)",
    url: "https://voters.eci.gov.in/",
    keywords: ["voter id", "voter card", "nvsp", "election card", "voter list", "voter apply", "epic download"],
    purposeHindi: "वोटर आईडी कार्ड ऑनलाइन अप्लाई, डाउनलोड व करेक्शन पोर्टल (ECI)",
    purposeBihari: "वोटर आईडी कार्ड बनवावे अउरी वोटर लिस्ट में नाम देखे वाला पोर्टल"
  },
  {
    name: "EPFO Member Portal (PF / UAN)",
    url: "https://unifiedportal-mem.epfindia.gov.in/memberinterface/",
    keywords: ["pf balance", "epfo", "uan portal", "epf passbook", "pf withdrawal", "pf claim", "provident fund"],
    purposeHindi: "ईपीएफओ (EPFO) पीएफ बैलेंस चेक, यूएएन व विड्रॉल पोर्टल",
    purposeBihari: "पीएफ (PF) बैलेंस चेक करे अउरी पैसा निकाले वाला EPFO UAN पोर्टल"
  },
  {
    name: "Income Tax e-Filing",
    url: "https://eportal.incometax.gov.in/",
    keywords: ["income tax", "itr filing", "tax return", "e-filing", "itr status", "tax refund", "income tax portal"],
    purposeHindi: "इनकम टैक्स रिटर्न (ITR) फाइलिंग एवं टैक्स रिफंड पोर्टल",
    purposeBihari: "इनकम टैक्स रिटर्न (ITR) भरे अउरी रिफंड चेक करे वाला e-Filing पोर्टल"
  },
  {
    name: "Passport Seva Portal",
    url: "https://www.passportindia.gov.in/",
    keywords: ["passport", "passport apply", "passport seva", "tatkaal passport", "passport renewal", "passport appointment"],
    purposeHindi: "पासपोर्ट ऑनलाइन आवेदन एवं अपॉइंटमेंट पोर्टल (Passport Seva)",
    purposeBihari: "पासपोर्ट बनवावे अउरी अपॉइंटमेंट बुक करे वाला ऑफिशियल पासपोर्ट पोर्टल"
  },
  {
    name: "PM Kisan Samman Nidhi",
    url: "https://pmkisan.gov.in/",
    keywords: ["pm kisan", "kisan samman", "kisan 2000", "kisan installment", "kisan status", "pm kisan ekyc"],
    purposeHindi: "पीएम किसान सम्मान निधि 2000 किस्त स्टेटस एवं ई-केवाईसी पोर्टल",
    purposeBihari: "पीएम किसान सम्मान निधि के किस्त चेक करे अउरी e-KYC करे वाला पोर्टल"
  },
  {
    name: "DigiLocker",
    url: "https://www.digilocker.gov.in/",
    keywords: ["digilocker", "digital locker", "marksheet download", "rc digilocker", "government docs", "gov docs"],
    purposeHindi: "सरकारी दस्तावेज सुरक्षित रखने और डाउनलोड करने का डिजिलॉकर पोर्टल",
    purposeBihari: "सभ सरकारी कागजात सुरक्षित राखे अउरी डाउनलोड करे वाला डिजिलॉकर"
  },

  // Everyday Travel, Entertainment, & Utilities
  {
    name: "IRCTC Next Generation eTicketing",
    url: "https://www.irctc.co.in/nget/",
    keywords: ["train ticket", "rail ticket", "irctc", "rail booking", "tatkal ticket", "pnr status", "train seat availability"],
    purposeHindi: "रेलवे टिकट ऑनलाइन बुकिंग एवं पीएनआर स्टेटस पोर्टल (IRCTC)",
    purposeBihari: "ट्रेन के टिकट बुक करे अउरी PNR स्टेटस देखे वाला IRCTC पोर्टल"
  },
  {
    name: "MakeMyTrip Flights",
    url: "https://www.makemytrip.com/flights/",
    keywords: ["flight ticket", "hawai jahaj", "airplane ticket", "flight booking", "sasti flight", "air ticket", "flight book"],
    purposeHindi: "हवाई जहाज (Flight) टिकट सर्च और ऑनलाइन बुकिंग पोर्टल",
    purposeBihari: "हवाई जहाज (Flight) के सबसे सस्ता टिकट बुक करे वाला पोर्टल"
  },
  {
    name: "Cricbuzz Live Cricket",
    url: "https://www.cricbuzz.com/",
    keywords: ["cricket score", "live score", "cricbuzz", "cricket match", "ipl score", "live cricket", "cricket commentary"],
    purposeHindi: "लाइव क्रिकेट स्कोर, बॉल-बाय-बॉल कमेंट्री व शेड्यूल पोर्टल",
    purposeBihari: "लाइव क्रिकेट मैच के स्कोर अउरी बॉल-बाई-बॉल कमेंट्री देखे वाला Cricbuzz"
  },
  {
    name: "Sarkari Result",
    url: "https://www.sarkariresult.com/",
    keywords: ["sarkari result", "sarkari naukri", "govt job", "admit card download", "government jobs", "sarkari vacancy"],
    purposeHindi: "सरकारी नौकरी वैकेंसी, एडमिट कार्ड एवं रिजल्ट पोर्टल",
    purposeBihari: "सरकारी नौकरी, एडमिट कार्ड अउरी फॉर्म भरे वाला Sarkari Result पोर्टल"
  },
  {
    name: "BookMyShow",
    url: "https://in.bookmyshow.com/",
    keywords: ["movie ticket", "cinema ticket", "bookmyshow", "film ticket", "theatre ticket", "show timing"],
    purposeHindi: "सिनेमा / मूवी टिकट ऑनलाइन बुकिंग पोर्टल (BookMyShow)",
    purposeBihari: "सिनेमा हॉल के मूवी टिकट ऑनलाइन बुक करे वाला BookMyShow"
  },
  {
    name: "Remove.bg",
    url: "https://www.remove.bg/",
    keywords: ["background remove", "photo background", "remove bg", "transparent photo", "image background eraser"],
    purposeHindi: "फोटो का बैकग्राउंड ऑटोमैटिक हटाने वाली फ्री वेबसाइट (Remove.bg)",
    purposeBihari: "फोटो के बैकग्राउंड तुरंत हटावे वाला Remove.bg टूल"
  },
  {
    name: "Speedtest by Ookla",
    url: "https://www.speedtest.net/",
    keywords: ["internet speed", "speed test", "net speed", "wifi speed", "download speed test", "fast internet"],
    purposeHindi: "इंटरनेट व वाईफाई स्पीड चेक करने का स्पीडटेस्ट पोर्टल",
    purposeBihari: "इंटरनेट अउरी वाई-फाई के स्पीड नापे वाला Speedtest पोर्टल"
  },
  {
    name: "YouTube Music",
    url: "https://music.youtube.com/",
    keywords: ["gaana sunne", "song online", "music online", "bhojpuri song", "hindi song", "mp3 song"],
    purposeHindi: "ऑनलाइन गाने और म्यूजिक सुनने का यूट्यूब म्यूजिक पोर्टल",
    purposeBihari: "भोजपुरी, हिंदी अउरी हर तरह के गाना ऑनलाइन सुने वाला म्यूजिक पोर्टल"
  },
  {
    name: "Google Maps Route Planner",
    url: "https://maps.google.com/",
    keywords: ["rasta dekhne", "navigation", "live traffic", "route", "map", "location", "rashta"],
    purposeHindi: "रास्ता, लाइव ट्रैफिक व नेविगेशन देखने का गूगल मैप्स",
    purposeBihari: "रास्ता अउरी लोकेशन देखे वाला गूगल मैप्स"
  }
];

/**
 * Normalizes text for matching
 */
function cleanQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Searches the curated offline directory of verified sites
 */
export function matchCuratedWebsite(userQuery: string): VerifiedWebsiteEntry | null {
  const cleaned = cleanQuery(userQuery);
  if (!cleaned || cleaned.length < 3) return null;

  // Deliberately vague queries like "government ki website kholo" or "kisi website ko kholo"
  // should NOT blindly match DigiLocker or other random sites; they must ask for clarification!
  const words = cleaned.split(/\s+/);
  const isTooVague = 
    words.length <= 4 && (
      cleaned === "government ki website" ||
      cleaned === "government ki website kholo" ||
      cleaned === "govt website" ||
      cleaned === "sarkari website" ||
      cleaned === "sarkari website kholo" ||
      cleaned === "kisi website ko kholo" ||
      cleaned === "website kholo"
    );

  if (isTooVague) {
    return null;
  }

  let bestMatch: VerifiedWebsiteEntry | null = null;
  let maxScore = 0;

  for (const entry of VERIFIED_WEBSITES) {
    let score = 0;

    for (const kw of entry.keywords) {
      // Don't match ultra-generic single words if the query is just a generic statement
      if ((kw === "gov docs" || kw === "government docs") && cleaned.includes("government ki website")) {
        continue;
      }

      if (cleaned.includes(kw)) {
        score += kw.length > 5 ? 3 : 2;
      }
    }

    if (score > maxScore && score >= 2) {
      maxScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

/**
 * Dynamic resolution using Gemini Search / Grounding when not in curated list
 */
export async function resolveWebsiteViaGemini(userDescription: string): Promise<SmartWebsiteResult> {
  try {
    const res = await apiSmartWebsite(userDescription);
    if (res.found && res.url && res.url.startsWith("http")) {
      const launchConfig: AppLaunchOptions = {
        name: res.name || "Official Website",
        webUrl: res.url,
        isWebsiteOnly: true,
      };

      return {
        found: true,
        name: res.name || "Official Website",
        url: res.url,
        purpose: userDescription,
        responseMessage: res.responseMessage || `हाँ बाबू, ${res.name} (${res.url}) के ऑफिशियल वेबसाइट खोज के सीधे खोल देलीं!`,
        appLaunchConfig: launchConfig,
      };
    }

    return {
      found: false,
      name: "",
      url: "",
      purpose: userDescription,
      responseMessage: res.responseMessage || "बाबू, ई काम खातिर कौनो भरोसेमंद ऑफिशियल वेबसाइट साफ-साफ ना मिलल। तनिक दोसर तरीका से समझाईं ना!",
    };
  } catch (error) {
    console.error("Gemini Smart Website Search Error:", error);
    return {
      found: false,
      name: "",
      url: "",
      purpose: userDescription,
      responseMessage: "बाबू, वेबसाइट खोजे में तनिक अड़चन आ गइल बा। एक बेर फिर से बोलिए ना!",
    };
  }
}

/**
 * Main unified smart website search-and-open handler
 * Fast offline check first, then falls back to dynamic Gemini search.
 */
export async function smartSearchAndOpenWebsite(userQuery: string): Promise<SmartWebsiteResult> {
  // 1. Check verified curated list first (zero latency)
  const localMatch = matchCuratedWebsite(userQuery);
  if (localMatch) {
    const launchConfig: AppLaunchOptions = {
      name: localMatch.name,
      webUrl: localMatch.url,
      isWebsiteOnly: true,
    };

    const responseMessage = `हाँ बाबू, ${localMatch.purposeBihari} (${localMatch.name}) के ऑफिशियल वेबसाइट खोज के सीधे खोल देलीं!`;

    // Automatically execute the launch
    try {
      openAppOrWeb(launchConfig);
    } catch (e) {
      console.warn("Failed to open app/web directly:", e);
    }

    return {
      found: true,
      name: localMatch.name,
      url: localMatch.url,
      purpose: localMatch.purposeHindi,
      responseMessage,
      appLaunchConfig: launchConfig,
    };
  }

  // 2. Dynamic Gemini search for any custom/generic purpose
  const dynamicResult = await resolveWebsiteViaGemini(userQuery);
  if (dynamicResult.found && dynamicResult.appLaunchConfig) {
    try {
      openAppOrWeb(dynamicResult.appLaunchConfig);
    } catch (e) {
      console.warn("Failed to open dynamic app/web directly:", e);
    }
  }

  return dynamicResult;
}

/**
 * Checks if the user's spoken or typed command is asking for a website by purpose
 */
export function isWebsitePurposeQuery(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Explicit keywords indicating website request
  const hasWebsiteKeyword = 
    lower.includes("website") || 
    lower.includes("वेबसाइट") || 
    lower.includes("site") || 
    lower.includes("portal") || 
    lower.includes("पोर्टल") || 
    lower.includes("link");

  const hasPurposeIndicator =
    lower.includes("kaunsa hai") ||
    lower.includes("kaun si") ||
    lower.includes("kaun sa") ||
    lower.includes("kahan se") ||
    lower.includes("jahan se") ||
    lower.includes("jahan pe") ||
    lower.includes("kahan pe") ||
    lower.includes("khol do") ||
    lower.includes("kholo") ||
    lower.includes("open") ||
    lower.includes("dikhao") ||
    lower.includes("batayein") ||
    lower.includes("batao");

  if (hasWebsiteKeyword && (hasPurposeIndicator || lower.includes("ki") || lower.includes("ka") || lower.includes("ke"))) {
    return true;
  }

  // Common phrases like "jahan se flight ticket book karte hain", "jahan pe online cricket score dekhte hain"
  if (
    lower.startsWith("jahan se") || 
    lower.startsWith("jahan pe") || 
    lower.startsWith("kahan se") || 
    lower.startsWith("kahan pe")
  ) {
    return true;
  }

  // Specific high-frequency queries
  if (
    lower.includes("jaati") ||
    lower.includes("caste certificate") ||
    lower.includes("awasiya") ||
    lower.includes("cricket score") ||
    lower.includes("flight ticket") ||
    lower.includes("train ticket") ||
    lower.includes("aadhar download") ||
    lower.includes("pan card apply")
  ) {
    if (lower.includes("kahan") || lower.includes("kholein") || lower.includes("kholo") || lower.includes("open") || hasWebsiteKeyword) {
      return true;
    }
  }

  return false;
}
