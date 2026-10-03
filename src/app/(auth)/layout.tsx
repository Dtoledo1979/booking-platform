import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" aria-label={`${brand.name} home`} className="mb-10">
        <Logo />
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
