import Link from "next/link";
import { brand } from "@/config/brand";
import { BookingPreview } from "@/components/marketing/booking-preview";
import { SiteHeader } from "@/components/marketing/site-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";

const segments = [
  {
    title: "Solo",
    body: "One chair, one calendar. Take bookings while you work and stop chasing no-shows by text.",
  },
  {
    title: "Teams",
    body: "Every stylist, barber or tech with their own hours. Clients pick someone — or anyone free.",
  },
  {
    title: "Multiple locations",
    body: "Each branch runs independently: its own team, prices, policy and payouts.",
  },
];

const features = [
  ["Online booking, 24/7", "A page for every location that clients can book from any phone."],
  ["Cancellation fees that hold", "Card on file, a clear policy clients accept, and fees paid to you."],
  ["Reminders that save the slot", "Clients are nudged before the free-cancellation window closes."],
  ["A calendar for the whole team", "Day and week views per person, walk-ins and phone bookings included."],
] as const;

const included = [
  "Unlimited bookings and team members",
  "Email and SMS reminders",
  "Card on file and cancellation fees",
  "100% of fees paid to your business",
  "No contract, cancel anytime",
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="flex flex-col gap-6">
            <Eyebrow>For salons, barbershops & studios</Eyebrow>
            <h1 className="font-display text-5xl leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-7xl">
              Fewer empty chairs.
              <br />
              <em className="text-brass-ink">Fewer no-shows.</em>
            </h1>
            <p className="max-w-xl text-lg text-ink-soft">
              Online bookings, reminders and cancellation fees that go straight to your business —
              built for solo operators, busy teams and multi-location salons.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className={buttonClasses("primary", "lg")}>
                List your business
              </Link>
              <Link href="#pricing" className={buttonClasses("secondary", "lg")}>
                See pricing
              </Link>
            </div>
          </div>
          <BookingPreview className="justify-self-center lg:justify-self-end" />
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {segments.map((s) => (
              <div key={s.title} className="px-4 py-10 sm:px-8">
                <h2 className="font-display text-3xl">{s.title}</h2>
                <p className="mt-3 text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Eyebrow>Everything in one place</Eyebrow>
          <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
            The front desk that never takes a day off.
          </h2>
          <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {features.map(([title, body]) => (
              <div key={title} className="border-t border-line pt-6">
                <dt className="text-lg font-medium">{title}</dt>
                <dd className="mt-2 text-ink-soft">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="pricing" className="bg-inverse text-inverse-fg">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-inverse-accent">
                <span aria-hidden className="h-px w-6 bg-inverse-accent" />
                Pricing
              </p>
              <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
                One price per location. <em className="text-inverse-accent">Nothing hidden.</em>
              </h2>
              <p className="mt-4 max-w-md text-inverse-muted">
                No commission on new clients, no lock-in contract. Add or pause locations whenever
                you need to.
              </p>
            </div>
            <Card className="border-transparent bg-surface text-ink">
              <p className="text-sm text-muted">Per location, per month</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="tabular font-display text-6xl">$49.99</span>
                <span className="text-sm text-muted">{brand.currency}, GST incl.</span>
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[0.9375rem]">
                    <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-brass" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={buttonClasses("primary", "lg", "mt-8 w-full")}>
                List your business
              </Link>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {brand.name}
          </p>
          <p>Made in Aotearoa New Zealand</p>
        </div>
      </footer>
    </>
  );
}
