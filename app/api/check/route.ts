/**
 * POST /api/check
 *
 * Accepts a multipart/form-data body with:
 *   - audio: an audio file (WebM/Opus from MediaRecorder) OR
 *   - image: screenshot of loan app/agreement OR
 *   - text:  a plain-text transcript (for testing without a mic)
 *
 * Flow:
 *   1. If image is present, extract terms using vision model.
 *   2. If audio is present, transcribe with Prisma.
 *   3. Run through Evon tool-calling (set_loan_terms, ask_clarification, check_lender).
 *   4. Check lender in NBFC registry.
 *   5. Compute loan summary and attach comparisons (config/comparison-rates.json).
 */

import type { NextRequest } from "next/server";
import { transcribe } from "@/lib/speech/prisma";
import { chat } from "@/lib/llm/evon";
import { buildLoanTerms } from "@/lib/llm/finance-bridge";
import { matchLender, type MatchResult } from "@/lib/lenders/match";
import { extractFromScreenshot } from "@/lib/vision/extract";
import { formatPercent, getComparisons, summarise, type ComparisonItem } from "@/lib/finance";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export type CheckResponse =
  | {
      kind: "summary";
      summary: SummaryPayload;
      lender?: MatchResult;
      comparisons?: ComparisonItem[];
      notice?: string;
    }
  | { kind: "clarification"; question: string; transcript: string }
  | { kind: "lender"; lender: MatchResult; transcript: string }
  | { kind: "error"; message: string };

