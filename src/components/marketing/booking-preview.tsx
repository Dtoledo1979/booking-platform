import { Badge, Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

// Static illustration of the client booking step for marketing and the
// style guide. Not wired to data.
const services = [
  { name: "Signature cut", duration: "45 min", price: "$65" },
  { name: "Beard sculpt & hot towel", duration: "30 min", price: "$45" },
  { name: "Gel manicure", duration: "60 min", price: "$70" },
];

const slots = ["9:00", "9:45", "10:30", "11:15", "1:00", "1:45", "2:30", "3:15"];
const taken = new Set(["10:30", "1:45"]);

export function BookingPreview({ className }: { className?: string }) {
  return (
    <Card className={cn("w-full max-w-md p-0 sm:p-0 shadow-[0_24px_60px_-30px_rgb(23_25_27/0.35)]", className)}>
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <p className="font-display text-xl leading-tight">Ponsonby Studio</p>
          <p className="text-sm text-muted">Hair · Barber · Nails</p>
        </div>
        <Badge tone="brass">Verified</Badge>
      </div>

      <ul className="divide-y divide-line px-6">
        {services.map((s, i) => (
          <li key={s.name} className="flex items-center justify-between py-3.5">
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  "size-4 rounded-full border",
                  i === 0 ? "border-[5px] border-ink" : "border-line-strong",
                )}
              />
              <span>
                <span className="block text-[0.9375rem] font-medium">{s.name}</span>
                <span className="block text-xs text-muted">{s.duration}</span>
              </span>
            </span>
            <span className="tabular font-mono text-sm">{s.price}</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-line px-6 py-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">Thu 14 Nov</p>
        <div className="grid grid-cols-4 gap-2">
          {slots.map((t) => (
            <span
              key={t}
              className={cn(
                "tabular rounded-control border py-2 text-center font-mono text-sm",
                t === "9:45"
                  ? "border-ink bg-ink text-on-ink"
                  : taken.has(t)
                    ? "border-transparent bg-stone text-muted line-through"
                    : "border-line-strong",
              )}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-b-card bg-stone px-6 py-4 text-sm text-ink-soft">
        Free cancellation until <span className="font-medium text-ink">Wed 9:45 am</span>. Later
        changes: <span className="tabular font-mono text-ink">$32.50</span> fee.
      </div>
    </Card>
  );
}
