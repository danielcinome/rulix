import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	ExportOptions,
	ExportResult,
	ExportWarning,
	ImportResult,
	ImportWarning,
	Result,
	Rule,
	RuleCategory,
	RuleScope,
	RuleSource,
	Ruleset,
	RulixAdapter,
	RulixConfig,
	RulixConfigOptions,
	TokenBudget,
	ValidationIssue,
	ValidationResult,
	ValidationSeverity,
} from "../../src/core/ir.js";
import { RulixError } from "../../src/core/ir.js";

// ─── Fixtures ────────────────────────────────────────────────────

const source: RuleSource = {
	adapter: "cursor",
	filePath: ".cursor/rules/style.mdc",
	importedAt: "2026-01-01T00:00:00Z",
};

const alwaysRule: Rule = {
	id: "typescript-strict",
	scope: "always",
	description: "Enforce strict TypeScript conventions",
	content: "# TypeScript\n\n- Use strict mode",
	category: "style",
	priority: 1,
	estimatedTokens: 12,
	source,
};

const fileScopedRule: Rule = {
	id: "testing-conventions",
	scope: "file-scoped",
	description: "Testing conventions for test files",
	content: "# Testing\n\n- Use describe/it blocks",
	globs: ["**/*.test.ts", "**/*.spec.ts"],
	category: "testing",
	priority: 2,
	estimatedTokens: 15,
};

const agentSelectedRule: Rule = {
	id: "security-review",
	scope: "agent-selected",
	description: "Security guidelines applied when AI deems relevant",
	content: "# Security\n\n- Validate all inputs",
	category: "security",
	priority: 1,
	estimatedTokens: 10,
};

const configOptions: RulixConfigOptions = {
	tokenEstimation: "heuristic",
	agentsMdHeader: true,
	syncOnSave: false,
};

const config: RulixConfig = {
	targets: ["cursor", "claude-code", "agents-md"],
	presets: [],
	overrides: {},
	options: configOptions,
};

// ─── Tests ───────────────────────────────────────────────────────

describe("RuleScope", () => {
	it("accepts all valid scope values", () => {
		const scopes: RuleScope[] = ["always", "file-scoped", "agent-selected"];
		expect(scopes).toHaveLength(3);
	});
});

describe("RuleCategory", () => {
	it("accepts all valid category values", () => {
		const categories: RuleCategory[] = [
			"style",
			"security",
			"testing",
			"architecture",
			"workflow",
			"general",
		];
		expect(categories).toHaveLength(6);
	});
});

describe("ValidationSeverity", () => {
	it("accepts all valid severity values", () => {
		const severities: ValidationSeverity[] = ["error", "warning", "info"];
		expect(severities).toHaveLength(3);
	});
});

describe("Rule", () => {
	it("requires all mandatory fields", () => {
		expectTypeOf(alwaysRule).toMatchTypeOf<Rule>();
		expect(alwaysRule.id).toBe("typescript-strict");
		expect(alwaysRule.scope).toBe("always");
		expect(alwaysRule.description).toBeTypeOf("string");
		expect(alwaysRule.content).toBeTypeOf("string");
		expect(alwaysRule.category).toBe("style");
		expect(alwaysRule.priority).toBe(1);
		expect(alwaysRule.estimatedTokens).toBe(12);
	});

	it("allows optional globs for file-scoped rules", () => {
		expect(fileScopedRule.globs).toEqual(["**/*.test.ts", "**/*.spec.ts"]);
	});

	it("allows optional source for imported rules", () => {
		expect(alwaysRule.source).toBeDefined();
		expect(agentSelectedRule.source).toBeUndefined();
	});

	it("allows optional extends field", () => {
		const extended: Rule = {
			...alwaysRule,
			extends: "@rulix/typescript/strict",
		};
		expect(extended.extends).toBe("@rulix/typescript/strict");
	});
});

