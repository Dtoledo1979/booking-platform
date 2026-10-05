"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { signUp } from "../actions";

export function SignUpForm({
  accountType = "business",
  next,
  defaultEmail,
}: {
  accountType?: "business" | "client" | "staff";
  next?: string;
  defaultEmail?: string;
}) {
  const [state, action] = useActionState(signUp, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const val = (name: string) => state.values?.[name];

  if (state.status === "success") {
    return (
      <Card className="flex flex-col gap-3 text-center">
        <h2 className="font-display text-3xl">Check your inbox</h2>
        <p className="text-ink-soft">{state.message}</p>
        <p className="text-sm text-muted">Didn&apos;t get it? Check spam, or wait a minute and try again.</p>
      </Card>
    );
  }

  return (
    <Card>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="accountType" value={accountType} />
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={err("firstName")}>
            <Input id="firstName" name="firstName" defaultValue={val("firstName")} autoComplete="given-name" required aria-invalid={!!err("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={err("lastName")}>
            <Input id="lastName" name="lastName" defaultValue={val("lastName")} autoComplete="family-name" required aria-invalid={!!err("lastName")} />
          </Field>
        </div>
        {accountType === "client" && (
          <Field label="Mobile" htmlFor="phone" hint="For appointment reminders only" error={err("phone")}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={val("phone")}
              autoComplete="tel"
              placeholder="021 123 4567"
              required
              aria-invalid={!!err("phone")}
            />
          </Field>
        )}
        <Field label={accountType === "business" ? "Work email" : "Email"} htmlFor="email" error={err("email")}>
          <Input id="email" name="email" defaultValue={val("email") ?? defaultEmail} type="email" autoComplete="email" required aria-invalid={!!err("email")} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={err("password")}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={!!err("password")}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input name="terms" type="checkbox" required defaultChecked={val("terms") === "on"} className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>
            I agree to the <Link href="/terms" className="underline underline-offset-2">terms</Link> and{" "}
            <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
          </span>
        </label>
        {err("terms") && <p className="-mt-2 text-sm text-danger">{err("terms")}</p>}
        <SubmitButton size="lg" pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </form>
    </Card>
  );
}
