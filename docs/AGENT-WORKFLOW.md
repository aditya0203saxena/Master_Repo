# AI Agent Workflow

This repository is designed for Codex, Cursor, Claude Code, and similar coding agents.

## Default protocol

### 1. Inspect
Read `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `package.json`, and only the files relevant to the requested feature.

Do not start by rewriting the repository. Find the closest existing component or pattern first.

### 2. Plan
For work larger than a small edit, produce a compact plan containing:
- affected files
- implementation approach
- important edge cases
- validation commands

Do not ask for confirmation when the task is already well specified. Make reasonable assumptions and state them briefly.

### 3. Implement
Make the smallest coherent vertical slice.
Reuse existing UI primitives, integrations, and patterns.
Prefer platform HTML/CSS capabilities before JavaScript.
Keep client-only code at the smallest possible boundary.
Do not add or upgrade dependencies unless necessary; verify peer compatibility first.
Do not modify unrelated files.

### 4. Validate
For application code or dependency changes:
```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

For docs-only or copy-only changes, run only the checks relevant to the changed files.

For UI features additionally verify semantic HTML, keyboard navigation/focus, responsive behavior, reduced-motion behavior, loading/empty/error/success states, and unnecessary client components.

### 5. Fix
If validation fails:
1. identify the first root cause;
2. classify it as code, dependency, network/registry, or CI-runner failure;
3. fix the root cause rather than masking it;
4. rerun the smallest relevant check;
5. rerun the complete validation suite before finishing code/dependency work.

Retry a transient network/registry failure once before reporting infrastructure trouble. Never hide errors with `any`, broad lint disables, `--legacy-peer-deps`, `--force`, or silent catch blocks unless the user explicitly requests a temporary diagnostic workaround.

### 6. Review
Before finishing, inspect the diff for:
- unrelated changes
- duplicated components
- dead imports
- secret exposure
- unnecessary dependencies
- incorrect server/client boundaries

### 7. Summarize
Report only:
- what changed
- validation results
- remaining known issues or risks

## Prompt format

Use this structure for feature requests:

```text
<task>
Implement [feature].
</task>

<context>
Relevant route/component: [path]
Existing patterns to reuse: [paths]
Constraints: [constraints]
</context>

<requirements>
1. [functional requirement]
2. [UI/UX requirement]
3. [data/API requirement]
</requirements>

<acceptance>
- [observable behavior]
- [edge case]
- [validation result]
</acceptance>
```

This format keeps scope, context, implementation requirements, and observable acceptance criteria explicit instead of giving an agent a vague "build this" request.

## Efficient default prompt

```text
Read AGENTS.md first. Inspect the existing architecture and only the files relevant to <feature>. Implement <feature> as one coherent vertical slice without rewriting unrelated code. Reuse existing UI, HTML/CSS, motion, state, Supabase, and API primitives. Prefer semantic HTML and CSS-first solutions; use client JavaScript only where needed. Keep server/client boundaries correct and secrets server-side. Handle the relevant loading, empty, error, success, responsive, keyboard, and reduced-motion states. Do not add or upgrade dependencies unless necessary; verify peer compatibility first and never use --force or --legacy-peer-deps. Review the diff. Run targeted checks first, then npm ci, npm run typecheck, npm run lint, and npm run build for code/dependency changes. If a command fails, diagnose the root cause, distinguish network/infrastructure failures from code failures, fix what you introduced, and rerun validation. Report changed files, behavior, validation results, and remaining risks.
```

## Provider notes

### Codex
For large changes, start in planning/Ask mode, then switch to implementation. Keep `AGENTS.md` short; use this document as deeper workflow guidance.

### Cursor
Use `.cursor/rules/` for persistent scoped rules and `.cursor/commands/` for repeatable workflows. `AGENTS.md` remains the cross-agent architecture map.

### Claude Code
Use `CLAUDE.md` for project instructions and keep detailed workflow guidance in `docs/`.
