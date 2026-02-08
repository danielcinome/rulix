import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cursorAdapter } from "../../src/adapters/cursor.js";
import type { Rule } from "../../src/core/ir.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = join(tmpdir(), `rulix-cursor-test-${Date.now()}`);
	await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

function makeRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "test-rule",
		scope: "always",
		description: "A test rule",
		content: "Follow this convention.",
		category: "style",
		priority: 1,
		estimatedTokens: 10,
		...overrides,
	};
}

// ─── detect ──────────────────────────────────────────────────────

describe("detect", () => {
	it("returns false when nothing exists", async () => {
		expect(await cursorAdapter.detect(tmpDir)).toBe(false);
	});

	it("returns true when .cursor/rules/ exists", async () => {
		await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });
		expect(await cursorAdapter.detect(tmpDir)).toBe(true);
	});

	it("returns true when .cursorrules exists", async () => {
		await writeFile(join(tmpDir, ".cursorrules"), "legacy content");
		expect(await cursorAdapter.detect(tmpDir)).toBe(true);
	});
});

// ─── import ──────────────────────────────────────────────────────

describe("import", () => {
	it("returns empty rules when directory does not exist", async () => {
		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("imports an alwaysApply rule", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "strict-mode.mdc"),
			`---
description: "Enforce strict mode"
alwaysApply: true
---

Use strict TypeScript settings.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.id).toBe("strict-mode");
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.rules[0]?.description).toBe("Enforce strict mode");
		expect(result.rules[0]?.content).toContain("strict TypeScript");
	});

	it("imports a file-scoped rule with globs", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "test-rules.mdc"),
			`---
description: "Testing conventions"
globs: "**/*.test.ts"
---

Use describe/it blocks.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.scope).toBe("file-scoped");
		expect(result.rules[0]?.globs).toEqual(["**/*.test.ts"]);
	});

	it("imports a file-scoped rule with inline array globs", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "tests.mdc"),
			`---
description: "Tests"
globs: ["**/*.test.ts", "**/*.spec.ts"]
---

Content.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);
	});

	it("imports an agent-selected rule (description only)", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "security.mdc"),
			`---
description: "Security guidelines for auth code"
---

Validate all inputs.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.scope).toBe("agent-selected");
	});

	it("handles no frontmatter with warning", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "bare.mdc"), "Just some raw content.");

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.message).toContain("No frontmatter");
	});

	it("derives ID from filename", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "my-custom-rule.mdc"),
			`---
description: "Custom"
alwaysApply: true
---

Content.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.id).toBe("my-custom-rule");
	});

	it("imports legacy .cursorrules file with warning", async () => {
		await writeFile(join(tmpDir, ".cursorrules"), "Legacy instructions.");

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.id).toBe("cursorrules-legacy");
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.message).toContain("deprecated");
	});

	it("skips empty legacy file", async () => {
		await writeFile(join(tmpDir, ".cursorrules"), "");

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(0);
	});

	it("imports both .mdc and legacy files", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "rule.mdc"),
			`---
description: "Modern rule"
alwaysApply: true
---

Modern content.
`,
		);
		await writeFile(join(tmpDir, ".cursorrules"), "Legacy content.");

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(2);
	});

	it("sets source metadata on imported rules", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "rule.mdc"),
			`---
description: "Test"
alwaysApply: true
---

Content.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.source?.adapter).toBe("cursor");
		expect(result.rules[0]?.source?.filePath).toContain(
			".cursor/rules/rule.mdc",
		);
	});

	it("computes estimatedTokens on import", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "rule.mdc"),
			`---
description: "Test"
alwaysApply: true
---

Some content here.
`,
		);

		const result = await cursorAdapter.import(tmpDir);
		expect(result.rules[0]?.estimatedTokens).toBeGreaterThan(0);
	});
});

// ─── export ──────────────────────────────────────────────────────

