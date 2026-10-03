import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { BookingPreview } from "@/components/marketing/booking-preview";
import { Button } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

export const metadata: Metadata = { title: "Style guide", robots: { index: false } };

// Living reference for the provisional identity. Development only.
const swatches = [
  ["paper", "Page background"],
  ["surface", "Cards, inputs"],
  ["stone", "Subtle fills"],
  ["line", "Dividers"],
  ["line-strong", "Form borders"],
  ["muted", "Secondary text"],
  ["ink-soft", "Body text"],
  ["ink", "Text, primary"],
  ["brass", "Accent"],
  ["brass-ink", "Accent text"],
  ["success", "Success"],
  ["danger", "Danger"],
] as const;

export default function StyleGuide() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-4">
        <Logo />
        <Eyebrow>Provisional identity · Ink, Stone & Brass</Eyebrow>
        <p className="max-w-2xl text-ink-soft">
          Unisex and high-end: warm stone neutrals and near-black ink that sit as naturally in a
          barbershop as in a beauty salon, with brass as the single accent.
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <h2 className="font-display text-3xl">Color</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map(([token, label]) => (
            <div key={token} className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="h-16" style={{ background: `var(--${token})` }} />
              <div className="px-3 py-2">
                <p className="font-mono text-xs">{token}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="font-display text-3xl">Type</h2>
        <div className="flex flex-col gap-4">
          <p className="font-display text-6xl leading-none">
            Display <em className="text-brass-ink">Instrument Serif</em>
          </p>
          <p className="font-display text-4xl">Headings stay in the serif, sentence case.</p>
          <p className="text-lg text-ink-soft">
            Body and interface text use Geist: neutral, legible at small sizes on a phone.
          </p>
          <p className="tabular font-mono text-lg">9:45 am · $65.00 · 45 min</p>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="font-display text-3xl">Controls</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Confirm booking</Button>
          <Button variant="secondary">Reschedule</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Charge no-show fee</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Draft</Badge>
          <Badge tone="brass">Verified</Badge>
          <Badge tone="success">Confirmed</Badge>
          <Badge tone="warning">Fee pending</Badge>
          <Badge tone="danger">No-show</Badge>
        </div>
        <Card className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="sg-first">
            <Input id="sg-first" placeholder="Alex" />
          </Field>
          <Field label="Mobile" htmlFor="sg-phone" hint="For reminders only">
            <Input id="sg-phone" type="tel" placeholder="021 123 4567" />
          </Field>
          <Field label="Service" htmlFor="sg-service">
            <Select id="sg-service" defaultValue="cut">
              <option value="cut">Signature cut</option>
              <option value="beard">Beard sculpt</option>
              <option value="nails">Gel manicure</option>
            </Select>
          </Field>
          <Field label="Email" htmlFor="sg-email" error="Enter a valid email address">
            <Input id="sg-email" aria-invalid defaultValue="alex@" />
          </Field>
        </Card>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="font-display text-3xl">Booking</h2>
        <BookingPreview />
      </section>
    </main>
  );
}
