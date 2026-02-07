/**
 * High-level convenience API for programmatic usage.
 *
 * These functions compose lower-level core and adapter APIs into
 * ergonomic one-call operations. They throw RulixError on failure
 * instead of returning Result, for simpler consumer code.
 */

import { getAdapter } from "./adapters/registry.js";
import { loadConfig } from "./core/config.js";
import type {
	ExportOptions,
	ExportResult,
	ImportResult,
	Rule,
	Ruleset,
	ValidationResult,
} from "./core/ir.js";
import { RulixError } from "./core/ir.js";
import { loadRules } from "./core/parser.js";
import type { TokenBudgetUsage } from "./core/tokenizer.js";
import { computeBudgetUsage, sumTokens } from "./core/tokenizer.js";
import { validateRules } from "./core/validator.js";

function requireAdapter(name: string) {
	const adapter = getAdapter(name);
	if (!adapter) {
		throw new RulixError("UNKNOWN_ADAPTER", `Unknown adapter: "${name}"`);
	}
	return adapter;
}

/** Loads the full ruleset (config + rules) from a project directory. */
export async function loadRuleset(projectRoot: string): Promise<Ruleset> {
	const configResult = await loadConfig(projectRoot);
	if (!configResult.ok) throw configResult.error;

	const rulesResult = await loadRules(projectRoot);
	if (!rulesResult.ok) throw rulesResult.error;

	return { rules: rulesResult.value, config: configResult.value };
}

/** Imports rules from a specific tool adapter into canonical IR. */
export async function importRules(
	adapterName: string,
	projectRoot: string,
): Promise<ImportResult> {
	return requireAdapter(adapterName).import(projectRoot);
}

/** Exports canonical rules to a specific tool's format. */
export async function exportRules(
	adapterName: string,
	rules: Rule[],
	projectRoot: string,
	options?: ExportOptions,
): Promise<ExportResult> {
	return requireAdapter(adapterName).export(rules, projectRoot, options);
}

/** Validates rules for structural issues. */
export function validateRuleset(ruleset: Ruleset): ValidationResult {
	return validateRules(ruleset.rules);
}

/** Returns token budget usage for a specific adapter. */
export function getTokenBudget(
	adapterName: string,
	rules: Rule[],
): TokenBudgetUsage {
	const adapter = requireAdapter(adapterName);
	const budget = adapter.getTokenBudget();
	const used = sumTokens(rules.map((r) => r.estimatedTokens));
	return computeBudgetUsage(used, budget.maxTokens);
}