describe("export", () => {
	it("writes .mdc files for each rule", async () => {
		const rules = [makeRule({ id: "rule-a" }), makeRule({ id: "rule-b" })];
		const result = await cursorAdapter.export(rules, tmpDir);

		expect(result.filesWritten).toHaveLength(2);
		const contentA = await readFile(
			join(tmpDir, ".cursor/rules/rule-a.mdc"),
			"utf-8",
		);
		expect(contentA).toContain("description:");
		expect(contentA).toContain("alwaysApply: true");
	});

	it("exports always rule with alwaysApply: true", async () => {
		const rules = [makeRule({ scope: "always" })];
		await cursorAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(content).toContain("alwaysApply: true");
		expect(content).not.toContain("globs:");
	});

	it("exports file-scoped rule with globs", async () => {
		const rules = [
			makeRule({
				scope: "file-scoped",
				globs: ["**/*.test.ts"],
			}),
		];
		await cursorAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(content).toContain('globs: "**/*.test.ts"');
		expect(content).toContain("alwaysApply: false");
	});

	it("exports multiple globs as inline array", async () => {
		const rules = [
			makeRule({
				scope: "file-scoped",
				globs: ["**/*.test.ts", "**/*.spec.ts"],
			}),
		];
		await cursorAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(content).toContain('globs: ["**/*.test.ts", "**/*.spec.ts"]');
	});

	it("exports agent-selected rule without globs", async () => {
		const rules = [makeRule({ scope: "agent-selected" })];
		await cursorAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(content).toContain("alwaysApply: false");
		expect(content).not.toContain("globs:");
	});

	it("deletes stale files in overwrite mode", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "old-rule.mdc"), "old content");

		const rules = [makeRule({ id: "new-rule" })];
		const result = await cursorAdapter.export(rules, tmpDir, {
			strategy: "overwrite",
		});

		expect(result.filesDeleted).toHaveLength(1);
		expect(result.filesDeleted[0]).toContain("old-rule.mdc");
	});

	it("preserves existing files in merge mode", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "existing.mdc"), "existing content");

		const rules = [makeRule({ id: "new-rule" })];
		const result = await cursorAdapter.export(rules, tmpDir, {
			strategy: "merge",
		});

		expect(result.filesDeleted).toHaveLength(0);
		const existing = await readFile(join(dir, "existing.mdc"), "utf-8");
		expect(existing).toBe("existing content");
	});

	it("supports dry run without writing files", async () => {
		const rules = [makeRule({ id: "dry-rule" })];
		const result = await cursorAdapter.export(rules, tmpDir, {
			strategy: "overwrite",
			dryRun: true,
		});

		expect(result.filesWritten).toHaveLength(1);
		const exists = await readFile(
			join(tmpDir, ".cursor/rules/dry-rule.mdc"),
			"utf-8",
		).catch(() => null);
		expect(exists).toBeNull();
	});

	it("creates .cursor/rules directory if needed", async () => {
		const rules = [makeRule()];
		await cursorAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(content).toBeDefined();
	});
});

// ─── getTokenBudget ──────────────────────────────────────────────

describe("getTokenBudget", () => {
	it("returns Cursor token budget", () => {
		const budget = cursorAdapter.getTokenBudget();
		expect(budget.maxTokens).toBe(5_000);
		expect(budget.warningThreshold).toBe(0.8);
	});
});

// ─── Round-trip ──────────────────────────────────────────────────

describe("round-trip: export then import", () => {
	it("preserves rule fields through export and import", async () => {
		const original = makeRule({
			id: "round-trip",
			scope: "always",
			description: "Round-trip test",
			content: "Do this and that.",
		});

		await cursorAdapter.export([original], tmpDir);
		const result = await cursorAdapter.import(tmpDir);

		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.id).toBe("round-trip");
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.rules[0]?.description).toBe("Round-trip test");
		expect(result.rules[0]?.content).toBe("Do this and that.");
	});

	it("preserves file-scoped globs through round-trip", async () => {
		const original = makeRule({
			id: "glob-trip",
			scope: "file-scoped",
			description: "Glob test",
			content: "Content here.",
			globs: ["**/*.ts", "**/*.tsx"],
		});

		await cursorAdapter.export([original], tmpDir);
		const result = await cursorAdapter.import(tmpDir);

		expect(result.rules[0]?.scope).toBe("file-scoped");
		expect(result.rules[0]?.globs).toEqual(["**/*.ts", "**/*.tsx"]);
	});
});
