import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { brand } from "@/config/brand";

// Header for signed-in business pages (onboarding, dashboard).
export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/dashboard" aria-label={`${brand.name} dashboard`} className="flex min-w-0 items-center gap-3">
          <Logo wordmarkClassName="hidden sm:inline" />
          {subtitle && <span className="truncate text-sm text-muted sm:border-l sm:border-line sm:pl-3">{subtitle}</span>}
        </Link>
        <form action={signOut}>
          <button type="submit" className={buttonClasses("ghost", "sm")}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
