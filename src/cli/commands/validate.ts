/**
 * `rulix validate` — checks rules for structural issues.
 */

import { loadRules } from "../../core/parser.js";
import { validateRules } from "../../core/validator.js";
import { blank, fail, header, info, success, warning } from "../ui.js";

export async function validateCommand(projectRoot: string): Promise<void> {
	header("Validating rules");

	const rulesResult = await loadRules(projectRoot);
	if (!rulesResult.ok) {
		fail(rulesResult.error.message);
		return;
	}

	const rules = rulesResult.value;
	if (rules.length === 0) {
		info("No rules found in .rulix/rules/");
		return;
	}

	info(`Checking ${rules.length} rule(s)...`);
	blank();

	const result = validateRules(rules);

	for (const err of result.errors) {
		fail(`${err.ruleId ?? "?"}: ${err.message}`);
		if (err.suggestion) info(`  → ${err.suggestion}`);
	}
	for (const w of result.warnings) {
		warning(`${w.ruleId ?? "?"}: ${w.message}`);
		if (w.suggestion) info(`  → ${w.suggestion}`);
	}
	for (const i of result.info) {
		info(`${i.ruleId ?? "?"}: ${i.message}`);
		if (i.suggestion) info(`  → ${i.suggestion}`);
	}

	blank();
	const counts = [
		`${result.errors.length} error(s)`,
		`${result.warnings.length} warning(s)`,
		`${result.info.length} info`,
	].join(", ");

	if (result.passed) {
		success(`Validation passed — ${counts}`);
	} else {
		fail(`Validation failed — ${counts}`);
	}
	blank();
}
