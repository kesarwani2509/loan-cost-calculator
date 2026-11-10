/**
 * Prisma speech-to-text client (Vachana AI).
 * "Prisma" is the product name for the speech-to-text model (prisma-v3.0).
 */

export type TranscribeResult = {
  text: string;
  language?: string;
};

/**
 * Transcribe a short audio clip.
 * @param audioBuffer  Raw audio bytes (WAV, WebM, etc.).
 * @param mimeType     MIME type of the audio.
 * @returns            Transcript text and detected language code.
 */
export async function transcribe(
  audioBuffer: ArrayBuffer,
  mimeType: string,
): Promise<TranscribeResult> {
  const baseUrl = process.env.PRISMA_API_BASE_URL || "https://api.vachana.ai/stt/v3";
  const apiKey = process.env.PRISMA_API_KEY;

  if (!apiKey) {
    throw new Error("Prisma speech-to-text is not configured. Set PRISMA_API_KEY in .env.local.");
  }

  const form = new FormData();
  const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") ? "mp3" : "webm";
  form.append("audio_file", new Blob([audioBuffer], { type: mimeType }), `clip.${ext}`);
  form.append("model", "prisma-v3.0");
  form.append("language_code", "indic-auto");

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "X-API-Key-ID": apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Prisma transcription failed (${response.status}). Check provider credentials and API configuration.`);
  }

  const json = (await response.json()) as {
    success?: boolean;
    transcript?: string;
    detected_language_code?: string;
  };

  return {
    text: json.transcript || "",
    language: json.detected_language_code,
  };
}
