
function categorizeSearchError(err: any): { userMsg: string; errorCategory: string } {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("network") || msg.includes("abort")) {
    return {
      userMsg: "नेटवर्क टाइमआउट के कारण वेब सर्च में रुकावट आ गई बाबू! (Network Timeout Error)",
      errorCategory: "Network / Timeout",
    };
  }
  if (msg.includes("quota") || msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("key")) {
    return {
      userMsg: "सर्च कोटा सीमित होने के कारण लाइव वेब परिणाम प्राप्त नहीं हो सके बाबू! (API Quota Error)",
      errorCategory: "API Key / Quota Exceeded",
    };
  }
  return {
    userMsg: "लाइव इंटरनेट सर्च सेवा में अस्थायी रुकावट आ गई बाबू! (Web Search Unavailable)",
    errorCategory: err?.message || "Search Service Error",
  };
}

import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { matchCuratedWebsite } from "./smartWebsiteService";
import { apiTools } from "./api";

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, '').trim();

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  qualityCategory?: "Official" | "Primary Research" | "Established News" | "Specialist" | "Opinion" | "User-Generated";
}

export function classifySourceQuality(urlString: string, title?: string): "Official" | "Primary Research" | "Established News" | "Specialist" | "Opinion" | "User-Generated" {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    // 1. Official / Government / Educational
    if (
      host.endsWith(".gov") ||
      host.endsWith(".gov.in") ||
      host.endsWith(".edu") ||
      host.endsWith(".ac.in") ||
      host.endsWith(".org") ||
      host.includes("nic.in") ||
      host.includes("who.int") ||
      host.includes("un.org") ||
      host.includes("pib.gov.in") ||
      host.includes("uidai.gov.in") ||
      host.includes("incometax.gov.in") ||
      host.includes("rbi.org.in")
    ) {
      return "Official";
    }

    // 2. Primary Research / Journals / Scholarly
    if (
      host.includes("nature.com") ||
      host.includes("sciencedirect.com") ||
      host.includes("arxiv.org") ||
      host.includes("doi.org") ||
      host.includes("ncbi.nlm.nih.gov") ||
      host.includes("pubmed") ||
      host.includes("springer.com") ||
      host.includes("ieee.org") ||
      host.includes("researchgate.net") ||
      host.includes("lancet.com")
    ) {
      return "Primary Research";
    }

    // 3. Established News Outlets
    if (
      host.includes("reuters.com") ||
      host.includes("apnews.com") ||
      host.includes("bbc.com") ||
      host.includes("thehindu.com") ||
      host.includes("indianexpress.com") ||
      host.includes("ndtv.com") ||
      host.includes("indiatimes.com") ||
      host.includes("hindustantimes.com") ||
      host.includes("bloomberg.com") ||
      host.includes("thewire.in") ||
      host.includes("scroll.in") ||
      host.includes("aajtak.in") ||
      host.includes("abplive.com")
    ) {
      return "Established News";
    }

    // 4. Specialist / Technical Platforms
    if (
      host.includes("github.com") ||
      host.includes("stackoverflow.com") ||
      host.includes("techcrunch.com") ||
      host.includes("wired.com") ||
      host.includes("theverge.com") ||
      host.includes("arstechnica.com") ||
      host.includes("geeksforgeeks.org") ||
      host.includes("developer.mozilla.org") ||
      host.includes("kaggle.com")
    ) {
      return "Specialist";
    }

    // 5. User-Generated / Social / Forums
    if (
      host.includes("reddit.com") ||
      host.includes("quora.com") ||
      host.includes("medium.com") ||
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("facebook.com") ||
      host.includes("instagram.com") ||
      host.includes("linkedin.com") ||
      host.includes("wikipedia.org")
    ) {
      return "User-Generated";
    }

    return "Opinion";
  } catch {
    return "Opinion";
  }
}

export interface WebSearchResult {
  success: boolean;
  query: string;
  aiSummary: string;
  sources: WebSearchResultItem[];
  error?: string;
}

export interface ImageSearchResultItem {
  title: string;
  thumbnailUrl: string;
  fullImageUrl: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  attribution?: string;
}

