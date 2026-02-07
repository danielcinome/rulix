import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	exportRules,
	getTokenBudget,
	importRules,
	loadRuleset,
	validateRuleset,
} from "../src/api.js";
import type { Rule } from "../src/core/ir.js";
import { RulixError } from "../src/core/ir.js";
import { writeRule } from "../src/core/parser.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = join(tmpdir(), `rulix-api-test-${Date.now()}`);
	await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

function makeRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "api-test",
		scope: "always",
		description: "A test rule for API testing",
		content: "This is sufficient content for validation.",
		category: "style",
		priority: 1,
		estimatedTokens: 15,
		...overrides,
	};
}

// ─── loadRuleset ─────────────────────────────────────────────────

describe("loadRuleset", () => {
	it("loads config and rules from a project", async () => {
		await writeRule(tmpDir, makeRule());

		const ruleset = await loadRuleset(tmpDir);
		expect(ruleset.config).toBeDefined();
		expect(ruleset.rules).toHaveLength(1);
		expect(ruleset.rules[0]?.id).toBe("api-test");
	});

	it("returns empty rules when no rules directory exists", async () => {
		const ruleset = await loadRuleset(tmpDir);
		expect(ruleset.rules).toHaveLength(0);
	});

	it("returns default config when no config file exists", async () => {
		const ruleset = await loadRuleset(tmpDir);
		expect(ruleset.config.targets).toEqual([]);
	});
});

// ─── importRules ─────────────────────────────────────────────────

describe("importRules", () => {
	it("imports rules from an adapter", async () => {
		await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });
		const { writeFile } = await import("node:fs/promises");
		await writeFile(
			join(tmpDir, ".cursor/rules/test.mdc"),
			`---
description: "Test rule"
alwaysApply: true
---

Content here.
`,
		);

		const result = await importRules("cursor", tmpDir);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.id).toBe("test");
	});

	it("throws for unknown adapter", async () => {
		await expect(importRules("nonexistent", tmpDir)).rejects.toThrow(
			RulixError,
		);
	});
});

// ─── exportRules ─────────────────────────────────────────────────

describe("exportRules", () => {
	it("exports rules to an adapter", async () => {
		const rules = [makeRule()];
		const result = await exportRules("cursor", rules, tmpDir);
		expect(result.filesWritten.length).toBeGreaterThan(0);
	});

	it("supports dry run", async () => {
		const rules = [makeRule()];
		const result = await exportRules("cursor", rules, tmpDir, {
			strategy: "overwrite",
			dryRun: true,
		});
		expect(result.filesWritten.length).toBeGreaterThan(0);
	});

	it("throws for unknown adapter", async () => {
		await expect(exportRules("nonexistent", [], tmpDir)).rejects.toThrow(
			RulixError,
		);
	});
});

// ─── validateRuleset ─────────────────────────────────────────────

describe("validateRuleset", () => {
	it("validates a valid ruleset", async () => {
		await writeRule(tmpDir, makeRule());
		const ruleset = await loadRuleset(tmpDir);

		const result = validateRuleset(ruleset);
		expect(result.passed).toBe(true);
	});

	it("catches validation errors", async () => {
		const ruleset = {
			rules: [makeRule({ scope: "file-scoped" })],
			config: (await loadRuleset(tmpDir)).config,
		};

		const result = validateRuleset(ruleset);
		expect(result.passed).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

// ─── getTokenBudget ──────────────────────────────────────────────

describe("getTokenBudget", () => {
	it("returns budget usage for an adapter", () => {
		const rules = [makeRule({ estimatedTokens: 500 })];
		const usage = getTokenBudget("claude-code", rules);

		expect(usage.used).toBe(500);
		expect(usage.max).toBe(2_000);
		expect(usage.percentage).toBe(25);
		expect(usage.exceeded).toBe(false);
	});

	it("detects exceeded budget", () => {
		const rules = [makeRule({ estimatedTokens: 3_000 })];
		const usage = getTokenBudget("claude-code", rules);

		expect(usage.exceeded).toBe(true);
		expect(usage.percentage).toBe(150);
	});

	it("throws for unknown adapter", () => {
		expect(() => getTokenBudget("nonexistent", [])).toThrow(RulixError);
	});
});
