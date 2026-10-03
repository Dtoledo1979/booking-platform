import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  if (await getCurrentUser()) redirect(safeNextPath(next, "/dashboard"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-4xl leading-tight">Welcome back</h1>
        <p className="text-ink-soft">Sign in to continue.</p>
      </div>
      <LoginForm next={next} linkError={params.error === "link"} />
      <p className="text-center text-sm text-muted">
        New here?{" "}
        {next ? (
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-2">
            Create an account
          </Link>
        ) : (
          <Link href="/signup" className="font-medium text-ink underline underline-offset-2">
            List your business
          </Link>
        )}
      </p>
    </div>
  );
}
