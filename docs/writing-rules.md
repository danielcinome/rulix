# Writing Rules

Rules are the core of Rulix. Each rule is a Markdown file with YAML frontmatter that lives in `.rulix/rules/`.

## File format

```markdown
---
id: rule-id
scope: always
description: "Short description of what this rule enforces"
category: style
priority: 1
---

Rule content goes here. Write in Markdown.
```

## Frontmatter fields

### `id` (required)

Unique identifier in kebab-case. Used for deduplication, override composition, and file naming.

```yaml
id: no-any-types
```

### `scope` (required)

Controls when the rule is applied:

| Scope | When applied | Use case |
|---|---|---|
| `always` | Every AI request | Project-wide conventions |
| `file-scoped` | When matching files are open | Test-specific or lang-specific rules |
| `agent-selected` | AI decides based on description | Contextual rules the AI activates when relevant |

### `description` (required)

A short explanation of what the rule enforces. This is especially important for `agent-selected` rules — the AI uses this text to decide when to apply the rule.

```yaml
description: "Enforce strict TypeScript conventions across all source files"
```

Tips:
- Be specific, not vague. "Follow best practices" is too generic.
- Describe the **what**, not the **why**. The rule content explains the details.

### `category` (optional)

Groups rules by purpose. Defaults to `"general"`.

| Category | Use for |
|---|---|
| `style` | Coding conventions, formatting preferences |
| `security` | Input validation, auth patterns, vulnerability prevention |
| `testing` | Test structure, assertions, coverage |
| `architecture` | Project structure, design patterns, dependencies |
| `workflow` | Git workflow, CI/CD, deployment |
| `general` | Everything else |

### `priority` (optional)

1 (critical) to 5 (nice-to-have). Defaults to `3`.

Priority drives:
- **Ordering** in generated configs (lower number = higher priority)
- **Token budget optimization** (future: lower-priority rules can be dropped when over budget)

### `globs` (required for `file-scoped`)

File patterns that this rule applies to. Uses [picomatch](https://github.com/micromatch/picomatch) syntax.

```yaml
globs: ["**/*.test.ts", "**/*.spec.ts"]
```

Common patterns:
- `**/*.ts` — all TypeScript files
- `src/**/*.tsx` — React components in src/
- `**/*.test.ts` — all test files
- `*.config.*` — config files at root

## Examples

### Always-on rule

Applied to every AI interaction:

```markdown
---
id: typescript-strict
scope: always
description: "Enforce strict TypeScript conventions"
category: style
priority: 1
---

# TypeScript Conventions

- Use `strict: true` in tsconfig
- Never use `any` — prefer `unknown` with type narrowing
- Use explicit return types on public functions
- Prefer `interface` over `type` for object shapes
```

### File-scoped rule

Applied only when test files are open:

```markdown
---
id: testing-conventions
scope: file-scoped
description: "Testing conventions for unit and integration tests"
category: testing
priority: 2
globs: ["**/*.test.ts", "**/*.spec.ts"]
---

# Testing Conventions

- Use `describe` / `it` blocks, not `test`
- One assertion per test when possible
- Use `vi.fn()` for mocks, never manual stubs
- Name test files `<module>.test.ts`
```

### Agent-selected rule

The AI decides when to apply this rule based on the description:

```markdown
---
id: security-review
scope: agent-selected
description: "Security review guidelines for code that handles user input or authentication"
category: security
priority: 3
---

# Security Review

- Validate all user input at system boundaries
- Use parameterized queries, never string concatenation for SQL
- Sanitize HTML output to prevent XSS
- Use constant-time comparison for secrets
```

## Best practices

**Keep rules focused.** Each rule should cover one topic. A rule about "TypeScript + Testing + Security" should be three separate rules.

**Write actionable content.** Tell the AI what to do, not just what to avoid. Include examples of good and bad patterns.

**Use appropriate scopes.** Don't make everything `always` — file-scoped and agent-selected rules reduce noise and save token budget.

**Mind the token budget.** Each tool has a token limit. Use `rulix status` to check how much budget your rules consume. Rules longer than 50 lines trigger a validation warning.

**Set meaningful priorities.** Critical conventions (no `any`, strict mode) should be priority 1. Nice-to-have preferences (import ordering) can be priority 4-5.

## How scopes map to tools

| Rulix scope | Cursor | Claude Code | AGENTS.md |
|---|---|---|---|
| `always` | `alwaysApply: true` | Section in `CLAUDE.md` | Included |
| `file-scoped` | `globs` in frontmatter | `.claude/rules/*.md` with `paths` | Included |
| `agent-selected` | `description` only | `## Context: X` in `CLAUDE.md` | Excluded |
