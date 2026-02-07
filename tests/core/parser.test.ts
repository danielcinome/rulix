import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	loadRules,
	parseRule,
	serializeRule,
	writeRule,
} from "../../src/core/parser.js";

// ─── Fixtures ────────────────────────────────────────────────────

const ALWAYS_RULE_MD = `---
id: typescript-strict
scope: always
description: "Enforce strict TypeScript conventions"
category: style
priority: 1
---

# TypeScript

- Use strict mode
- No any types
`;

const FILE_SCOPED_RULE_MD = `---
id: testing-conventions
scope: file-scoped
description: "Testing conventions for test files"
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
category: testing
priority: 2
---

# Testing

- Use describe/it blocks
`;

const AGENT_SELECTED_RULE_MD = `---
id: security-review
scope: agent-selected
description: "Security guidelines"
category: security
priority: 1
---

# Security

- Validate all inputs
`;

const MINIMAL_RULE_MD = `---
id: minimal
scope: always
description: "A minimal rule"
---

Minimal content.
`;

// ─── parseRule ────────────────────────────────────────────────────

describe("parseRule", () => {
	it("parses an always-scoped rule", () => {
		const result = parseRule(ALWAYS_RULE_MD, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.id).toBe("typescript-strict");
		expect(result.value.scope).toBe("always");
		expect(result.value.description).toBe(
			"Enforce strict TypeScript conventions",
		);
		expect(result.value.category).toBe("style");
		expect(result.value.priority).toBe(1);
		expect(result.value.content).toContain("# TypeScript");
		expect(result.value.globs).toBeUndefined();
	});

	it("parses a file-scoped rule with multi-line globs", () => {
		const result = parseRule(FILE_SCOPED_RULE_MD, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.scope).toBe("file-scoped");
		expect(result.value.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);
	});

	it("parses a single-string glob", () => {
		const md = `---
id: single-glob
scope: file-scoped
description: "Single glob"
globs: "**/*.ts"
---

Content.
`;
		const result = parseRule(md, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.globs).toEqual(["**/*.ts"]);
	});

	it("parses an inline array glob", () => {
		const md = `---
id: inline-globs
scope: file-scoped
description: "Inline globs"
globs: ["**/*.ts", "**/*.tsx"]
---

Content.
`;
		const result = parseRule(md, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.globs).toEqual(["**/*.ts", "**/*.tsx"]);
	});

	it("fills default category and priority when omitted", () => {
		const result = parseRule(MINIMAL_RULE_MD, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.category).toBe("general");
		expect(result.value.priority).toBe(3);
	});

	it("parses the extends field", () => {
		const md = `---
id: extended
scope: always
description: "Extended rule"
extends: "@rulix/typescript/strict"
---

Content.
`;
		const result = parseRule(md, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.extends).toBe("@rulix/typescript/strict");
	});

	it("computes estimatedTokens", () => {
		const result = parseRule(ALWAYS_RULE_MD, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.estimatedTokens).toBeGreaterThan(0);
	});

	it("handles Windows line endings", () => {
		const md =
			'---\r\nid: win\r\nscope: always\r\ndescription: "Windows"\r\n---\r\n\r\nContent.\r\n';
		const result = parseRule(md, "test.md");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.id).toBe("win");
	});

	describe("error cases", () => {
		it("rejects file without frontmatter", () => {
			const result = parseRule("# Just markdown", "test.md");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.message).toContain("frontmatter");
			expect(result.error.message).toContain("test.md");
		});

		it("rejects unterminated frontmatter", () => {
			const result = parseRule("---\nid: broken\nscope: always\n", "test.md");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.message).toContain("closing");
		});

		it("rejects missing id", () => {
			const md = `---
scope: always
description: "No id"
---

Content.
`;
			const result = parseRule(md, "test.md");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.message).toContain("id");
		});

		it("rejects invalid scope", () => {
			const md = `---
id: bad-scope
scope: invalid
description: "Bad scope"
---

Content.
`;
			const result = parseRule(md, "test.md");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.message).toContain("scope");
		});

		it("rejects missing description", () => {
			const md = `---
id: no-desc
scope: always
---

Content.
`;
			const result = parseRule(md, "test.md");
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.message).toContain("description");
		});
	});
});

// ─── serializeRule ───────────────────────────────────────────────