export interface ImageSearchResult {
  success: boolean;
  query: string;
  images: ImageSearchResultItem[];
  error?: string;
}

export interface GeneratedImageResult {
  success: boolean;
  prompt: string;
  imageDataUrl?: string;
  error?: string;
}

export interface LinkInspectionResult {
  success: boolean;
  url: string;
  title?: string;
  publisher?: string;
  description?: string;
  favicon?: string;
  mainText?: string;
  summary?: string;
  error?: string;
}

export interface DocumentAnalysisResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  fileType: string;
  summary: string;
  extractedSnippet?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// 1. WEB SEARCH (Gemini with Google Search Grounding & Fallback)
// ---------------------------------------------------------------------------
export async function executeWebSearch(query: string): Promise<WebSearchResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      success: false,
      query,
      aiSummary: "सर्च करने के लिए कृपया कोई विषय या सवाल बताएं बाबू!",
      sources: [],
      error: "Empty search query",
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      try {
        const serverRes = await apiTools("search", { query: cleanQuery });
        if (serverRes && serverRes.aiSummary) {
          return {
            success: serverRes.success !== false,
            query,
            aiSummary: serverRes.aiSummary,
            sources: serverRes.sources || [],
          };
        }
      } catch (err: any) {
        return {
          success: false,
          query: cleanQuery,
          aiSummary: "माफ़ करना बाबू, सर्च करने में थोड़ी रुकावट आ गई। कृपया दोबारा प्रयास करें।",
          sources: [],
          error: err?.message || "Search request failed",
        };
      }
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Call Gemini with Google Search Grounding enabled
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Search the web and provide accurate, verified information about: "${cleanQuery}".
Present the key findings in 3-5 clear, friendly, natural sentences in sweet conversational Hindi with authentic Bihari touch, addressing the user warmly as 'बाबू'.
Highlight key facts directly. Always mention the genuine source names if available.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const aiSummary = response.text || "इंटरनेट से जानकारी मिल गई है बाबू!";
    const sources: WebSearchResultItem[] = [];

    // Extract grounding metadata if provided by Gemini Search
    const candidate = response.candidates?.[0];
    const groundingMeta = candidate?.groundingMetadata;

    if (groundingMeta?.groundingChunks) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri) {
          const uri = chunk.web.uri;
          const title = chunk.web.title || new URL(uri).hostname.replace(/^www\./, '');
          if (!sources.some((s) => s.url === uri)) {
            sources.push({
              title,
              url: uri,
              source: new URL(uri).hostname.replace(/^www\./, ''),
              snippet: title,
              qualityCategory: classifySourceQuality(uri, title),
            });
          }
        }
      }
    }

    return {
      success: true,
      query: cleanQuery,
      aiSummary,
      sources,
    };
  } catch (err: any) {
    console.error("Web Search Error:", err);
    const { userMsg, errorCategory } = categorizeSearchError(err);
    return {
      success: false,
      query: cleanQuery,
      aiSummary: `${userMsg}\n\n(नोट: यह बिना वेब रिसर्च का सामान्य उत्तर है, सत्यापित इंटरनेट डेटा नहीं बाबू!)`,
      sources: [],
      error: errorCategory,
    };
  }
}

