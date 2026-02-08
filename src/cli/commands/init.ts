/**
 * `rulix init` — scaffolds .rulix/ directory and detects existing rules.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { detectAdapters } from "../../adapters/registry.js";
import {
	configPath,
	createDefaultConfig,
	loadConfig,
	rulesPath,
} from "../../core/config.js";
import { blank, fail, header, info, success } from "../ui.js";

export async function initCommand(projectRoot: string): Promise<void> {
	header("Initializing Rulix");

	const existingConfig = await loadConfig(projectRoot);
	if (existingConfig.ok && existingConfig.value.targets.length > 0) {
		fail("Rulix is already initialized in this project");
		info("Run `rulix status` to see current configuration");
		return;
	}

	const dir = rulesPath(projectRoot);
	await mkdir(dir, { recursive: true });
	success("Created .rulix/rules/");

	const config = createDefaultConfig();
	const cfgPath = configPath(projectRoot);
	await writeFile(cfgPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
	success("Created .rulix/config.json");

	blank();
	const detected = await detectAdapters(projectRoot);

	if (detected.length > 0) {
		info("Detected existing rules:");
		for (const adapter of detected) {
			info(`  ${adapter.displayName}`);
		}
		blank();
		info("Run `rulix import --from <adapter>` to import them");
		info(`  Available: ${detected.map((a) => a.name).join(", ")}`);
	} else {
		info("No existing AI tool rules detected");
		info("Add rules to .rulix/rules/ and run `rulix sync`");
	}

	blank();
}
