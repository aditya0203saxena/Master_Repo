# Hackathon Master Repo

A reusable Next.js 16 foundation for building polished full-stack hackathon products quickly without starting infrastructure from zero.

## Stack

- Next.js 16.3.x + App Router
- React 19.2.x
- TypeScript
- Tailwind CSS
- Supabase SSR + browser/server clients
- Zod for runtime validation
- Lucide icons
- CVA + `cn()` for reusable UI primitives
- OpenAI Responses API integration hook
- Vercel-friendly deployment
- GitHub Actions CI

## Architecture

```text
app/                 Routes, pages, route handlers, boundaries
  api/               Backend endpoints grouped by feature
  auth/              Authentication callbacks
  dashboard/         Example protected product area
  login/             Example Supabase magic-link flow
components/          Product-specific reusable UI
components/ui/       Small, composable UI primitives
lib/                 Integrations, validation, AI and utilities
  ai/                Browser-safe AI client helpers
  supabase/          Browser/server Supabase clients
proxy.ts             Request/session cookie refresh boundary
AGENTS.md            Instructions for AI coding agents
.github/workflows/   Automated typecheck, lint and build verification
```

## First run

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works without Supabase configured. Configure Supabase before using `/login` or authenticated routes.

## Environment

Copy `.env.example` to `.env.local` and add the credentials for the services used by your project. Keep server secrets such as `OPENAI_API_KEY` out of any `NEXT_PUBLIC_*` variable.

## AI workflow

Use an AI coding agent after reading `AGENTS.md`. Ask the agent to inspect the existing architecture, make the smallest coherent change, reuse existing primitives, and run typecheck/lint/build before finishing.

A good project-start prompt is:

> Read `AGENTS.md`, inspect the existing architecture, and implement the requested feature without rewriting unrelated code. Reuse existing UI primitives and integrations. Handle loading, empty, error, and success states. Run `npm run typecheck`, `npm run lint`, and `npm run build`, then fix any errors you introduced.

## Hackathon workflow

1. Clone this repository.
2. Rename the app and replace the home page with the product flow.
3. Add feature routes under `app/` and matching APIs under `app/api/`.
4. Use Supabase for auth/data when the project needs persistence.
5. Use `/api/ai` as the starting point for AI-backed server actions.
6. Deploy to Vercel.

## Engineering rule

This repository is a foundation, not a finished product. Keep domain logic inside feature boundaries and avoid turning shared folders into dumping grounds.
