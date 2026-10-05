"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { echoValues, fieldErrorsOf, friendlyDbError, type FormState } from "@/lib/form-state";
import { getOwnerContext } from "@/lib/owner-context";
import { requestFeeCollection, requestFeeRefund } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { DATE_KEY, zonedTimeToUtc } from "@/lib/time";

const uuid = z.uuid();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// RPC exceptions → what the business should do next.
const MESSAGES: Record<string, string> = {
  appointment_not_found: "This appointment no longer exists.",
  appointment_not_started: "You can mark it completed once the appointment has started.",
  too_early_for_no_show: "A no-show can only be recorded after the start time plus the grace period.",
  appointment_not_confirmed: "Only confirmed appointments can be marked as a no-show.",
  appointment_not_cancellable: "This appointment can't be cancelled any more.",
  reason_required: "Tell the client why — the reason is sent to them.",
  slot_unavailable: "That time overlaps another appointment for this professional.",
  staff_unavailable: "That professional isn't available.",
  service_unavailable: "That service isn't available.",
  client_not_found: "Choose a client first.",
  fee_not_found: "This fee no longer exists.",
  fee_already_resolved: "This fee has already been resolved.",
  multi_service_reschedule_unsupported: "Multi-service visits can't be moved yet.",
};

function message(error: { message?: string; code?: string }) {
  return MESSAGES[error.message ?? ""] ?? friendlyDbError(error);
}

async function context() {
  const user = await requireUser("/dashboard/calendar");
  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  return { supabase, ctx };
}

function done() {
  revalidatePath("/dashboard/calendar");
}

// ---------- Status changes ----------

export async function markCompleted(appointmentId: string): Promise<{ error?: string }> {
  if (!uuid.safeParse(appointmentId).success) return { error: MESSAGES.appointment_not_found };
  const { supabase } = await context();
  const { error } = await supabase.rpc("mark_appointment_completed", { p_appointment_id: appointmentId });
  if (error) return { error: message(error) };

  // Reverting a mistaken no-show may need a refund of a fee already charged.
  const { data: refund } = await supabase
    .from("booking_fees")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("kind", "no_show")
    .not("refund_requested_at", "is", null)
    .maybeSingle();
  await requestFeeRefund(refund?.id);

  done();
  return {};
}

export async function markNoShow(appointmentId: string, chargeFee: boolean): Promise<{ error?: string }> {
  if (!uuid.safeParse(appointmentId).success) return { error: MESSAGES.appointment_not_found };
  const { supabase } = await context();
  const { data, error } = await supabase.rpc("mark_no_show", { p_appointment_id: appointmentId, p_charge_fee: chargeFee });
  if (error) return { error: message(error) };
  await requestFeeCollection((data as { fee_id?: string | null } | null)?.fee_id);
  done();
  return {};
}

export async function waiveFee(feeId: string): Promise<{ error?: string }> {
  if (!uuid.safeParse(feeId).success) return { error: MESSAGES.fee_not_found };
  const { supabase } = await context();
  const { data, error } = await supabase.rpc("waive_fee", { p_fee_id: feeId });
  if (error) return { error: message(error) };
  if (data === "refund_requested") await requestFeeRefund(feeId);
  done();
  return {};
}

const cancelSchema = z.object({
  appointmentId: uuid,
  reason: z.string().trim().min(3, "Tell the client why — the reason is sent to them.").max(500),
});

export async function cancelByBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase } = await context();
  const { error } = await supabase.rpc("cancel_appointment", {
    p_appointment_id: parsed.data.appointmentId,
    p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: message(error), values: echoValues(formData) };
  done();
  return { status: "success", message: "Appointment cancelled. The client won't be charged." };
}

// ---------- Moving ----------

const moveSchema = z.object({
  appointmentId: uuid,
  staffId: uuid,
  date: z.string().regex(DATE_KEY, "Choose a date"),
  time: z.string().regex(TIME, "Choose a time"),
});

