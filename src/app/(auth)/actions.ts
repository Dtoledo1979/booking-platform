"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { echoValues, fieldErrorsOf, type FormState } from "@/lib/form-state";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().min(1, "Enter your last name").max(80),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters").max(72),
  terms: z.literal("on", { error: "You need to accept the terms to continue" }),
  accountType: z.enum(["business", "client", "staff"]).default("business"),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[+\d\s()-]*$/, "Enter a valid phone number")
    .optional(),
  next: z.string().optional(),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { firstName, lastName, email, password, accountType, phone } = parsed.data;
  if (accountType === "client" && !phone) {
    return { status: "error", fieldErrors: { phone: ["We need your mobile for appointment reminders"] }, values: echoValues(formData) };
  }
  // Business owners continue to setup; clients go back to what they were booking.
  const destination = safeNextPath(
    parsed.data.next,
    accountType === "client" ? "/my-bookings" : accountType === "staff" ? "/dashboard" : "/onboarding",
  );

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Picked up by the handle_new_user trigger to create the profile.
      data: { first_name: firstName, last_name: lastName, phone: phone || null, account_type: accountType },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(destination)}`,
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: ["Choose a stronger password"] }, values: echoValues(formData) };
    }
    if (error.code === "over_email_send_rate_limit") {
      return {
        status: "error",
        message: "Too many sign-ups right now. Please try again in a few minutes.",
        values: echoValues(formData),
      };
    }
    return { status: "error", message: "We couldn't create your account. Please try again.", values: echoValues(formData) };
  }

  // Email confirmation off (e.g. local dev): straight into onboarding.
  if (data.session) redirect(destination);

  // Same answer whether or not the email already had an account, so the
  // form can't be used to discover who is registered.
  return {
    status: "success",
    message:
      accountType === "client"
        ? `We've sent a confirmation link to ${email}. Open it to finish your booking.`
        : accountType === "staff"
          ? `We've sent a confirmation link to ${email}. Open it to join your team.`
        : `We've sent a confirmation link to ${email}. Open it to continue setting up your business.`,
  };
}

const signInSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "Please confirm your email first — check your inbox for the link.",
        values: echoValues(formData),
      };
    }
    return { status: "error", message: "That email and password don't match.", values: echoValues(formData) };
  }

  redirect(safeNextPath(parsed.data.next, "/dashboard"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
