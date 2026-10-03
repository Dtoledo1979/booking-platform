"use client";

import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/form-state";
import { SLUG_PATTERN, slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/client";
import { TIMEZONES } from "@/lib/timezones";
import { createBusiness } from "./actions";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export function BusinessStep({ host }: { host: string }) {
  const [state, action] = useActionState(createBusiness, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const val = (name: string) => state.values?.[name];

  const [name, setName] = useState(val("businessName") ?? "");
  const [slug, setSlug] = useState(val("slug") ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(val("slug")));
  // Last server answer, tagged with the slug it was for.
  const [checked, setChecked] = useState<{ slug: string; available: boolean | null } | null>(null);
  const wellFormed = slug.length >= 3 && SLUG_PATTERN.test(slug);

  const availability: Availability = !slug
    ? "idle"
    : !wellFormed
      ? "invalid"
      : checked?.slug !== slug
        ? "checking"
        : checked.available === null
          ? "idle"
          : checked.available
            ? "available"
            : "taken";

  // Check the link as the owner types (debounced). The server re-validates
  // on submit; this is only feedback.
  useEffect(() => {
    if (!wellFormed) return;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc("is_slug_available", { p_slug: slug });
      setChecked({ slug, available: error ? null : data });
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, wellFormed]);

  const slugHint = {
    idle: "Clients book at this address. You can't change it later without breaking shared links.",
    checking: "Checking…",
    available: "Available",
    taken: "Not available — try another.",
    invalid: "Use at least 3 lowercase letters, numbers and single dashes.",
  }[availability];

  return (
    <Card>
      <form action={action} className="flex flex-col gap-5" noValidate>
        <FormMessage status={state.status} message={state.message} />

        <Field label="Business name" htmlFor="businessName" error={err("businessName")}>
          <Input
            id="businessName"
            name="businessName"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            placeholder="e.g. Ponsonby Studio"
            autoComplete="organization"
            required
            aria-invalid={!!err("businessName")}
          />
        </Field>

        <Field
          label="Location name"
          htmlFor="locationName"
          hint="Optional. Useful if you have — or plan to open — more than one branch."
          error={err("locationName")}
        >
          <Input id="locationName" name="locationName" defaultValue={val("locationName")} placeholder="e.g. Ponsonby" />
        </Field>

        <Field
          label="Booking link"
          htmlFor="slug"
          error={err("slug")}
          hint={
            <span
              className={cn(
                availability === "available" && "text-success",
                (availability === "taken" || availability === "invalid") && "text-danger",
              )}
            >
              {slugHint}
            </span>
          }
        >
          <div className="flex items-stretch overflow-hidden rounded-control border border-line-strong bg-surface focus-within:border-brass">
            <span className="flex items-center border-r border-line bg-stone px-3 text-sm text-muted">{host}/</span>
            <input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value) || e.target.value.toLowerCase());
              }}
              className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-[0.9375rem] focus:outline-none"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={!!err("slug") || availability === "taken" || availability === "invalid"}
            />
          </div>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Do you work on clients yourself?</legend>
          {[
            ["yes", "Yes — I take bookings", "You'll appear as bookable staff. Perfect for solo stylists and barbers."],
            ["no", "No — I manage a team", "You'll add your stylists, barbers or technicians next."],
          ].map(([value, title, body]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-control border border-line-strong bg-surface p-3.5 has-[:checked]:border-ink has-[:checked]:bg-stone"
            >
              <input
                type="radio"
                name="worksOnClients"
                value={value}
                defaultChecked={(val("worksOnClients") ?? "yes") === value}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted">{body}</span>
              </span>
            </label>
          ))}
          {err("worksOnClients") && <p className="text-sm text-danger">{err("worksOnClients")}</p>}
        </fieldset>

        <Field label="Time zone" htmlFor="timezone" error={err("timezone")}>
          <Select id="timezone" name="timezone" defaultValue={val("timezone") ?? TIMEZONES[0].value}>
            {TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        <SubmitButton size="lg" pendingLabel="Creating your business…" disabled={availability === "taken"}>
          Continue
        </SubmitButton>
      </form>
    </Card>
  );
}
