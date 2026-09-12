# Architecture

## Runtime
Next.js App Router + React + TypeScript. Prefer Server Components. Client components exist only at interactive/browser boundaries.

## Layers

```text
app/                 route composition and API handlers
  api/<feature>/      server endpoints
components/ui/       generic visual primitives
components/          product-level components
components/motion/   GSAP animation primitives
components/visualization/  R3F/Three.js scenes
components/providers/ global client providers
store/               small shared client state
lib/                 integrations, validation, utilities
  ai/                server/browser-safe AI helpers
  supabase/          browser/server Supabase clients
docs/                architecture and agent workflow
```

## Dependency responsibilities

| Tool | Responsibility | Do not use it for |
| --- | --- | --- |
| HTML | semantics, native controls, forms, accessibility | visual layout hacks |
| CSS/Tailwind | layout, responsive design, tokens, simple effects | application state |
| React | component composition and UI state local to a component | global state by default |
| Zustand | shared client state across distant components | server data cache or every local toggle |
| Lenis | app-level smooth scrolling | core interaction logic |
| GSAP | complex/timeline/scroll-linked DOM motion | layout that CSS can express |
| R3F/Three/Drei | 3D/WebGL visualization | ordinary UI |
| Lucide | interface icons | duplicating SVG icon files |
| Supabase | auth/data/storage/realtime when needed | unrelated client-side state |

## Performance rules
- Lazy-load WebGL and other heavy surfaces when below the fold or route-specific.
- Prefer transform/opacity animation.
- Avoid scroll event listeners when CSS scroll-driven animation is sufficient.
- Preserve intrinsic media dimensions and aspect ratios.
- Do not load Three.js on routes that do not use visualization.

## Accessibility rules
- Use semantic elements before generic containers.
- Labels must be associated with inputs.
- Keyboard interaction must work without pointer input.
- Focus must remain visible.
- Respect `prefers-reduced-motion`.
- Do not hide essential content behind animation.
- Use `inert` for deliberately inactive UI regions rather than custom pointer-event hacks.

## Data/security
- Provider secrets stay server-side.
- Validate untrusted input at API boundaries with Zod or equivalent existing validation.
- Authorization belongs next to the database/data operation.
- `proxy.ts` may refresh session cookies or establish an early request boundary; it is not the authorization layer.
