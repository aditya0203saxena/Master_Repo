# Claude Code project instructions

Read `AGENTS.md` and `docs/ARCHITECTURE.md` before substantial changes. Use `docs/AGENT-WORKFLOW.md` for the inspect → plan → implement → validate → fix → summarize protocol.

Project commands:
- `npm run dev`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Prefer semantic HTML and CSS/Tailwind before JavaScript for layout and simple interactions. Keep client components minimal. Preserve the boundaries in `docs/ARCHITECTURE.md`.

For non-trivial changes, make a compact plan before implementation, then run the complete validation suite and fix failures before finishing.
