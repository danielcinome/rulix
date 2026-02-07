/**
 * `rulix sync [--target <adapter>] [--dry-run]` — exports rules to targets.
 */

import { getAdapter, getAdapters } from "../../adapters/registry.js";
import { loadConfig } from "../../core/config.js";
import type { ExportOptions, RulixAdapter } from "../../core/ir.js";
import { loadRules } from "../../core/parser.js";
import { validateRules } from "../../core/validator.js";
import { blank, color, fail, header, info, success, warning } from "../ui.js";

function resolveTargets(
	targetName: string | undefined,
	configTargets: string[],
): RulixAdapter[] {
	if (targetName) {
		const adapter = getAdapter(targetName);
		return adapter ? [adapter] : [];
	}

	if (configTargets.length > 0) {
		return configTargets
			.map(getAdapter)
			.filter((a): a is RulixAdapter => a !== undefined);
	}

	return getAdapters();
}

export async function syncCommand(
	projectRoot: string,
	options: { target?: string | undefined; dryRun: boolean },
): Promise<void> {
	header(options.dryRun ? "Sync (dry run)" : "Syncing rules");

	const configResult = await loadConfig(projectRoot);
	if (!configResult.ok) {
		fail(configResult.error.message);
		return;
	}

	const rulesResult = await loadRules(projectRoot);
	if (!rulesResult.ok) {
		fail(rulesResult.error.message);
		return;
	}

	const rules = rulesResult.value;
	if (rules.length === 0) {
		info("No rules found in .rulix/rules/");
		info("Run `rulix init` or add rules manually");
		return;
	}

	const validation = validateRules(rules);
	if (!validation.passed) {
		fail("Validation failed — fix errors before syncing");
		for (const err of validation.errors) {
			fail(`${err.ruleId ?? "?"}: ${err.message}`);
		}
		return;
	}

	for (const w of validation.warnings) {
		warning(`${w.ruleId ?? "?"}: ${w.message}`);
	}

	const targets = resolveTargets(options.target, configResult.value.targets);
	if (targets.length === 0) {
		fail(
			options.target
				? `Unknown target: "${options.target}"`
				: "No targets configured",
		);
		return;
	}

	const exportOpts: ExportOptions = {
		strategy: "overwrite",
		dryRun: options.dryRun,
	};

	for (const adapter of targets) {
		info(`${color.bold(adapter.displayName)}:`);
		const result = await adapter.export(rules, projectRoot, exportOpts);

		if (result.filesWritten.length > 0) {
			success(`${result.filesWritten.length} file(s) written`);
		}
		if (result.filesDeleted.length > 0) {
			success(`${result.filesDeleted.length} file(s) deleted`);
		}
		for (const w of result.warnings) {
			warning(w.message);
		}
	}

	blank();
	success(`Synced ${rules.length} rule(s) to ${targets.length} target(s)`);
	blank();
}
