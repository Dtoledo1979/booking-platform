import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { PolicyTerms } from "@/lib/format";

type Client = SupabaseClient<Database>;

export type PublicLocation = Awaited<ReturnType<typeof fetchLocation>>;

async function fetchLocation(supabase: Client, slug: string) {
  // RLS returns active locations to everyone, and draft ones to their own
  // staff — which is what makes the owner's preview work.
  const { data } = await supabase
    .from("locations")
    .select(
      "id, slug, name, description, phone, email, address_line, suburb, city, postcode, timezone, currency, status, is_verified, max_advance_days, amenities",
    )
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

// Everything a booking page needs, loaded once per request.
export const getPublicLocation = cache(async (slug: string) => {
  const supabase = await createClient();
  const location = await fetchLocation(supabase, slug);
  if (!location) return null;

  const [services, staff, links, hours, policy] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, duration_minutes, price_cents, price_type, category_id, sort_order")
      .eq("location_id", location.id)
      .eq("active", true)
      .eq("is_bookable_online", true)
      .order("sort_order")
      .order("price_cents"),
    supabase
      .from("staff")
      .select("id, display_name, bio, photo_path, sort_order")
      .eq("location_id", location.id)
      .eq("active", true)
      .eq("is_bookable_online", true)
      .order("sort_order"),
    supabase.from("staff_services").select("staff_id, service_id").eq("location_id", location.id),
    supabase
      .from("location_opening_hours")
      .select("weekday, opens_at, closes_at")
      .eq("location_id", location.id)
      .order("opens_at"),
    supabase
      .from("cancellation_policies")
      .select("id, free_cancellation_hours, late_cancel_fee_type, late_cancel_fee_value, no_show_fee_type, no_show_fee_value, policy_text")
      .eq("location_id", location.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    location,
    isPreview: location.status !== "active",
    services: services.data ?? [],
    staff: staff.data ?? [],
    staffServices: links.data ?? [],
    hours: hours.data ?? [],
    policy: (policy.data ?? null) as (PolicyTerms & { id: string; policy_text: string | null }) | null,
  };
});

export function addressLines(l: { address_line: string | null; suburb: string | null; city: string | null; postcode: string | null }) {
  return [l.address_line, [l.suburb, l.city, l.postcode].filter(Boolean).join(", ")].filter(Boolean) as string[];
}
