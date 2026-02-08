/**
 * Claude Code adapter: imports from `.claude/rules/*.md`,
 * exports IR rules to `.claude/rules/` individual files.
 *
 * CLAUDE.md is never generated, modified, or overwritten by Rulix.
 * Never touches `.claude/skills/`, `.claude/commands/`,
 * `.claude/agents/`, or `.claude/settings.json`.
 */

import {
	access,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import type {
	ExportOptions,
	ExportResult,
	ImportResult,
	Rule,
	RuleScope,
	RulixAdapter,
	TokenBudget,
} from "../core/ir.js";
import { estimateRuleTokens } from "../core/tokenizer.js";

const RULES_DIR = ".claude/rules";

// ─── Filesystem Helpers ──────────────────────────────────────────

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listMdFiles(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir);
		return entries.filter((f) => f.endsWith(".md")).sort();
	} catch {
		return [];
	}
}

// ─── Text Helpers ────────────────────────────────────────────────

function stripQuotes(s: string): string {
	const t = s.trim();
	if (
		(t.startsWith('"') && t.endsWith('"')) ||
		(t.startsWith("'") && t.endsWith("'"))
	) {
		return t.slice(1, -1);
	}
	return t;
}

// ─── Frontmatter Parsing ─────────────────────────────────────────

interface FmParts {
	readonly yaml: string;
	readonly content: string;
}

function splitFrontmatter(raw: string): FmParts | null {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");
	if (lines[0]?.trim() !== "---") return null;

	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			return {
				yaml: lines.slice(1, i).join("\n"),
				content: lines
					.slice(i + 1)
					.join("\n")
					.trim(),
			};
		}
	}
	return null;
}

interface ClaudeRuleFields {
	readonly paths: string[] | undefined;
	readonly description: string | undefined;
}

function parseClaudeRuleFields(yaml: string): ClaudeRuleFields {
	let paths: string[] | undefined;
	let description: string | undefined;

	for (const line of yaml.split("\n")) {
		const trimmed = line.trim();
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (key === "paths" && value !== "") {
			if (value.startsWith("[") && value.endsWith("]")) {
				const inner = value.slice(1, -1).trim();
				paths = inner === "" ? [] : inner.split(",").map(stripQuotes);
			} else {
				paths = [stripQuotes(value)];
			}
		} else if (key === "description" && value !== "") {
			description = stripQuotes(value);
		}
	}

	return { paths, description };
}

// ─── Import Helpers ──────────────────────────────────────────────

function createImportedRule(
	id: string,
	scope: RuleScope,
	description: string,
	content: string,
	filePath: string,
	globs?: string[],
): Rule {
	return {
		id,
		scope,
		description,
		content,
		category: "general",
		priority: 3,
		estimatedTokens: estimateRuleTokens(content, description),
		...(globs ? { globs } : {}),
		source: {
			adapter: "claude-code",
			filePath,
			importedAt: new Date().toISOString(),
		},
	};
}

function importClaudeRuleFile(raw: string, filePath: string, id: string): Rule {
	const fallbackDescription = id.replace(/-/g, " ");
	const parts = splitFrontmatter(raw);

	if (!parts) {
		const content = raw.replace(/\r\n/g, "\n").trim();
		return createImportedRule(
			id,
			"always",
			fallbackDescription,
			content,
			filePath,
		);
	}

	const fields = parseClaudeRuleFields(parts.yaml);

	if (fields.paths && fields.paths.length > 0) {
		return createImportedRule(
			id,
			"file-scoped",
			fields.description ?? fallbackDescription,
			parts.content,
			filePath,
			fields.paths,
		);
	}

	if (fields.description) {
		return createImportedRule(
			id,
			"agent-selected",
			fields.description,
			parts.content,
			filePath,
		);
	}

	return createImportedRule(
		id,
		"always",
		fallbackDescription,
		parts.content,
		filePath,
	);
}

