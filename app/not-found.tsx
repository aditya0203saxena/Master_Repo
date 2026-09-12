import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">404</p>
        <h1 className="mt-3 text-4xl font-semibold">Page not found.</h1>
        <p className="mt-3 text-sm text-zinc-400">The route does not exist in this application yet.</p>
        <Link href="/"><Button className="mt-6">Go home</Button></Link>
      </div>
    </main>
  );
}
