"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { inviteMember } from "./actions";

const ROLE_HELP = {
  manager: "Everything except billing: calendar, team, services, hours and settings.",
  reception: "Everyone's calendar: book, move and cancel appointments.",
  professional: "Their own calendar and their own time off.",
} as const;

// Invites are shareable links until an email provider is connected.
export function InviteForm({
  canInviteManagers,
  unlinkedStaff,
  presetStaffId,
}: {
  canInviteManagers: boolean;
  unlinkedStaff: { id: string; display_name: string }[];
  presetStaffId?: string;
}) {
  const [state, action] = useActionState(inviteMember, idle);
  const [role, setRole] = useState<keyof typeof ROLE_HELP>("professional");
  const [copied, setCopied] = useState(false);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const link = state.status === "success" ? state.values?.link : undefined;

  if (link) {
    return (
      <Card className="flex flex-col gap-3">
        <h3 className="font-display text-xl">Invite link ready</h3>
        <p className="text-sm text-ink-soft">
          Send this link to <strong>{state.values?.email}</strong> by WhatsApp, text or email. It works once, only for
          that email address, and expires in 14 days.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={link} aria-label="Invite link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-muted">For security we can&apos;t show this link again. You can always create a new one.</p>
      </Card>
    );
  }

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="invite-email" error={err("email")}>
            <Input id="invite-email" name="email" type="email" defaultValue={state.values?.email} required aria-invalid={!!err("email")} />
          </Field>
          <Field label="Role" htmlFor="invite-role" hint={ROLE_HELP[role]}>
            <Select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as keyof typeof ROLE_HELP)}>
              <option value="professional">Professional</option>
              <option value="reception">Reception</option>
              {canInviteManagers && <option value="manager">Manager</option>}
            </Select>
          </Field>
        </div>
        {role === "professional" && (
          <Field label="Their bookable profile" htmlFor="invite-staff" hint="The login is linked to this team member's calendar.">
            <Select id="invite-staff" name="staffId" defaultValue={presetStaffId ?? unlinkedStaff[0]?.id}>
              {unlinkedStaff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {role === "professional" && unlinkedStaff.length === 0 ? (
          <p className="text-sm text-muted">Add the team member first — every professional login belongs to a profile.</p>
        ) : (
          <SubmitButton pendingLabel="Creating link…">Create invite link</SubmitButton>
        )}
      </form>
    </Card>
  );
}
