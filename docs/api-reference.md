# API Reference

Rulix can be used as a TypeScript/JavaScript library. Install it as a dependency and import from `"rulix"`.

```bash
npm install rulix
```

## High-Level API

These functions compose lower-level APIs into single-call operations. They throw `RulixError` on failure.

### `loadRuleset(projectRoot)`

Loads the full ruleset (config + rules) from a project directory.

```typescript
import { loadRuleset } from "rulix";

const ruleset = await loadRuleset("./my-project");
// ruleset.rules  — Rule[]
// ruleset.config — RulixConfig
```

**Parameters:**
- `projectRoot: string` — Path to the project root

**Returns:** `Promise<Ruleset>`

**Throws:** `RulixError` if config is invalid or rules cannot be parsed.

---

### `importRules(adapterName, projectRoot)`

Imports rules from a tool-specific format into canonical IR.

```typescript
import { importRules } from "rulix";

const result = await importRules("cursor", "./my-project");
// result.rules    — Rule[]
// result.warnings — ImportWarning[]
// result.source   — string (e.g. ".cursor/rules/")
```

**Parameters:**
- `adapterName: string` — Adapter name (`"cursor"`, `"claude-code"`)
- `projectRoot: string` — Path to the project root

**Returns:** `Promise<ImportResult>`

---

### `exportRules(adapterName, rules, projectRoot, options?)`

Exports canonical rules to a tool's native format.

```typescript
import { exportRules } from "rulix";

const result = await exportRules("cursor", ruleset.rules, "./my-project", {
  strategy: "overwrite",
  dryRun: false,
});
// result.filesWritten — string[]
// result.filesDeleted — string[]
// result.warnings     — ExportWarning[]
```

**Parameters:**
- `adapterName: string` — Target adapter name
- `rules: Rule[]` — Rules to export
- `projectRoot: string` — Path to the project root
- `options?: ExportOptions` — Export options

**Returns:** `Promise<ExportResult>`

---

### `validateRuleset(ruleset)`

Validates a ruleset for structural issues.

```typescript
import { loadRuleset, validateRuleset } from "rulix";

const ruleset = await loadRuleset("./my-project");
const result = validateRuleset(ruleset);

if (!result.passed) {
  for (const error of result.errors) {
    console.error(`${error.code}: ${error.message}`);
  }
}
```

**Parameters:**
- `ruleset: Ruleset` — The ruleset to validate

**Returns:** `ValidationResult`

---

### `getTokenBudget(adapterName, rules)`

Returns token budget usage for a specific adapter.

```typescript
import { getTokenBudget } from "rulix";

const usage = getTokenBudget("cursor", ruleset.rules);
// usage.used      — number (tokens used)
// usage.max       — number (token limit)
// usage.percent   — number (0-100)
// usage.exceeded  — boolean
```

**Parameters:**
- `adapterName: string` — Adapter name
- `rules: Rule[]` — Rules to measure

**Returns:** `TokenBudgetUsage`

---

## Core API

Lower-level functions for fine-grained control.

### Parser

```typescript
import { parseRule, serializeRule, loadRules, writeRule } from "rulix";
```

#### `parseRule(content, filePath?)`

Parses a Markdown string with YAML frontmatter into a `Rule`.

```typescript
const result = parseRule(`---
id: my-rule
scope: always
description: "My rule"
---

Rule content here.
`);

if (result.ok) {
  console.log(result.value); // Rule
}
```

**Returns:** `Result<Rule, RulixError>`

#### `serializeRule(rule)`

Converts a `Rule` back to Markdown with frontmatter.

```typescript
const markdown = serializeRule(rule);
// ---
// id: my-rule
// scope: always
// ...
// ---
// Rule content here.
```

**Returns:** `string`

#### `loadRules(projectRoot)`

Reads all `.rulix/rules/*.md` files and parses them.

**Returns:** `Promise<Result<Rule[], RulixError>>`

#### `writeRule(rule, projectRoot)`

Writes a single rule to `.rulix/rules/{id}.md`.

**Returns:** `Promise<void>`

### Config

```typescript
import { loadConfig, resolveConfig, createDefaultConfig, configPath, rulesPath } from "rulix";
```

#### `loadConfig(projectRoot)`

Reads and validates `.rulix/config.json`. Returns defaults if the file doesn't exist.

**Returns:** `Promise<Result<RulixConfig, RulixError>>`

#### `resolveConfig(raw)`

Pure validation: validates a raw object against the config schema and merges with defaults.

**Returns:** `Result<RulixConfig, RulixError>`

#### `createDefaultConfig()`

Returns a `RulixConfig` with all defaults applied.

**Returns:** `RulixConfig`

#### `configPath(projectRoot)`

Returns the absolute path to `.rulix/config.json`.

#### `rulesPath(projectRoot)`

Returns the absolute path to `.rulix/rules/`.

### Tokenizer

```typescript
import { estimateTokens, estimateRuleTokens, sumTokens, computeBudgetUsage } from "rulix";
```

#### `estimateTokens(text)`

Estimates token count for a string (~4 chars per token).

**Returns:** `number`

#### `estimateRuleTokens(content, description)`

Estimates total tokens for a rule (content + description).

**Returns:** `number`

#### `sumTokens(counts)`

Sums an array of token counts.

**Returns:** `number`

#### `computeBudgetUsage(used, max)`

Calculates budget usage percentage and exceeded flag.

**Returns:** `TokenBudgetUsage`

### Validator

```typescript
import { validateRules } from "rulix";
```

#### `validateRules(rules, targets?)`

Validates an array of rules for structural issues (V001-V012).

**Parameters:**
- `rules: Rule[]` — Rules to validate
- `targets?: string[]` — Optional adapter names. Enables target-specific checks (e.g. V011 for Cursor)

**Returns:** `ValidationResult`

### Adapters

```typescript
import { getAdapter, getAdapters, getAdapterNames, detectAdapters } from "rulix";
```

#### `getAdapter(name)`

Returns an adapter by name, or `undefined`.

#### `getAdapters()`

Returns all registered adapters.

#### `getAdapterNames()`

Returns all adapter names as `string[]`.

#### `detectAdapters(projectRoot)`

Auto-detects which tools have existing configs in the project.

**Returns:** `Promise<RulixAdapter[]>`

---

## Types

All types are exported from `"rulix"`:

```typescript
import type {
  Rule,
  RuleScope,
  RuleCategory,
  RuleSource,
  Ruleset,
  RulixConfig,
  RulixConfigOptions,
  RulixAdapter,
  TokenBudget,
  TokenBudgetUsage,
  ExportOptions,
  ExportResult,
  ExportWarning,
  ExportStrategy,
  ImportResult,
  ImportWarning,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  Result,
  TokenEstimation,
} from "rulix";
```

See the [source types](../src/core/ir.ts) for full JSDoc documentation on each type.

---

## Error Handling

The high-level API (`loadRuleset`, `importRules`, `exportRules`) throws `RulixError` on failure.

The core API uses the `Result<T, E>` pattern:

```typescript
import { loadConfig, RulixError } from "rulix";

const result = await loadConfig("./my-project");
if (result.ok) {
  console.log(result.value.targets);
} else {
  console.error(result.error.code, result.error.message);
}
```

`RulixError` always includes a machine-readable `code` string for programmatic handling.
