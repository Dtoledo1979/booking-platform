import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Supabase client for Client Components. The session lives in cookies so
// Server Components and the proxy can read the same session.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
