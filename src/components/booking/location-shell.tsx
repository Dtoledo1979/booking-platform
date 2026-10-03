import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { brand } from "@/config/brand";

// Frame for client-facing location pages: the business is the hero, the
// platform stays in the background.
export function LocationShell({
  slug,
  name,
  isPreview,
  children,
}: {
  slug: string;
  name: string;
  isPreview: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {isPreview && (
        <div className="bg-inverse px-4 py-2.5 text-center text-sm text-inverse-fg">
          <span className="font-medium text-inverse-accent">Preview.</span> Only you can see this page. Clients can
          book once your location goes live.{" "}
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </div>
      )}
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href={`/${slug}`} className="truncate font-display text-xl">
            {name}
          </Link>
          <Link href="/my-bookings" className="text-sm text-muted hover:text-ink">
            My bookings
          </Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <LogoMark className="size-6 text-sm" />
          <span>
            Bookings by{" "}
            <Link href="/" className="underline underline-offset-2">
              {brand.name}
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
