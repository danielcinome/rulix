/**
 * Schema, defaults, and loader for `.rulix/config.json`.
 *
 * Pure validation lives in `resolveConfig`; filesystem I/O lives in `loadConfig`.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	Result,
	Rule,
	RulixConfig,
	RulixConfigOptions,
	TokenEstimation,
} from "./ir.js";
import { RulixError } from "./ir.js";

export const RULIX_DIR = ".rulix";
export const CONFIG_FILENAME = "config.json";
export const RULES_DIR = "rules";

const DEFAULT_OPTIONS: RulixConfigOptions = {
	tokenEstimation: "heuristic",
	agentsMdHeader: true,
	syncOnSave: false,
};

const DEFAULT_CONFIG: RulixConfig = {
	targets: [],
	presets: [],
	overrides: {},
	options: DEFAULT_OPTIONS,
};

export function configPath(projectRoot: string): string {
	return join(projectRoot, RULIX_DIR, CONFIG_FILENAME);
}

export function rulesPath(projectRoot: string): string {
	return join(projectRoot, RULIX_DIR, RULES_DIR);
}

export function createDefaultConfig(): RulixConfig {
	return DEFAULT_CONFIG;
}

// ─── Validation ──────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function configError(message: string): Result<never> {
	return { ok: false, error: new RulixError("CONFIG_INVALID", message) };
}

function resolveOptions(raw: unknown): Result<RulixConfigOptions> {
	if (raw === undefined) return { ok: true, value: DEFAULT_OPTIONS };
	if (!isRecord(raw)) return configError('"options" must be an object');

	if (
		raw.tokenEstimation !== undefined &&
		raw.tokenEstimation !== "heuristic" &&
		raw.tokenEstimation !== "tiktoken"
	) {
		return configError(
			'"options.tokenEstimation" must be "heuristic" or "tiktoken"',
		);
	}
	if (
		raw.agentsMdHeader !== undefined &&
		typeof raw.agentsMdHeader !== "boolean"
	) {
		return configError('"options.agentsMdHeader" must be a boolean');
	}
	if (raw.syncOnSave !== undefined && typeof raw.syncOnSave !== "boolean") {
		return configError('"options.syncOnSave" must be a boolean');
	}

	return {
		ok: true,
		value: {
			tokenEstimation:
				(raw.tokenEstimation as TokenEstimation | undefined) ??
				DEFAULT_OPTIONS.tokenEstimation,
			agentsMdHeader:
				(raw.agentsMdHeader as boolean | undefined) ??
				DEFAULT_OPTIONS.agentsMdHeader,
			syncOnSave:
				(raw.syncOnSave as boolean | undefined) ?? DEFAULT_OPTIONS.syncOnSave,
		},
	};
}

/** Validates raw JSON and merges with defaults to produce a fully-resolved config. */
export function resolveConfig(raw: unknown): Result<RulixConfig> {
	if (!isRecord(raw)) return configError("Config must be a JSON object");

	if (raw.targets !== undefined && !isStringArray(raw.targets)) {
		return configError('"targets" must be an array of strings');
	}
	if (raw.presets !== undefined && !isStringArray(raw.presets)) {
		return configError('"presets" must be an array of strings');
	}
	if (raw.overrides !== undefined && !isRecord(raw.overrides)) {
		return configError('"overrides" must be an object');
	}

	const options = resolveOptions(raw.options);
	if (!options.ok) return options;

	return {
		ok: true,
		value: {
			targets: (raw.targets as string[] | undefined) ?? DEFAULT_CONFIG.targets,
			presets: (raw.presets as string[] | undefined) ?? DEFAULT_CONFIG.presets,
			overrides:
				(raw.overrides as Record<string, Partial<Rule>> | undefined) ??
				DEFAULT_CONFIG.overrides,
			options: options.value,
		},
	};
}

// ─── I/O ─────────────────────────────────────────────────────────

/** Reads `.rulix/config.json` from disk. Returns defaults if file is missing. */
export async function loadConfig(
	projectRoot: string,
): Promise<Result<RulixConfig>> {
	const filePath = configPath(projectRoot);

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return { ok: true, value: createDefaultConfig() };
		}
		throw error;
	}

	let raw: unknown;
	try {
		raw = JSON.parse(content);
	} catch {
		return configError(`Invalid JSON in ${filePath}`);
	}

	return resolveConfig(raw);
}
