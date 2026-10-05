import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
export type MemberRole = Database["public"]["Enums"]["member_role"];

export type MemberContext = {
  role: MemberRole;
  organizationId: string;
  organizationName: string;
  location: {
    id: string;
    name: string;
    slug: string;
    status: Database["public"]["Enums"]["location_status"];
    timezone: string;
  };
  // The signed-in person's own bookable profile at this location, if any.
  myStaffId: string | null;
};

const PRIORITY: Record<MemberRole, number> = { owner: 0, manager: 1, reception: 2, professional: 3 };

// The business the signed-in user works in, with their highest role.
// Owners are org-wide (first location for now); everyone else is scoped to
// the location they were invited to. Multi-location switching comes later.
export async function getMemberContext(supabase: Client, userId: string): Promise<MemberContext | null> {
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organization_id, location_id, organizations(name)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (!memberships?.length) return null;

  const best = [...memberships].sort((a, b) => PRIORITY[a.role] - PRIORITY[b.role])[0];

  let query = supabase.from("locations").select("id, name, slug, status, timezone");
  query = best.location_id
    ? query.eq("id", best.location_id)
    : query.eq("organization_id", best.organization_id).order("created_at").limit(1);
  const { data: location } = await query.maybeSingle();
  if (!location) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id")
    .eq("location_id", location.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    role: best.role,
    organizationId: best.organization_id,
    organizationName: best.organizations?.name ?? "",
    location,
    myStaffId: staff?.id ?? null,
  };
}

// What each role can do in the dashboard. The database enforces the same
// rules (RLS and RPC checks); this only decides what to show.
export function can(role: MemberRole) {
  const manager = role === "owner" || role === "manager";
  return {
    manageBusiness: manager, // profile, services, hours, team
    seeAllCalendars: role !== "professional",
    inviteManagers: role === "owner",
  };
}

export type SetupStep = "business" | "services" | "hours" | "done";

export async function getSetupStep(supabase: Client, ctx: MemberContext | null): Promise<SetupStep> {
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

// Active, bookable professionals: the unit any per-seat pricing will count.
export async function countBookableStaff(supabase: Client, locationId: string) {
  const { count } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .eq("active", true)
    .eq("is_bookable_online", true);
  return count ?? 0;
}
