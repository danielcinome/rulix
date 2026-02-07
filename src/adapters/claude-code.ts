/**
 * Claude Code adapter: imports from `CLAUDE.md` and `.claude/rules/*.md`,
 * exports IR rules to Claude Code format.
 *
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

const CLAUDE_MD = "CLAUDE.md";
const RULES_DIR = ".claude/rules";
const CONTEXT_PREFIX = "Context: ";

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

function toKebabCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

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

function parsePaths(yaml: string): string[] | undefined {
	for (const line of yaml.split("\n")) {
		const trimmed = line.trim();
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (key === "paths" && value !== "") {
			if (value.startsWith("[") && value.endsWith("]")) {
				const inner = value.slice(1, -1).trim();
				return inner === "" ? [] : inner.split(",").map(stripQuotes);
			}
			return [stripQuotes(value)];
		}
	}
	return undefined;
}

// ─── CLAUDE.md Splitting ─────────────────────────────────────────

interface H2Section {
	readonly heading: string;
	readonly content: string;
}

function splitByH2(raw: string): { preamble: string; sections: H2Section[] } {
	const parts = raw.split(/^(?=## )/m);
	let preamble = "";
	const sections: H2Section[] = [];

	for (const part of parts) {
		if (!part.startsWith("## ")) {
			preamble = part.trim();
			continue;
		}
		const newlineIdx = part.indexOf("\n");
		if (newlineIdx === -1) {
			sections.push({ heading: part.slice(3).trim(), content: "" });
		} else {
			sections.push({
				heading: part.slice(3, newlineIdx).trim(),
				content: part.slice(newlineIdx + 1).trim(),
			});
		}
	}

	return { preamble, sections };
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

function importClaudeMdContent(raw: string): Rule[] {
	const content = raw.replace(/\r\n/g, "\n").trim();
	if (content === "") return [];

	const { preamble, sections } = splitByH2(content);

	if (sections.length === 0) {
		if (!preamble) return [];
		return [
			createImportedRule(
				"claude-md",
				"always",
				"CLAUDE.md contents",
				preamble,
				CLAUDE_MD,
			),
		];
	}

	const rules: Rule[] = [];
	if (preamble) {
		rules.push(
			createImportedRule(
				"claude-md-preamble",
				"always",
				"CLAUDE.md preamble",
				preamble,
				CLAUDE_MD,
			),
		);
	}

	for (const section of sections) {
		const isContext = section.heading.startsWith(CONTEXT_PREFIX);
		const description = isContext
			? section.heading.slice(CONTEXT_PREFIX.length)
			: section.heading;
		const scope: RuleScope = isContext ? "agent-selected" : "always";
		const id = toKebabCase(description);
		if (id && section.content) {
			rules.push(
				createImportedRule(id, scope, description, section.content, CLAUDE_MD),
			);
		}
	}

	return rules;
}

async function importClaudeMd(projectRoot: string): Promise<Rule[]> {
	const filePath = join(projectRoot, CLAUDE_MD);
	if (!(await pathExists(filePath))) return [];
	const raw = await readFile(filePath, "utf-8");
	return importClaudeMdContent(raw);
}

function importClaudeRuleFile(raw: string, filePath: string, id: string): Rule {
	const description = id.replace(/-/g, " ");
	const parts = splitFrontmatter(raw);

	if (!parts) {
		const content = raw.replace(/\r\n/g, "\n").trim();
		return createImportedRule(id, "always", description, content, filePath);
	}

	const paths = parsePaths(parts.yaml);
	const scope: RuleScope = paths && paths.length > 0 ? "file-scoped" : "always";
	const globs = scope === "file-scoped" ? paths : undefined;
	return createImportedRule(
		id,
		scope,
		description,
		parts.content,
		filePath,
		globs,
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

function buildClaudeMdContent(rules: Rule[]): string {
	const sorted = [...rules].sort((a, b) => a.priority - b.priority);
	const sections: string[] = [];

	for (const rule of sorted) {
		const prefix = rule.scope === "agent-selected" ? CONTEXT_PREFIX : "";
		sections.push(`## ${prefix}${rule.description}\n\n${rule.content}`);
	}

	return `${sections.join("\n\n")}\n`;
}

function buildClaudeRuleFile(rule: Rule): string {
	if (!rule.globs || rule.globs.length === 0) {
		return `${rule.content}\n`;
	}

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

async function exportClaudeMd(
	rules: Rule[],
	projectRoot: string,
	dryRun: boolean,
): Promise<string[]> {
	const mdRules = rules.filter(
		(r) => r.scope === "always" || r.scope === "agent-selected",
	);
	if (mdRules.length === 0) return [];

	if (!dryRun) {
		const content = buildClaudeMdContent(mdRules);
		await writeFile(join(projectRoot, CLAUDE_MD), content, "utf-8");
	}
	return [CLAUDE_MD];
}

async function exportClaudeRules(
	rules: Rule[],
	projectRoot: string,
	dryRun: boolean,
): Promise<string[]> {
	const fileScoped = rules.filter((r) => r.scope === "file-scoped");
	if (fileScoped.length === 0) return [];

	const dir = join(projectRoot, RULES_DIR);
	if (!dryRun) await mkdir(dir, { recursive: true });

	const written: string[] = [];
	for (const rule of fileScoped) {
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
	const exportedIds = new Set(
		rules.filter((r) => r.scope === "file-scoped").map((r) => `${r.id}.md`),
	);
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
		const claudeMd = join(projectRoot, CLAUDE_MD);
		const claudeDir = join(projectRoot, ".claude");
		return (await pathExists(claudeMd)) || (await pathExists(claudeDir));
	},

	async import(projectRoot: string): Promise<ImportResult> {
		const mdRules = await importClaudeMd(projectRoot);
		const ruleFiles = await importClaudeRuleFiles(projectRoot);

		return {
			rules: [...mdRules, ...ruleFiles],
			warnings: [],
			source: CLAUDE_MD,
		};
	},

	async export(
		rules: Rule[],
		projectRoot: string,
		options?: ExportOptions,
	): Promise<ExportResult> {
		const dryRun = options?.dryRun === true;
		const strategy = options?.strategy ?? "overwrite";

		const mdWritten = await exportClaudeMd(rules, projectRoot, dryRun);
		const rulesWritten = await exportClaudeRules(rules, projectRoot, dryRun);
		const filesDeleted =
			strategy === "overwrite"
				? await deleteStaleRuleFiles(rules, projectRoot, dryRun)
				: [];

		return {
			filesWritten: [...mdWritten, ...rulesWritten],
			filesDeleted,
			warnings: [],
		};
	},

	getTokenBudget(): TokenBudget {
		return {
			maxTokens: 2_000,
			maxInstructions: 150,
			warningThreshold: 0.8,
			source: "Claude Code documentation",
		};
	},
};
