import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CONFIG_FILENAME,
	configPath,
	createDefaultConfig,
	loadConfig,
	RULES_DIR,
	RULIX_DIR,
	resolveConfig,
	rulesPath,
} from "../../src/core/config.js";

// ─── Path Helpers ────────────────────────────────────────────────

describe("configPath", () => {
	it("joins project root with .rulix/config.json", () => {
		expect(configPath("/my/project")).toBe(
			join("/my/project", RULIX_DIR, CONFIG_FILENAME),
		);
	});
});

describe("rulesPath", () => {
	it("joins project root with .rulix/rules", () => {
		expect(rulesPath("/my/project")).toBe(
			join("/my/project", RULIX_DIR, RULES_DIR),
		);
	});
});

// ─── createDefaultConfig ─────────────────────────────────────────

describe("createDefaultConfig", () => {
	it("returns config with empty targets and presets", () => {
		const config = createDefaultConfig();
		expect(config.targets).toEqual([]);
		expect(config.presets).toEqual([]);
		expect(config.overrides).toEqual({});
	});

	it("returns heuristic token estimation by default", () => {
		const config = createDefaultConfig();
		expect(config.options.tokenEstimation).toBe("heuristic");
		expect(config.options.agentsMdHeader).toBe(true);
		expect(config.options.claudeMdStrategy).toBe("concatenate");
		expect(config.options.syncOnSave).toBe(false);
	});
});

// ─── resolveConfig ───────────────────────────────────────────────

describe("resolveConfig", () => {
	it("rejects non-object input", () => {
		expect(resolveConfig(null).ok).toBe(false);
		expect(resolveConfig("string").ok).toBe(false);
		expect(resolveConfig(42).ok).toBe(false);
		expect(resolveConfig([]).ok).toBe(false);
	});

	it("accepts empty object and fills defaults", () => {
		const result = resolveConfig({});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.targets).toEqual([]);
		expect(result.value.presets).toEqual([]);
		expect(result.value.overrides).toEqual({});
		expect(result.value.options.tokenEstimation).toBe("heuristic");
	});

	it("preserves provided targets", () => {
		const result = resolveConfig({ targets: ["cursor", "claude-code"] });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.targets).toEqual(["cursor", "claude-code"]);
	});

	it("rejects non-string-array targets", () => {
		const result = resolveConfig({ targets: "cursor" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toContain("targets");
	});

	it("rejects non-string-array presets", () => {
		const result = resolveConfig({ presets: [42] });
		expect(result.ok).toBe(false);
	});

	it("rejects non-object overrides", () => {
		const result = resolveConfig({ overrides: "bad" });
		expect(result.ok).toBe(false);
	});

	it("preserves valid overrides", () => {
		const input = { overrides: { "my-rule": { priority: 1 } } };
		const result = resolveConfig(input);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.overrides["my-rule"]).toEqual({ priority: 1 });
	});

	it("ignores unknown top-level fields like $schema", () => {
		const result = resolveConfig({ $schema: "https://rulix.dev/schema.json" });
		expect(result.ok).toBe(true);
	});

	describe("options", () => {
		it("rejects non-object options", () => {
			const result = resolveConfig({ options: "bad" });
			expect(result.ok).toBe(false);
		});

		it("rejects invalid tokenEstimation", () => {
			const result = resolveConfig({
				options: { tokenEstimation: "invalid" },
			});
			expect(result.ok).toBe(false);
		});

		it("rejects invalid claudeMdStrategy", () => {
			const result = resolveConfig({
				options: { claudeMdStrategy: "invalid" },
			});
			expect(result.ok).toBe(false);
		});

		it("rejects non-boolean agentsMdHeader", () => {
			const result = resolveConfig({ options: { agentsMdHeader: "yes" } });
			expect(result.ok).toBe(false);
		});

		it("rejects non-boolean syncOnSave", () => {
			const result = resolveConfig({ options: { syncOnSave: 1 } });
			expect(result.ok).toBe(false);
		});

		it("accepts valid partial options and fills defaults", () => {
			const result = resolveConfig({ options: { syncOnSave: true } });
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.options.syncOnSave).toBe(true);
			expect(result.value.options.tokenEstimation).toBe("heuristic");
		});

		it("accepts tiktoken estimation", () => {
			const result = resolveConfig({
				options: { tokenEstimation: "tiktoken" },
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.options.tokenEstimation).toBe("tiktoken");
		});

		it("accepts reference claudeMdStrategy", () => {
			const result = resolveConfig({
				options: { claudeMdStrategy: "reference" },
			});
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value.options.claudeMdStrategy).toBe("reference");
		});
	});
});

// ─── loadConfig (filesystem) ─────────────────────────────────────

describe("loadConfig", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdir(join(tmpdir(), "rulix-test-"), { recursive: true });
		tmpDir = join(tmpdir(), `rulix-test-${Date.now()}`);
		await mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("returns defaults when config file is missing", async () => {
		const result = await loadConfig(tmpDir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.targets).toEqual([]);
	});

	it("parses valid config file", async () => {
		const configDir = join(tmpDir, RULIX_DIR);
		await mkdir(configDir, { recursive: true });
		await writeFile(
			join(configDir, CONFIG_FILENAME),
			JSON.stringify({ targets: ["cursor"] }),
		);

		const result = await loadConfig(tmpDir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.targets).toEqual(["cursor"]);
	});

	it("returns error for invalid JSON", async () => {
		const configDir = join(tmpDir, RULIX_DIR);
		await mkdir(configDir, { recursive: true });
		await writeFile(join(configDir, CONFIG_FILENAME), "{ not valid json }");

		const result = await loadConfig(tmpDir);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toContain("Invalid JSON");
	});

	it("returns error for invalid config values", async () => {
		const configDir = join(tmpDir, RULIX_DIR);
		await mkdir(configDir, { recursive: true });
		await writeFile(
			join(configDir, CONFIG_FILENAME),
			JSON.stringify({ targets: "not-an-array" }),
		);

		const result = await loadConfig(tmpDir);
		expect(result.ok).toBe(false);
	});
});