async function importClaudeRuleFiles(projectRoot: string): Promise<Rule[]> {
	const dir = join(projectRoot, RULES_DIR);
	const files = await listMdFiles(dir);
	const rules: Rule[] = [];

	for (const file of files) {
		const filePath = join(RULES_DIR, file);
		const raw = await readFile(join(projectRoot, filePath), "utf-8");
		rules.push(importClaudeRuleFile(raw, filePath, basename(file, ".md")));
	}

	return rules;
}

// ─── Export Helpers ──────────────────────────────────────────────

function buildClaudeRuleFile(rule: Rule): string {
	if (rule.scope === "file-scoped" && rule.globs && rule.globs.length > 0) {
		const lines: string[] = ["---"];
		if (rule.globs.length === 1) {
			const first = rule.globs[0];
			if (first !== undefined) lines.push(`paths: "${first}"`);
		} else {
			const items = rule.globs.map((g) => `"${g}"`).join(", ");
			lines.push(`paths: [${items}]`);
		}
		lines.push("---");
		lines.push("");
		lines.push(rule.content);
		lines.push("");
		return lines.join("\n");
	}

	if (rule.scope === "agent-selected") {
		const lines: string[] = ["---"];
		lines.push(`description: "${rule.description}"`);
		lines.push("---");
		lines.push("");
		lines.push(rule.content);
		lines.push("");
		return lines.join("\n");
	}

	return `${rule.content}\n`;
}

async function exportClaudeRules(
	rules: Rule[],
	projectRoot: string,
	dryRun: boolean,
): Promise<string[]> {
	if (rules.length === 0) return [];

	const dir = join(projectRoot, RULES_DIR);
	if (!dryRun) await mkdir(dir, { recursive: true });

	const written: string[] = [];
	for (const rule of rules) {
		const filePath = join(RULES_DIR, `${rule.id}.md`);
		if (!dryRun) {
			await writeFile(
				join(projectRoot, filePath),
				buildClaudeRuleFile(rule),
				"utf-8",
			);
		}
		written.push(filePath);
	}
	return written;
}

async function deleteStaleRuleFiles(
	rules: Rule[],
	projectRoot: string,
	dryRun: boolean,
): Promise<string[]> {
	const dir = join(projectRoot, RULES_DIR);
	const existing = await listMdFiles(dir);
	const exportedIds = new Set(rules.map((r) => `${r.id}.md`));
	const deleted: string[] = [];

	for (const file of existing) {
		if (!exportedIds.has(file)) {
			const filePath = join(RULES_DIR, file);
			if (!dryRun) await rm(join(projectRoot, filePath));
			deleted.push(filePath);
		}
	}
	return deleted;
}

// ─── Adapter ─────────────────────────────────────────────────────

export const claudeCodeAdapter: RulixAdapter = {
	name: "claude-code",
	displayName: "Claude Code",

	async detect(projectRoot: string): Promise<boolean> {
		const claudeMd = join(projectRoot, "CLAUDE.md");
		const claudeDir = join(projectRoot, ".claude");
		return (await pathExists(claudeMd)) || (await pathExists(claudeDir));
	},

	async import(projectRoot: string): Promise<ImportResult> {
		const ruleFiles = await importClaudeRuleFiles(projectRoot);

		return {
			rules: ruleFiles,
			warnings: [],
			source: RULES_DIR,
		};
	},

	async export(
		rules: Rule[],
		projectRoot: string,
		options?: ExportOptions,
	): Promise<ExportResult> {
		const dryRun = options?.dryRun === true;
		const strategy = options?.strategy ?? "overwrite";

		const filesWritten = await exportClaudeRules(rules, projectRoot, dryRun);
		const filesDeleted =
			strategy === "overwrite"
				? await deleteStaleRuleFiles(rules, projectRoot, dryRun)
				: [];

		return {
			filesWritten,
			filesDeleted,
			warnings: [],
		};
	},

	getTokenBudget(): TokenBudget {
		return {
			maxTokens: 4_000,
			warningThreshold: 0.8,
			source: "Claude Code documentation",
		};
	},
};
