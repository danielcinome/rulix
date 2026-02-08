#!/usr/bin/env node

/**
 * Rulix CLI entry point.
 * Hand-rolled argument parsing — zero dependencies.
 */

import { readFileSync } from "node:fs";
import { importCommand } from "./commands/import.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";
import { validateCommand } from "./commands/validate.js";
import { color, fail, log } from "./ui.js";

// ─── Version ─────────────────────────────────────────────────────

function readVersion(): string {
	try {
		const url = new URL("../../package.json", import.meta.url);
		const pkg = JSON.parse(readFileSync(url, "utf-8")) as {
			version?: string;
		};
		return pkg.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}

// ─── Argument Parsing ────────────────────────────────────────────

interface CliArgs {
	readonly command: string | undefined;
	readonly flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): CliArgs {
	let command: string | undefined;
	const flags: Record<string, string | true> = {};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;

		if (arg.startsWith("--")) {
			const eqIdx = arg.indexOf("=");
			if (eqIdx !== -1) {
				flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
			} else {
				const next = argv[i + 1];
				if (next !== undefined && !next.startsWith("-")) {
					flags[arg.slice(2)] = next;
					i++;
				} else {
					flags[arg.slice(2)] = true;
				}
			}
		} else if (arg.startsWith("-")) {
			for (const ch of arg.slice(1)) {
				flags[ch] = true;
			}
		} else if (command === undefined) {
			command = arg;
		}
	}

	return { command, flags };
}

// ─── Help ────────────────────────────────────────────────────────

function showHelp(): void {
	log(`
  ${color.bold("rulix")} — One ruleset. Every AI coding tool.

  ${color.bold("Usage:")}
    rulix <command> [options]

  ${color.bold("Commands:")}
    init              Initialize Rulix in current project
    import            Import rules from existing tool configs
    sync              Generate/update all target tool configs
    validate          Check rules for issues
    status            Show rules overview and token budgets

  ${color.bold("Options:")}
    --version         Show version
    --help            Show help
    --verbose, -v     Verbose output
    --dry-run         Show what would change without writing
    --from <adapter>  Adapter to import from (cursor, claude-code)
    --target <name>   Specific target for sync
`);
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	if (args.flags.version === true) {
		log(readVersion());
		return;
	}

	if (args.flags.help === true || args.command === undefined) {
		showHelp();
		return;
	}

	const cwd = process.cwd();

	switch (args.command) {
		case "init":
			await initCommand(cwd);
			break;
		case "import": {
			const from =
				typeof args.flags.from === "string" ? args.flags.from : undefined;
			await importCommand(cwd, from);
			break;
		}
		case "sync":
			await syncCommand(cwd, {
				target:
					typeof args.flags.target === "string" ? args.flags.target : undefined,
				dryRun: args.flags["dry-run"] === true,
			});
			break;
		case "validate":
			await validateCommand(cwd);
			break;
		case "status":
			await statusCommand(cwd);
			break;
		default:
			fail(`Unknown command: "${args.command}"`);
			showHelp();
			process.exitCode = 1;
	}
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err);
	fail(message);
	process.exitCode = 1;
});