// ---------------------------------------------------------------------------
// 1.1 DEEP RESEARCH (Structured Multi-Source Investigation)
// ---------------------------------------------------------------------------
export async function executeDeepResearch(query: string, urls?: string[]): Promise<WebSearchResult> {
  const cleanQuery = query.trim();
  try {
    if (!GEMINI_API_KEY) {
      try {
        const serverRes = await apiTools("deepResearch", { query: cleanQuery, urls });
        if (serverRes && serverRes.aiSummary) {
          const categorizedSources = (serverRes.sources || []).map((s: any) => ({
            ...s,
            qualityCategory: s.qualityCategory || classifySourceQuality(s.url, s.title),
          }));
          return {
            success: serverRes.success !== false,
            query: cleanQuery,
            aiSummary: serverRes.aiSummary,
            sources: categorizedSources,
          };
        }
      } catch (err: any) {
        return {
          success: false,
          query: cleanQuery,
          aiSummary: "डीप रिसर्च में समस्या आ गई बाबू! कृपया नेटवर्क जांचें।",
          sources: [],
          error: err?.message || "Deep Research request failed",
        };
      }
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    let urlContexts = "";
    const urlSources: WebSearchResultItem[] = [];

    if (urls && Array.isArray(urls) && urls.length > 0) {
      for (const u of urls) {
        try {
          const linkRes = await inspectWebUrl(u);
          if (linkRes && linkRes.success) {
            urlContexts += `\n=== LINK: ${u} ===\nTitle: ${linkRes.title}\nSummary: ${linkRes.summary}\n`;
            urlSources.push({
              title: linkRes.title || u,
              url: linkRes.url || u,
              source: new URL(u).hostname.replace(/^www\./, ""),
              snippet: linkRes.description || linkRes.summary?.slice(0, 150),
              qualityCategory: classifySourceQuality(u, linkRes.title),
            });
          }
        } catch {}
      }
    }

    const prompt = `Perform a DEEP RESEARCH investigation on: "${cleanQuery}".
${urlContexts ? `User Links Content:\n${urlContexts}\n` : ""}

Instructions for Deep Research Report:
1. Conduct a thorough, multi-source investigation using Google Search Grounding.
2. Cross-check claims across independent sources.
3. Mark facts with status tags where relevant: [सत्यापित / Verified], [पुष्टीकृत / Corroborated], [विवादित / Disputed], or [अपुष्ट / Unverified].
4. Deliver the response in warm, conversational Hindi with an authentic Bihari touch, warmly calling the user 'बाबू'.
5. Format the report clearly with these sections:
   📌 Executive Summary (निष्कर्ष सार)
   🔎 Research Scope & Method (शोध दायरा एवं विधि)
   📊 Key Findings (मुख्य तथ्य एवं निष्कर्ष)
   ⚖️ Cross-Source Evidence Comparison (स्रोतों का तुलनात्मक विश्लेषण)
   ⚠️ Uncertain or Disputed Claims (अपुष्ट या विवादित तथ्य)
   📝 Final Conclusion (अंतिम निष्कर्ष)
6. Do not fabricate facts or sources.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const aiSummary = response.text || "डीप रिसर्च रिपोर्ट तैयार हो गई है बाबू!";
    const sources: WebSearchResultItem[] = [...urlSources];

    const candidate = response.candidates?.[0];
    const groundingMeta = candidate?.groundingMetadata;

    if (groundingMeta?.groundingChunks) {
      for (const chunk of groundingMeta.groundingChunks) {
        if (chunk.web?.uri) {
          const uri = chunk.web.uri;
          const title = chunk.web.title || new URL(uri).hostname.replace(/^www\./, "");
          if (!sources.some((s) => s.url === uri)) {
            sources.push({
              title,
              url: uri,
              source: new URL(uri).hostname.replace(/^www\./, ""),
              snippet: title,
              qualityCategory: classifySourceQuality(uri, title),
            });
          }
        }
      }
    }

    return {
      success: true,
      query: cleanQuery,
      aiSummary,
      sources,
    };
  } catch (err: any) {
    console.error("Deep Research Error:", err);
    return {
      success: false,
      query: cleanQuery,
      aiSummary: "डीप रिसर्च करने में रुकावट आ गई बाबू!",
      sources: [],
      error: err?.message || "Deep Research failed",
    };
  }
}

// ---------------------------------------------------------------------------
// 2. WEBSITE SEARCH & LINK INSPECTION (SSRF Protected)
// ---------------------------------------------------------------------------

// SSRF Protection: Checks whether a URL points to dangerous/private IP or cloud metadata
export function isSafePublicUrl(urlString: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "केवल HTTP और HTTPS प्रोटोकॉल की अनुमति है।" };
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost, loopbacks, 0.0.0.0
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    ) {
      return { safe: false, reason: "लोकलहोस्ट या इंटरनल नेटवर्क की अनुमति नहीं है।" };
    }

    // Block cloud metadata services (e.g. 169.254.169.254, metadata.google.internal)
    if (
      host === "169.254.169.254" ||
      host.includes("metadata.google.internal") ||
      host.includes("metadata.internal")
    ) {
      return { safe: false, reason: "क्लाउड मेटाडेटा एंडपॉइंट्स सख्त वर्जित हैं।" };
    }

    // Block private IPv4 subnets (10.x, 172.16-31.x, 192.168.x)
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b0 = parseInt(ipv4Match[1], 10);
      const b1 = parseInt(ipv4Match[2], 10);
      if (
        b0 === 10 ||
        b0 === 127 ||
        (b0 === 172 && b1 >= 16 && b1 <= 31) ||
        (b0 === 192 && b1 === 168) ||
        (b0 === 169 && b1 === 254)
      ) {
        return { safe: false, reason: "प्राइवेट लोकल आईपी एड्रेस को एक्सेस नहीं किया जा सकता।" };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "अमान्य URL प्रारूप (Invalid URL format)।" };
  }
}

export async function inspectWebUrl(urlString: string): Promise<LinkInspectionResult> {
  const safetyCheck = isSafePublicUrl(urlString);
  if (!safetyCheck.safe) {
    return {
      success: false,
      url: urlString,
      error: safetyCheck.reason || "असुरक्षित या अमान्य URL।",
    };
  }

  try {
    // Check if URL matches a known curated website
    const curated = matchCuratedWebsite(urlString);
    let siteName = curated ? curated.name : "";

    // Safely attempt to fetch metadata with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    let htmlContent = "";
    try {
      // Use CORS proxy or direct fetch
      const fetchUrl = urlString;
      const res = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const fullText = await res.text();
        htmlContent = fullText.slice(0, 150000); // Max 150KB for fast analysis
      }
    } catch {
      clearTimeout(timeoutId);
      // If direct fetch is CORS-blocked, proceed with URL domain inspection via Gemini Grounding
    }

    // Extract Title and Meta from HTML if available
    let pageTitle = siteName || new URL(urlString).hostname;
    let pageDescription = "";
    let extractedText = "";

    if (htmlContent) {
      const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) pageTitle = titleMatch[1].trim();

      const descMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        htmlContent.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      if (descMatch) pageDescription = descMatch[1].trim();

      // Simple HTML stripping
      extractedText = htmlContent
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
    }

    let faviconUrl = "";
    try {
      const hostname = new URL(urlString).hostname;
      faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {}

    // Use Gemini to generate a crisp summary via server
    if (!GEMINI_API_KEY) {
      const serverRes = await apiTools("inspectLink", { url: urlString });
      if (!serverRes || serverRes.success === false) {
        return {
          success: false,
          url: urlString,
          error: serverRes?.error || "इस लिंक को पढ़ने में समस्या आ गई बाबू! कृपया लिंक जांच लें।",
        };
      }
      return {
        success: true,
        url: serverRes.url || urlString,
        title: serverRes.title || pageTitle,
        description: serverRes.description || pageDescription,
        favicon: serverRes.favicon || faviconUrl,
        mainText: serverRes.mainText || extractedText.slice(0, 500),
        summary: serverRes.summary || "इस लिंक का विवरण प्राप्त हो गया है बाबू!",
      };
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `Analyze this webpage URL: "${urlString}".
Page Title: "${pageTitle}".
Description: "${pageDescription}".
Extracted text preview: "${extractedText || "Direct metadata only"}".
Summarize what this website/link is about, its utility, and what services or content it provides.
Deliver the answer in 3-4 friendly, crisp sentences in sweet conversational Hindi with authentic Bihari touch, calling the user 'बाबू'.`;

    const summaryRes = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const summary = summaryRes.text || "इस लिंक का विश्लेषण पूरा हो गया है बाबू!";

    return {
      success: true,
      url: urlString,
      title: pageTitle,
      description: pageDescription,
      favicon: faviconUrl,
      mainText: extractedText.slice(0, 500),
      summary,
    };
  } catch (err: any) {
    console.error("Link Inspection Error:", err);
    return {
      success: false,
      url: urlString,
      error: "इस लिंक को पढ़ने में दिक्कत आई बाबू! वेबसाइट ने एक्सेस ब्लॉक कर रखा हो सकता है।",
    };
  }
}

// ---------------------------------------------------------------------------
// 3. IMAGE SEARCH (Wikimedia Commons + Verified Public Gallery API)
// ---------------------------------------------------------------------------
export async function searchWebImages(query: string): Promise<ImageSearchResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      success: false,
      query,
      images: [],
      error: "कृपया इमेज खोजने के लिए कोई विषय बताएं!",
    };
  }

  try {
    // Query Wikimedia Commons Open API (Authentic, license-safe public images)
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      cleanQuery
    )}&gsrlimit=8&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Wikimedia API request failed");

    const data = await res.json();
    const images: ImageSearchResultItem[] = [];

    if (data?.query?.pages) {
      const pages = Object.values(data.query.pages) as any[];
      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        if (info && info.url) {
          const title = (page.title || "Image").replace(/^File:/, "").replace(/\.[^.]+$/, "");
          const isSvg = info.url.endsWith(".svg");
          // Use thumbnail or full image
          const thumb = isSvg ? info.url : info.thumburl || info.url;
          images.push({
            title: title.slice(0, 50),
            thumbnailUrl: thumb,
            fullImageUrl: info.url,
            sourceUrl: info.descriptionurl || info.url,
            width: info.width,
            height: info.height,
            attribution: "Wikimedia Commons (Open License)",
          });
        }
      }
    }

    // Fallback if Wikimedia returned no matches: generate structured curated query cards
    if (images.length === 0) {
      // Create high-quality curated query links
      const terms = cleanQuery.split(" ").slice(0, 3).join("+");
      images.push({
        title: `${cleanQuery} on Unsplash`,
        thumbnailUrl: `https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80`,
        fullImageUrl: `https://unsplash.com/s/photos/${terms}`,
        sourceUrl: `https://unsplash.com/s/photos/${terms}`,
        attribution: "Unsplash Gallery",
      });
      images.push({
        title: `${cleanQuery} on Google Images`,
        thumbnailUrl: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80`,
        fullImageUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanQuery)}`,
        sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanQuery)}`,
        attribution: "Google Images Search",
      });
    }

    return {
      success: true,
      query: cleanQuery,
      images,
    };
  } catch (err: any) {
    console.error("Image search error:", err);
    return {
      success: false,
      query: cleanQuery,
      images: [
        {
          title: `Search '${cleanQuery}' on Google Images`,
          thumbnailUrl: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80`,
          fullImageUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanQuery)}`,
          sourceUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanQuery)}`,
          attribution: "Google Images Search",
        },
      ],
      error: "तस्वीरें खोजने में थोड़ी दिक्कत आ गई बाबू! डायरेक्ट लिंक दिया गया है।",
    };
  }
}