describe("serializeRule", () => {
	it("serializes an always rule", () => {
		const output = serializeRule({
			id: "my-rule",
			scope: "always",
			description: "My rule",
			content: "# Rule\n\n- Do this",
			category: "style",
			priority: 1,
			estimatedTokens: 10,
		});
		expect(output).toContain("---");
		expect(output).toContain("id: my-rule");
		expect(output).toContain("scope: always");
		expect(output).toContain('description: "My rule"');
		expect(output).toContain("category: style");
		expect(output).toContain("priority: 1");
		expect(output).toContain("# Rule");
		expect(output).not.toContain("globs");
	});

	it("serializes a single glob inline", () => {
		const output = serializeRule({
			id: "single",
			scope: "file-scoped",
			description: "Single",
			content: "Content",
			globs: ["**/*.ts"],
			category: "general",
			priority: 3,
			estimatedTokens: 5,
		});
		expect(output).toContain('globs: "**/*.ts"');
	});

	it("serializes multiple globs as multi-line array", () => {
		const output = serializeRule({
			id: "multi",
			scope: "file-scoped",
			description: "Multi",
			content: "Content",
			globs: ["**/*.ts", "**/*.tsx"],
			category: "general",
			priority: 3,
			estimatedTokens: 5,
		});
		expect(output).toContain("globs:");
		expect(output).toContain('  - "**/*.ts"');
		expect(output).toContain('  - "**/*.tsx"');
	});

	it("serializes extends field", () => {
		const output = serializeRule({
			id: "ext",
			scope: "always",
			description: "Ext",
			content: "Content",
			extends: "@rulix/typescript/strict",
			category: "general",
			priority: 3,
			estimatedTokens: 5,
		});
		expect(output).toContain("extends: @rulix/typescript/strict");
	});
});

// ─── Round-trip ──────────────────────────────────────────────────

describe("round-trip: parseRule(serializeRule(rule))", () => {
	it("preserves all fields for an always rule", () => {
		const original = parseRule(ALWAYS_RULE_MD, "test.md");
		expect(original.ok).toBe(true);
		if (!original.ok) return;

		const serialized = serializeRule(original.value);
		const roundTripped = parseRule(serialized, "test.md");
		expect(roundTripped.ok).toBe(true);
		if (!roundTripped.ok) return;

		expect(roundTripped.value.id).toBe(original.value.id);
		expect(roundTripped.value.scope).toBe(original.value.scope);
		expect(roundTripped.value.description).toBe(original.value.description);
		expect(roundTripped.value.category).toBe(original.value.category);
		expect(roundTripped.value.priority).toBe(original.value.priority);
		expect(roundTripped.value.content).toBe(original.value.content);
	});

	it("preserves globs through round-trip", () => {
		const original = parseRule(FILE_SCOPED_RULE_MD, "test.md");
		expect(original.ok).toBe(true);
		if (!original.ok) return;

		const serialized = serializeRule(original.value);
		const roundTripped = parseRule(serialized, "test.md");
		expect(roundTripped.ok).toBe(true);
		if (!roundTripped.ok) return;

		expect(roundTripped.value.globs).toEqual(original.value.globs);
	});
});

// ─── I/O: loadRules & writeRule ──────────────────────────────────

describe("loadRules and writeRule", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = join(tmpdir(), `rulix-parser-test-${Date.now()}`);
		await mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns empty array when rules directory does not exist", async () => {
		const result = await loadRules(tmpDir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual([]);
	});

	it("writes and reads back a rule", async () => {
		const rule = parseRule(ALWAYS_RULE_MD, "test.md");
		expect(rule.ok).toBe(true);
		if (!rule.ok) return;

		await writeRule(tmpDir, rule.value);
		const result = await loadRules(tmpDir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toHaveLength(1);
		expect(result.value[0]?.id).toBe("typescript-strict");
	});

	it("loads multiple rules sorted by filename", async () => {
		const ruleA = parseRule(ALWAYS_RULE_MD, "a.md");
		const ruleB = parseRule(AGENT_SELECTED_RULE_MD, "b.md");
		expect(ruleA.ok && ruleB.ok).toBe(true);
		if (!ruleA.ok || !ruleB.ok) return;

		await writeRule(tmpDir, ruleA.value);
		await writeRule(tmpDir, ruleB.value);

		const result = await loadRules(tmpDir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toHaveLength(2);
	});

	it("returns error when a rule file is invalid", async () => {
		await writeRule(tmpDir, {
			id: "valid",
			scope: "always",
			description: "Valid",
			content: "Content",
			category: "general",
			priority: 3,
			estimatedTokens: 5,
		});

		// Write a broken file directly
		const { writeFile: fsWrite } = await import("node:fs/promises");
		const { rulesPath } = await import("../../src/core/config.js");
		await fsWrite(join(rulesPath(tmpDir), "broken.md"), "not frontmatter");

		const result = await loadRules(tmpDir);
		expect(result.ok).toBe(false);
	});
});
