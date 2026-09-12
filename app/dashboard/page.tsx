import Link from "next/link";
import { ArrowUpRight, Database, Layers3, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const modules = [
  { href: "/api/health", icon: Database, title: "API foundation", description: "Health checks and server route conventions are ready." },
  { href: "/login", icon: Layers3, title: "Authentication", description: "Supabase magic-link flow is wired for reuse." },
  { href: "/", icon: Sparkles, title: "AI layer", description: "A server-only AI endpoint is ready for product-specific orchestration." },
];

export default async function DashboardPage() {
  let email: string | null = null;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Hackathon workspace</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Ship the product.</h1>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Keep feature work inside clear boundaries so an AI agent can modify one module without destabilizing the rest.
            </p>
          </div>
          <Link href="/"><Button variant="secondary">Back to home</Button></Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Session</p>
          <p className="mt-2 text-sm text-zinc-300">{email ?? "Supabase is not configured yet."}</p>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.title} className="transition hover:-translate-y-0.5 hover:border-white/20">
                <CardHeader>
                  <Icon className="size-5 text-zinc-300" />
                  <CardTitle className="mt-4">{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={module.href} className="inline-flex items-center gap-1 text-sm text-white hover:underline">
                    Open module <ArrowUpRight className="size-4" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}
