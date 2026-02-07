import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../../src/cli/commands/init.js";
import { importCommand } from "../../src/cli/commands/import.js";
import { syncCommand } from "../../src/cli/commands/sync.js";
import { validateCommand } from "../../src/cli/commands/validate.js";
import { statusCommand } from "../../src/cli/commands/status.js";
import { writeRule } from "../../src/core/parser.js";
import type { Rule } from "../../src/core/ir.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = join(tmpdir(), `rulix-cli-test-${Date.now()}`);
	await mkdir(tmpDir, { recursive: true });
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function makeRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "test-rule",
		scope: "always",
		description: "A test rule for CLI testing",
		content: "This is enough content to pass validation checks.",
		category: "style",
		priority: 1,
		estimatedTokens: 15,
		...overrides,
	};
}

// ─── init ────────────────────────────────────────────────────────

describe("initCommand", () => {
	it("creates .rulix directory structure", async () => {
		await initCommand(tmpDir);

		const config = await readFile(
			join(tmpDir, ".rulix/config.json"),
			"utf-8",
		);
		expect(JSON.parse(config)).toHaveProperty("targets");
	});

	it("creates rules directory", async () => {
		await initCommand(tmpDir);

		const rulesDir = join(tmpDir, ".rulix/rules");
		const stat = await import("node:fs/promises").then((fs) =>
			fs.access(rulesDir),
		);
		expect(stat).toBeUndefined();
	});

	it("detects existing cursor rules", async () => {
		await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });
		await initCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Cursor");
	});
});

// ─── import ──────────────────────────────────────────────────────

describe("importCommand", () => {
	it("fails without --from flag", async () => {
		await importCommand(tmpDir, undefined);

		const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Missing");
	});

	it("fails with unknown adapter", async () => {
		await importCommand(tmpDir, "unknown");

		const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Unknown adapter");
	});

	it("imports cursor rules into .rulix/rules/", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "my-rule.mdc"),
			`---
description: "My imported rule"
alwaysApply: true
---

Follow these conventions.
`,
		);

		await importCommand(tmpDir, "cursor");

		const imported = await readFile(
			join(tmpDir, ".rulix/rules/my-rule.md"),
			"utf-8",
		);
		expect(imported).toContain("my-rule");
	});

	it("reports import count", async () => {
		const dir = join(tmpDir, ".cursor/rules");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "rule.mdc"),
			`---
description: "Rule"
alwaysApply: true
---

Content.
`,
		);

		await importCommand(tmpDir, "cursor");

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Imported 1 rule(s)");
	});
});

// ─── sync ────────────────────────────────────────────────────────

describe("syncCommand", () => {
	it("reports when no rules found", async () => {
		await mkdir(join(tmpDir, ".rulix"), { recursive: true });
		await syncCommand(tmpDir, { dryRun: false });

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("No rules found");
	});

	it("syncs rules to all targets", async () => {
		await writeRule(tmpDir, makeRule());

		await syncCommand(tmpDir, { dryRun: false });

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Synced");
	});

	it("syncs to specific target", async () => {
		await writeRule(tmpDir, makeRule());

		await syncCommand(tmpDir, { target: "cursor", dryRun: false });

		const mdc = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		);
		expect(mdc).toContain("A test rule");
	});

	it("supports dry run", async () => {
		await writeRule(tmpDir, makeRule());

		await syncCommand(tmpDir, { target: "cursor", dryRun: true });

		const exists = await readFile(
			join(tmpDir, ".cursor/rules/test-rule.mdc"),
			"utf-8",
		).catch(() => null);
		expect(exists).toBeNull();
	});

	it("blocks sync when validation fails", async () => {
		await writeRule(tmpDir, makeRule({ scope: "file-scoped" }));

		await syncCommand(tmpDir, { dryRun: false });

		const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Validation failed");
	});
});

// ─── validate ────────────────────────────────────────────────────

describe("validateCommand", () => {
	it("reports when no rules found", async () => {
		await mkdir(join(tmpDir, ".rulix"), { recursive: true });
		await validateCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("No rules found");
	});

	it("reports validation passed", async () => {
		await writeRule(tmpDir, makeRule());

		await validateCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("passed");
	});

	it("reports validation errors", async () => {
		await writeRule(tmpDir, makeRule({ scope: "file-scoped" }));

		await validateCommand(tmpDir);

		const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("file-scoped");
	});
});

// ─── status ──────────────────────────────────────────────────────

describe("statusCommand", () => {
	it("shows rule count", async () => {
		await writeRule(tmpDir, makeRule({ id: "rule-a" }));
		await writeRule(tmpDir, makeRule({ id: "rule-b" }));

		await statusCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("2 rule(s)");
	});

	it("shows scope breakdown", async () => {
		await writeRule(tmpDir, makeRule({ scope: "always" }));

		await statusCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("always");
	});

	it("shows token budgets", async () => {
		await writeRule(tmpDir, makeRule());

		await statusCommand(tmpDir);

		const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
		const output = calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("Token budgets");
	});
});
