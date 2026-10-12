"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { echoValues, fieldErrorsOf, friendlyDbError, type FormState } from "@/lib/form-state";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

async function frontDeskContext() {
  const user = await requireUser("/dashboard/clients");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).seeAllCalendars) redirect("/dashboard/calendar");
  return { supabase, ctx };
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const clientSchema = z.object({
  clientId: z.union([z.literal(""), z.uuid()]),
  first_name: z.string().trim().min(1, "Enter a first name").max(80),
  last_name: optional(80),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+\d\s()-]*$/, "Enter a valid phone number")
    .transform((v) => v || null),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]).transform((v) => v || null),
  allergies: optional(1000),
  notes: optional(4000),
});

export async function saveClient(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await frontDeskContext();
  const { clientId, ...fields } = parsed.data;

  if (clientId) {
    const { error } = await supabase.from("location_clients").update(fields).eq("id", clientId).eq("location_id", ctx.location.id);
    if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };
    revalidatePath("/dashboard/clients");
    return { status: "success", message: "Saved.", values: echoValues(formData) };
  }

  const { data, error } = await supabase
    .from("location_clients")
    .insert({ ...fields, location_id: ctx.location.id })
    .select("id")
    .single();
  if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };
  revalidatePath("/dashboard/clients");
  redirect(`/dashboard/clients/${data.id}`);
}

const blockSchema = z.object({
  clientId: z.uuid(),
  block: z.enum(["true", "false"]),
  reason: z.string().trim().max(500).optional(),
});

// Blocked clients can't book online (book_appointment refuses them); the
// team can still book them by phone.
export async function setClientBlocked(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = blockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { supabase, ctx } = await frontDeskContext();
  const block = parsed.data.block === "true";

  const { error } = await supabase
    .from("location_clients")
    .update({ is_blocked: block, blocked_reason: block ? parsed.data.reason || null : null })
    .eq("id", parsed.data.clientId)
    .eq("location_id", ctx.location.id);
  if (error) return { status: "error", message: friendlyDbError(error) };
  revalidatePath("/dashboard/clients");
  return { status: "success", message: block ? "Client blocked from online booking." : "Client unblocked." };
}
