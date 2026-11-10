/**
 * Timbre text-to-speech client (Vachana AI).
 * Returns audio/wav bytes in the requested language (Hindi, Tamil, or Bengali).
 */

export type SpeakOptions = {
  text: string;
  language: "hi" | "ta" | "bn"; // Hindi, Tamil, Bengali
};

const LANGUAGE_MAP: Record<"hi" | "ta" | "bn", { code: string; voice: string }> = {
  hi: { code: "hi-IN", voice: "Nalini" },
  ta: { code: "ta-IN", voice: "Nalini" },
  bn: { code: "bn-IN", voice: "Nalini" },
};

/**
 * Convert text to speech via Vachana Timbre TTS.
 * Returns the raw audio/wav ArrayBuffer.
 */
export async function speak(options: SpeakOptions): Promise<ArrayBuffer> {
  const baseUrl = process.env.TIMBRE_API_BASE_URL || "https://api.vachana.ai/api/v1/tts/inference";
  const apiKey = process.env.TIMBRE_API_KEY;

  if (!apiKey) {
    throw new Error("Timbre TTS is not configured. Set TIMBRE_API_KEY in .env.local.");
  }

  const langConfig = LANGUAGE_MAP[options.language] || LANGUAGE_MAP.hi;

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key-ID": apiKey,
    },
    body: JSON.stringify({
      text: options.text,
      voice: langConfig.voice,
      model: process.env.TIMBRE_MODEL || "timbre-v2.5",
      language: langConfig.code,
      speed: 1,
      audio_config: {
        encoding: "linear_pcm",
        container: "wav",
        num_channels: 1,
        sample_rate: 24000,
        sample_width: 2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Timbre TTS failed (${response.status}). Check provider credentials and API configuration.`);
  }

  return response.arrayBuffer();
}
