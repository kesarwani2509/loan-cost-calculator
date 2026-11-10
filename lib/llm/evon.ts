/**
 * Evon tool-calling model client.
 *
 * Sends a transcript (text) to Evon with the three allowed tools and
 * returns whatever the model decided to call: set_loan_terms,
 * ask_clarification, or check_lender.
 *
 * Base URL and auth header come from env at runtime.
 */

import { SYSTEM_PROMPT, TOOLS } from "./system-prompt";

export type ToolCallResult =
  | { tool: "set_loan_terms"; args: SetLoanTermsArgs }
  | { tool: "ask_clarification"; args: { question: string } }
  | { tool: "check_lender"; args: { name: string } };

export type SetLoanTermsArgs = {
  principalRupees: number;
  receivedRupees: number;
  feesRupees: number;
  scheduleType: "interestOnly" | "equalPayments" | "bullet" | "flatRate" | "reducingBalance" | "dailyCollection";
  interestRupees?: number;
  amountRupees?: number;
  periods?: number;
  periodUnit?: "month" | "week" | "day";
  annualRate?: number;
  payments?: Array<{ amountRupees: number; dueInDays: number }>;
  lenderName?: string;
  appName?: string;
  penalty?:
    | { kind: "flat"; amountRupees: number }
    | { kind: "per_day"; amountRupees: number }
    | { kind: "percent_of_instalment"; percent: number; instalmentRupees: number };
  rollover?: { outstandingRupees: number; feeRupees: number; days: number };
};

export type EvonMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

/**
 * Send a transcript to Evon and return the first tool call.
 * @param transcript  The user's words as plain text from Prisma.
 * @param history     Prior turns in the conversation (for follow-up clarifications).
 */
export async function chat(
  transcript: string,
  history: EvonMessage[] = [],
): Promise<ToolCallResult | null> {
  const baseUrl = process.env.EVON_API_BASE_URL;
  const apiKey = process.env.EVON_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Evon LLM is not configured. Set EVON_API_BASE_URL and EVON_API_KEY in .env.local.");
  }

  const messages: EvonMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: transcript },
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages,
      tools: TOOLS,
      tool_choice: "required",
    }),
  });

  if (!response.ok) {
    throw new Error(`Evon request failed (${response.status}). Check EVON_API_BASE_URL, credentials, and provider contract.`);
  }

  const json = (await response.json()) as EvonResponse;
  const choice = json.choices?.[0];
  if (!choice) return null;

  const toolCall = choice.message?.tool_calls?.[0];
  if (!toolCall) return null;

  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Evon returned malformed tool arguments.");
  }

  const name = toolCall.function.name;
  if (name === "set_loan_terms" && args && typeof args === "object") return { tool: "set_loan_terms", args: args as SetLoanTermsArgs };
  if (name === "ask_clarification" && typeof (args as { question?: unknown })?.question === "string") return { tool: "ask_clarification", args: { question: (args as { question: string }).question.slice(0, 300) } };
  if (name === "check_lender" && typeof (args as { name?: unknown })?.name === "string") return { tool: "check_lender", args: { name: (args as { name: string }).name.slice(0, 200) } };

  return null;
}

// ---- Evon response shape ------------------------------------------------

type EvonResponse = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
};