// ---------------------------------------------------------------------------
// 4. TEXT-TO-IMAGE GENERATION (Google Imagen 3 via @google/genai)
// ---------------------------------------------------------------------------
export async function generateImageWithPrompt(prompt: string): Promise<GeneratedImageResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return {
      success: false,
      prompt,
      error: "तस्वीर बनाने के लिए कृपया कोई प्रॉम्प्ट दें बाबू!",
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      const serverRes = await apiTools("generateImage", { prompt: cleanPrompt });
      return {
        success: Boolean(serverRes?.success),
        prompt: cleanPrompt,
        imageDataUrl: serverRes?.imageDataUrl,
        error: serverRes?.error,
      };
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Call Imagen 3 via generateImages
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: cleanPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "1:1",
      },
    });

    const image = response.generatedImages?.[0];
    if (image?.image?.imageBytes) {
      const dataUrl = `data:image/jpeg;base64,${image.image.imageBytes}`;
      return {
        success: true,
        prompt: cleanPrompt,
        imageDataUrl: dataUrl,
      };
    }

    return {
      success: false,
      prompt: cleanPrompt,
      error: "तस्वीर जनरेट नहीं हो सकी बाबू! कृपया दूसरा प्रॉम्प्ट आज़माएं।",
    };
  } catch (err: any) {
    console.error("Imagen 3 generation error:", err);
    return {
      success: false,
      prompt: cleanPrompt,
      error: err?.message || "इमेज जनरेशन में त्रुटि आ गई बाबू। कोटा या प्रॉम्प्ट पॉलिसी चेक करें।",
    };
  }
}

