import Link from "next/link";

const capabilities = [
  "Full-stack Next.js foundation",
  "Supabase-ready auth and database layer",
  "Reusable UI and API patterns",
  "AI integration hooks",
  "Vercel deployment ready",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
            Hackathon Master Repo
          </p>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            Build the idea, not the boilerplate.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
            A reusable starting point for fast, polished full-stack hackathon
            projects. Replace this page with your product flow and keep the
            foundation underneath.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <div
              key={capability}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
            >
              <div className="mb-5 h-2 w-2 rounded-full bg-white" />
              <p className="text-base text-zinc-200">{capability}</p>
            </div>
          ))}
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/api/health"
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            Test API
          </Link>
          <a
            href="https://vercel.com/new"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Deploy to Vercel
          </a>
        </div>
      </div>
    </main>
  );
}
