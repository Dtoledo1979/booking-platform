"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { echoValues, fieldErrorsOf, friendlyDbError, type FormState } from "@/lib/form-state";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter the location name").max(120),
  description: optional(2000),
  phone: optional(32),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]).transform((v) => v || null),
  address_line: optional(200),
  suburb: optional(120),
  city: optional(120),
  postcode: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "NZ postcodes have 4 digits")
    .transform((v) => v || null),
});

export async function updateLocationProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/dashboard/profile");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) return { status: "error", message: "You don't have permission to do that." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);

  const { error } = await supabase.from("locations").update(parsed.data).eq("id", ctx.location.id);
  if (error) return { status: "error", message: friendlyDbError(error), values: echoValues(formData) };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/${ctx.location.slug}`);
  return { status: "success", message: "Saved.", values: echoValues(formData) };
}
