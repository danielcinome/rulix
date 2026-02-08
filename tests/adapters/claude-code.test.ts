import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeCodeAdapter } from "../../src/adapters/claude-code.js";
import type { Rule } from "../../src/core/ir.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = join(tmpdir(), `rulix-claude-code-test-${Date.now()}`);
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
		expect(await claudeCodeAdapter.detect(tmpDir)).toBe(false);
	});

	it("returns true when CLAUDE.md exists", async () => {
		await writeFile(join(tmpDir, "CLAUDE.md"), "# Instructions");
		expect(await claudeCodeAdapter.detect(tmpDir)).toBe(true);
	});

	it("returns true when .claude/ directory exists", async () => {
		await mkdir(join(tmpDir, ".claude"), { recursive: true });
		expect(await claudeCodeAdapter.detect(tmpDir)).toBe(true);
	});
});

// ─── import: .claude/rules/ ─────────────────────────────────────

describe("import .claude/rules/", () => {
	it("returns empty rules when directory does not exist", async () => {
		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(0);
	});

	it("imports rule file with paths: frontmatter as file-scoped", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "test-files.md"),
			`---
paths: "**/*.test.ts"
---

Use describe/it blocks.
`,
		);

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.scope).toBe("file-scoped");
		expect(result.rules[0]?.globs).toEqual(["**/*.test.ts"]);
		expect(result.rules[0]?.id).toBe("test-files");
	});

	it("imports rule file with inline array paths", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "tests.md"),
			`---
paths: ["**/*.test.ts", "**/*.spec.ts"]
---

Content.
`,
		);

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules[0]?.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);
	});

	it("imports rule file without frontmatter as always-scoped", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "general.md"), "Always apply this.");

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.rules[0]?.globs).toBeUndefined();
	});

	it("imports rule file with description: frontmatter as agent-selected", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "security.md"),
			`---
description: "Security guidelines for auth code"
---

Validate all inputs.
`,
		);

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules[0]?.scope).toBe("agent-selected");
		expect(result.rules[0]?.description).toBe(
			"Security guidelines for auth code",
		);
	});

	it("derives description from filename for always-scoped rules", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "my-coding-style.md"), "Content here.");

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules[0]?.description).toBe("my coding style");
	});

	it("does not import from CLAUDE.md", async () => {
		await writeFile(
			join(tmpDir, "CLAUDE.md"),
			"## TypeScript\n\nUse strict mode.\n",
		);

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules).toHaveLength(0);
	});

	it("sets source metadata on imported rules", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "rule.md"), "Content here.");

		const result = await claudeCodeAdapter.import(tmpDir);
		expect(result.rules[0]?.source?.adapter).toBe("claude-code");
		expect(result.rules[0]?.source?.filePath).toContain(
			".claude/rules/rule.md",
		);
	});
});

// ─── export ──────────────────────────────────────────────────────

