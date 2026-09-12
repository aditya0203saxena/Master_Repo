Read `AGENTS.md`, `README.md`, and `docs/ARCHITECTURE.md` first.

Implement the requested feature using this sequence:
1. Inspect the relevant route/component and existing reusable patterns.
2. State a compact plan: affected files, approach, edge cases, validation.
3. Implement the smallest coherent change.
4. Prefer semantic HTML and CSS/Tailwind before JavaScript for layout/simple behavior.
5. Keep browser-only code in client components and keep the client boundary minimal.
6. Reuse existing UI, motion, visualization, state, and integration helpers.
7. Handle loading, empty, error, success, keyboard, responsive, and reduced-motion states where relevant.
8. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
9. Fix validation failures and rerun the full suite.
10. Summarize changed files and validation results.

Do not use `--force`, `--legacy-peer-deps`, broad lint disables, `any`, or silent error suppression to make checks pass.
