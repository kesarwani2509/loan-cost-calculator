/**
 * scripts/delete-expired.ts
 *
 * Retention & Privacy policy from plan:
 * - loan_checks rows are deleted after 24 hours (expires_at <= now()).
 * - Original screenshots are never stored in the database.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/delete-expired.ts
 */

import { serverClient } from "../lib/db/supabase";

async function main() {
  const supabase = serverClient();
  const now = new Date().toISOString();

  console.log(`Running privacy deletion job at ${now}...`);

  const { data, error, count } = await supabase
    .from("loan_checks")
    .delete({ count: "exact" })
    .lte("expires_at", now);

  if (error) {
    console.error("Deletion job failed:", error);
    process.exit(1);
  }

  console.log(` Successfully purged ${count ?? 0} expired loan_check records.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
