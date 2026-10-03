import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type OwnerContext = {
  organizationId: string;
  organizationName: string;
  location: {
    id: string;
    name: string;
    slug: string;
    status: Database["public"]["Enums"]["location_status"];
    timezone: string;
  };
  // The owner's own bookable profile, when they also work on clients.
  ownerStaffId: string | null;
};

// The organization the signed-in user owns and its first location. The
// MVP onboarding creates exactly one; multi-location management comes later.
export async function getOwnerContext(supabase: Client, userId: string): Promise<OwnerContext | null> {
  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, organizations(name)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: location } = await supabase
    .from("locations")
    .select("id, name, slug, status, timezone")
    .eq("organization_id", membership.organization_id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("location_id", location.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    organizationId: membership.organization_id,
    organizationName: membership.organizations?.name ?? "",
    location,
    ownerStaffId: staff?.id ?? null,
  };
}

export type SetupStep = "business" | "services" | "hours" | "done";

export async function getSetupStep(supabase: Client, ctx: OwnerContext | null): Promise<SetupStep> {
  if (!ctx) return "business";

  const [{ count: services }, { count: hours }] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("location_id", ctx.location.id),
    supabase
      .from("location_opening_hours")
      .select("id", { count: "exact", head: true })
      .eq("location_id", ctx.location.id),
  ]);

  if (!services) return "services";
  if (!hours) return "hours";
  return "done";
}
