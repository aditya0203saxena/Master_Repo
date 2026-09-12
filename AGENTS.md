# Hackathon Master Repo — Agent Instructions

## Mission
Build hackathon products quickly without turning the repository into an unmaintainable prototype. Prefer small, composable changes over broad rewrites.

## Architecture rules
- Use the Next.js App Router.
- Keep route-specific UI inside `app/`.
- Put reusable visual primitives in `components/ui/`.
- Put reusable product components in `components/`.
- Put server/browser integrations and pure helpers in `lib/`.
- Keep API handlers under `app/api/<feature>/route.ts`.
- Keep secrets server-side. Never expose provider API keys through `NEXT_PUBLIC_*` variables.
- Use Supabase through the helpers in `lib/supabase/` rather than creating clients ad hoc.
- Put runtime environment validation in `lib/env.ts`.
- Prefer `cn()` from `lib/utils.ts` for class composition.

## Change workflow
1. Inspect the existing route/component before editing it.
2. Reuse existing primitives before adding another component.
3. Make the smallest coherent change that satisfies the feature.
4. Handle loading, empty, error, and success states for user-facing features.
5. Keep authorization checks close to the data mutation/read. Proxy is only an early request boundary, not the authorization layer.
6. Run `npm run typecheck`, `npm run lint`, and `npm run build` before declaring a feature complete.

## Hackathon priorities
1. Working end-to-end flow.
2. Clear and polished UI.
3. Reliable data and error handling.
4. Demo-ready performance.
5. Tests for high-risk logic.

## Avoid
- Giant single-file components.
- Duplicate UI primitives.
- Hard-coded secrets.
- Catch blocks that silently hide errors.
- Introducing a library for a problem already solved by the repository.
- Rewriting unrelated files when implementing a feature.
