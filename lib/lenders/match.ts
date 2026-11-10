import { serverClient } from "@/lib/db/supabase";

export type MatchResult =
  | { found: false; state: "not_found" }
  | { found: false; state: "possible_match"; candidates: string[] }
  | { found: false; state: "unable_to_check"; reason: "not_configured" | "lookup_failed" }
  | {
      found: true;
      state: "verified" | "possible_match";
      exact: boolean;
      name: string;
      registrationNumber?: string;
      status: "active" | "cancelled";
      matchType: "verified" | "possible_match";
      note?: string;
    };

function normaliseName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const GENERIC_NAMES = new Set(["loan", "app", "loan app", "instant loan", "quick loan", "cash"]);

export async function matchLender(rawName: string): Promise<MatchResult> {
  const norm = normaliseName(rawName);
  if (!norm || norm.length < 3 || GENERIC_NAMES.has(norm)) return { found: false, state: "not_found" };

  let supabase;
  try { supabase = serverClient(); }
  catch { return { found: false, state: "unable_to_check", reason: "not_configured" }; }

  try {
    const columns = "name_raw, registration_number, status";
    const exact = await supabase.from("nbfc_registry").select(columns).eq("name_normalised", norm).limit(2);
    if (exact.error) throw exact.error;
    if (exact.data?.length === 1) return asMatch(exact.data[0], true);
    if (exact.data && exact.data.length > 1) return { found: false, state: "unable_to_check", reason: "lookup_failed" };

    // A substring is only a lead, never proof of legal identity. Return it as
    // possible only when a single candidate exists; ambiguity is not resolved by row order.
    const fuzzy = await supabase.from("nbfc_registry").select(columns).ilike("name_normalised", `%${norm}%`).limit(3);
    if (fuzzy.error) throw fuzzy.error;
    if (fuzzy.data?.length === 1) {
      const candidate = asMatch(fuzzy.data[0], false);
      return { ...candidate, state: "possible_match", matchType: "possible_match",
        note: "Possible name similarity only. Confirm the legal lender name and registration independently." };
    }
    if (fuzzy.data && fuzzy.data.length > 1) {
      return { found: false, state: "possible_match", candidates: fuzzy.data.map((row: { name_raw: string }) => row.name_raw) };
    }
    return { found: false, state: "not_found" };
  } catch {
    return { found: false, state: "unable_to_check", reason: "lookup_failed" };
  }
}

function asMatch(row: { name_raw: string; registration_number: string | null; status: string }, exact: boolean): Extract<MatchResult, { found: true }> {
  const status = row.status === "cancelled" ? "cancelled" : "active";
  return {
    found: true, state: exact ? "verified" : "possible_match", exact,
    name: row.name_raw, registrationNumber: row.registration_number ?? undefined,
    status, matchType: exact ? "verified" : "possible_match",
    note: "An exact registry-name match does not by itself establish that a particular app or agent is authorised to collect money.",
  };
}