describe("export", () => {
	it("writes always rules to .claude/rules/ without frontmatter", async () => {
		const rules = [
			makeRule({ id: "rule-a", description: "Rule A", content: "Do A." }),
		];
		const result = await claudeCodeAdapter.export(rules, tmpDir);

		expect(result.filesWritten).toContain(".claude/rules/rule-a.md");
		const content = await readFile(
			join(tmpDir, ".claude/rules/rule-a.md"),
			"utf-8",
		);
		expect(content).toBe("Do A.\n");
		expect(content).not.toContain("---");
	});

	it("writes file-scoped rules with paths: frontmatter", async () => {
		const rules = [
			makeRule({
				id: "test-rules",
				scope: "file-scoped",
				description: "Testing",
				content: "Use vitest.",
				globs: ["**/*.test.ts"],
			}),
		];
		const result = await claudeCodeAdapter.export(rules, tmpDir);

		expect(result.filesWritten).toContain(".claude/rules/test-rules.md");
		const content = await readFile(
			join(tmpDir, ".claude/rules/test-rules.md"),
			"utf-8",
		);
		expect(content).toContain('paths: "**/*.test.ts"');
		expect(content).toContain("Use vitest.");
	});

	it("writes file-scoped rule with multiple paths as inline array", async () => {
		const rules = [
			makeRule({
				id: "tests",
				scope: "file-scoped",
				content: "Content.",
				globs: ["**/*.test.ts", "**/*.spec.ts"],
			}),
		];
		await claudeCodeAdapter.export(rules, tmpDir);

		const content = await readFile(
			join(tmpDir, ".claude/rules/tests.md"),
			"utf-8",
		);
		expect(content).toContain('paths: ["**/*.test.ts", "**/*.spec.ts"]');
	});

	it("writes agent-selected rules with description: frontmatter", async () => {
		const rules = [
			makeRule({
				id: "security",
				scope: "agent-selected",
				description: "Security Review",
				content: "Validate inputs.",
			}),
		];
		const result = await claudeCodeAdapter.export(rules, tmpDir);

		expect(result.filesWritten).toContain(".claude/rules/security.md");
		const content = await readFile(
			join(tmpDir, ".claude/rules/security.md"),
			"utf-8",
		);
		expect(content).toContain('description: "Security Review"');
		expect(content).toContain("Validate inputs.");
	});

	it("never generates CLAUDE.md", async () => {
		const rules = [
			makeRule({ id: "rule-a", description: "Rule A", content: "Do A." }),
			makeRule({
				id: "rule-b",
				scope: "agent-selected",
				description: "Rule B",
				content: "Do B.",
			}),
		];
		const result = await claudeCodeAdapter.export(rules, tmpDir);

		expect(result.filesWritten).not.toContain("CLAUDE.md");
		const exists = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8").catch(
			() => null,
		);
		expect(exists).toBeNull();
	});

	it("deletes stale .claude/rules/ files in overwrite mode", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "old-rule.md"), "old content");

		const rules = [makeRule({ id: "new-rule" })];
		const result = await claudeCodeAdapter.export(rules, tmpDir, {
			strategy: "overwrite",
		});

		expect(result.filesDeleted).toHaveLength(1);
		expect(result.filesDeleted[0]).toContain("old-rule.md");
	});

	it("preserves files in merge mode", async () => {
		const dir = join(tmpDir, ".claude/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "existing.md"), "existing content");

		const rules = [makeRule({ id: "new-rule" })];
		const result = await claudeCodeAdapter.export(rules, tmpDir, {
			strategy: "merge",
		});

		expect(result.filesDeleted).toHaveLength(0);
	});

	it("supports dry run without writing files", async () => {
		const rules = [makeRule({ id: "dry" })];
		const result = await claudeCodeAdapter.export(rules, tmpDir, {
			strategy: "overwrite",
			dryRun: true,
		});

		expect(result.filesWritten).toHaveLength(1);
		const exists = await readFile(
			join(tmpDir, ".claude/rules/dry.md"),
			"utf-8",
		).catch(() => null);
		expect(exists).toBeNull();
	});

	it("exports all scopes to .claude/rules/", async () => {
		const rules = [
			makeRule({ id: "always-rule", scope: "always" }),
			makeRule({
				id: "scoped-rule",
				scope: "file-scoped",
				globs: ["**/*.ts"],
			}),
			makeRule({
				id: "agent-rule",
				scope: "agent-selected",
				description: "Agent rule",
			}),
		];
		const result = await claudeCodeAdapter.export(rules, tmpDir);

		expect(result.filesWritten).toHaveLength(3);
		expect(result.filesWritten).toContain(".claude/rules/always-rule.md");
		expect(result.filesWritten).toContain(".claude/rules/scoped-rule.md");
		expect(result.filesWritten).toContain(".claude/rules/agent-rule.md");
	});
});

// ─── getTokenBudget ──────────────────────────────────────────────

describe("getTokenBudget", () => {
	it("returns Claude Code token budget", () => {
		const budget = claudeCodeAdapter.getTokenBudget();
		expect(budget.maxTokens).toBe(4_000);
		expect(budget.warningThreshold).toBe(0.8);
	});
});

// ─── Round-trip ──────────────────────────────────────────────────

describe("round-trip: export then import", () => {
	it("preserves always-scoped rules through round-trip", async () => {
		const original = makeRule({
			id: "round-trip",
			description: "Round Trip Test",
			content: "Do this.",
		});

		await claudeCodeAdapter.export([original], tmpDir);
		const result = await claudeCodeAdapter.import(tmpDir);

		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.scope).toBe("always");
		expect(result.rules[0]?.content).toBe("Do this.");
	});

	it("preserves agent-selected rules through round-trip", async () => {
		const original = makeRule({
			id: "context-rule",
			scope: "agent-selected",
			description: "Security Guidelines",
			content: "Validate inputs.",
		});

		await claudeCodeAdapter.export([original], tmpDir);
		const result = await claudeCodeAdapter.import(tmpDir);

		expect(result.rules[0]?.scope).toBe("agent-selected");
		expect(result.rules[0]?.description).toBe("Security Guidelines");
	});

	it("preserves file-scoped rules through round-trip", async () => {
		const original = makeRule({
			id: "scoped-trip",
			scope: "file-scoped",
			description: "Test Rules",
			content: "Use vitest.",
			globs: ["**/*.test.ts"],
		});

		await claudeCodeAdapter.export([original], tmpDir);
		const result = await claudeCodeAdapter.import(tmpDir);

		const scoped = result.rules.find((r) => r.id === "scoped-trip");
		expect(scoped?.scope).toBe("file-scoped");
		expect(scoped?.globs).toEqual(["**/*.test.ts"]);
	});
});
