/**
 * Rulix — One ruleset. Every AI coding tool.
 *
 * Public API for programmatic usage.
 */

export {
	agentsMdAdapter,
	claudeCodeAdapter,
	cursorAdapter,
	detectAdapters,
	getAdapter,
	getAdapterNames,
	getAdapters,
} from "./adapters/index.js";
export {
	exportRules,
	getTokenBudget,
	importRules,
	loadRuleset,
	validateRuleset,
} from "./api.js";
export type {
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
	loadRules,
	parseRule,
	RULES_DIR,
	RULIX_DIR,
	RulixError,
	resolveConfig,
	rulesPath,
	serializeRule,
	sumTokens,
	validateRules,
	writeRule,
} from "./core/index.js";