// ---------------------------------------------------------------------------
// 5. PDF & DOCUMENT ANALYSIS (Gemini Native Multimodal & Text Processing)
// ---------------------------------------------------------------------------
export async function analyzeUploadedDocument(
  file: File,
  userInstruction = "Summarize this document and highlight its key points."
): Promise<DocumentAnalysisResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const fileType = file.type || "application/octet-stream";

  // Check 10MB limit
  if (fileSize > 10 * 1024 * 1024) {
    return {
      success: false,
      fileName,
      fileSize,
      fileType,
      summary: "",
      error: "फ़ाइल का आकार 10 MB से अधिक है बाबू! कृपया छोटी फ़ाइल चुनें।",
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const serverRes = await apiTools("analyzeFile", {
        fileName,
        fileType,
        fileBase64: base64,
        userQuery: userInstruction,
      });
      return {
        success: Boolean(serverRes?.success),
        fileName,
        fileSize,
        fileType: serverRes?.fileType || fileType,
        summary: serverRes?.analysis || serverRes?.summary || "दस्तावेज़ का विश्लेषण पूरा हो गया है बाबू!",
        extractedSnippet: serverRes?.extractedSnippet,
        error: serverRes?.error,
      };
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Handle PDF files directly via inlineData base64 (Gemini 2.5/3.1 native support)
    if (fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      const prompt = `You are Zoya, a brilliant and caring AI assistant built by Royal Ankit Ahiran.
The user has attached the PDF document "${fileName}" and asks: "${userInstruction}".
Analyze this PDF thoroughly.
1. Provide a clear, structured summary of the key points in conversational, friendly Hindi with sweet Bihari warmth, addressing the user as 'बाबू'.
2. List 3-4 vital takeaways or action items.
3. Keep it crisp, accurate, and completely free of hallucination.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64,
                },
              },
            ],
          },
        ],
      });

      return {
        success: true,
        fileName,
        fileSize,
        fileType: "PDF Document",
        summary: response.text || "PDF का विश्लेषण पूरा हो गया है बाबू!",
      };
    }

    // Handle Text-based formats (TXT, CSV, JSON, Markdown, Code)
    const textContent = await file.text();
    const truncatedText = textContent.slice(0, 60000); // 60K chars safe context window

    const prompt = `You are Zoya, a brilliant AI assistant built by Royal Ankit Ahiran.
The user has attached the document/file "${fileName}" (${fileType}).
User query: "${userInstruction}".
File content preview:
---
${truncatedText}
---
Analyze this content. Provide a clear summary and answer the user query in sweet conversational Hindi with authentic Bihari charm, calling the user 'बाबू'.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      success: true,
      fileName,
      fileSize,
      fileType,
      summary: response.text || "फ़ाइल का विश्लेषण सफलतापूर्वक हो गया बाबू!",
      extractedSnippet: truncatedText.slice(0, 300),
    };
  } catch (err: any) {
    console.error("Document analysis error:", err);
    return {
      success: false,
      fileName,
      fileSize,
      fileType,
      summary: "",
      error: err?.message || "फ़ाइल पढ़ने या विश्लेषण करने में समस्या आ गई बाबू!",
    };
  }
}

