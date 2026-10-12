"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { saveMessageSettings } from "./actions";

export function MessageSettingsForm({ email, sms }: { email: boolean; sms: boolean }) {
  const [state, action] = useActionState(saveMessageSettings, idle);
  const options = [
    ["email", email, "Email", "Confirmations, changes, cancellations and reminders to clients; new bookings and cancellations to you."],
    ["sms", sms, "SMS", "Confirmations, reminders before the free-cancellation window closes, and 2 hours before."],
  ] as const;

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4">
        <FormMessage status={state.status} message={state.message} />
        {options.map(([name, checked, label, help]) => (
          <label key={name} className="flex items-start gap-3">
            <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 size-4 accent-[var(--ink)]" />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="block text-sm text-muted">{help}</span>
            </span>
          </label>
        ))}
        <div>
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
