import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

// Service-role client for trusted server jobs (the notification dispatcher,
// later the Stripe webhook). Bypasses RLS: never use it to answer a user's
// request directly, and never import it from client code.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (server-only secret, see .env.example).");
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}
