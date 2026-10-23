// translationService.ts - Live Voice Translation Engine for Zoya AI
// Routes translation requests through secure backend /api/translate
import { apiTranslate } from "./api";

export interface TranslationResult {
  isTranslationIntent: boolean;
  sourceText?: string;
  targetLanguage?: "English" | "Hindi" | "Bhojpuri";
  translatedText?: string;
  response: string;
}

export async function handleLiveTranslation(input: string): Promise<TranslationResult> {
  const lower = input.toLowerCase().trim();

  // Check translation patterns:
  // "Isko English mein bolo", "Bhojpuri mein bata do", "Translate: [text]", "English mein translate karo"
  const isTranslate =
    /translate|isko\s+english\s+mein|isko\s+hindi\s+mein|isko\s+bhojpuri\s+mein|english\s+mein\s+bolo|bhojpuri\s+mein\s+bolo|hindi\s+mein\s+bolo/i.test(
      lower
    );

  if (!isTranslate) {
    return { isTranslationIntent: false, response: "" };
  }

  let targetLang: "English" | "Hindi" | "Bhojpuri" = "English";
  if (/bhojpuri/i.test(lower)) targetLang = "Bhojpuri";
  else if (/hindi/i.test(lower)) targetLang = "Hindi";
  else if (/english/i.test(lower)) targetLang = "English";

  // Extract source text
  let sourceText = input
    .replace(
      /^(?:zoya\s+)?(?:please\s+)?(?:translate|isko|ise|ye|this)?\s*(?:to|into|in|mein)?\s*(?:english|hindi|bhojpuri)?\s*(?:mein)?\s*(?:bolo|batao|karo|translate\s+karo)?(?::|-)?\s*/gi,
      ""
    )
    .trim();

  if (!sourceText) {
    sourceText = input;
  }

  try {
    const result = await apiTranslate(sourceText, targetLang);
    return {
      isTranslationIntent: true,
      sourceText,
      targetLanguage: targetLang,
      translatedText: result.translated,
      response: result.spokenReply,
    };
  } catch (e) {
    console.error("Translation error:", e);
    return {
      isTranslationIntent: true,
      response: "मालिक, ट्रांसलेशन करे में तनी दिक्कत भइल। एक बेर दोबारा बोल के देखीं!",
    };
  }
}
