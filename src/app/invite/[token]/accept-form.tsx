"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { acceptInvite } from "./actions";

export function AcceptForm({ token, label }: { token: string; label: string }) {
  const [state, action] = useActionState(acceptInvite.bind(null, token), idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton size="lg" pendingLabel="Joining…">
        {label}
      </SubmitButton>
    </form>
  );
}
