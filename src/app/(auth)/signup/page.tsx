import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eyebrow } from "@/components/ui/card";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

// One sign-up page, two audiences: arriving with ?next= (from a booking
// page) means a client account; otherwise it's a business listing.
export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next, "") || undefined : undefined;
  const isClient = Boolean(next);

  if (await getCurrentUser()) redirect(next ?? "/onboarding");

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 text-center">
        <Eyebrow className="justify-center">{isClient ? "Almost there" : "For businesses"}</Eyebrow>
        <h1 className="font-display text-4xl leading-tight">
          {isClient ? "Create your account" : "List your business"}
        </h1>
        <p className="text-ink-soft">
          {isClient
            ? "One account to book, reschedule and manage your appointments."
            : "Set up takes about five minutes. You only pay once you go live."}
        </p>
      </div>
      <SignUpForm accountType={isClient ? "client" : "business"} next={next} />
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
