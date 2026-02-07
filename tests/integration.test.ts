/**
 * Integration tests: round-trip import → IR → export → import.
 *
 * These tests use the fixture files in `tests/fixtures/` to verify
 * that adapters can faithfully import, export, and re-import rules
 * without losing or corrupting data.
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsMdAdapter } from "../src/adapters/agents-md.js";
import { claudeCodeAdapter } from "../src/adapters/claude-code.js";
import { cursorAdapter } from "../src/adapters/cursor.js";
import type { Rule } from "../src/core/ir.js";
import {
	loadRules,
	parseRule,
	serializeRule,
	writeRule,
} from "../src/core/parser.js";
import { validateRules } from "../src/core/validator.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

// ─── Helpers ──────────────────────────────────────────────────────

/** Create a temporary directory for test output. */
function makeTmpDir(): string {
	return join(
		tmpdir(),
		`rulix-integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
}

/**
 * Strip volatile fields (estimatedTokens, source) so we can compare
 * structural equality between imported rules.
 */
function stripVolatile(rule: Rule): Omit<Rule, "estimatedTokens" | "source"> {
	const { estimatedTokens: _t, source: _s, ...rest } = rule;
	return rest;
}

/**
 * Build three canonical rules that match the fixture files.
 * These are the "source of truth" for round-trip tests.
 */
function makeCanonicalRules(): Rule[] {
	return [
		{
			id: "typescript-strict",
			scope: "always",
			description: "Enforce strict TypeScript conventions",
			content:
				"# TypeScript Conventions\n\n- Always use `strict: true` in tsconfig\n- Never use `any` — prefer `unknown` with type narrowing\n- Use explicit return types on public functions\n- Prefer `interface` over `type` for object shapes",
			category: "style",
			priority: 1,
			estimatedTokens: 0,
		},
		{
			id: "testing-conventions",
			scope: "file-scoped",
			description: "Testing conventions for test files",
			content:
				'# Testing\n\n- Use `describe`/`it` blocks for structure\n- One assertion per test when possible\n- Name tests with "should" pattern',
			globs: ["**/*.test.ts", "**/*.spec.ts"],
			category: "testing",
			priority: 2,
			estimatedTokens: 0,
		},
		{
			id: "security-review",
			scope: "agent-selected",
			description: "Security guidelines for sensitive code",
			content:
				"- Validate all user input\n- Use parameterized queries\n- Never log secrets or tokens",
			category: "security",
			priority: 3,
			estimatedTokens: 0,
		},
	];
}

// ─── Test Suite ───────────────────────────────────────────────────

describe("Integration: Rulix canonical format", () => {
	it("should parse all fixture rules from .rulix/rules/", async () => {
		const result = await loadRules(join(FIXTURES, "rulix"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.value).toHaveLength(3);
		const ids = result.value.map((r) => r.id).sort();
		expect(ids).toEqual([
			"security-review",
			"testing-conventions",
			"typescript-strict",
		]);
	});

	it("should validate fixture rules without errors", async () => {
		const result = await loadRules(join(FIXTURES, "rulix"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const validation = validateRules(result.value);
		expect(validation.passed).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});

	it("should round-trip serialize → parse without loss", async () => {
		const result = await loadRules(join(FIXTURES, "rulix"));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		for (const rule of result.value) {
			const serialized = serializeRule(rule);
			const parsed = parseRule(serialized, `${rule.id}.md`);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) continue;
			expect(stripVolatile(parsed.value)).toEqual(stripVolatile(rule));
		}
	});
});

describe("Integration: Cursor round-trip", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = makeTmpDir();
		await mkdir(tmp, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it("should import fixture rules from .cursor/rules/", async () => {
		const result = await cursorAdapter.import(join(FIXTURES, "cursor"));
		expect(result.rules).toHaveLength(3);

		const ids = result.rules.map((r) => r.id).sort();
		expect(ids).toEqual([
			"security-review",
			"testing-conventions",
			"typescript-strict",
		]);
	});

	it("should map Cursor scopes correctly", async () => {
		const result = await cursorAdapter.import(join(FIXTURES, "cursor"));
		const byId = new Map(result.rules.map((r) => [r.id, r]));

		const ts = byId.get("typescript-strict");
		expect(ts?.scope).toBe("always");

		const test = byId.get("testing-conventions");
		expect(test?.scope).toBe("file-scoped");
		expect(test?.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);

		const sec = byId.get("security-review");
		expect(sec?.scope).toBe("agent-selected");
	});

	it("should round-trip: export canonical → import → same IR", async () => {
		const canonical = makeCanonicalRules();
		await cursorAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const imported = await cursorAdapter.import(tmp);
		expect(imported.rules).toHaveLength(3);

		const sortedCanonical = [...canonical].sort((a, b) =>
			a.id.localeCompare(b.id),
		);
		const sortedImported = [...imported.rules].sort((a, b) =>
			a.id.localeCompare(b.id),
		);

		for (let i = 0; i < sortedCanonical.length; i++) {
			const canon = sortedCanonical[i];
			const imp = sortedImported[i];
			if (!canon || !imp) continue;
			expect(imp.id).toBe(canon.id);
			expect(imp.scope).toBe(canon.scope);
			expect(imp.content).toBe(canon.content);
			if (canon.globs) {
				expect(imp.globs).toEqual(canon.globs);
			}
		}
	});

	it("should export then import with description fidelity", async () => {
		const canonical = makeCanonicalRules();
		await cursorAdapter.export(canonical, tmp, { strategy: "overwrite" });
		const imported = await cursorAdapter.import(tmp);

		const byId = new Map(imported.rules.map((r) => [r.id, r]));
		for (const rule of canonical) {
			expect(byId.get(rule.id)?.description).toBe(rule.description);
		}
	});
});

describe("Integration: Claude Code round-trip", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = makeTmpDir();
		await mkdir(tmp, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it("should import fixture rules from CLAUDE.md and .claude/rules/", async () => {
		const result = await claudeCodeAdapter.import(
			join(FIXTURES, "claude-code"),
		);
		expect(result.rules.length).toBeGreaterThanOrEqual(2);

		const ids = result.rules.map((r) => r.id);
		expect(ids).toContain("testing-conventions");
		// CLAUDE.md has "TypeScript Conventions" and "Context: Security Review"
		const hasTs = result.rules.some((r) => r.id === "typescript-conventions");
		const hasSec = result.rules.some((r) => r.id === "security-review");
		expect(hasTs).toBe(true);
		expect(hasSec).toBe(true);
	});

	it("should detect Context: prefix as agent-selected", async () => {
		const result = await claudeCodeAdapter.import(
			join(FIXTURES, "claude-code"),
		);
		const security = result.rules.find((r) => r.id === "security-review");
		expect(security?.scope).toBe("agent-selected");
	});

	it("should detect .claude/rules/ paths as file-scoped", async () => {
		const result = await claudeCodeAdapter.import(
			join(FIXTURES, "claude-code"),
		);
		const testing = result.rules.find((r) => r.id === "testing-conventions");
		expect(testing?.scope).toBe("file-scoped");
		expect(testing?.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);
	});

	it("should round-trip: export canonical → import → same IR", async () => {
		const canonical = makeCanonicalRules();
		await claudeCodeAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const imported = await claudeCodeAdapter.import(tmp);

		// always + agent-selected go to CLAUDE.md, file-scoped to .claude/rules/
		const byScope = {
			always: imported.rules.filter((r) => r.scope === "always"),
			fileScoped: imported.rules.filter((r) => r.scope === "file-scoped"),
			agentSelected: imported.rules.filter((r) => r.scope === "agent-selected"),
		};

		expect(byScope.always.length).toBeGreaterThanOrEqual(1);
		expect(byScope.fileScoped).toHaveLength(1);
		expect(byScope.agentSelected).toHaveLength(1);

		// File-scoped content should match
		const fileScoped = byScope.fileScoped[0];
		const canonFileScoped = canonical.find((r) => r.scope === "file-scoped");
		expect(fileScoped?.content).toBe(canonFileScoped?.content);
		expect(fileScoped?.globs).toEqual(canonFileScoped?.globs);

		// Agent-selected content should match
		const agentSel = byScope.agentSelected[0];
		const canonAgentSel = canonical.find((r) => r.scope === "agent-selected");
		expect(agentSel?.content).toBe(canonAgentSel?.content);
	});

	it("should generate CLAUDE.md with correct section headers", async () => {
		const canonical = makeCanonicalRules();
		await claudeCodeAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const content = await readFile(join(tmp, "CLAUDE.md"), "utf-8");
		expect(content).toContain("## Enforce strict TypeScript conventions");
		expect(content).toContain(
			"## Context: Security guidelines for sensitive code",
		);
	});
});

describe("Integration: AGENTS.md export", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = makeTmpDir();
		await mkdir(tmp, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it("should export canonical rules to AGENTS.md", async () => {
		const canonical = makeCanonicalRules();
		const result = await agentsMdAdapter.export(canonical, tmp, {
			strategy: "overwrite",
		});

		expect(result.filesWritten).toEqual(["AGENTS.md"]);
	});

	it("should include generated header", async () => {
		const canonical = makeCanonicalRules();
		await agentsMdAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const content = await readFile(join(tmp, "AGENTS.md"), "utf-8");
		expect(content).toContain("<!-- Generated by Rulix");
	});

	it("should group rules by category with H2 headers", async () => {
		const canonical = makeCanonicalRules();
		await agentsMdAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const content = await readFile(join(tmp, "AGENTS.md"), "utf-8");
		// Only always + file-scoped are exported: style (always) and testing (file-scoped)
		expect(content).toContain("## Style");
		expect(content).toContain("## Testing");
	});

	it("should exclude agent-selected rules from AGENTS.md", async () => {
		const canonical = makeCanonicalRules();
		await agentsMdAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const content = await readFile(join(tmp, "AGENTS.md"), "utf-8");
		// The agent-selected "Security guidelines" rule content should NOT appear
		// but the file-scoped security rule from "testing" category should be there
		expect(content).not.toContain("Security guidelines for sensitive code");
	});

	it("should order categories by CATEGORY_ORDER", async () => {
		const canonical = makeCanonicalRules();
		await agentsMdAdapter.export(canonical, tmp, { strategy: "overwrite" });

		const content = await readFile(join(tmp, "AGENTS.md"), "utf-8");
		// Style comes before Testing in CATEGORY_ORDER
		const styleIdx = content.indexOf("## Style");
		const testingIdx = content.indexOf("## Testing");
		expect(styleIdx).toBeGreaterThan(-1);
		expect(testingIdx).toBeGreaterThan(-1);
		expect(styleIdx).toBeLessThan(testingIdx);
	});
});

describe("Integration: cross-adapter sync", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = makeTmpDir();
		await mkdir(tmp, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it("should sync Rulix rules to all three adapters", async () => {
		const canonical = makeCanonicalRules();

		const cursorResult = await cursorAdapter.export(canonical, tmp, {
			strategy: "overwrite",
		});
		const claudeResult = await claudeCodeAdapter.export(canonical, tmp, {
			strategy: "overwrite",
		});
		const agentsResult = await agentsMdAdapter.export(canonical, tmp, {
			strategy: "overwrite",
		});

		expect(cursorResult.filesWritten).toHaveLength(3);
		expect(claudeResult.filesWritten.length).toBeGreaterThanOrEqual(2);
		expect(agentsResult.filesWritten).toHaveLength(1);
	});

	it("should import from Cursor → write to Rulix → export to Claude Code", async () => {
		// Step 1: Import from Cursor fixtures
		const cursorImport = await cursorAdapter.import(join(FIXTURES, "cursor"));
		expect(cursorImport.rules.length).toBeGreaterThanOrEqual(3);

		// Step 2: Write to .rulix/rules/
		for (const rule of cursorImport.rules) {
			await writeRule(tmp, rule);
		}

		// Step 3: Load back from .rulix/rules/
		const loaded = await loadRules(tmp);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;
		expect(loaded.value).toHaveLength(cursorImport.rules.length);

		// Step 4: Export to Claude Code
		const claudeResult = await claudeCodeAdapter.export(loaded.value, tmp, {
			strategy: "overwrite",
		});
		expect(claudeResult.filesWritten.length).toBeGreaterThanOrEqual(1);

		// Step 5: Import back from Claude Code and verify
		const claudeImport = await claudeCodeAdapter.import(tmp);
		expect(claudeImport.rules.length).toBeGreaterThanOrEqual(1);

		// All scopes should be preserved
		const scopes = new Set(claudeImport.rules.map((r) => r.scope));
		expect(scopes.has("always")).toBe(true);
	});

	it("should preserve rule content through Cursor → Rulix → Cursor round-trip", async () => {
		// Step 1: Import from Cursor
		const initial = await cursorAdapter.import(join(FIXTURES, "cursor"));

		// Step 2: Write to Rulix canonical format
		for (const rule of initial.rules) {
			await writeRule(tmp, rule);
		}

		// Step 3: Load from Rulix
		const loaded = await loadRules(tmp);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;

		// Step 4: Export back to Cursor
		const exportTmp = join(tmp, "cursor-out");
		await mkdir(exportTmp, { recursive: true });
		await cursorAdapter.export(loaded.value, exportTmp, {
			strategy: "overwrite",
		});

		// Step 5: Import from Cursor again
		const reimported = await cursorAdapter.import(exportTmp);

		// Step 6: Compare content (ignoring volatile fields)
		const initialById = new Map(initial.rules.map((r) => [r.id, r]));
		for (const rule of reimported.rules) {
			const original = initialById.get(rule.id);
			expect(original).toBeDefined();
			if (!original) continue;
			expect(rule.scope).toBe(original.scope);
			expect(rule.content).toBe(original.content);
			if (original.globs) {
				expect(rule.globs).toEqual(original.globs);
			}
		}
	});

	it("should dry-run export without writing files", async () => {
		const canonical = makeCanonicalRules();

		const result = await cursorAdapter.export(canonical, tmp, {
			strategy: "overwrite",
			dryRun: true,
		});

		expect(result.filesWritten).toHaveLength(3);

		// Verify no files were actually written
		const cursorDir = join(tmp, ".cursor", "rules");
		await expect(
			readFile(join(cursorDir, "typescript-strict.mdc"), "utf-8"),
		).rejects.toThrow();
	});
});
