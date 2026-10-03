"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { echoValues, fieldErrorsOf, friendlyDbError, type FormState } from "@/lib/form-state";
import { getOwnerContext } from "@/lib/owner-context";
import { SLUG_PATTERN } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE_VALUES } from "@/lib/timezones";

// Every action re-checks the session and loads the caller's own business:
// ids from the form are never trusted to pick which business to change.
async function ownerOrRedirect() {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, user.id);
  return { user, supabase, ctx };
}

// ---------- Step 1: business ----------

const businessSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(120),
  locationName: z.string().trim().max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(60, "Keep it under 60 characters")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes"),
  timezone: z.enum(TIMEZONE_VALUES),
  worksOnClients: z.enum(["yes", "no"], { error: "Choose one option" }),
});

export async function createBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, ctx } = await ownerOrRedirect();
  if (ctx) redirect("/onboarding"); // already created: never make a second org by double-submit

  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const d = parsed.data;

  const { error } = await supabase.rpc("create_organization", {
    p_organization_name: d.businessName,
    p_location_name: d.locationName || d.businessName,
    p_location_slug: d.slug,
    p_timezone: d.timezone,
    p_owner_is_professional: d.worksOnClients === "yes",
  });

  if (error) {
    const message = friendlyDbError(error);
    const onSlug = message.includes("booking link");
    return {
      status: "error",
      message: onSlug ? undefined : message,
      fieldErrors: onSlug ? { slug: [message] } : undefined,
      values: echoValues(formData),
    };
  }

  redirect("/onboarding");
}

// ---------- Step 2: services ----------

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Enter a service name").max(120),
  duration: z.coerce.number().int().min(5).max(720),
  price: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a price like 65 or 65.50"),
});

export async function addService(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, ctx } = await ownerOrRedirect();
  if (!ctx) redirect("/onboarding");

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { name, duration, price } = parsed.data;

  const { data: service, error } = await supabase
    .from("services")
    .insert({
      location_id: ctx.location.id,
      name,
      duration_minutes: duration,
      price_cents: Math.round(Number(price) * 100),
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };

  // Solo owners do every service themselves; teams assign staff later.
  if (ctx.ownerStaffId) {
    const { error: linkError } = await supabase
      .from("staff_services")
      .insert({ staff_id: ctx.ownerStaffId, service_id: service.id, location_id: ctx.location.id });
    if (linkError) return { status: "error", message: friendlyDbError(linkError) };
  }

  revalidatePath("/onboarding");
  return { status: "success", message: `Added “${name}”.` };
}

export async function removeService(serviceId: string) {
  const { supabase, ctx } = await ownerOrRedirect();
  if (!ctx) redirect("/onboarding");

  // Scoped to the caller's location as well as by RLS.
  await supabase.from("services").delete().eq("id", serviceId).eq("location_id", ctx.location.id);
  revalidatePath("/onboarding");
}

// ---------- Step 3: hours ----------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveHours(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, ctx } = await ownerOrRedirect();
  if (!ctx) redirect("/onboarding");

  const rows: { weekday: number; opens: string; closes: string }[] = [];
  const fieldErrors: Record<string, string[]> = {};

  for (let weekday = 0; weekday <= 6; weekday++) {
    if (formData.get(`open_${weekday}`) !== "on") continue;
    const opens = String(formData.get(`opens_${weekday}`) ?? "");
    const closes = String(formData.get(`closes_${weekday}`) ?? "");
    if (!TIME.test(opens) || !TIME.test(closes) || closes <= opens) {
      fieldErrors[`day_${weekday}`] = ["Closing time must be after opening time"];
      continue;
    }
    rows.push({ weekday, opens, closes });
  }

  if (Object.keys(fieldErrors).length) {
    return { status: "error", message: "Please fix the highlighted days.", fieldErrors, values: echoValues(formData) };
  }
  if (!rows.length) {
    return { status: "error", message: "Open at least one day a week.", values: echoValues(formData) };
  }

  // Replace the week: public opening hours, plus the owner's own working
  // hours when they take bookings themselves.
  const { error: delError } = await supabase.from("location_opening_hours").delete().eq("location_id", ctx.location.id);
  if (delError) return { status: "error", message: friendlyDbError(delError), values: echoValues(formData) };

  const { error: insError } = await supabase.from("location_opening_hours").insert(
    rows.map((r) => ({ location_id: ctx.location.id, weekday: r.weekday, opens_at: r.opens, closes_at: r.closes })),
  );
  if (insError) return { status: "error", message: friendlyDbError(insError), values: echoValues(formData) };

  if (ctx.ownerStaffId) {
    await supabase.from("staff_working_hours").delete().eq("staff_id", ctx.ownerStaffId);
    const { error } = await supabase.from("staff_working_hours").insert(
      rows.map((r) => ({
        staff_id: ctx.ownerStaffId!,
        location_id: ctx.location.id,
        weekday: r.weekday,
        starts_at: r.opens,
        ends_at: r.closes,
      })),
    );
    if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };
  }

  redirect("/dashboard");
}
