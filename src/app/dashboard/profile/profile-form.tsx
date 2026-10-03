"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { updateLocationProfile } from "./actions";

type Profile = {
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  suburb: string | null;
  city: string | null;
  postcode: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateLocationProfile, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  // After a save (or a failed one) show what was submitted; otherwise the stored values.
  const val = (name: keyof Profile) => state.values?.[name] ?? profile[name] ?? "";

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormMessage status={state.status} message={state.message} />

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">About</h2>
        <Field label="Location name" htmlFor="name" hint="As clients know it, e.g. “Ponsonby Studio”." error={err("name")}>
          <Input id="name" name="name" defaultValue={val("name")} required aria-invalid={!!err("name")} />
        </Field>
        <Field label="Description" htmlFor="description" hint="A sentence or two about your space and style." error={err("description")}>
          <Textarea id="description" name="description" defaultValue={val("description")} rows={3} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">Address</h2>
        <Field label="Street address" htmlFor="address_line" error={err("address_line")}>
          <Input id="address_line" name="address_line" defaultValue={val("address_line")} autoComplete="address-line1" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Suburb" htmlFor="suburb" error={err("suburb")}>
            <Input id="suburb" name="suburb" defaultValue={val("suburb")} />
          </Field>
          <Field label="City" htmlFor="city" error={err("city")}>
            <Input id="city" name="city" defaultValue={val("city")} autoComplete="address-level2" />
          </Field>
          <Field label="Postcode" htmlFor="postcode" error={err("postcode")}>
            <Input
              id="postcode"
              name="postcode"
              defaultValue={val("postcode")}
              inputMode="numeric"
              autoComplete="postal-code"
              aria-invalid={!!err("postcode")}
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone" error={err("phone")}>
            <Input id="phone" name="phone" type="tel" defaultValue={val("phone")} autoComplete="tel" />
          </Field>
          <Field label="Email" htmlFor="email" error={err("email")}>
            <Input id="email" name="email" type="email" defaultValue={val("email")} aria-invalid={!!err("email")} />
          </Field>
        </div>
      </Card>

      <div>
        <SubmitButton size="lg">Save changes</SubmitButton>
      </div>
    </form>
  );
}
