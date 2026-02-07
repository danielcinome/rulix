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
	CONFIG_FILENAME,
	computeBudgetUsage,
	configPath,
	createDefaultConfig,
	estimateRuleTokens,
	estimateTokens,
	loadConfig,
	RULES_DIR,
	RULIX_DIR,
	RulixError,
	resolveConfig,
	rulesPath,
	sumTokens,
} from "./core/index.js";
