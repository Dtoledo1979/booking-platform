import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  const user = await requireUser("/dashboard/clients");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).seeAllCalendars) redirect("/dashboard/calendar");

  const q = (await searchParams).q;
  const search = typeof q === "string" ? q.slice(0, 100) : "";
  const [{ data: clients }, { data: location }] = await Promise.all([
    supabase.rpc("location_client_summaries", { p_location_id: ctx.location.id, p_search: search || undefined }),
    supabase.from("locations").select("currency").eq("id", ctx.location.id).single(),
  ]);
  const tz = ctx.location.timezone;
  const currency = location?.currency ?? "NZD";

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "clients", ctx.role)} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Eyebrow>Clients</Eyebrow>
            <h1 className="font-display text-4xl leading-tight">Your clients</h1>
          </div>
          <Link href="/dashboard/clients/new" className={buttonClasses("primary")}>
            Add client
          </Link>
        </div>

        <form role="search" className="flex gap-2">
          <Input name="q" defaultValue={search} placeholder="Search by name, mobile or email" aria-label="Search clients" />
          <button type="submit" className={buttonClasses("secondary")}>
            Search
          </button>
        </form>

        {clients?.length ? (
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-stone">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span>
                        {c.is_blocked && <Badge tone="danger">Blocked</Badge>}
                        {c.no_shows > 0 && (
                          <Badge tone="warning">
                            {c.no_shows} no-show{c.no_shows === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {c.fees_due_cents > 0 && <Badge tone="warning">{formatMoney(c.fees_due_cents, currency)} due</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted">{[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}</span>
                    </span>
                    <span className="text-right text-sm">
                      {c.next_visit ? (
                        <span className="block">Next: {formatDate(c.next_visit, tz, "short")}</span>
                      ) : c.last_visit ? (
                        <span className="block text-muted">Last: {formatDate(c.last_visit, tz, "short")}</span>
                      ) : null}
                      <span className="block text-muted">
                        {c.visits} visit{c.visits === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-muted">{search ? `No clients match “${search}”.` : "No clients yet. They appear here when they book."}</p>
        )}
      </main>
    </>
  );
}
