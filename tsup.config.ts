import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		"cli/index": "src/cli/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	splitting: true,
	sourcemap: true,
	clean: true,
	outDir: "dist",
});