// ---------------------------------------------------------------------------
// 6. CODE & SCRIPT ANALYSIS (Safe Inspection, No Eval)
// ---------------------------------------------------------------------------
export async function analyzeCodeFile(
  file: File,
  userInstruction = "Explain this code, spot any bugs, and suggest improvements."
): Promise<DocumentAnalysisResult> {
  const fileName = file.name;
  const fileSize = file.size;

  if (fileSize > 5 * 1024 * 1024) {
    return {
      success: false,
      fileName,
      fileSize,
      fileType: "Code File",
      summary: "",
      error: "कोड फ़ाइल 5 MB से बड़ी है बाबू! कृपया छोटी फ़ाइल चुनें।",
    };
  }

  try {
    const codeText = await file.text();
    const cleanSnippet = codeText.slice(0, 50000);

    if (!GEMINI_API_KEY) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const serverRes = await apiTools("analyzeFile", {
        fileName,
        fileType: "text/plain",
        fileBase64: base64,
        userQuery: userInstruction,
      });
      return {
        success: Boolean(serverRes?.success),
        fileName,
        fileSize,
        fileType: serverRes?.fileType || "Source Code",
        summary: serverRes?.analysis || serverRes?.summary || "कोड का विश्लेषण पूरा हो गया है बाबू!",
        extractedSnippet: serverRes?.extractedSnippet,
        error: serverRes?.error,
      };
    }
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `You are Zoya, a sharp, tech-savvy coding companion built by developer Royal Ankit Ahiran (Python & Security expert).
The user shared a code file: "${fileName}".
User request: "${userInstruction}".
Code Content:
\`\`\`
${cleanSnippet}
\`\`\`
1. Explain what this code does clearly and simply.
2. Spot any syntax mistakes, logic bugs, or security vulnerabilities (like SQL injection, unhandled errors, memory leaks).
3. Provide concrete code improvements or fixed snippets.
Deliver the explanation in lively, encouraging, and sweet Hindi with authentic Bihari banter, addressing the user as 'बाबू'.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      success: true,
      fileName,
      fileSize,
      fileType: "Source Code",
      summary: response.text || "कोड का विश्लेषण पूरा हो गया है बाबू!",
      extractedSnippet: cleanSnippet.slice(0, 200),
    };
  } catch (err: any) {
    console.error("Code analysis error:", err);
    return {
      success: false,
      fileName,
      fileSize,
      fileType: "Source Code",
      summary: "",
      error: err?.message || "कोड फ़ाइल पढ़ने में दिक्कत आई बाबू!",
    };
  }
}

// ---------------------------------------------------------------------------
// 7. ZIP ARCHIVE PROJECT ANALYSIS (Safe Unzip, Source Code Extraction)
// ---------------------------------------------------------------------------
export async function analyzeZipArchive(
  file: File,
  userInstruction = "Inspect this ZIP archive, explain project structure and main code files."
): Promise<DocumentAnalysisResult> {
  const fileName = file.name;
  const fileSize = file.size;

  if (fileSize > 25 * 1024 * 1024) {
    return {
      success: false,
      fileName,
      fileSize,
      fileType: "ZIP Archive",
      summary: "",
      error: "ZIP फ़ाइल 25 MB से बड़ी है बाबू! कृपया छोटी अर्काइव फ़ाइल चुनें।",
    };
  }

  try {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    const fileList: string[] = [];
    const extractedSourceFiles: { path: string; text: string }[] = [];
    let totalExtractedBytes = 0;
    const MAX_EXTRACTED_BYTES = 5 * 1024 * 1024; // 5MB uncompressed limit

    const isTextExt = (path: string) =>
      /\.(py|js|ts|tsx|jsx|html|css|json|md|txt|c|cpp|h|java|sql|sh|go|rs|cs|kt|php|yml|yaml|toml|xml)$/i.test(path);

    for (const [relativePath, entry] of Object.entries(contents.files)) {
      if (entry.dir) continue;
      // Guard against path traversal
      if (relativePath.includes("..") || relativePath.startsWith("/")) continue;
      
      fileList.push(relativePath);

      if (isTextExt(relativePath) && extractedSourceFiles.length < 30 && totalExtractedBytes < MAX_EXTRACTED_BYTES) {
        try {
          const text = await entry.async("text");
          if (text && text.trim().length > 0) {
            const truncated = text.slice(0, 10000);
            totalExtractedBytes += truncated.length;
            extractedSourceFiles.push({ path: relativePath, text: truncated });
          }
        } catch {
          // Ignore binary/corrupted entries
        }
      }
    }

    const treePreview = fileList.slice(0, 40).join("\n");
    const sourcesPreview = extractedSourceFiles
      .map((f) => `--- File: ${f.path} ---\n${f.text}`)
      .join("\n\n");

    if (!GEMINI_API_KEY) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const serverRes = await apiTools("analyzeFile", {
        fileName,
        fileType: "application/zip",
        fileBase64: base64,
        userQuery: userInstruction,
      });
      return {
        success: Boolean(serverRes?.success),
        fileName,
        fileSize,
        fileType: serverRes?.fileType || "ZIP Project Archive",
        summary: serverRes?.analysis || serverRes?.summary || `अर्काइव "${fileName}" में कुल ${fileList.length} फ़ाइलें पाई गईं बाबू!`,
        extractedSnippet: serverRes?.extractedSnippet,
        error: serverRes?.error,
      };
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `You are Zoya, an expert developer AI assistant built by Royal Ankit Ahiran.
The user uploaded a ZIP project archive: "${fileName}".
User request: "${userInstruction}".

Directory / File Structure Preview (Total files: ${fileList.length}):
\`\`\`
${treePreview}
\`\`\`

Key Source Files Content:
\`\`\`
${sourcesPreview.slice(0, 40000)}
\`\`\`

Analyze this project:
1. Explain what this project / ZIP archive is for and its main structure.
2. Highlight key entry points, dependencies, and configuration.
3. Identify potential bugs, missing files, or security risks.
4. Deliver the summary in friendly, clear Hindi with sweet Bihari warmth, calling user 'बाबू'.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return {
      success: true,
      fileName,
      fileSize,
      fileType: "ZIP Project Archive",
      summary: response.text || "ZIP अर्काइव का विश्लेषण पूरा हो गया है बाबू!",
      extractedSnippet: treePreview.slice(0, 300),
    };
  } catch (err: any) {
    console.error("ZIP analysis error:", err);
    return {
      success: false,
      fileName,
      fileSize,
      fileType: "ZIP Archive",
      summary: "",
      error: err?.message || "ZIP फ़ाइल खोलने या पढ़ने में समस्या आ गई बाबू!",
    };
  }
}

// ---------------------------------------------------------------------------
// 8. VIDEO & AUDIO FILE ANALYSIS
// ---------------------------------------------------------------------------
export async function analyzeVideoOrAudioFile(
  file: File,
  userInstruction = "Summarize this media file and explain its key content."
): Promise<DocumentAnalysisResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const fileType = file.type || (fileName.endsWith(".mp4") ? "video/mp4" : "audio/mpeg");

  if (fileSize > 25 * 1024 * 1024) {
    return {
      success: false,
      fileName,
      fileSize,
      fileType,
      summary: "",
      error: "मीडिया फ़ाइल 25 MB से बड़ी है बाबू! कृपया छोटी फ़ाइल चुनें।",
    };
  }

  try {
    if (!GEMINI_API_KEY) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const serverRes = await apiTools("analyzeFile", {
        fileName,
        fileType,
        fileBase64: base64,
        userQuery: userInstruction,
      });
      return {
        success: Boolean(serverRes?.success),
        fileName,
        fileSize,
        fileType: serverRes?.fileType || fileType,
        summary: serverRes?.analysis || serverRes?.summary || `मीडिया फ़ाइल "${fileName}" का विश्लेषण पूरा हो गया है बाबू!`,
        extractedSnippet: serverRes?.extractedSnippet,
        error: serverRes?.error,
      };
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    const isVideo = fileType.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi)$/i.test(fileName);
    const mime = isVideo ? "video/mp4" : "audio/mp3";

    const prompt = `You are Zoya, a brilliant AI voice assistant built by Royal Ankit Ahiran.
The user uploaded a ${isVideo ? "video" : "audio"} file: "${fileName}" (${Math.round(fileSize / 1024)} KB).
User query: "${userInstruction}".
Thoroughly analyze this media content (audio transcript / video frames).
Provide a clear, helpful summary of key points, speech, or events in friendly Hindi with sweet Bihari charm, calling user 'बाबू'.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mime,
                data: base64,
              },
            },
          ],
        },
      ],
    });

    return {
      success: true,
      fileName,
      fileSize,
      fileType: isVideo ? "Video File" : "Audio File",
      summary: response.text || `${isVideo ? "वीडियो" : "ऑडियो"} का विश्लेषण पूरा हो गया बाबू!`,
    };
  } catch (err: any) {
    console.error("Media analysis error:", err);
    return {
      success: false,
      fileName,
      fileSize,
      fileType,
      summary: "",
      error: err?.message || "मीडिया फ़ाइल का विश्लेषण करने में अड़चन आई बाबू!",
    };
  }
}

// Helper: Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
