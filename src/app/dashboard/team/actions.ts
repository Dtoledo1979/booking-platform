"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { echoValues, fieldErrorsOf, friendlyDbError, type FormState } from "@/lib/form-state";
import { parseWeekHours } from "@/lib/hours";
import { can, getMemberContext } from "@/lib/owner-context";
import { siteOrigin } from "@/lib/site";
import { STAFF_COLORS } from "@/lib/staff-colors";
import { createClient } from "@/lib/supabase/server";

async function managerContext() {
  const user = await requireUser("/dashboard/team");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) redirect("/dashboard/calendar");
  return { supabase, ctx };
}

const MESSAGES: Record<string, string> = {
  not_allowed: "You don't have permission to invite that role.",
  invalid_email: "Enter a valid email address.",
  staff_required: "Choose which team member this login is for.",
  staff_unavailable: "That team member already has a login.",
  already_member: "That person already has this role here.",
};

// ---------- Team members (bookable profiles) ----------

const staffSchema = z.object({
  staffId: z.union([z.literal(""), z.uuid()]),
  displayName: z.string().trim().min(1, "Enter a name").max(80),
  bio: z.string().trim().max(1000).optional(),
  calendarColor: z.enum(STAFF_COLORS).optional(),
  bookableOnline: z.literal("on").optional(),
});

export async function saveStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await managerContext();
  const d = parsed.data;

  // Checkbox groups echo back as one comma-separated value.
  const requested = formData.getAll("services").map(String);
  const echo = () => ({ ...echoValues(formData), services: requested.join(",") });

  const { rows, fieldErrors } = parseWeekHours(formData);
  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please fix the highlighted days.", fieldErrors, values: echo() };
  }

  // Only services of this location can be assigned.
  const { data: validServices } = await supabase.from("services").select("id").eq("location_id", ctx.location.id);
  const serviceIds = requested.filter((id) => validServices?.some((s) => s.id === id));

  const profile = {
    display_name: d.displayName,
    bio: d.bio || null,
    calendar_color: d.calendarColor ?? null,
    is_bookable_online: d.bookableOnline === "on",
  };

  let staffId = d.staffId;
  if (staffId) {
    const { error } = await supabase.from("staff").update(profile).eq("id", staffId).eq("location_id", ctx.location.id);
    if (error) return { status: "error", message: friendlyDbError(error), values: echo() };
  } else {
    const { data: created, error } = await supabase
      .from("staff")
      .insert({ ...profile, location_id: ctx.location.id })
      .select("id")
      .single();
    if (error) return { status: "error", message: friendlyDbError(error), values: echo() };
    staffId = created.id;
  }

  // Replace services and weekly hours.
  await supabase.from("staff_services").delete().eq("staff_id", staffId);
  if (serviceIds.length) {
    const { error } = await supabase
      .from("staff_services")
      .insert(serviceIds.map((service_id) => ({ staff_id: staffId, service_id, location_id: ctx.location.id })));
    if (error) return { status: "error", message: friendlyDbError(error), values: echo() };
  }
  await supabase.from("staff_working_hours").delete().eq("staff_id", staffId);
  if (rows.length) {
    const { error } = await supabase.from("staff_working_hours").insert(
      rows.map((r) => ({
        staff_id: staffId,
        location_id: ctx.location.id,
        weekday: r.weekday,
        starts_at: r.opens,
        ends_at: r.closes,
      })),
    );
    if (error) return { status: "error", message: friendlyDbError(error), values: echo() };
  }

  revalidatePath("/dashboard/team");
  revalidatePath(`/${ctx.location.slug}`);
  redirect(`/dashboard/team?saved=${staffId}`);
}

export async function setStaffActive(staffId: string, active: boolean): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(staffId).success) return { error: "Team member not found." };
  const { supabase, ctx } = await managerContext();

  if (!active) {
    // Don't strand clients: future bookings must be moved or cancelled first.
    const { count } = await supabase
      .from("appointment_services")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", staffId)
      .eq("is_active", true)
      .gt("starts_at", new Date().toISOString());
    if (count) {
      return {
        error: `They have ${count} upcoming appointment${count === 1 ? "" : "s"}. Move or cancel them in the calendar first.`,
      };
    }
  }

  const { error } = await supabase.from("staff").update({ active }).eq("id", staffId).eq("location_id", ctx.location.id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/dashboard/team");
  revalidatePath(`/${ctx.location.slug}`);
  return {};
}

// ---------- Logins (memberships) ----------

const inviteSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  role: z.enum(["manager", "reception", "professional"]),
  staffId: z.union([z.literal(""), z.uuid()]).optional(),
});

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await managerContext();
  const d = parsed.data;

  const { data: token, error } = await supabase.rpc("create_invite", {
    p_location_id: ctx.location.id,
    p_email: d.email,
    p_role: d.role,
    p_staff_id: d.role === "professional" && d.staffId ? d.staffId : undefined,
  });
  if (error) {
    return { status: "error", message: MESSAGES[error.message] ?? friendlyDbError(error), values: echoValues(formData) };
  }

  revalidatePath("/dashboard/team");
  // The raw token is only available now; the database keeps a hash.
  return {
    status: "success",
    message: `Invite ready for ${d.email}.`,
    values: { link: `${await siteOrigin()}/invite/${token}`, email: d.email },
  };
}

export async function removeMember(membershipId: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(membershipId).success) return { error: "Member not found." };
  const { supabase } = await managerContext();
  const { error } = await supabase.rpc("remove_member", { p_membership_id: membershipId });
  if (error) return { error: MESSAGES[error.message] ?? friendlyDbError(error) };
  revalidatePath("/dashboard/team");
  return {};
}
