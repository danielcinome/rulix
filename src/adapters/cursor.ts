/**
 * Cursor adapter: imports from `.cursor/rules/*.mdc` and `.cursorrules`,
 * exports IR rules to `.cursor/rules/*.mdc`.
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
	ExportWarning,
	ImportResult,
	ImportWarning,
	Rule,
	RuleScope,
	RulixAdapter,
	TokenBudget,
} from "../core/ir.js";
import { estimateRuleTokens } from "../core/tokenizer.js";

const RULES_DIR = ".cursor/rules";
const LEGACY_FILE = ".cursorrules";
const MDC_EXT = ".mdc";

// ─── Filesystem Helpers ──────────────────────────────────────────

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function listMdcFiles(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir);
		return entries.filter((f) => f.endsWith(MDC_EXT)).sort();
	} catch {
		return [];
	}
}

// ─── Frontmatter Parsing ─────────────────────────────────────────

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

function parseInlineArray(raw: string): string[] {
	const inner = raw.slice(1, -1).trim();
	if (inner === "") return [];
	return inner.split(",").map(stripQuotes);
}

interface MdcParts {
	readonly yaml: string;
	readonly content: string;
}

function splitMdcFrontmatter(raw: string): MdcParts | null {
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

interface MdcFields {
	readonly description: string | undefined;
	readonly globs: string[] | undefined;
	readonly alwaysApply: boolean;
}

function parseMdcFields(yaml: string): MdcFields {
	let description: string | undefined;
	let globs: string[] | undefined;
	let alwaysApply = false;

	for (const line of yaml.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (key === "description" && value !== "") {
			description = stripQuotes(value);
		} else if (key === "globs" && value !== "") {
			globs =
				value.startsWith("[") && value.endsWith("]")
					? parseInlineArray(value)
					: [stripQuotes(value)];
		} else if (key === "alwaysApply") {
			alwaysApply = value === "true";
		}
	}

	return { description, globs, alwaysApply };
}

// ─── Scope Mapping ───────────────────────────────────────────────

function determineScope(fields: MdcFields): RuleScope {
	if (fields.alwaysApply) return "always";
	if (fields.globs && fields.globs.length > 0) return "file-scoped";
	if (fields.description) return "agent-selected";
	return "always";
}

// ─── Import Helpers ──────────────────────────────────────────────

function importRuleWithoutFrontmatter(
	raw: string,
	filePath: string,
	id: string,
): { rule: Rule; warning: ImportWarning } {
	const content = raw.replace(/\r\n/g, "\n").trim();
	const description = id.replace(/-/g, " ");
	return {
		rule: {
			id,
			scope: "always",
			description,
			content,
			category: "general",
			priority: 3,
			estimatedTokens: estimateRuleTokens(content, description),
			source: {
				adapter: "cursor",
				filePath,
				importedAt: new Date().toISOString(),
			},
		},
		warning: {
			filePath,
			message: "No frontmatter found, treating as always-on rule",
		},
	};
}

function importRuleWithFrontmatter(
	parts: MdcParts,
	filePath: string,
	id: string,
): Rule {
	const fields = parseMdcFields(parts.yaml);
	const scope = determineScope(fields);
	const description = fields.description ?? id.replace(/-/g, " ");

	return {
		id,
		scope,
		description,
		content: parts.content,
		category: "general",
		priority: 3,
		estimatedTokens: estimateRuleTokens(parts.content, description),
		...(scope === "file-scoped" && fields.globs ? { globs: fields.globs } : {}),
		source: {
			adapter: "cursor",
			filePath,
			importedAt: new Date().toISOString(),
		},
	};
}

async function importMdcFiles(
	projectRoot: string,
): Promise<{ rules: Rule[]; warnings: ImportWarning[] }> {
	const rules: Rule[] = [];
	const warnings: ImportWarning[] = [];
	const dir = join(projectRoot, RULES_DIR);
	const files = await listMdcFiles(dir);

	for (const file of files) {
		const filePath = join(RULES_DIR, file);
		const raw = await readFile(join(projectRoot, filePath), "utf-8");
		const id = basename(file, MDC_EXT);
		const parts = splitMdcFrontmatter(raw);

		if (!parts) {
			const result = importRuleWithoutFrontmatter(raw, filePath, id);
			rules.push(result.rule);
			warnings.push(result.warning);
		} else {
			rules.push(importRuleWithFrontmatter(parts, filePath, id));
		}
	}

	return { rules, warnings };
}

async function importLegacyFile(
	projectRoot: string,
): Promise<{ rules: Rule[]; warnings: ImportWarning[] }> {
	const legacyPath = join(projectRoot, LEGACY_FILE);
	if (!(await pathExists(legacyPath))) return { rules: [], warnings: [] };

	const raw = await readFile(legacyPath, "utf-8");
	const content = raw.trim();
	if (content === "") return { rules: [], warnings: [] };

	return {
		rules: [
			{
				id: "cursorrules-legacy",
				scope: "always",
				description: "Legacy .cursorrules file",
				content,
				category: "general",
				priority: 3,
				estimatedTokens: estimateRuleTokens(content, "Legacy .cursorrules"),
				source: {
					adapter: "cursor",
					filePath: LEGACY_FILE,
					importedAt: new Date().toISOString(),
				},
			},
		],
		warnings: [
			{
				filePath: LEGACY_FILE,
				message: ".cursorrules is deprecated. Migrate to .cursor/rules/*.mdc",
			},
		],
	};
}

// ─── Export Helpers ──────────────────────────────────────────────

function serializeMdcGlobs(globs: string[]): string {
	if (globs.length === 1) {
		const first = globs[0];
		if (first !== undefined) return `globs: "${first}"`;
	}
	const items = globs.map((g) => `"${g}"`).join(", ");
	return `globs: [${items}]`;
}

function ruleToMdc(rule: Rule): string {
	const lines: string[] = ["---"];
	lines.push(`description: "${rule.description}"`);
	if (rule.scope === "file-scoped" && rule.globs && rule.globs.length > 0) {
		lines.push(serializeMdcGlobs(rule.globs));
	}
	lines.push(`alwaysApply: ${rule.scope === "always"}`);
	lines.push("---");
	lines.push("");
	lines.push(rule.content);
	lines.push("");
	return lines.join("\n");
}

async function deleteStaleFiles(
	projectRoot: string,
	exportedIds: Set<string>,
	dryRun: boolean,
): Promise<string[]> {
	const dir = join(projectRoot, RULES_DIR);
	const existing = await listMdcFiles(dir);
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

export const cursorAdapter: RulixAdapter = {
	name: "cursor",
	displayName: "Cursor",

	async detect(projectRoot: string): Promise<boolean> {
		const rulesDir = join(projectRoot, RULES_DIR);
		const legacyFile = join(projectRoot, LEGACY_FILE);
		return (await pathExists(rulesDir)) || (await pathExists(legacyFile));
	},

	async import(projectRoot: string): Promise<ImportResult> {
		const mdc = await importMdcFiles(projectRoot);
		const legacy = await importLegacyFile(projectRoot);

		return {
			rules: [...mdc.rules, ...legacy.rules],
			warnings: [...mdc.warnings, ...legacy.warnings],
			source: RULES_DIR,
		};
	},

	async export(
		rules: Rule[],
		projectRoot: string,
		options?: ExportOptions,
	): Promise<ExportResult> {
		const dir = join(projectRoot, RULES_DIR);
		const dryRun = options?.dryRun === true;
		const strategy = options?.strategy ?? "overwrite";
		const filesWritten: string[] = [];
		const warnings: ExportWarning[] = [];

		if (!dryRun) await mkdir(dir, { recursive: true });

		for (const rule of rules) {
			const filePath = join(RULES_DIR, `${rule.id}${MDC_EXT}`);
			if (!dryRun) {
				await writeFile(join(projectRoot, filePath), ruleToMdc(rule), "utf-8");
			}
			filesWritten.push(filePath);
		}

		const exportedIds = new Set(rules.map((r) => `${r.id}${MDC_EXT}`));
		const filesDeleted =
			strategy === "overwrite"
				? await deleteStaleFiles(projectRoot, exportedIds, dryRun)
				: [];

		return { filesWritten, filesDeleted, warnings };
	},

	getTokenBudget(): TokenBudget {
		return {
			maxTokens: 10_000,
			maxInstructions: 500,
			warningThreshold: 0.8,
			source: "Cursor documentation",
		};
	},
};
