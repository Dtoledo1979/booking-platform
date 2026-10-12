"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { saveClient, setClientBlocked } from "./actions";

export type ClientFields = {
  id: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  allergies: string | null;
  notes: string | null;
};

export function ClientForm({ client, hasAccount }: { client: ClientFields; hasAccount: boolean }) {
  const [state, action] = useActionState(saveClient, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const val = (name: keyof ClientFields) => state.values?.[name] ?? client[name] ?? "";

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="clientId" value={client.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="first_name" error={err("first_name")}>
            <Input id="first_name" name="first_name" defaultValue={val("first_name")} required aria-invalid={!!err("first_name")} />
          </Field>
          <Field label="Last name" htmlFor="last_name">
            <Input id="last_name" name="last_name" defaultValue={val("last_name")} />
          </Field>
          <Field label="Mobile" htmlFor="phone" hint="Used for SMS reminders." error={err("phone")}>
            <Input id="phone" name="phone" type="tel" defaultValue={val("phone")} aria-invalid={!!err("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" error={err("email")}>
            <Input id="email" name="email" type="email" defaultValue={val("email")} aria-invalid={!!err("email")} />
          </Field>
        </div>
        {hasAccount && (
          <p className="text-xs text-muted">
            This client books with their own account. Changes here only affect your records and reminders.
          </p>
        )}
        <Field label="Allergies & sensitivities" htmlFor="allergies" hint="Visible to the whole team before every appointment.">
          <Textarea id="allergies" name="allergies" rows={2} defaultValue={val("allergies")} />
        </Field>
        <Field label="Notes" htmlFor="notes" hint="Preferences, formulas, anything useful. Only your team sees this.">
          <Textarea id="notes" name="notes" rows={4} defaultValue={val("notes")} />
        </Field>
        <div>
          <SubmitButton pendingLabel="Saving…">{client.id ? "Save client" : "Add client"}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}

export function BlockForm({ clientId, blocked, reason }: { clientId: string; blocked: boolean; reason: string | null }) {
  const [state, action] = useActionState(setClientBlocked, idle);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{blocked ? "Blocked from online booking" : "Online booking"}</h2>
      <form action={action} className="flex flex-col gap-3">
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="block" value={blocked ? "false" : "true"} />
        {blocked ? (
          <p className="text-sm text-ink-soft">
            {reason ? `Reason: ${reason}. ` : ""}They can&apos;t book online; your team can still book them.
          </p>
        ) : (
          <Field label="Reason (internal)" htmlFor="block-reason" hint="E.g. repeated no-shows. The client isn't told the reason.">
            <Input id="block-reason" name="reason" />
          </Field>
        )}
        <div>
          <SubmitButton variant={blocked ? "secondary" : "danger"} size="sm" pendingLabel="Saving…">
            {blocked ? "Unblock" : "Block online booking"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
