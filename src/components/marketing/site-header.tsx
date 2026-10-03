import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";
import { buttonClasses } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label={`${brand.name} home`}>
          <Logo wordmarkClassName="hidden sm:inline" />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="#pricing" className={buttonClasses("ghost", "sm", "hidden sm:inline-flex")}>
            Pricing
          </Link>
          <Link href="/login" className={buttonClasses("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClasses("primary", "sm")}>
            List your business
          </Link>
        </nav>
      </div>
    </header>
  );
}
