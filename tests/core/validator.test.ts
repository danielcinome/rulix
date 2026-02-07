import { describe, expect, it } from "vitest";
import type { Rule } from "../../src/core/ir.js";
import { validateRules } from "../../src/core/validator.js";

function makeRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "test-rule",
		scope: "always",
		description: "A valid test rule for validation",
		content: "This is enough content to pass the minimum length check.",
		category: "style",
		priority: 3,
		estimatedTokens: 20,
		...overrides,
	};
}

// ─── V001: Duplicate IDs ─────────────────────────────────────────

describe("V001 — duplicate rule IDs", () => {
	it("passes when all IDs are unique", () => {
		const result = validateRules([
			makeRule({ id: "rule-a" }),
			makeRule({ id: "rule-b" }),
		]);
		expect(result.passed).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("reports duplicate IDs as error", () => {
		const result = validateRules([
			makeRule({ id: "dup" }),
			makeRule({ id: "dup" }),
		]);
		expect(result.passed).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.code).toBe("V001");
		expect(result.errors[0]?.message).toContain("dup");
	});

	it("reports only one error for three duplicates", () => {
		const result = validateRules([
			makeRule({ id: "dup" }),
			makeRule({ id: "dup" }),
			makeRule({ id: "dup" }),
		]);
		expect(result.errors.filter((e) => e.code === "V001")).toHaveLength(1);
	});
});

// ─── V002: Required Fields ───────────────────────────────────────

describe("V002 — required fields", () => {
	it("reports empty ID", () => {
		const result = validateRules([makeRule({ id: "" })]);
		expect(result.passed).toBe(false);
		expect(result.errors.some((e) => e.code === "V002")).toBe(true);
	});

	it("reports empty description", () => {
		const result = validateRules([makeRule({ description: "" })]);
		expect(result.passed).toBe(false);
		expect(result.errors.some((e) => e.code === "V002")).toBe(true);
	});

	it("reports both empty ID and description", () => {
		const result = validateRules([makeRule({ id: "", description: "" })]);
		const v002Errors = result.errors.filter((e) => e.code === "V002");
		expect(v002Errors).toHaveLength(2);
	});
});

// ─── V003: File-Scoped Without Globs ─────────────────────────────

describe("V003 — file-scoped without globs", () => {
	it("errors when file-scoped has no globs", () => {
		const result = validateRules([makeRule({ scope: "file-scoped" })]);
		expect(result.passed).toBe(false);
		expect(result.errors.some((e) => e.code === "V003")).toBe(true);
	});

	it("errors when file-scoped has empty globs array", () => {
		const result = validateRules([
			makeRule({ scope: "file-scoped", globs: [] }),
		]);
		expect(result.passed).toBe(false);
		expect(result.errors.some((e) => e.code === "V003")).toBe(true);
	});

	it("passes when file-scoped has globs", () => {
		const result = validateRules([
			makeRule({ scope: "file-scoped", globs: ["**/*.ts"] }),
		]);
		const v003 = result.errors.filter((e) => e.code === "V003");
		expect(v003).toHaveLength(0);
	});

	it("ignores non-file-scoped rules without globs", () => {
		const result = validateRules([makeRule({ scope: "always" })]);
		const v003 = result.errors.filter((e) => e.code === "V003");
		expect(v003).toHaveLength(0);
	});
});

// ─── V004: Short Content ─────────────────────────────────────────

describe("V004 — short content", () => {
	it("warns when content is very short", () => {
		const result = validateRules([makeRule({ content: "Short." })]);
		expect(result.warnings.some((w) => w.code === "V004")).toBe(true);
	});

	it("does not warn when content is long enough", () => {
		const result = validateRules([
			makeRule({ content: "This content is definitely long enough." }),
		]);
		const v004 = result.warnings.filter((w) => w.code === "V004");
		expect(v004).toHaveLength(0);
	});
});

// ─── V005: Vague Description ─────────────────────────────────────

describe("V005 — vague description", () => {
	it("warns on 'handle X properly'", () => {
		const result = validateRules([
			makeRule({ description: "Handle errors properly" }),
		]);
		expect(result.warnings.some((w) => w.code === "V005")).toBe(true);
	});

	it("warns on 'follow best practices'", () => {
		const result = validateRules([
			makeRule({ description: "Follow best practices" }),
		]);
		expect(result.warnings.some((w) => w.code === "V005")).toBe(true);
	});

	it("warns on 'do X correctly'", () => {
		const result = validateRules([
			makeRule({ description: "Do testing correctly" }),
		]);
		expect(result.warnings.some((w) => w.code === "V005")).toBe(true);
	});

	it("warns on 'ensure X is correct'", () => {
		const result = validateRules([
			makeRule({ description: "Ensure output is correct" }),
		]);
		expect(result.warnings.some((w) => w.code === "V005")).toBe(true);
	});

	it("does not warn on specific descriptions", () => {
		const result = validateRules([
			makeRule({ description: "Use snake_case for function names" }),
		]);
		const v005 = result.warnings.filter((w) => w.code === "V005");
		expect(v005).toHaveLength(0);
	});
});

// ─── V007: Default Category ─────────────────────────────────────

describe("V007 — default category", () => {
	it("emits info when category is 'general'", () => {
		const result = validateRules([makeRule({ category: "general" })]);
		expect(result.info.some((i) => i.code === "V007")).toBe(true);
	});

	it("does not emit info for specific categories", () => {
		const result = validateRules([makeRule({ category: "security" })]);
		const v007 = result.info.filter((i) => i.code === "V007");
		expect(v007).toHaveLength(0);
	});
});

// ─── V009: Glob Syntax ───────────────────────────────────────────

describe("V009 — invalid glob syntax", () => {
	it("errors on unbalanced brackets", () => {
		const result = validateRules([
			makeRule({ scope: "file-scoped", globs: ["[*.ts"] }),
		]);
		expect(result.errors.some((e) => e.code === "V009")).toBe(true);
	});

	it("errors on unbalanced braces", () => {
		const result = validateRules([
			makeRule({ scope: "file-scoped", globs: ["{*.ts"] }),
		]);
		expect(result.errors.some((e) => e.code === "V009")).toBe(true);
	});

	it("errors on empty glob pattern", () => {
		const result = validateRules([
			makeRule({ scope: "file-scoped", globs: ["  "] }),
		]);
		expect(result.errors.some((e) => e.code === "V009")).toBe(true);
	});

	it("passes valid globs", () => {
		const result = validateRules([
			makeRule({
				scope: "file-scoped",
				globs: ["**/*.ts", "src/{a,b}/*.tsx", "test/[abc].ts"],
			}),
		]);
		const v009 = result.errors.filter((e) => e.code === "V009");
		expect(v009).toHaveLength(0);
	});
});

// ─── V010: Long Content ─────────────────────────────────────────

describe("V010 — long content", () => {
	it("warns when content exceeds 50 lines", () => {
		const longContent = Array.from(
			{ length: 51 },
			(_, i) => `Line ${i + 1}`,
		).join("\n");
		const result = validateRules([makeRule({ content: longContent })]);
		expect(result.warnings.some((w) => w.code === "V010")).toBe(true);
	});

	it("does not warn when content is within limit", () => {
		const content = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join(
			"\n",
		);
		const result = validateRules([makeRule({ content })]);
		const v010 = result.warnings.filter((w) => w.code === "V010");
		expect(v010).toHaveLength(0);
	});
});

// ─── Result Structure ────────────────────────────────────────────

describe("ValidationResult structure", () => {
	it("returns passed=true when no errors exist", () => {
		const result = validateRules([makeRule()]);
		expect(result.passed).toBe(true);
	});

	it("returns passed=false when errors exist", () => {
		const result = validateRules([makeRule({ id: "" })]);
		expect(result.passed).toBe(false);
	});

	it("passes with warnings present but no errors", () => {
		const result = validateRules([makeRule({ content: "Short." })]);
		expect(result.passed).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("handles empty rules array", () => {
		const result = validateRules([]);
		expect(result.passed).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
		expect(result.info).toHaveLength(0);
	});

	it("includes suggestions where applicable", () => {
		const result = validateRules([makeRule({ scope: "file-scoped" })]);
		const v003 = result.errors.find((e) => e.code === "V003");
		expect(v003?.suggestion).toBeDefined();
	});

	it("includes ruleId in issues", () => {
		const result = validateRules([makeRule({ id: "my-rule", content: "X" })]);
		const v004 = result.warnings.find((w) => w.code === "V004");
		expect(v004?.ruleId).toBe("my-rule");
	});
});