export type SummaryPayload = {
  transcript: string;
  totalRepayRupees: number;
  totalCostRupees: number;
  effectiveAnnualRateDisplay: string | null;
  holdingPeriodRateDisplay: string | null;
  holdingDays: number;
  principalRupees: number;
  receivedRupees: number;
  feesRupees: number;
  payments: Array<{ amountRupees: number; dueInDays: number; tYears?: number }>;
  penalty?: { amountRupees: number; label: "once" | "per_day" };
  rollover?: { feeRupees: number; effectiveAnnualRateDisplay: string };
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"]);

export async function POST(request: NextRequest): Promise<Response> {
  if (!rateLimit(`check:${clientKey(request)}`, 8, 60_000)) {
    return Response.json({ kind: "error", message: "Too many requests. Please wait a minute and try again." } satisfies CheckResponse, { status: 429 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ kind: "error", message: "Upload is too large. Maximum size is 8 MB." } satisfies CheckResponse, { status: 413 });
  }
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let transcript = "";
    let extractedLenderName: string | undefined;
    let screenshotNotice: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const textField = form.get("text");
      const audioField = form.get("audio");
      const imageField = form.get("image");

      if (imageField instanceof Blob && imageField.size > 0) {
        const imageMime = imageField.type.split(";")[0].toLowerCase();
        if (imageField.size > MAX_UPLOAD_BYTES || !ALLOWED_IMAGE_TYPES.has(imageMime)) {
          return Response.json({ kind: "error", message: "Use a JPEG, PNG, or WebP image up to 8 MB." } satisfies CheckResponse, { status: 400 });
        }
        const buffer = await imageField.arrayBuffer();
        const extracted = await extractFromScreenshot(buffer, imageField.type || "image/png");
        if (extracted) {
          extractedLenderName = extracted.lenderName;
          screenshotNotice = extracted.notice;
          const extractedFacts = [
            extracted.appName ? `App name: ${extracted.appName}` : "",
            extracted.lenderName ? `Stated lender: ${extracted.lenderName}` : "",
            extracted.principalRupees !== undefined ? `Loan principal: ₹${extracted.principalRupees}` : "",
            extracted.disbursedRupees !== undefined ? `Amount received: ₹${extracted.disbursedRupees}` : "",
            extracted.feesRupees !== undefined ? `Fees and deductions: ₹${extracted.feesRupees}` : "",
            extracted.repaymentRupees !== undefined ? `Total repayment: ₹${extracted.repaymentRupees}` : "",
            extracted.tenureDays !== undefined ? `Tenure: ${extracted.tenureDays} days` : "",
          ].filter(Boolean).join(". ");
          transcript = [extractedFacts, extracted.rawText ? `Visible offer text: ${extracted.rawText}` : ""].filter(Boolean).join("\n");
        }
      } else if (typeof textField === "string" && textField.trim()) {
        transcript = textField.trim();
      } else if (audioField instanceof Blob && audioField.size > 0) {
        const audioMime = audioField.type.split(";")[0].toLowerCase();
        if (audioField.size > MAX_UPLOAD_BYTES || !ALLOWED_AUDIO_TYPES.has(audioMime)) {
          return Response.json({ kind: "error", message: "Use a supported audio file (WebM, OGG, WAV, MP3, or MP4) up to 8 MB." } satisfies CheckResponse, { status: 400 });
        }
        const buffer = await audioField.arrayBuffer();
        const result = await transcribe(buffer, audioField.type || "audio/webm");
        transcript = result.text;
      } else {
        return Response.json(
          { kind: "error", message: "Send an audio file, a screenshot image, or a text field." } satisfies CheckResponse,
          { status: 400 },
        );
      }
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { text?: string };
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 12_000) {
        return Response.json(
          { kind: "error", message: "JSON body must include a text field." } satisfies CheckResponse,
          { status: 400 },
        );
      }
      transcript = body.text.trim();
    } else {
      return Response.json(
        { kind: "error", message: "Unsupported content-type. Use multipart/form-data or application/json." } satisfies CheckResponse,
        { status: 415 },
      );
    }

    if (!transcript.trim() || transcript.length > 12_000) {
      return Response.json({ kind: "error", message: "The supplied text is empty or too long." } satisfies CheckResponse, { status: 400 });
    }
    const toolCall = await chat(transcript);

    if (!toolCall) {
      return Response.json(
        { kind: "error", message: "The model did not return a tool call." } satisfies CheckResponse,
        { status: 502 },
      );
    }

    if (toolCall.tool === "ask_clarification") {
      return Response.json({
        kind: "clarification",
        question: toolCall.args.question,
        transcript,
      } satisfies CheckResponse);
    }

    if (toolCall.tool === "check_lender") {
      const lender = await matchLender(toolCall.args.name);
      return Response.json({
        kind: "lender",
        lender,
        transcript,
      } satisfies CheckResponse);
    }

    // set_loan_terms
    const loanTerms = buildLoanTerms(toolCall.args);
    const loanSummary = summarise(loanTerms);

    // Look up lender if found from screenshot or model
    let lenderResult: MatchResult | undefined;
    const targetLender = extractedLenderName || toolCall.args.lenderName;
    if (targetLender) {
      lenderResult = await matchLender(targetLender);
    }

    // Comparison rates for bank, SHG, gold loan
    const comparisons = getComparisons(
      toolCall.args.principalRupees * 100,
      loanSummary.holdingDays || 30,
    );

    const summaryPayload: SummaryPayload = {
      transcript,
      totalRepayRupees: loanSummary.totalRepayPaise / 100,
      totalCostRupees: loanSummary.totalCostPaise / 100,
      effectiveAnnualRateDisplay:
        loanSummary.effectiveAnnualRate !== null
          ? formatPercent(loanSummary.effectiveAnnualRate)
          : null,
      holdingPeriodRateDisplay:
        loanSummary.holdingPeriodRate !== null
          ? `${formatPercent(loanSummary.holdingPeriodRate)} in ${loanSummary.holdingDays} days`
          : null,
      holdingDays: loanSummary.holdingDays,
      principalRupees: loanTerms.principalPaise / 100,
      receivedRupees: loanTerms.receivedPaise / 100,
      feesRupees: loanTerms.feesPaise / 100,
      payments: loanTerms.payments.map((payment) => ({
        amountRupees: payment.amountPaise / 100,
        dueInDays: payment.dueInDays,
        ...(payment.tYears === undefined ? {} : { tYears: payment.tYears }),
      })),
      ...(loanSummary.penalty ? { penalty: {
        amountRupees: loanSummary.penalty.amountPaise / 100,
        label: loanSummary.penalty.label,
      } } : {}),
      ...(loanSummary.rollover ? { rollover: {
        feeRupees: loanSummary.rollover.feePaise / 100,
        effectiveAnnualRateDisplay: formatPercent(loanSummary.rollover.effectiveAnnualRate),
      } } : {}),
    };

    return Response.json({
      kind: "summary",
      summary: summaryPayload,
      lender: lenderResult,
      comparisons,
      notice: screenshotNotice,
    } satisfies CheckResponse);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "";
    const isConfig = rawMessage.includes("not configured");
    const isInput = /must be|invalid|requires|between|payment schedule/i.test(rawMessage);
    const message = isConfig ? "A required service is not configured. Please contact the administrator."
      : isInput ? rawMessage : "Loan analysis could not be completed. Please try again.";
    const status = isConfig ? 503 : isInput ? 400 : 502;
    return Response.json({ kind: "error", message } satisfies CheckResponse, { status });
  }
}
