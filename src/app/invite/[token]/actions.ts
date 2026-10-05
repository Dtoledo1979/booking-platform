"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  invite_not_found: "This invite link isn't valid any more. Ask for a new one.",
  invite_expired: "This invite link has expired. Ask for a new one.",
  invite_email_mismatch: "This invite is for a different email address.",
};

export async function acceptInvite(token: string): Promise<FormState> {
  await requireUser(`/invite/${token}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) return { status: "error", message: MESSAGES[error.message] ?? "We couldn't accept the invite. Please try again." };
  redirect("/dashboard");
}
