import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationShell } from "@/components/booking/location-shell";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { formatDuration, formatMoney, policySentences } from "@/lib/format";
import { addressLines, getPublicLocation } from "@/lib/public-location";

const WEEK = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

function hhmm(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const data = await getPublicLocation((await params).slug);
  if (!data) return {};
  const { location, isPreview } = data;
  const where = [location.suburb, location.city].filter(Boolean).join(", ");
  return {
    title: `${location.name}${where ? ` · ${where}` : ""}`,
    description: location.description ?? `Book online with ${location.name}.`,
    robots: isPreview ? { index: false } : undefined,
  };
}

export default async function LocationPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const data = await getPublicLocation(slug);
  if (!data) notFound();
  const { location, isPreview, services, staff, hours, policy } = data;

  const address = addressLines(location);
  const mapsHref = address.length
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.name}, ${address.join(", ")}`)}`
    : null;
  const hoursByDay = new Map<number, string[]>();
  for (const h of hours) {
    (hoursByDay.get(h.weekday) ?? hoursByDay.set(h.weekday, []).get(h.weekday)!).push(
      `${hhmm(h.opens_at)} – ${hhmm(h.closes_at)}`,
    );
  }

  return (
    <LocationShell slug={slug} name={location.name} isPreview={isPreview}>
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-3">
            <Eyebrow>{[location.suburb, location.city].filter(Boolean).join(", ") || "Book online"}</Eyebrow>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-5xl leading-none">{location.name}</h1>
              {location.is_verified && <Badge tone="brass">Verified</Badge>}
            </div>
            {location.description && <p className="max-w-2xl text-lg text-ink-soft">{location.description}</p>}
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="services-heading">
            <h2 id="services-heading" className="font-display text-3xl">
              Services
            </h2>
            {services.length ? (
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {services.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-sm text-muted">
                          {formatDuration(s.duration_minutes)}
                          {s.description ? ` · ${s.description}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="tabular font-mono text-sm">
                          {s.price_type === "from" ? "from " : ""}
                          {formatMoney(s.price_cents, location.currency)}
                        </span>
                        <Link
                          href={`/${slug}/book?service=${s.id}`}
                          className={buttonClasses("primary", "sm")}
                          aria-label={`Book ${s.name}`}
                        >
                          Book
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-muted">No services are available to book online yet.</p>
            )}
          </section>

          {staff.length > 1 && (
            <section className="flex flex-col gap-4" aria-labelledby="team-heading">
              <h2 id="team-heading" className="font-display text-3xl">
                Team
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {staff.map((m) => (
                  <li key={m.id}>
                    <Card className="flex items-center gap-4 p-4 sm:p-4">
                      <span
                        aria-hidden
                        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-stone font-display text-xl"
                      >
                        {m.display_name.charAt(0)}
                      </span>
                      <span>
                        <span className="block font-medium">{m.display_name}</span>
                        {m.bio && <span className="block text-sm text-muted">{m.bio}</span>}
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {(address.length > 0 || location.phone || location.email) && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-2xl">Find us</h2>
              {address.length > 0 && (
                <address className="not-italic text-ink-soft">
                  {address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              )}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">
                  Open in Maps
                </a>
              )}
              {location.phone && (
                <a href={`tel:${location.phone.replace(/\s/g, "")}`} className="text-sm text-ink-soft">
                  {location.phone}
                </a>
              )}
              {location.email && (
                <a href={`mailto:${location.email}`} className="text-sm text-ink-soft">
                  {location.email}
                </a>
              )}
            </Card>
          )}

          {hours.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-2xl">Opening hours</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {WEEK.map(([weekday, label]) => (
                  <div key={weekday} className="contents">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="tabular text-right font-mono">
                      {hoursByDay.get(weekday)?.join(", ") ?? <span className="text-muted">Closed</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {policy && (
            <Card className="flex flex-col gap-2">
              <h2 className="font-display text-2xl">Cancellation policy</h2>
              {policySentences(policy, null, location.currency).map((s) => (
                <p key={s} className="text-sm text-ink-soft">
                  {s}
                </p>
              ))}
              {policy.policy_text && <p className="text-sm text-muted">{policy.policy_text}</p>}
            </Card>
          )}
        </aside>
      </main>
    </LocationShell>
  );
}