export async function moveAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await context();
  const d = parsed.data;
  const { error } = await supabase.rpc("reschedule_appointment", {
    p_appointment_id: d.appointmentId,
    p_new_starts_at: zonedTimeToUtc(d.date, d.time, ctx.location.timezone).toISOString(),
    p_staff_id: d.staffId,
  });
  if (error) return { status: "error", message: message(error), values: echoValues(formData) };
  done();
  return { status: "success", message: "Appointment moved." };
}

// ---------- Internal notes ----------

const noteSchema = z.object({ appointmentId: uuid, body: z.string().trim().max(4000) });

export async function saveNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await context();
  const { appointmentId, body } = parsed.data;

  if (!body) {
    await supabase.from("appointment_notes").delete().eq("appointment_id", appointmentId);
  } else {
    // Update first; insert if there was no note yet. (An upsert would try
    // to write appointment_id/location_id, which staff can't update.)
    const { data: updated, error } = await supabase
      .from("appointment_notes")
      .update({ body })
      .eq("appointment_id", appointmentId)
      .select("appointment_id");
    if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };
    if (!updated?.length) {
      const { error: insertError } = await supabase
        .from("appointment_notes")
        .insert({ appointment_id: appointmentId, location_id: ctx.location.id, body });
      if (insertError) return { status: "error", message: friendlyDbError(insertError), values: echoValues(formData) };
    }
  }
  done();
  return { status: "success", message: "Note saved.", values: echoValues(formData) };
}

// ---------- New appointment (phone / walk-in) ----------

const newSchema = z
  .object({
    clientId: z.union([z.literal(""), uuid]),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(32).optional(),
    email: z.union([z.literal(""), z.email("Enter a valid email address")]).optional(),
    serviceId: uuid,
    staffId: uuid,
    date: z.string().regex(DATE_KEY, "Choose a date"),
    time: z.string().regex(TIME, "Choose a time"),
    notes: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.clientId || v.firstName, { path: ["firstName"], message: "Choose a client or enter a name" });

export async function createAppointment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await context();
  const d = parsed.data;

  let clientId = d.clientId;
  if (!clientId) {
    const { data: created, error } = await supabase
      .from("location_clients")
      .insert({
        location_id: ctx.location.id,
        first_name: d.firstName!,
        last_name: d.lastName || null,
        phone: d.phone || null,
        email: d.email || null,
      })
      .select("id")
      .single();
    if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };
    clientId = created.id;
  }

  const { data: appointmentId, error } = await supabase.rpc("create_staff_appointment", {
    p_location_id: ctx.location.id,
    p_location_client_id: clientId,
    p_service_id: d.serviceId,
    p_staff_id: d.staffId,
    p_starts_at: zonedTimeToUtc(d.date, d.time, ctx.location.timezone).toISOString(),
    p_notes: d.notes || undefined,
  });
  if (error) return { status: "error", message: message(error), values: echoValues(formData) };

  done();
  redirect(`/dashboard/calendar?date=${d.date}&appt=${appointmentId}`);
}

// ---------- Time off ----------

const blockSchema = z
  .object({
    staffId: z.union([z.literal(""), uuid]),
    date: z.string().regex(DATE_KEY, "Choose a date"),
    start: z.string().regex(TIME, "Choose a start time"),
    end: z.string().regex(TIME, "Choose an end time"),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.end > v.start, { path: ["end"], message: "End must be after start" });

export async function createTimeOff(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = blockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await context();
  const d = parsed.data;
  const tz = ctx.location.timezone;

  const { error } = await supabase.from("time_off").insert({
    location_id: ctx.location.id,
    staff_id: d.staffId || null,
    starts_at: zonedTimeToUtc(d.date, d.start, tz).toISOString(),
    ends_at: zonedTimeToUtc(d.date, d.end, tz).toISOString(),
    reason: d.reason || null,
  });
  if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };

  done();
  redirect(`/dashboard/calendar?date=${d.date}`);
}

export async function deleteTimeOff(timeOffId: string): Promise<{ error?: string }> {
  if (!uuid.safeParse(timeOffId).success) return { error: "Block not found." };
  const { supabase, ctx } = await context();
  const { error } = await supabase.from("time_off").delete().eq("id", timeOffId).eq("location_id", ctx.location.id);
  if (error) return { error: friendlyDbError(error) };
  done();
  return {};
}
