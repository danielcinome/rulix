/**
 * Core engine: parser, IR types, validator, tokenizer, config.
 */

export {
	CONFIG_FILENAME,
	configPath,
	createDefaultConfig,
	loadConfig,
	RULES_DIR,
	RULIX_DIR,
	resolveConfig,
	rulesPath,
} from "./config.js";
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
	TokenEstimation,
	ValidationIssue,
	ValidationResult,
	ValidationSeverity,
} from "./ir.js";
export { RulixError } from "./ir.js";
export {
	loadRules,
	parseRule,
	serializeRule,
	writeRule,
} from "./parser.js";
export type { TokenBudgetUsage } from "./tokenizer.js";
export {
	computeBudgetUsage,
	estimateRuleTokens,
	estimateTokens,
	sumTokens,
} from "./tokenizer.js";
export { validateRules } from "./validator.js";
