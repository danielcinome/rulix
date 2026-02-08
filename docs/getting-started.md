# Getting Started

This guide takes you from zero to a working Rulix setup in under 5 minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or higher

## Step 1: Initialize

Run `rulix init` in your project root:

```bash
npx rulix init
```

This creates:

```
.rulix/
├── config.json    # Targets and options
└── rules/         # Your canonical rules
```

Rulix will detect if you already have rules for Cursor or Claude Code and suggest importing them.

## Step 2: Configure targets

Edit `.rulix/config.json` to list the tools you want to sync to:

```json
{
  "targets": ["cursor", "claude-code", "agents-md"]
}
```

Available targets: `cursor`, `claude-code`, `agents-md`.

## Step 3: Write your first rule

Create `.rulix/rules/no-any.md`:

```markdown
---
id: no-any
scope: always
description: "Forbid the use of any in TypeScript"
category: style
priority: 1
---

Never use `any` in TypeScript code. Use `unknown` with type narrowing instead.

Bad:
- `function parse(data: any)`
- `const result: any = getValue()`

Good:
- `function parse(data: unknown)`
- `const result: unknown = getValue()`
```

### Rule fields

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique kebab-case identifier |
| `scope` | Yes | `always`, `file-scoped`, or `agent-selected` |
| `description` | Yes | What the rule enforces |
| `category` | No | `style`, `security`, `testing`, `architecture`, `workflow`, or `general` |
| `priority` | No | `1` (critical) to `5` (nice-to-have). Defaults to `3` |
| `globs` | If file-scoped | File patterns like `["**/*.test.ts"]` |

## Step 4: Validate

Check your rules for issues:

```bash
npx rulix validate
```

Rulix checks for:
- Duplicate rule IDs
- Missing required fields
- File-scoped rules without globs
- Vague or overly short descriptions
- Invalid glob patterns
- Overly long rules

## Step 5: Sync

Generate configs for all your target tools:

```bash
npx rulix sync
```

This writes tool-specific files:
- **Cursor**: `.cursor/rules/*.mdc`
- **Claude Code**: `CLAUDE.md` + `.claude/rules/*.md`
- **AGENTS.md**: `AGENTS.md`

### Dry run

Preview what will be written without making changes:

```bash
npx rulix sync --dry-run
```

### Sync a single target

```bash
npx rulix sync --target cursor
```

## Step 6: Check status

Get an overview of your ruleset:

```bash
npx rulix status
```

Shows:
- Rule count by scope (always, file-scoped, agent-selected)
- Token budget usage per target tool
- Configured targets

## Importing existing rules

If you already have rules in Cursor or Claude Code, import them into Rulix's canonical format:

```bash
# Import from Cursor (.cursor/rules/*.mdc)
npx rulix import --from cursor

# Import from Claude Code (CLAUDE.md + .claude/rules/)
npx rulix import --from claude-code
```

Imported rules are written to `.rulix/rules/` as Markdown files. Review them after import — you may want to adjust IDs, scopes, or categories.

## Recommended workflow

1. Edit rules in `.rulix/rules/`
2. Run `npx rulix validate` to catch issues
3. Run `npx rulix sync` to generate tool configs
4. Commit both `.rulix/` and generated files to git

## Next steps

- [Writing Rules](writing-rules.md) — Detailed guide for authoring rules
- [CLI Reference](cli-reference.md) — All commands and flags
- [Configuration](configuration.md) — All config options
- [API Reference](api-reference.md) — Use Rulix as a library
- [Writing an Adapter](adapters.md) — Add support for a new tool
