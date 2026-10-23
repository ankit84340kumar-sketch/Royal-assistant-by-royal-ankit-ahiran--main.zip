// screenVisionService.ts - Real-Time Screen Vision, OCR & Error Explanations
// Routes vision analysis securely through backend /api/vision
import { apiVision } from "./api";

/**
 * Analyzes the given base64 image (screen capture frame) with Gemini Vision via secure backend
 */
export async function analyzeScreenContent(
  imageBase64: string,
  userQuery = "What is visible on this screen? Read or explain key elements."
): Promise<string> {
  try {
    const analysis = await apiVision(imageBase64, userQuery);
    return analysis || "मालिक, हम स्क्रीन देख लेलीं! एह पर जरूरी जानकारी अउरी मेनू देखाई दे रहल बा।";
  } catch (error) {
    console.error("Screen Vision analysis error:", error);
    return "मालिक, स्क्रीन फ्रेम पढ़े में तनी दिक्कत भइल बा। कृपया स्क्रीन शेयर चालू राखीं अउरी दोबारा बोलीं!";
  }
}
