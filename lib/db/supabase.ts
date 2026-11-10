/**
 * Supabase clients.
 *
 * A single server-only client using the service-role key. Never import this
 * module from a Client Component. Server operations are still protected by
 * application-level validation and must not expose the key in responses.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Runtime guard: never permit the service-role client to execute in a browser.
if (typeof window !== "undefined") {
  throw new Error("The Supabase service-role client is server-only.");
}

// ── Server client (service-role key) ───────────────────────────────────────
// Only use in server components, route handlers, and scripts.

let _server: SupabaseClient | null = null;

export function serverClient(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  if (!_server) {
    _server = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
  }
  return _server;
}

