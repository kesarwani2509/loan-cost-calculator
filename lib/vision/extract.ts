/**
 * Vision model: extract loan terms from a screenshot.
 *
 * Sunday morning:
 * - Image is read in memory.
 * - Extracts: loan amount, disbursed amount, fees, repayment amount, tenure, lender name, app name.
 * - If only app name is present (no NBFC/lender), note that the lending company was not on the offer.
 * - Original screenshots are never stored; only extracted text/terms are retained.
 */

export type ExtractedTerms = {
  rawText?: string;
  appName?: string;
  lenderName?: string;
  principalRupees?: number;
  disbursedRupees?: number;
  feesRupees?: number;
  repaymentRupees?: number;
  tenureDays?: number;
  notice?: string;
};

/**
 * Read a screenshot in-memory and extract visible loan terms.
 */
export async function extractFromScreenshot(
  imageBuffer: ArrayBuffer,
  mimeType: string,
): Promise<ExtractedTerms | null> {
  const apiKey = process.env.VISION_API_KEY;
  const baseUrl = process.env.VISION_API_BASE_URL;

  if (!apiKey) {
    throw new Error("Vision API is not configured. Set VISION_API_KEY in .env.local.");
  }

  const endpoint = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/chat/completions` : "https://api.openai.com/v1/chat/completions";
  const base64Image = Buffer.from(imageBuffer).toString("base64");
  const dataUrl = `data:${mimeType || "image/png"};base64,${base64Image}`;

  const prompt = `Analyze this loan screenshot or offer document and extract:
1. appName: Name of the application/service
2. lenderName: Regulated NBFC or bank name (if stated)
3. principalRupees: Total/face loan amount in numbers
4. disbursedRupees: Cash actually received/disbursed to borrower
5. feesRupees: Processing fees, GST, or upfront deductions
6. repaymentRupees: Total amount required to repay
7. tenureDays: Tenure in days (e.g. 14, 30, 90, 365)
8. rawText: Full visible text snippet for reference

Respond in strictly valid JSON matching this schema:
{
  "appName": string | null,
  "lenderName": string | null,
  "principalRupees": number | null,
  "disbursedRupees": number | null,
  "feesRupees": number | null,
  "repaymentRupees": number | null,
  "tenureDays": number | null,
  "rawText": string | null
}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Vision API error (${response.status}). Check VISION_API_BASE_URL, VISION_MODEL, and credentials.`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as ExtractedTerms;
    for (const [key, value] of Object.entries(parsed)) {
      if (["principalRupees", "disbursedRupees", "feesRupees", "repaymentRupees", "tenureDays"].includes(key)
        && value !== null && value !== undefined
        && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        throw new Error(`Vision returned an invalid ${key} value.`);
      }
    }
    if (parsed.appName && !parsed.lenderName) {
      parsed.notice = "The lending company (registered NBFC/bank) was not found on the offer screen.";
    }
    return parsed;
  } catch {
    throw new Error("Failed to parse vision response JSON.");
  }
}
