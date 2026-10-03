import { brand } from "@/config/brand";

// Placeholder home page until the marketing site and booking flow exist.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{brand.name}</h1>
      <p className="max-w-md text-lg opacity-70">{brand.tagline}</p>
    </main>
  );
}
