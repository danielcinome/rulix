/**
 * Hand-rolled frontmatter parser for `.rulix/rules/*.md`.
 *
 * Supports the subset of YAML needed by Rulix frontmatter:
 * simple key-value pairs, quoted strings, numbers, and arrays
 * (both inline `[a, b]` and multi-line `- a`).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rulesPath } from "./config.js";
import type { Result, Rule, RuleCategory, RuleScope } from "./ir.js";
import { RulixError } from "./ir.js";
import { estimateRuleTokens } from "./tokenizer.js";

const DEFAULT_CATEGORY: RuleCategory = "general";
const DEFAULT_PRIORITY = 3;

// ─── Error Helper ────────────────────────────────────────────────

function parseError(message: string, filePath?: string): Result<never> {
	const suffix = filePath ? ` in ${filePath}` : "";
	return {
		ok: false,
		error: new RulixError("PARSE_ERROR", `${message}${suffix}`),
	};
}

// ─── YAML Helpers ────────────────────────────────────────────────

function stripQuotes(value: string): string {
	const t = value.trim();
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

function parseYamlValue(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === "") return trimmed;
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return parseInlineArray(trimmed);
	}
	if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	return stripQuotes(trimmed);
}

// ─── Frontmatter Splitting ───────────────────────────────────────

interface FrontmatterParts {
	readonly yaml: string;
	readonly content: string;
}

function splitFrontmatter(raw: string): Result<FrontmatterParts> {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");

	if (lines[0]?.trim() !== "---") {
		return parseError("File must start with frontmatter (---)");
	}

	let closingIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			closingIndex = i;
			break;
		}
	}

	if (closingIndex === -1) {
		return parseError("Unterminated frontmatter (missing closing ---)");
	}

	return {
		ok: true,
		value: {
			yaml: lines.slice(1, closingIndex).join("\n"),
			content: lines.slice(closingIndex + 1).join("\n"),
		},
	};
}

// ─── Frontmatter Field Parsing ───────────────────────────────────

function parseFrontmatterFields(yaml: string): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	const lines = yaml.split("\n");
	let arrayKey: string | undefined;
	let arrayItems: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") continue;

		if (trimmed.startsWith("- ")) {
			if (arrayKey !== undefined) {
				arrayItems.push(stripQuotes(trimmed.slice(2)));
			}
			continue;
		}

		if (arrayKey !== undefined) {
			fields[arrayKey] = arrayItems;
			arrayKey = undefined;
			arrayItems = [];
		}

		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) continue;

		const key = trimmed.slice(0, colonIndex).trim();
		const rawValue = trimmed.slice(colonIndex + 1).trim();

		if (rawValue === "") {
			arrayKey = key;
			arrayItems = [];
		} else {
			fields[key] = parseYamlValue(rawValue);
		}
	}

	if (arrayKey !== undefined) fields[arrayKey] = arrayItems;

	return fields;
}

// ─── Type Guards ─────────────────────────────────────────────────

function isValidScope(value: unknown): value is RuleScope {
	return (
		value === "always" || value === "file-scoped" || value === "agent-selected"
	);
}

function isValidCategory(value: unknown): value is RuleCategory {
	return (
		value === "style" ||
		value === "security" ||
		value === "testing" ||
		value === "architecture" ||
		value === "workflow" ||
		value === "general"
	);
}

function normalizeGlobs(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return [value];
	if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
		return value as string[];
	}
	return undefined;
}

// ─── Public API: Parse & Serialize ───────────────────────────────

/** Parses a markdown file with YAML frontmatter into a Rule. */
export function parseRule(raw: string, filePath: string): Result<Rule> {
	const split = splitFrontmatter(raw);
	if (!split.ok) return parseError(split.error.message, filePath);

	const fields = parseFrontmatterFields(split.value.yaml);
	const content = split.value.content.trim();
	const { id, scope, description } = fields;

	if (typeof id !== "string" || id === "") {
		return parseError('Missing required field "id"', filePath);
	}
	if (!isValidScope(scope)) {
		return parseError('Invalid or missing "scope"', filePath);
	}
	if (typeof description !== "string" || description === "") {
		return parseError('Missing required field "description"', filePath);
	}

	const globs = normalizeGlobs(fields.globs);
	const extendsVal =
		typeof fields.extends === "string" ? fields.extends : undefined;

	return {
		ok: true,
		value: {
			id,
			scope,
			description,
			content,
			category: isValidCategory(fields.category)
				? fields.category
				: DEFAULT_CATEGORY,
			priority:
				typeof fields.priority === "number"
					? fields.priority
					: DEFAULT_PRIORITY,
			estimatedTokens: estimateRuleTokens(content, description),
			...(globs !== undefined ? { globs } : {}),
			...(extendsVal !== undefined ? { extends: extendsVal } : {}),
		},
	};
}

function serializeGlobs(globs: string[], lines: string[]): void {
	if (globs.length === 1) {
		const first = globs[0];
		if (first !== undefined) lines.push(`globs: "${first}"`);
		return;
	}
	lines.push("globs:");
	for (const glob of globs) {
		lines.push(`  - "${glob}"`);
	}
}

/** Serializes a Rule back to markdown with YAML frontmatter. */
export function serializeRule(rule: Rule): string {
	const lines: string[] = ["---"];
	lines.push(`id: ${rule.id}`);
	lines.push(`scope: ${rule.scope}`);
	lines.push(`description: "${rule.description}"`);
	if (rule.globs && rule.globs.length > 0) serializeGlobs(rule.globs, lines);
	lines.push(`category: ${rule.category}`);
	lines.push(`priority: ${rule.priority}`);
	if (rule.extends) lines.push(`extends: ${rule.extends}`);
	lines.push("---");
	lines.push("");
	lines.push(rule.content);
	lines.push("");
	return lines.join("\n");
}

// ─── Public API: I/O ─────────────────────────────────────────────

/** Reads and parses all `.md` rule files from `.rulix/rules/`. */
export async function loadRules(projectRoot: string): Promise<Result<Rule[]>> {
	const dir = rulesPath(projectRoot);

	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return { ok: true, value: [] };
		}
		throw error;
	}

	const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
	const rules: Rule[] = [];

	for (const file of mdFiles) {
		const filePath = join(dir, file);
		const raw = await readFile(filePath, "utf-8");
		const result = parseRule(raw, filePath);
		if (!result.ok) return result;
		rules.push(result.value);
	}

	return { ok: true, value: rules };
}

/** Writes a single rule to `.rulix/rules/{id}.md`. Creates the directory if needed. */
export async function writeRule(
	projectRoot: string,
	rule: Rule,
): Promise<void> {
	const dir = rulesPath(projectRoot);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${rule.id}.md`), serializeRule(rule), "utf-8");
}
