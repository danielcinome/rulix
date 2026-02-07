/**
 * Rulix — One ruleset. Every AI coding tool.
 *
 * Public API for programmatic usage.
 */

export type {
	ClaudeMdStrategy,
	ExportOptions,
	ExportResult,
	ExportStrategy,
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
	TokenBudgetUsage,
	TokenEstimation,
	ValidationIssue,
	ValidationResult,
	ValidationSeverity,
} from "./core/index.js";
export {
	computeBudgetUsage,
	estimateRuleTokens,
	estimateTokens,
	RulixError,
	sumTokens,
} from "./core/index.js";
