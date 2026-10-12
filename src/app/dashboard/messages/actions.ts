"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { friendlyDbError, type FormState } from "@/lib/form-state";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

export async function saveMessageSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/dashboard/messages");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) return { status: "error", message: "You don't have permission to do that." };

  const { error } = await supabase
    .from("locations")
    .update({
      email_notifications: formData.get("email") === "on",
      sms_notifications: formData.get("sms") === "on",
    })
    .eq("id", ctx.location.id);
  if (error) return { status: "error", message: friendlyDbError(error) };
  revalidatePath("/dashboard/messages");
  return { status: "success", message: "Saved. Changes apply to new bookings and changes from now on." };
}
