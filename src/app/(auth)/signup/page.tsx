import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eyebrow } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "List your business" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/onboarding");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-center">
        <Eyebrow className="justify-center">For businesses</Eyebrow>
        <h1 className="font-display text-4xl leading-tight">List your business</h1>
        <p className="text-ink-soft">Set up takes about five minutes. You only pay once you go live.</p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
