import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Team invite", robots: { index: false } };

const ROLE = {
  owner: "owner",
  manager: "a manager",
  reception: "reception",
  professional: "a team member",
} as const;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: invites }, user] = await Promise.all([supabase.rpc("get_invite", { p_token: token }), getCurrentUser()]);
  const invite = invites?.[0];
  const next = `/invite/${token}`;

  let body: React.ReactNode;
  if (!invite) {
    body = (
      <Card className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">This link isn&apos;t valid</h1>
        <p className="text-ink-soft">It may have been used already or replaced by a newer invite. Ask for a new link.</p>
      </Card>
    );
  } else if (invite.expired) {
    body = (
      <Card className="flex flex-col gap-2">
        <h1 className="font-display text-3xl">This invite has expired</h1>
        <p className="text-ink-soft">Invite links last 14 days. Ask {invite.organization_name} for a new one.</p>
      </Card>
    );
  } else {
    const intro = (
      <div className="flex flex-col gap-3 text-center">
        <Eyebrow className="justify-center">You&apos;re invited</Eyebrow>
        <h1 className="font-display text-4xl leading-tight">Join {invite.location_name}</h1>
        <p className="text-ink-soft">
          {invite.organization_name} has invited <strong>{invite.invited_email}</strong> to join as {ROLE[invite.role]}.
        </p>
      </div>
    );

    if (!user) {
      body = (
        <>
          {intro}
          <Card className="flex flex-col gap-3">
            <Link
              href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.invited_email ?? "")}`}
              className={buttonClasses("primary", "lg")}
            >
              Create my account
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClasses("secondary", "lg")}>
              I already have an account
            </Link>
            <p className="text-center text-sm text-muted">Use {invite.invited_email} — the invite only works for that address.</p>
          </Card>
        </>
      );
    } else if (user.email?.toLowerCase() !== invite.invited_email?.toLowerCase()) {
      body = (
        <>
          {intro}
          <Card className="flex flex-col gap-3">
            <p className="text-ink-soft">
              You&apos;re signed in as <strong>{user.email}</strong>, but this invite is for{" "}
              <strong>{invite.invited_email}</strong>.
            </p>
            <form action={signOut}>
              <button type="submit" className={buttonClasses("secondary", "lg", "w-full")}>
                Sign out and use the right account
              </button>
            </form>
          </Card>
        </>
      );
    } else {
      body = (
        <>
          {intro}
          <Card>
            <AcceptForm token={token} label={`Join ${invite.location_name}`} />
          </Card>
        </>
      );
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <main className="flex w-full max-w-md flex-col gap-6">{body}</main>
    </div>
  );
}
