"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { echoValues, fieldErrorsOf, type FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().min(1, "Enter your last name").max(80),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters").max(72),
  terms: z.literal("on", { error: "You need to accept the terms to continue" }),
});

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorsOf(parsed.error, formData);
  const { firstName, lastName, email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Picked up by the handle_new_user trigger to create the profile.
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding`,
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
  if (data.session) redirect("/onboarding");

  // Same answer whether or not the email already had an account, so the
  // form can't be used to discover who is registered.
  return {
    status: "success",
    message: `We've sent a confirmation link to ${email}. Open it to continue setting up your business.`,
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
