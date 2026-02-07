# rulix

> One ruleset. Every AI coding tool.

Rulix is a CLI tool and TypeScript library that gives you a **single source of truth** for AI coding rules across Cursor, Claude Code, AGENTS.md, and more.

Write your rules once. Rulix generates optimized configs for each tool — handling format differences, scoping semantics, and token budgets automatically.

## The Problem

Every AI coding tool has its own rules format:

| Tool | Format | Location |
|---|---|---|
| Cursor | `.mdc` with YAML frontmatter | `.cursor/rules/` |
| Claude Code | Plain markdown | `CLAUDE.md` + `.claude/rules/` |
| AGENTS.md | Plain markdown | `AGENTS.md` |
| Windsurf | Markdown | `.windsurf/rules/` |
| Copilot | Markdown | `.github/copilot-instructions.md` |

If you use more than one tool, you're maintaining duplicate rules that drift apart.

## How Rulix Works

```
.rulix/rules/         →    .cursor/rules/*.mdc
  ├── typescript.md    →    CLAUDE.md + .claude/rules/
  ├── testing.md       →    AGENTS.md
  └── security.md      →    (more targets coming)
```

1. **Write rules once** in `.rulix/rules/` using markdown + frontmatter
2. **`rulix sync`** generates configs for each target tool
3. **`rulix validate`** catches duplicates, vague rules, and token budget issues

## Quick Start

```bash
npx rulix init
npx rulix import --from cursor    # Import existing rules
npx rulix sync                     # Generate all targets
npx rulix validate                 # Check for issues
npx rulix status                   # See overview + token budgets
```

## Rule Format

```markdown
---
id: typescript-strict
scope: always
description: "Enforce strict TypeScript conventions"
category: style
priority: 1
---

# TypeScript Strict Conventions

- Use strict TypeScript with no `any` types
- Prefer `interface` over `type` for object shapes
- Enable `strictNullChecks` in all projects
```

## Key Features

- **Import** existing rules from Cursor or Claude Code
- **Export** to Cursor, Claude Code, and AGENTS.md (more coming)
- **Validate** rules for duplicates, conflicts, and vague content
- **Token budgets** — know when your rules exceed a tool's recommended limits
- **Zero LLM dependency** — all validation is deterministic, works offline
- **Programmatic API** — use Rulix as a library in your own tools

## Supported Tools

| Tool | Import | Export | Status |
|---|---|---|---|
| Cursor | ✅ | ✅ | v0.1 |
| Claude Code | ✅ | ✅ | v0.1 |
| AGENTS.md | — | ✅ | v0.1 |
| Windsurf | — | — | Planned |
| Copilot | — | — | Planned |
| Codex | — | — | Planned |

## Contributing

Contributions are welcome! The most impactful ways to help:

1. **New adapters** — Add support for Windsurf, Copilot, Cline, etc.
2. **Validation rules** — New checks for common rule issues
3. **Bug reports** — Especially format edge cases

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines.

## License

[MIT](LICENSE)
