"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requestFeeCollection } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";

const id = z.uuid();

export type CancelQuote = { feeCents: number; currency: string } | { error: string };

// Asks the database what cancelling right now would cost, so the client
// sees the exact fee before confirming (docs/03).
export async function getCancelQuote(appointmentId: string): Promise<CancelQuote> {
  await requireUser("/my-bookings");
  if (!id.safeParse(appointmentId).success) return { error: "Booking not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cancellation_quote", { p_appointment_id: appointmentId });
  if (error || !data) return { error: "We couldn't check the cancellation fee. Please try again." };
  const quote = data as { fee_cents: number; currency: string };
  return { feeCents: quote.fee_cents, currency: quote.currency };
}

export async function cancelMyAppointment(appointmentId: string): Promise<{ error?: string }> {
  await requireUser("/my-bookings");
  if (!id.safeParse(appointmentId).success) return { error: "Booking not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_appointment", { p_appointment_id: appointmentId });
  if (error) {
    return {
      error:
        error.message === "appointment_started"
          ? "This appointment has already started. Please contact the business."
          : "We couldn't cancel this booking. Please try again.",
    };
  }
  // A late cancellation creates a pending fee; collect it (docs/06 §6).
  await requestFeeCollection((data as { fee_id?: string | null } | null)?.fee_id);
  revalidatePath("/my-bookings");
  return {};
}
