import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const user = await requireUser("/dashboard/clients/new");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).seeAllCalendars) redirect("/dashboard/calendar");

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "clients", ctx.role)} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Link href="/dashboard/clients" className="text-sm text-muted hover:text-ink">
            ← Clients
          </Link>
          <Eyebrow>Clients</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">Add a client</h1>
        </div>
        <ClientForm
          hasAccount={false}
          client={{ id: null, first_name: "", last_name: null, phone: null, email: null, allergies: null, notes: null }}
        />
      </main>
    </>
  );
}
