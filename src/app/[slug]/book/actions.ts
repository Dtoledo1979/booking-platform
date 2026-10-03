"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const bookingSchema = z.object({
  slug: z.string().min(1),
  locationId: z.uuid(),
  serviceId: z.uuid(),
  staffId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  startsAt: z.iso.datetime({ offset: true }),
  accept: z.literal("on", { error: "Please accept the cancellation policy to book." }),
  rescheduleId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});

// RPC exceptions (docs/03) → what the client should do next.
const MESSAGES: Record<string, string> = {
  slot_unavailable: "Sorry — that time was just taken. Please choose another.",
  policy_not_accepted: "Please accept the cancellation policy to book.",
  client_blocked: "This business can't take an online booking from your account. Please contact them directly.",
  location_unavailable: "This business isn't taking online bookings right now.",
  reschedule_window_closed: "It's too close to your appointment to change it online. Please contact the business.",
  appointment_not_reschedulable: "This appointment can no longer be changed online.",
};

export async function confirmBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your booking." };
  }
  const d = parsed.data;

  if (!(await getCurrentUser())) {
    const next = `/${d.slug}/book?service=${d.serviceId}&start=${encodeURIComponent(d.startsAt)}${d.staffId ? `&staff=${d.staffId}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();

  if (d.rescheduleId) {
    const { error } = await supabase.rpc("reschedule_appointment", {
      p_appointment_id: d.rescheduleId,
      p_new_starts_at: d.startsAt,
      p_staff_id: d.staffId ?? undefined,
    });
    if (error) return { status: "error", message: MESSAGES[error.message] ?? "We couldn't change your booking. Please try again." };
    redirect(`/${d.slug}/booked/${d.rescheduleId}?changed=1`);
  }

  const { data, error } = await supabase.rpc("book_appointment", {
    p_location_id: d.locationId,
    p_service_id: d.serviceId,
    p_starts_at: d.startsAt,
    p_staff_id: d.staffId ?? undefined,
    p_accept_policy: true,
  });
  if (error) return { status: "error", message: MESSAGES[error.message] ?? "We couldn't complete your booking. Please try again." };

  const result = data as { appointment_id: string };
  redirect(`/${d.slug}/booked/${result.appointment_id}`);
}
