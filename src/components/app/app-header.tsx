import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; current?: boolean };

// Header for signed-in pages. Business pages pass their section nav; the
// client area passes its own.
export function AppHeader({ subtitle, nav = [], homeHref = "/dashboard" }: { subtitle?: string; nav?: NavItem[]; homeHref?: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={homeHref} aria-label={`${brand.name} home`} className="flex min-w-0 items-center gap-3">
          <Logo wordmarkClassName="hidden sm:inline" />
          {subtitle && <span className="truncate text-sm text-muted sm:border-l sm:border-line sm:pl-3">{subtitle}</span>}
        </Link>
        <form action={signOut}>
          <button type="submit" className={buttonClasses("ghost", "sm")}>
            Sign out
          </button>
        </form>
      </div>
      {nav.length > 0 && (
        <nav aria-label="Sections" className="mx-auto max-w-5xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
                    item.current ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

// Sections of the business dashboard.
export function businessNav(
  slug: string,
  current: "overview" | "calendar" | "profile" | "services" | "hours",
): NavItem[] {
  return [
    { href: "/dashboard", label: "Overview", current: current === "overview" },
    { href: "/dashboard/calendar", label: "Calendar", current: current === "calendar" },
    { href: "/dashboard/profile", label: "Location profile", current: current === "profile" },
    { href: "/onboarding?step=services", label: "Services", current: current === "services" },
    { href: "/onboarding?step=hours", label: "Opening hours", current: current === "hours" },
    { href: `/${slug}`, label: "Booking page ↗" },
  ];
}
