import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, getMemberContext, getSetupStep } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS = {
  draft: { label: "Draft — not taking bookings yet", tone: "neutral" },
  active: { label: "Live", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  archived: { label: "Archived", tone: "neutral" },
} as const;

type ChecklistItem = {
  title: string;
  detail: string;
  state: "done" | "todo" | "soon";
  href?: string;
  action?: string;
};

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);

  if (!ctx) {
    // Clients have no business to manage: send them to their bookings.
    const { data } = await supabase.auth.getClaims();
    const accountType = (data?.claims?.user_metadata as { account_type?: string } | undefined)?.account_type;
    redirect(accountType === "client" ? "/my-bookings" : "/onboarding");
  }
  if (!can(ctx.role).manageBusiness) redirect("/dashboard/calendar");
  if ((await getSetupStep(supabase, ctx)) !== "done") redirect("/onboarding");

  const [{ count: services }, { data: profile }, { data: location }] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("location_id", ctx.location.id),
    supabase.from("user_profiles").select("first_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("locations").select("address_line, city").eq("id", ctx.location.id).single(),
  ]);
  const status = STATUS[ctx.location.status];
  const hasAddress = Boolean(location?.address_line && location?.city);

  const checklist: ChecklistItem[] = [
    { state: "done", title: "Business details", detail: ctx.organizationName },
    {
      state: hasAddress ? "done" : "todo",
      title: "Address & contact details",
      detail: hasAddress ? `${location!.address_line}, ${location!.city}` : "Shown on your booking page so clients can find you",
      href: "/dashboard/profile",
      action: hasAddress ? "Edit" : "Add",
    },
    {
      state: "done",
      title: "Services",
      detail: `${services} service${services === 1 ? "" : "s"}`,
      href: "/onboarding?step=services",
      action: "Edit",
    },
    { state: "done", title: "Opening hours", detail: "Set", href: "/onboarding?step=hours", action: "Edit" },
    { state: "soon", title: "Connect payouts", detail: "So cancellation fees go straight to your bank account" },
    { state: "soon", title: "Go live", detail: "Activate your subscription and start taking online bookings" },
  ];

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "overview", ctx.role)} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Eyebrow>Dashboard</Eyebrow>
            <h1 className="font-display text-4xl leading-tight">
              {profile?.first_name ? `Welcome, ${profile.first_name}.` : "Welcome."}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/${ctx.location.slug}`} className={buttonClasses("secondary")}>
              Preview booking page
            </Link>
            <Link href="/dashboard/calendar" className={buttonClasses("primary")}>
              Open calendar
            </Link>
          </div>
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
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={
                      item.state === "done"
                        ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[0.65rem] text-on-ink"
                        : "size-5 shrink-0 rounded-full border border-line-strong"
                    }
                  >
                    {item.state === "done" ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {item.title}
                      <span className="sr-only">{item.state === "done" ? " (done)" : " (to do)"}</span>
                    </span>
                    <span className="block truncate text-sm text-muted">{item.detail}</span>
                  </span>
                </span>
                {item.state === "soon" ? (
                  <Badge>Coming soon</Badge>
                ) : (
                  item.href && (
                    <Link
                      href={item.href}
                      className={buttonClasses(item.state === "todo" ? "primary" : "ghost", "sm")}
                    >
                      {item.action}
                    </Link>
                  )
                )}
              </li>
            ))}
          </ol>
          {ctx.location.status === "draft" && (
            <p className="rounded-control bg-stone px-4 py-3 text-sm text-ink-soft">
              Your booking page is private while it&apos;s a draft — only you can preview it. Payouts and going
              live are the next things we&apos;re building.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}
