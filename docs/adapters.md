# Writing a Rulix Adapter

This guide walks you through adding support for a new AI coding tool.

## Overview

An adapter translates between a tool's native rule format and Rulix's Intermediate Representation (IR). Each adapter implements the `RulixAdapter` interface:

```typescript
interface RulixAdapter {
  name: string;           // e.g. "windsurf"
  displayName: string;    // e.g. "Windsurf"

  detect(projectRoot: string): Promise<boolean>;
  import(projectRoot: string): Promise<ImportResult>;
  export(rules: Rule[], projectRoot: string, options?: ExportOptions): Promise<ExportResult>;
  getTokenBudget(): TokenBudget;
}
```

## Step-by-Step

### 1. Research the tool's format

Before writing code, document:

- Where does the tool store its rules? (file paths, extensions)
- What metadata does the format support? (frontmatter, YAML, etc.)
- How does the tool scope rules? (always-on, file-specific, contextual)
- Are there token or instruction limits?
- Is there a legacy format to support?

### 2. Create the adapter file

Create `src/adapters/<tool-name>.ts`. Follow the existing adapters as reference:

- `cursor.ts` — full import/export with frontmatter parsing
- `claude-code.ts` — import/export with H2 section splitting
- `agents-md.ts` — export-only adapter

Every adapter should:

- **Import only from `../core/ir.js` and `../core/tokenizer.js`** — no cross-adapter imports
- **Use `estimateRuleTokens()`** from the tokenizer for token estimation
- **Handle missing files gracefully** — `detect()` returns false, `import()` returns empty results
- **Support `dryRun` option** — export should list files without writing when `dryRun: true`
- **Support `strategy` option** — `"overwrite"` deletes stale files, `"merge"` preserves them

### 3. Scope mapping

Map the tool's scoping model to Rulix's three scopes:

| Rulix Scope | Meaning | Example |
|---|---|---|
| `always` | Applied to every request | Cursor: `alwaysApply: true` |
| `file-scoped` | Applied when matching files are open | Cursor: `globs` field |
| `agent-selected` | AI decides based on description | Cursor: `description` only |

If the tool doesn't support a scope, pick a reasonable fallback:

- `agent-selected` can fall back to `always` if the tool has no selection mechanism
- `file-scoped` can include a comment noting the intended globs

### 4. Implement detect()

Return `true` if the project has any files or directories for this tool:

```typescript
async detect(projectRoot: string): Promise<boolean> {
  const configDir = join(projectRoot, ".tool/rules");
  return pathExists(configDir);
}
```

### 5. Implement import()

Read the tool's native files and convert each to a `Rule`:

```typescript
async import(projectRoot: string): Promise<ImportResult> {
  // Read files, parse format, create Rule objects
  return { rules, warnings, source: ".tool/rules" };
}
```

Guidelines:

- Set `source.adapter` to your adapter name
- Set `source.filePath` relative to projectRoot
- Set `source.importedAt` to `new Date().toISOString()`
- Default `category` to `"general"` and `priority` to `3`
- Add warnings for edge cases (missing frontmatter, deprecated formats)

### 6. Implement export()

Convert IR rules to the tool's native format and write files:

```typescript
async export(
  rules: Rule[],
  projectRoot: string,
  options?: ExportOptions,
): Promise<ExportResult> {
  const dryRun = options?.dryRun === true;
  const strategy = options?.strategy ?? "overwrite";

  // Convert rules, write files (unless dryRun)
  // Delete stale files (if strategy === "overwrite")

  return { filesWritten, filesDeleted, warnings };
}
```

### 7. Implement getTokenBudget()

Return the tool's known limits:

```typescript
getTokenBudget(): TokenBudget {
  return {
    maxTokens: 10_000,
    maxInstructions: 500,
    warningThreshold: 0.8,
    source: "Tool documentation",
  };
}
```

If limits are unknown, use conservative defaults (e.g. 10,000 tokens).

### 8. Register the adapter

Add your adapter to `src/adapters/registry.ts`:

```typescript
import { myToolAdapter } from "./my-tool.js";

const BUILTIN_ADAPTERS: RulixAdapter[] = [
  cursorAdapter,
  claudeCodeAdapter,
  agentsMdAdapter,
  myToolAdapter,  // Add here
];
```

Export it from `src/adapters/index.ts`:

```typescript
export { myToolAdapter } from "./my-tool.js";
```

### 9. Write tests

Create `tests/adapters/<tool-name>.test.ts` covering:

- **detect()** — returns true/false based on filesystem
- **import()** — all scope types, edge cases, warnings
- **export()** — file generation, dry-run, stale file deletion
- **Round-trip** — export then import produces equivalent IR

Add fixture files in `tests/fixtures/<tool-name>/` matching the tool's expected directory structure.

### 10. Update docs

- Add the tool to the **Supported Tools** table in `README.md`
- Update `AGENTS.md` if needed
- Add a changeset: `npx changeset`

## Testing checklist

```bash
npm run lint:fix
npm run typecheck
npm test
```

All three must pass before submitting a PR.

## Examples

Study the existing adapters for patterns:

| Adapter | Key patterns |
|---|---|
| `cursor.ts` | Frontmatter parsing, scope detection from fields, `.mdc` format |
| `claude-code.ts` | H2 section splitting, `Context:` prefix, dual output (CLAUDE.md + .claude/rules/) |
| `agents-md.ts` | Export-only, category grouping, priority ordering |
