# AI Agent Workflow

This repository is designed for Codex, Cursor, Claude Code, and similar coding agents.

## Default protocol

### 1. Inspect
Read `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `package.json`, and only the files relevant to the requested feature.

Do not start by rewriting the repository. Find the closest existing component/pattern first.

### 2. Plan
For work larger than a small edit, produce a compact plan with:
- affected files
- implementation approach
- important edge cases
- validation commands

Do not ask for confirmation when the task is already well specified.

### 3. Implement
Make the smallest coherent change.
Reuse existing UI primitives, integrations, and patterns.
Prefer platform HTML/CSS capabilities before JavaScript.
Keep client-only code at the smallest possible boundary.
Do not add dependencies unless the existing stack cannot solve the requirement reasonably.

### 4. Validate
Run:
```bash
npm run typecheck
npm run lint
npm run build
```
For UI features additionally verify:
- semantic HTML
- keyboard navigation/focus
- responsive behavior
- reduced-motion behavior
- loading/empty/error/success states
- no unnecessary client components

### 5. Fix
If validation fails:
1. identify the first root cause;
2. fix it;
3. rerun the smallest relevant check;
4. rerun the complete validation suite before finishing.

Never hide errors with `any`, broad lint disables, `--legacy-peer-deps`, `--force`, or silent catch blocks unless the user explicitly requests a temporary diagnostic workaround.

### 6. Summarize
Report only:
- what changed
- validation result
- remaining known issues

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

This matches the current recommendation to give agents structured context, scope, explicit actions, and acceptance criteria rather than vague "build this" instructions. citehttps://openai.com/business/guides-and-resources/how-openai-uses-codex/

## Codex
Start large changes in planning/Ask mode, then implement. Keep `AGENTS.md` as the short repository map and use this document for the workflow details. This follows OpenAI's current Codex guidance. citehttps://openai.com/index/harness-engineering/

## Cursor
Use `.cursor/rules/` for persistent scoped rules and `.cursor/commands/` for repeatable workflows. `AGENTS.md` remains the cross-agent architecture map. citehttps://docs.cursor.com/context/rules

## Claude Code
Use `CLAUDE.md` for project instructions. Keep it concise and reference this workflow/architecture documentation when more detail is needed. Claude Code loads project memory automatically. citehttps://docs.anthropic.com/zh-CN/docs/claude-code/memory
