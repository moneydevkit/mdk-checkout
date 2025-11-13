import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	splitting: false,
	shims: false,
	sourcemap: true,
	clean: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
});
