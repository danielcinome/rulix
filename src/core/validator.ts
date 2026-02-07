/**
 * Validation engine for Rulix rules (V001–V010).
 *
 * Each check is a pure function that inspects rules structurally.
 * V006 (token budgets) and V008 (agent-selected support) are deferred
 * to the adapter layer where tool-specific limits are known.
 */

import type {
	Rule,
	ValidationIssue,
	ValidationResult,
	ValidationSeverity,
} from "./ir.js";

const MIN_CONTENT_LENGTH = 20;
const MAX_CONTENT_LINES = 50;

const VAGUE_PATTERNS: RegExp[] = [
	/handle .+ properly/i,
	/do .+ correctly/i,
	/implement .+ properly/i,
	/make sure .+ works/i,
	/ensure .+ is correct/i,
	/follow best practices/i,
];

// ─── Issue Factory ───────────────────────────────────────────────

function createIssue(
	code: string,
	severity: ValidationSeverity,
	message: string,
	ruleId?: string,
	suggestion?: string,
): ValidationIssue {
	return {
		code,
		severity,
		message,
		...(ruleId !== undefined ? { ruleId } : {}),
		...(suggestion !== undefined ? { suggestion } : {}),
	};
}

// ─── Cross-Rule Checks ──────────────────────────────────────────

function checkDuplicateIds(rules: Rule[]): ValidationIssue[] {
	const seen = new Map<string, number>();
	const issues: ValidationIssue[] = [];

	for (const rule of rules) {
		const count = (seen.get(rule.id) ?? 0) + 1;
		seen.set(rule.id, count);
		if (count === 2) {
			issues.push(
				createIssue(
					"V001",
					"error",
					`Duplicate rule ID "${rule.id}"`,
					rule.id,
					"Rename one of the duplicate rules",
				),
			);
		}
	}

	return issues;
}

// ─── Per-Rule Checks ─────────────────────────────────────────────

function checkRequiredFields(rule: Rule): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	if (rule.id === "") {
		issues.push(createIssue("V002", "error", "Rule has empty ID", rule.id));
	}
	if (rule.description === "") {
		issues.push(
			createIssue(
				"V002",
				"error",
				`Rule "${rule.id}" has empty description`,
				rule.id,
			),
		);
	}
	return issues;
}

function checkFileScopedGlobs(rule: Rule): ValidationIssue[] {
	if (rule.scope !== "file-scoped") return [];
	if (!rule.globs || rule.globs.length === 0) {
		return [
			createIssue(
				"V003",
				"error",
				`Rule "${rule.id}" is file-scoped but has no globs`,
				rule.id,
				'Add globs or change scope to "always"',
			),
		];
	}
	return [];
}

function checkShortContent(rule: Rule): ValidationIssue[] {
	if (rule.content.length < MIN_CONTENT_LENGTH) {
		return [
			createIssue(
				"V004",
				"warning",
				`Rule "${rule.id}" has very short content (${rule.content.length} chars)`,
				rule.id,
				"Consider adding more detail",
			),
		];
	}
	return [];
}

function checkVagueDescription(rule: Rule): ValidationIssue[] {
	for (const pattern of VAGUE_PATTERNS) {
		if (pattern.test(rule.description)) {
			return [
				createIssue(
					"V005",
					"warning",
					`Rule "${rule.id}" has a vague description`,
					rule.id,
					"Be more specific about what conventions to follow",
				),
			];
		}
	}
	return [];
}

function checkDefaultCategory(rule: Rule): ValidationIssue[] {
	if (rule.category === "general") {
		return [
			createIssue(
				"V007",
				"info",
				`Rule "${rule.id}" has no specific category`,
				rule.id,
				"Consider assigning a category (style, security, testing, architecture, workflow)",
			),
		];
	}
	return [];
}

function isValidGlobSyntax(pattern: string): boolean {
	if (pattern.trim() === "") return false;
	let brackets = 0;
	let braces = 0;
	for (const ch of pattern) {
		if (ch === "[") brackets++;
		else if (ch === "]") brackets--;
		else if (ch === "{") braces++;
		else if (ch === "}") braces--;
		if (brackets < 0 || braces < 0) return false;
	}
	return brackets === 0 && braces === 0;
}

function checkGlobSyntax(rule: Rule): ValidationIssue[] {
	if (!rule.globs) return [];
	const issues: ValidationIssue[] = [];
	for (const glob of rule.globs) {
		if (!isValidGlobSyntax(glob)) {
			issues.push(
				createIssue(
					"V009",
					"error",
					`Rule "${rule.id}" has invalid glob pattern: "${glob}"`,
					rule.id,
				),
			);
		}
	}
	return issues;
}

function checkLongContent(rule: Rule): ValidationIssue[] {
	const lineCount = rule.content.split("\n").length;
	if (lineCount > MAX_CONTENT_LINES) {
		return [
			createIssue(
				"V010",
				"warning",
				`Rule "${rule.id}" has ${lineCount} lines (>${MAX_CONTENT_LINES})`,
				rule.id,
				"Consider splitting into smaller rules",
			),
		];
	}
	return [];
}

// ─── Result Builder ──────────────────────────────────────────────

function buildResult(issues: ValidationIssue[]): ValidationResult {
	return {
		passed: issues.every((i) => i.severity !== "error"),
		errors: issues.filter((i) => i.severity === "error"),
		warnings: issues.filter((i) => i.severity === "warning"),
		info: issues.filter((i) => i.severity === "info"),
	};
}

// ─── Public API ──────────────────────────────────────────────────

/** Validates rules for structural issues (V001–V005, V007, V009, V010). */
export function validateRules(rules: Rule[]): ValidationResult {
	const issues: ValidationIssue[] = [];

	issues.push(...checkDuplicateIds(rules));

	for (const rule of rules) {
		issues.push(...checkRequiredFields(rule));
		issues.push(...checkFileScopedGlobs(rule));
		issues.push(...checkShortContent(rule));
		issues.push(...checkVagueDescription(rule));
		issues.push(...checkDefaultCategory(rule));
		issues.push(...checkGlobSyntax(rule));
		issues.push(...checkLongContent(rule));
	}

	return buildResult(issues);
}
