/**
 * POST /api/speak
 *
 * Accepts JSON: { text: string; language: "hi" | "ta" | "bn" }
 * Returns the audio bytes from Timbre as audio/mpeg (or audio/opus).
 *
 * Returns 503 when TIMBRE_API_KEY is not set.
 */

import type { NextRequest } from "next/server";
import { speak } from "@/lib/speech/timbre";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest): Promise<Response> {
  if (!rateLimit(`speak:${clientKey(request)}`, 10, 60_000)) {
    return new Response("Too many requests. Please wait a minute and try again.", { status: 429 });
  }
  try {
    const body = (await request.json()) as { text?: string; language?: string };

    if (!body.text || typeof body.text !== "string" || body.text.length > 2000) {
      return new Response("Body must include a text string of up to 2,000 characters.", { status: 400 });
    }

    const lang = body.language ?? "hi";
    if (!["hi", "ta", "bn"].includes(lang)) {
      return new Response("language must be one of: hi, ta, bn.", { status: 400 });
    }

    const audio = await speak({
      text: body.text,
      language: lang as "hi" | "ta" | "bn",
    });

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "";
    const configured = rawMessage.includes("not configured");
    return new Response(configured ? "Speech service is not configured." : "Speech synthesis failed. Please try again.", { status: configured ? 503 : 502 });
  }
}

