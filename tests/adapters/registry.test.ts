import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	detectAdapters,
	getAdapter,
	getAdapterNames,
	getAdapters,
} from "../../src/adapters/registry.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = join(tmpdir(), `rulix-registry-test-${Date.now()}`);
	await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

// ─── getAdapters ─────────────────────────────────────────────────

describe("getAdapters", () => {
	it("returns all built-in adapters", () => {
		const adapters = getAdapters();
		expect(adapters.length).toBe(3);
	});

	it("includes cursor, claude-code, and agents-md", () => {
		const names = getAdapters().map((a) => a.name);
		expect(names).toContain("cursor");
		expect(names).toContain("claude-code");
		expect(names).toContain("agents-md");
	});
});

// ─── getAdapter ──────────────────────────────────────────────────

describe("getAdapter", () => {
	it("returns adapter by name", () => {
		const adapter = getAdapter("cursor");
		expect(adapter).toBeDefined();
		expect(adapter?.name).toBe("cursor");
		expect(adapter?.displayName).toBe("Cursor");
	});

	it("returns undefined for unknown adapter", () => {
		expect(getAdapter("unknown")).toBeUndefined();
	});
});

// ─── getAdapterNames ─────────────────────────────────────────────

describe("getAdapterNames", () => {
	it("returns all adapter names", () => {
		const names = getAdapterNames();
		expect(names).toContain("cursor");
		expect(names).toContain("claude-code");
		expect(names).toContain("agents-md");
	});
});

// ─── detectAdapters ──────────────────────────────────────────────

describe("detectAdapters", () => {
	it("returns empty array when no tools detected", async () => {
		const detected = await detectAdapters(tmpDir);
		expect(detected).toHaveLength(0);
	});

	it("detects cursor when .cursor/rules/ exists", async () => {
		await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });

		const detected = await detectAdapters(tmpDir);
		const names = detected.map((a) => a.name);
		expect(names).toContain("cursor");
	});

	it("detects claude-code when CLAUDE.md exists", async () => {
		await writeFile(join(tmpDir, "CLAUDE.md"), "# Instructions");

		const detected = await detectAdapters(tmpDir);
		const names = detected.map((a) => a.name);
		expect(names).toContain("claude-code");
	});

	it("detects agents-md when AGENTS.md exists", async () => {
		await writeFile(join(tmpDir, "AGENTS.md"), "# AGENTS");

		const detected = await detectAdapters(tmpDir);
		const names = detected.map((a) => a.name);
		expect(names).toContain("agents-md");
	});

	it("detects multiple adapters at once", async () => {
		await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });
		await writeFile(join(tmpDir, "CLAUDE.md"), "# Instructions");
		await writeFile(join(tmpDir, "AGENTS.md"), "# AGENTS");

		const detected = await detectAdapters(tmpDir);
		expect(detected).toHaveLength(3);
	});
});