describe("RuleSource", () => {
	it("contains provenance information", () => {
		expectTypeOf(source).toMatchTypeOf<RuleSource>();
		expect(source.adapter).toBe("cursor");
		expect(source.filePath).toBeTypeOf("string");
		expect(source.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("Ruleset", () => {
	it("combines rules with config", () => {
		const ruleset: Ruleset = {
			rules: [alwaysRule, fileScopedRule, agentSelectedRule],
			config,
		};
		expectTypeOf(ruleset).toMatchTypeOf<Ruleset>();
		expect(ruleset.rules).toHaveLength(3);
		expect(ruleset.config.targets).toContain("cursor");
	});
});

describe("RulixConfig", () => {
	it("has all required fields", () => {
		expectTypeOf(config).toMatchTypeOf<RulixConfig>();
		expect(config.targets).toEqual(["cursor", "claude-code", "agents-md"]);
		expect(config.presets).toEqual([]);
		expect(config.overrides).toEqual({});
		expect(config.options.tokenEstimation).toBe("heuristic");
	});

	it("supports overrides keyed by rule ID", () => {
		const withOverrides: RulixConfig = {
			...config,
			overrides: { "typescript-strict": { priority: 1 } },
		};
		expect(withOverrides.overrides["typescript-strict"]).toBeDefined();
	});
});

describe("TokenBudget", () => {
	it("has all required fields", () => {
		const budget: TokenBudget = {
			maxTokens: 4000,
			warningThreshold: 0.8,
			source: "Claude Code documentation",
		};
		expectTypeOf(budget).toMatchTypeOf<TokenBudget>();
		expect(budget.maxTokens).toBe(4000);
		expect(budget.warningThreshold).toBe(0.8);
	});
});

describe("ExportOptions", () => {
	it("requires strategy", () => {
		const opts: ExportOptions = { strategy: "overwrite" };
		expectTypeOf(opts).toMatchTypeOf<ExportOptions>();
		expect(opts.strategy).toBe("overwrite");
	});

	it("allows optional dryRun", () => {
		const opts: ExportOptions = { strategy: "merge", dryRun: true };
		expect(opts.dryRun).toBe(true);
	});
});

describe("ImportResult", () => {
	it("contains rules, warnings, and source", () => {
		const warning: ImportWarning = {
			filePath: ".cursor/rules/empty.mdc",
			message: "Empty description, defaulting to scope: always",
		};
		const result: ImportResult = {
			rules: [alwaysRule],
			warnings: [warning],
			source: ".cursor/rules/",
		};
		expectTypeOf(result).toMatchTypeOf<ImportResult>();
		expect(result.rules).toHaveLength(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]?.message).toContain("Empty description");
	});
});

describe("ExportResult", () => {
	it("contains files written, deleted, and warnings", () => {
		const warning: ExportWarning = {
			ruleId: "security-review",
			filePath: "CLAUDE.md",
			message: "agent-selected scope not natively supported",
		};
		const result: ExportResult = {
			filesWritten: [".cursor/rules/style.mdc"],
			filesDeleted: [],
			warnings: [warning],
		};
		expectTypeOf(result).toMatchTypeOf<ExportResult>();
		expect(result.filesWritten).toHaveLength(1);
		expect(result.filesDeleted).toHaveLength(0);
	});
});

describe("RulixAdapter", () => {
	it("can be implemented as a plain object", () => {
		const adapter: RulixAdapter = {
			name: "test",
			displayName: "Test Adapter",
			detect: async (_root: string) => false,
			import: async (_root: string) => ({
				rules: [],
				warnings: [],
				source: "test",
			}),
			export: async (_rules: Rule[], _root: string) => ({
				filesWritten: [],
				filesDeleted: [],
				warnings: [],
			}),
			getTokenBudget: () => ({
				maxTokens: 10000,
				warningThreshold: 0.8,
				source: "test",
			}),
		};
		expectTypeOf(adapter).toMatchTypeOf<RulixAdapter>();
		expect(adapter.name).toBe("test");
	});
});

describe("Result", () => {
	it("represents success with ok: true", () => {
		const success: Result<number> = { ok: true, value: 42 };
		expect(success.ok).toBe(true);
		if (success.ok) {
			expectTypeOf(success.value).toBeNumber();
			expect(success.value).toBe(42);
		}
	});

	it("represents failure with ok: false", () => {
		const failure: Result<number> = {
			ok: false,
			error: new RulixError("E001", "something failed"),
		};
		expect(failure.ok).toBe(false);
		if (!failure.ok) {
			expectTypeOf(failure.error).toMatchTypeOf<RulixError>();
			expect(failure.error.code).toBe("E001");
		}
	});

	it("narrows type via discriminant", () => {
		const result: Result<string> = { ok: true, value: "hello" };
		if (result.ok) {
			const val: string = result.value;
			expect(val).toBe("hello");
		} else {
			const err: RulixError = result.error;
			expect(err).toBeInstanceOf(RulixError);
		}
	});
});

describe("RulixError", () => {
	it("extends Error", () => {
		const err = new RulixError("E001", "test error");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(RulixError);
	});

	it("has code, message, and name", () => {
		const err = new RulixError("V002", "missing frontmatter");
		expect(err.code).toBe("V002");
		expect(err.message).toBe("missing frontmatter");
		expect(err.name).toBe("RulixError");
	});

	it("supports optional cause", () => {
		const original = new Error("fs read failed");
		const err = new RulixError("E100", "could not read file", original);
		expect(err.cause).toBe(original);
	});

	it("has undefined cause when not provided", () => {
		const err = new RulixError("E001", "test");
		expect(err.cause).toBeUndefined();
	});
});

describe("ValidationIssue", () => {
	it("has all required fields", () => {
		const issue: ValidationIssue = {
			code: "V001",
			severity: "error",
			message: "Duplicate rule ID",
			ruleId: "typescript-strict",
			filePath: ".rulix/rules/typescript.md",
			suggestion: "Rename one of the duplicate rules",
		};
		expectTypeOf(issue).toMatchTypeOf<ValidationIssue>();
		expect(issue.code).toBe("V001");
		expect(issue.severity).toBe("error");
	});

	it("allows optional fields to be omitted", () => {
		const issue: ValidationIssue = {
			code: "V006",
			severity: "warning",
			message: "Token budget exceeded",
		};
		expect(issue.ruleId).toBeUndefined();
		expect(issue.filePath).toBeUndefined();
		expect(issue.suggestion).toBeUndefined();
	});
});

describe("ValidationResult", () => {
	it("aggregates issues by severity", () => {
		const result: ValidationResult = {
			passed: false,
			errors: [
				{ code: "V001", severity: "error", message: "Duplicate rule ID" },
			],
			warnings: [
				{ code: "V006", severity: "warning", message: "Token budget exceeded" },
			],
			info: [
				{ code: "V007", severity: "info", message: "No category assigned" },
			],
		};
		expectTypeOf(result).toMatchTypeOf<ValidationResult>();
		expect(result.passed).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.warnings).toHaveLength(1);
		expect(result.info).toHaveLength(1);
	});

	it("passes when no errors exist", () => {
		const result: ValidationResult = {
			passed: true,
			errors: [],
			warnings: [],
			info: [],
		};
		expect(result.passed).toBe(true);
	});
});
