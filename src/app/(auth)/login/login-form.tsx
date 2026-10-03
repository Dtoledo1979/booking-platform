"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { signIn } from "../actions";

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action] = useActionState(signIn, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const val = (name: string) => state.values?.[name];

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {linkError && state.status === "idle" && (
          <FormMessage status="error" message="That link has expired or was already used. Sign in to continue." />
        )}
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="email" error={err("email")}>
          <Input id="email" name="email" defaultValue={val("email")} type="email" autoComplete="email" required aria-invalid={!!err("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={err("password")}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!err("password")}
          />
        </Field>
        <SubmitButton size="lg" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </Card>
  );
}
