import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getOwnerContext, getSetupStep, type SetupStep } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { BusinessStep } from "./business-step";
import { HoursStep } from "./hours-step";
import { ServicesStep } from "./services-step";

export const metadata: Metadata = { title: "Set up your business" };

const STEPS = [
  { id: "business", title: "Your business", intro: "Tell us who you are and where clients will book you." },
  { id: "services", title: "Services", intro: "Add what clients can book. You can refine these any time." },
  { id: "hours", title: "Opening hours", intro: "When are you open? Clients only see times inside these hours." },
] as const;

const ORDER: SetupStep[] = ["business", "services", "hours", "done"];

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding");
  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, user.id);
  const progress = await getSetupStep(supabase, ctx);

  // ?step= lets the owner revisit a completed step, never skip ahead.
  const requested = (await searchParams).step;
  let step: SetupStep = progress;
  if (typeof requested === "string" && ORDER.includes(requested as SetupStep)) {
    const wanted = requested as SetupStep;
    if (wanted !== "business" && ORDER.indexOf(wanted) <= ORDER.indexOf(progress)) step = wanted;
  }
  if (step === "done") redirect("/dashboard");

  // Once setup is complete, these screens are just editors for the dashboard.
  const editing = progress === "done";
  const current = STEPS.findIndex((s) => s.id === step);
  const meta = STEPS[current];

  let body: React.ReactNode = null;
  if (step === "business") {
    body = <BusinessStep host={(await headers()).get("host") ?? "your-site"} />;
  } else if (step === "services" && ctx) {
    const { data } = await supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents")
      .eq("location_id", ctx.location.id)
      .order("created_at");
    body = <ServicesStep services={data ?? []} editing={editing} />;
  } else if (step === "hours" && ctx) {
    const { data } = await supabase
      .from("location_opening_hours")
      .select("weekday, opens_at, closes_at")
      .eq("location_id", ctx.location.id);
    body = <HoursStep hours={data ?? []} ownerWorks={!!ctx.ownerStaffId} editing={editing} />;
  }

  return (
    <>
      <AppHeader
        subtitle={ctx?.location.name}
        nav={editing && ctx ? businessNav(ctx.location.slug, step === "services" ? "services" : "hours") : []}
      />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        {!editing && (
        <ol className="flex gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex flex-1 flex-col gap-2">
              <span className={cn("h-1 rounded-full", i <= current ? "bg-ink" : "bg-line")} />
              <span
                className={cn("text-xs", i === current ? "font-medium text-ink" : "text-muted")}
                aria-current={i === current ? "step" : undefined}
              >
                {s.title}
              </span>
            </li>
          ))}
        </ol>
        )}
        <div className="flex flex-col gap-3">
          <Eyebrow>{editing ? "Settings" : `Step ${current + 1} of ${STEPS.length}`}</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">{meta.title}</h1>
          <p className="text-ink-soft">{meta.intro}</p>
        </div>
        {body}
      </main>
    </>
  );
}
