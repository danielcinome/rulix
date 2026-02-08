# CLI Reference

## Usage

```bash
rulix <command> [options]
```

## Global Options

| Option | Description |
|---|---|
| `--version` | Show Rulix version |
| `--help` | Show help |
| `--verbose`, `-v` | Verbose output |

---

## `rulix init`

Initialize Rulix in the current project.

```bash
rulix init
```

Creates the `.rulix/` directory with:
- `config.json` — default configuration with empty targets
- `rules/` — directory for canonical rule files

If existing tool configs are detected (e.g. `.cursor/rules/`, `CLAUDE.md`), Rulix suggests import commands.

---

## `rulix import`

Import rules from an existing tool's config into Rulix's canonical format.

```bash
rulix import --from <adapter>
```

### Options

| Option | Required | Description |
|---|---|---|
| `--from <adapter>` | Yes | Source adapter: `cursor` or `claude-code` |

### Examples

```bash
# Import from Cursor
rulix import --from cursor

# Import from Claude Code
rulix import --from claude-code
```

### What it imports

**From Cursor** (`.cursor/rules/*.mdc` + `.cursorrules`):
- `alwaysApply: true` maps to `scope: always`
- `globs` field maps to `scope: file-scoped`
- `description` only maps to `scope: agent-selected`
- Legacy `.cursorrules` is imported with a deprecation warning

**From Claude Code** (`.claude/rules/*.md`):
- Files without frontmatter map to `scope: always`
- Files with `description:` frontmatter (no `paths:`) map to `scope: agent-selected`
- Files with `paths:` frontmatter map to `scope: file-scoped`

> **Note**: CLAUDE.md is not imported. Rulix reads only from `.claude/rules/`.

Imported rules are written to `.rulix/rules/{id}.md`. Review them after import — you may want to adjust IDs, scopes, or categories.

> **Note**: AGENTS.md import is not supported because the format is too unstructured to parse reliably.

---

## `rulix sync`

Generate or update tool-specific configs from your canonical rules.

```bash
rulix sync [--target <adapter>] [--dry-run]
```

### Options

| Option | Description |
|---|---|
| `--target <adapter>` | Sync only to a specific target (e.g. `cursor`) |
| `--dry-run` | Preview changes without writing files |

### Behavior

1. Loads and validates all rules from `.rulix/rules/`
2. If validation fails, stops and shows errors
3. Resolves targets from `--target` flag, `config.json`, or all available adapters
4. Exports rules to each target using the `overwrite` strategy
5. Reports files written and deleted per target

### Examples

```bash
# Sync to all configured targets
rulix sync

# Sync only to Cursor
rulix sync --target cursor

# Preview without writing
rulix sync --dry-run
```

### Generated files

| Target | Output |
|---|---|
| Cursor | `.cursor/rules/*.mdc` |
| Claude Code | `.claude/rules/*.md` |
| AGENTS.md | `AGENTS.md` |

The `overwrite` strategy removes stale files (rules that no longer exist in `.rulix/rules/`) from target directories.

---

## `rulix validate`

Check rules for structural issues, duplicates, and best practice violations.

```bash
rulix validate
```

### Validation codes

| Code | Severity | Description |
|---|---|---|
| V001 | Error | Duplicate rule IDs |
| V002 | Error | Missing required fields (`id`, `description`) |
| V003 | Error | File-scoped rule without `globs` |
| V004 | Warning | Very short content (< 20 characters) |
| V005 | Warning | Vague description |
| V007 | Info | No specific category assigned |
| V009 | Error | Invalid glob syntax |
| V010 | Warning | Overly long content (> 50 lines) |
| V011 | Warning | Rule exceeds 50 lines (Cursor target only) |
| V012 | Info | Total rule tokens exceed 4,000 |

Exits with code 1 if any errors are found. Warnings and info messages don't affect the exit code.

---

## `rulix status`

Show an overview of your ruleset including rule counts and token budgets.

```bash
rulix status
```

### Output includes

- **Rule count** by scope (always, file-scoped, agent-selected)
- **Per-rule detail** — each rule with its estimated tokens, line count, and a warning indicator for rules exceeding 50 lines
- **Token budget usage** per configured target tool
- **Budget warnings** when usage exceeds 80% of a tool's limit
- **Configured targets** from `config.json`
