import Link from "next/link";
import { ArrowUpRight, Box, Gauge, Layers3, Sparkles } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { AmbientScene } from "@/components/visualization/ambient-scene";

const capabilities = [
  { icon: Layers3, title: "Full-stack foundation", description: "Next.js, Supabase, API routes and server/client boundaries are ready." },
  { icon: Sparkles, title: "Motion system", description: "Lenis smooth scroll and GSAP reveal primitives are available as shared building blocks." },
  { icon: Box, title: "3D visualization", description: "Three.js through React Three Fiber with Drei helpers for interactive scenes." },
  { icon: Gauge, title: "Fast UI state", description: "Zustand provides lightweight client state without unnecessary provider trees." },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-black text-white">
      <section className="relative isolate min-h-[760px] overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <AmbientScene />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(124,58,237,0.22),transparent_42%)]" />

        <div className="relative mx-auto flex min-h-[760px] max-w-6xl items-center px-6 py-24">
          <Reveal className="max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Hackathon Master Repo
            </p>
            <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
              Build the idea.
              <span className="block text-zinc-500">Keep the engineering.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300">
              A reusable full-stack foundation with a deliberate frontend system for smooth motion,
              3D visualization, predictable state, and production-ready styling.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Open workspace <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="/api/health"
                className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Test API
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Frontend toolkit</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Structured for fast iteration.</h2>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, description }, index) => (
            <Reveal key={title} delay={index * 0.06}>
              <article className="h-full rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-white/20">
                <Icon className="size-5 text-zinc-300" />
                <h3 className="mt-6 text-base font-medium">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </main>
  );
}
