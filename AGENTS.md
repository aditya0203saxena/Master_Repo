# Hackathon Master Repo — Agent Map

## Mission
Build fast hackathon products without creating an unmaintainable prototype.

## Before changing code
1. Read `README.md`.
2. Read `docs/ARCHITECTURE.md` for boundaries and design decisions.
3. Inspect the route/component and nearby existing patterns before editing.
4. For non-trivial work, state a brief implementation plan before coding.

## Architecture
- Next.js App Router; Server Components by default.
- `app/`: routes, route-specific UI, API handlers.
- `components/ui/`: small reusable primitives.
- `components/`: reusable product components.
- `components/motion/`: GSAP/motion primitives.
- `components/visualization/`: Three.js/R3F primitives.
- `components/providers/`: global client providers.
- `store/`: small domain-focused Zustand stores.
- `lib/`: integrations, validation, server/browser helpers.
- `docs/`: architectural and agent workflow source of truth.

## Frontend rules
- Semantic HTML first; prefer native browser capabilities before JavaScript.
- CSS first for layout, responsiveness, simple interaction, and simple scroll effects.
- Use Tailwind through PostCSS; keep global CSS for tokens, resets, accessibility, fallbacks, and true global behavior.
- Use Lenis for app-level smooth scrolling only when it improves UX; respect reduced motion and clean up.
- Use GSAP + `@gsap/react` for complex DOM animation; use `useGSAP()` for cleanup.
- Use Three.js through `@react-three/fiber` + Drei; isolate WebGL in client components and lazy-load heavy scenes.
- Use Zustand only for genuinely shared client state.
- Use Lucide for interface icons.
- Never make animation or WebGL required for core functionality.

## Engineering rules
- Keep secrets server-side; never use `NEXT_PUBLIC_*` for provider secrets.
- Keep authorization next to the data operation; request proxying is not authorization.
- Handle loading, empty, error, and success states.
- Prefer composition and small files over giant components.
- Reuse existing primitives before adding dependencies.
- Do not rewrite unrelated files.

## Validation
Before declaring work complete, run:
```bash
npm run typecheck
npm run lint
npm run build
```
For UI work also verify keyboard behavior, responsive behavior, reduced motion, semantic structure, and progressive-enhancement fallbacks.

## Agent workflow
For non-trivial changes use the sequence:
**inspect → plan → implement → validate → fix → summarize**.

Use `docs/AGENT-WORKFLOW.md` for the detailed prompt protocol and provider-specific instructions.
