/**
 * `rulix import --from <adapter>` — imports rules from an existing tool.
 */

import { getAdapter } from "../../adapters/registry.js";
import { writeRule } from "../../core/parser.js";
import { blank, fail, header, info, success, warning } from "../ui.js";

export async function importCommand(
	projectRoot: string,
	adapterName: string | undefined,
): Promise<void> {
	if (!adapterName) {
		fail("Missing required flag: --from <adapter>");
		info("Example: rulix import --from cursor");
		return;
	}

	const adapter = getAdapter(adapterName);
	if (!adapter) {
		fail(`Unknown adapter: "${adapterName}"`);
		info("Available: cursor, claude-code, agents-md");
		return;
	}

	header(`Importing from ${adapter.displayName}`);

	const result = await adapter.import(projectRoot);

	if (result.rules.length === 0) {
		info("No rules found to import");
		return;
	}

	for (const rule of result.rules) {
		await writeRule(projectRoot, rule);
		success(`${rule.id}.md (${rule.scope})`);
	}

	for (const w of result.warnings) {
		warning(w.message);
	}

	blank();
	const warnCount = result.warnings.length;
	const warnSuffix = warnCount > 0 ? ` with ${warnCount} warning(s)` : "";
	success(`Imported ${result.rules.length} rule(s)${warnSuffix}`);
	blank();
}
