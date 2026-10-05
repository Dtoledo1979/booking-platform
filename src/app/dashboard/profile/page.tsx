import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Location profile" };

export default async function LocationProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) redirect("/dashboard/calendar");

  const { data: profile } = await supabase
    .from("locations")
    .select("name, description, phone, email, address_line, suburb, city, postcode")
    .eq("id", ctx.location.id)
    .single();
  if (!profile) redirect("/dashboard");

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "profile", ctx.role)} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Location profile</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">How clients see you</h1>
          <p className="text-ink-soft">These details appear on your booking page and in confirmation emails.</p>
        </div>
        <ProfileForm profile={profile} />
      </main>
    </>
  );
}
