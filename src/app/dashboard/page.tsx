import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getOwnerContext, getSetupStep } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS = {
  draft: { label: "Draft — not taking bookings", tone: "neutral" },
  active: { label: "Live", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
} as const;

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, user.id);
  if ((await getSetupStep(supabase, ctx)) !== "done" || !ctx) redirect("/onboarding");

  const [{ count: services }, { data: profile }] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("location_id", ctx.location.id),
    supabase.from("user_profiles").select("first_name").eq("user_id", user.id).maybeSingle(),
  ]);
  const status = STATUS[ctx.location.status];

  const checklist = [
    { done: true, title: "Business details", detail: ctx.organizationName, href: null },
    {
      done: true,
      title: "Services",
      detail: `${services} service${services === 1 ? "" : "s"}`,
      href: "/onboarding?step=services",
    },
    { done: true, title: "Opening hours", detail: "Set", href: "/onboarding?step=hours" },
    { done: false, title: "Connect payouts", detail: "So cancellation fees reach your bank — coming next", href: null },
    { done: false, title: "Go live", detail: "Activate your subscription to start taking bookings", href: null },
  ];

  return (
    <>
      <AppHeader subtitle={ctx.location.name} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">
            {profile?.first_name ? `Welcome, ${profile.first_name}.` : "Welcome."}
          </h1>
        </div>

        <Card className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">{ctx.location.name}</h2>
              <p className="font-mono text-sm text-muted">/{ctx.location.slug}</p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>

          <ol className="flex flex-col divide-y divide-line border-t border-line">
            {checklist.map((item) => (
              <li key={item.title} className="flex items-center justify-between gap-4 py-3.5">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={
                      item.done
                        ? "flex size-5 items-center justify-center rounded-full bg-ink text-[0.65rem] text-on-ink"
                        : "size-5 rounded-full border border-line-strong"
                    }
                  >
                    {item.done ? "✓" : ""}
                  </span>
                  <span>
                    <span className="block font-medium">
                      {item.title}
                      <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                    </span>
                    <span className="block text-sm text-muted">{item.detail}</span>
                  </span>
                </span>
                {item.href && (
                  <Link href={item.href} className={buttonClasses("ghost", "sm")}>
                    Edit
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </main>
    </>
  );
}
