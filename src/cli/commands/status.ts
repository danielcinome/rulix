/**
 * `rulix status` — shows rules overview and token budgets.
 */

import { getAdapter } from "../../adapters/registry.js";
import { loadConfig } from "../../core/config.js";
import type { Rule } from "../../core/ir.js";
import { loadRules } from "../../core/parser.js";
import { sumTokens } from "../../core/tokenizer.js";
import { blank, color, fail, header, info, log, warning } from "../ui.js";

function countByScope(rules: Rule[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const rule of rules) {
		counts[rule.scope] = (counts[rule.scope] ?? 0) + 1;
	}
	return counts;
}

function tokensByScope(rules: Rule[]): Record<string, number> {
	const tokens: Record<string, number> = {};
	for (const rule of rules) {
		tokens[rule.scope] = (tokens[rule.scope] ?? 0) + rule.estimatedTokens;
	}
	return tokens;
}

export async function statusCommand(projectRoot: string): Promise<void> {
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
	const config = configResult.value;
	const totalTokens = sumTokens(rules.map((r) => r.estimatedTokens));

	header(`Rulix — ${rules.length} rule(s) in .rulix/rules/`);

	const scopeCounts = countByScope(rules);
	const scopeTokens = tokensByScope(rules);

	log("  Rules by scope:");
	for (const scope of ["always", "file-scoped", "agent-selected"]) {
		const count = scopeCounts[scope] ?? 0;
		const tokens = scopeTokens[scope] ?? 0;
		log(
			`    ${scope.padEnd(16)} ${count} rule(s)  ${color.dim(`(${tokens} tokens)`)}`,
		);
	}

	if (rules.length > 0) {
		blank();
		log("  Rules:");
		const sorted = [...rules].sort((a, b) => a.priority - b.priority);
		for (const rule of sorted) {
			const lineCount = rule.content.split("\n").length;
			const warn = lineCount > 50 ? `  ${color.yellow("⚠")}` : "";
			log(
				`    ${rule.id.padEnd(24)} ${`(${rule.scope})`.padEnd(18)} ${String(rule.estimatedTokens).padStart(5)} tokens  ${String(lineCount).padStart(4)} lines${warn}`,
			);
		}
	}

	blank();
	log("  Token budgets:");
	const targets =
		config.targets.length > 0
			? config.targets
			: ["cursor", "claude-code", "agents-md"];

	for (const name of targets) {
		const adapter = getAdapter(name);
		if (!adapter) continue;
		const budget = adapter.getTokenBudget();
		const pct =
			budget.maxTokens > 0 ? (totalTokens / budget.maxTokens) * 100 : 0;
		const bar = `${totalTokens} / ${budget.maxTokens}`;
		const pctStr = budget.maxTokens > 0 ? ` (${Math.round(pct)}%)` : "";
		const line = `    ${adapter.displayName.padEnd(14)} ${bar}${pctStr}`;

		if (pct > budget.warningThreshold * 100) {
			warning(line.trim());
		} else {
			log(line);
		}
	}

	blank();
	log("  Targets:");
	if (config.targets.length > 0) {
		for (const name of config.targets) {
			const adapter = getAdapter(name);
			info(adapter ? adapter.displayName : name);
		}
	} else {
		info(color.dim("No targets configured — run `rulix init`"));
	}

	blank();
}
