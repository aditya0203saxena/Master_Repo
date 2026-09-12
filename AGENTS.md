# Hackathon Master Repo — Agent Instructions

## Mission
Build hackathon products quickly without turning the repository into an unmaintainable prototype. Prefer small, composable changes over broad rewrites.

## Architecture rules
- Use the Next.js App Router.
- Keep route-specific UI inside `app/`.
- Put reusable visual primitives in `components/ui/`.
- Put reusable product components in `components/`.
- Put motion primitives in `components/motion/`.
- Put 3D and visualization primitives in `components/visualization/`.
- Put global client providers in `components/providers/`.
- Put Zustand stores in `store/`; keep stores domain-focused and small.
- Put server/browser integrations and pure helpers in `lib/`.
- Keep API handlers under `app/api/<feature>/route.ts`.
- Keep secrets server-side. Never expose provider API keys through `NEXT_PUBLIC_*` variables.
- Use Supabase through the helpers in `lib/supabase/` rather than creating clients ad hoc.
- Put runtime environment validation in `lib/env.ts`.
- Prefer `cn()` from `lib/utils.ts` for class composition.

## Frontend system
- Use React Server Components by default; add `"use client"` only at the interactive boundary.
- Use semantic HTML first: `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `search`, `form`, `label`, `button`, and meaningful heading hierarchy.
- Prefer native HTML controls and browser behavior before writing JavaScript equivalents: `details/summary`, `dialog`, Popover API, native form validation, `fieldset/legend`, `output`, `progress`, and `button` are preferred where they fit.
- Use `autocomplete`, `inputmode`, correct input types, labels, and constraint-validation attributes for forms.
- Use responsive images/media correctly; preserve intrinsic dimensions/aspect ratio and use lazy loading for below-the-fold media.
- Treat accessibility as part of component design: keyboard access, visible focus, correct semantics, reduced motion, and `inert` for deliberately disabled/inactive UI regions.
- Use Lenis for app-level smooth scrolling; respect `prefers-reduced-motion` and destroy instances on unmount.
- Use GSAP for timeline, entrance, scroll-linked, and complex DOM animation. In React, use `@gsap/react` and `useGSAP()` so animation contexts clean up correctly.
- Use CSS scroll-driven animations for simple reveal/progress effects when supported instead of JavaScript scroll listeners; keep a usable non-animated state as fallback.
- Use CSS container queries for reusable components whose layout depends on component width rather than viewport width.
- Use CSS Grid, `subgrid`, `minmax()`, `clamp()`, `aspect-ratio`, `color-mix()`, custom properties, cascade layers, and logical properties where they make the layout more robust.
- Use CSS `@supports` around progressive-enhancement features and provide a sane fallback.
- Use Three.js through `@react-three/fiber`; use `@react-three/drei` for reusable scene helpers. Keep WebGL scenes isolated in client components.
- Use Zustand for client state that must be shared across distant components. Do not create global state for simple local component state.
- Use Lucide React for interface icons instead of ad-hoc SVG icon copies.
- Use Tailwind CSS through the PostCSS integration for styling and keep global CSS limited to tokens, resets, accessibility, progressive enhancement, and truly global behavior.
- Prefer composition over large prop-heavy components.
- Lazy-load heavy visualization/3D surfaces when they are not immediately visible.
- Do not make animations a prerequisite for core usability.

## HTML/CSS design priorities
1. Semantic structure and accessibility.
2. Responsive layout without breakpoint-specific hacks.
3. Progressive enhancement using native platform capabilities.
4. Consistent design tokens and reusable primitives.
5. Motion and visual polish after usability is correct.
6. Performance: avoid unnecessary JS for layout, scroll, and simple interaction.

## Change workflow
1. Inspect the existing route/component before editing it.
2. Reuse existing primitives before adding another component.
3. Make the smallest coherent change that satisfies the feature.
4. Handle loading, empty, error, and success states for user-facing features.
5. Keep authorization checks close to the data mutation/read. Proxy is only an early request boundary, not the authorization layer.
6. For animation or WebGL work, verify cleanup, reduced-motion behavior, and client/server boundaries.
7. For HTML/CSS work, verify semantics, keyboard behavior, responsive behavior, progressive-enhancement fallbacks, and reduced-motion behavior.
8. Run `npm run typecheck`, `npm run lint`, and `npm run build` before declaring a feature complete.

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
- Putting browser-only APIs in Server Components.
- Shipping a WebGL scene on every route when only one feature needs it.
- Using JavaScript for layout that CSS can solve cleanly.
- Replacing semantic HTML elements with generic `div`/`span` widgets.
- Using `!important` as a default way to fix specificity problems.
