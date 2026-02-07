/**
 * Adapter registry: lookup by name and auto-detection.
 */

import type { RulixAdapter } from "../core/ir.js";
import { agentsMdAdapter } from "./agents-md.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { cursorAdapter } from "./cursor.js";

const BUILTIN_ADAPTERS: RulixAdapter[] = [
	cursorAdapter,
	claudeCodeAdapter,
	agentsMdAdapter,
];

const adapterMap = new Map<string, RulixAdapter>(
	BUILTIN_ADAPTERS.map((a) => [a.name, a]),
);

/** Returns all registered adapters. */
export function getAdapters(): RulixAdapter[] {
	return [...adapterMap.values()];
}

/** Returns an adapter by name, or `undefined` if not found. */
export function getAdapter(name: string): RulixAdapter | undefined {
	return adapterMap.get(name);
}

/** Returns all adapter names. */
export function getAdapterNames(): string[] {
	return [...adapterMap.keys()];
}

/** Detects which adapters have existing rules in a project. */
export async function detectAdapters(
	projectRoot: string,
): Promise<RulixAdapter[]> {
	const results = await Promise.all(
		BUILTIN_ADAPTERS.map(async (adapter) => ({
			adapter,
			detected: await adapter.detect(projectRoot),
		})),
	);
	return results.filter((r) => r.detected).map((r) => r.adapter);
}
