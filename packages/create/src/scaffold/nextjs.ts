import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { NextJsDetection } from "../utils/nextjs-detector.js";
import {
	detectPackageManager,
	hasDependency,
	type PackageManager,
} from "../utils/package-manager.js";
import {
	readFileSafe,
	writeFileIfAbsent,
	writeFileWithBackup,
} from "../utils/fs-utils.js";

const templateRoot = new URL("../templates/nextjs/", import.meta.url);

function readTemplate(relativePath: string): string {
	return fs.readFileSync(new URL(relativePath, templateRoot), "utf8");
}

type ConfigResult =
	| { status: "created"; path: string; backupPath?: string }
	| { status: "updated"; path: string; backupPath?: string }
	| { status: "skipped"; path: string; reason: string };

export type ScaffoldSummary = {
	rootDir: string;
	packageManager: PackageManager;
	installedPackage: boolean;
	installSkipped: boolean;
	addedFiles: string[];
	skippedFiles: string[];
	config?: ConfigResult;
	warnings: string[];
};

function findExistingConfig(rootDir: string, preferred?: string): string | undefined {
	if (preferred && fs.existsSync(preferred)) return preferred;
	const candidates = [
		"next.config.js",
		"next.config.cjs",
		"next.config.mjs",
		"next.config.ts",
		"next.config.mts",
	];
	for (const candidate of candidates) {
		const fullPath = path.join(rootDir, candidate);
		if (fs.existsSync(fullPath)) {
			return fullPath;
		}
	}
	return undefined;
}

async function installNextjsPackage(
	rootDir: string,
	packageManager: PackageManager,
): Promise<{ installed: boolean; skipped: boolean }> {
	if (hasDependency(rootDir, "@moneydevkit/nextjs")) {
		return { installed: false, skipped: true };
	}

	const commandForPm: Record<PackageManager, [string, string[]]> = {
		pnpm: ["pnpm", ["add", "@moneydevkit/nextjs"]],
		yarn: ["yarn", ["add", "@moneydevkit/nextjs"]],
		npm: ["npm", ["install", "@moneydevkit/nextjs"]],
		bun: ["bun", ["add", "@moneydevkit/nextjs"]],
	};

	const [cmd, args] = commandForPm[packageManager];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "inherit", cwd: rootDir });
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
			}
		});
		child.on("error", reject);
	});

	return { installed: true, skipped: false };
}

function createAppRouteContent(isTypeScript: boolean): string {
	return readTemplate(`app/api/mdk/route.${isTypeScript ? "ts" : "js"}`);
}

function createAppCheckoutPageContent(isTypeScript: boolean): string {
	return readTemplate(
		`app/checkout/[id]/page.${isTypeScript ? "tsx" : "js"}`,
	);
}

function isTypeScriptConfig(configPath: string): boolean {
	return configPath.endsWith(".ts") || configPath.endsWith(".mts");
}

function patchNextConfigTypes(source: string): string {
	// Strip NextConfig imports and swap annotations to the plugin's override type.
	let patched = source.replace(
		/import\s+type\s+\{\s*NextConfig\s*\}\s+from\s+["']next["'];?\s*\n?/g,
		"",
	);
	patched = patched.replace(/:\s*NextConfig\b/g, ": NextConfigOverrides");
	return patched;
}

function updateConfigFile(configPath: string): ConfigResult {
	const isTs = isTypeScriptConfig(configPath);
	const pluginImport = isTs
		? 'import withMdkCheckout, { type NextConfigOverrides } from "@moneydevkit/nextjs/next-plugin";'
		: 'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";';

	if (!fs.existsSync(configPath)) {
		const content = [
			pluginImport,
			"",
			"// Wrap your existing Next.js config with withMdkCheckout to enable Money Dev Kit.",
			"// Example: export default withMdkCheckout(yourConfig)",
			isTs
				? "const nextConfig: NextConfigOverrides = {};"
				: "const nextConfig = {};",
			"",
			"export default withMdkCheckout(nextConfig);",
			"",
		].join("\n");

		const writeResult = writeFileWithBackup(configPath, content);
		return {
			status: "created",
			path: configPath,
			backupPath:
				writeResult.status === "updated-with-backup"
					? writeResult.backupPath
					: undefined,
		};
	}

	const original = readFileSafe(configPath) ?? "";

	if (
		original.includes("@moneydevkit/nextjs/next-plugin") ||
		original.includes("withMdkCheckout")
	) {
		return { status: "skipped", path: configPath, reason: "already configured" };
	}

	if (original.includes("module.exports")) {
		const re = /module\.exports\s*=\s*(\{[\s\S]*?\});?/;
		const match = original.match(re);

		if (match) {
			const prefix =
				'const withMdkCheckout = require("@moneydevkit/nextjs/next-plugin").default ?? require("@moneydevkit/nextjs/next-plugin");\n';
			const replaced = original.replace(
				re,
				`module.exports = withMdkCheckout(${match[1]});`,
			);
			const result = writeFileWithBackup(configPath, `${prefix}${replaced}`);
			return {
				status: "updated",
				path: configPath,
				backupPath:
					result.status === "updated-with-backup" ? result.backupPath : undefined,
			};
		}
	}

	if (original.includes("export default")) {
		const reDefaultObject = /export\s+default\s+(\{[\s\S]*?\});?/;
		const objectMatch = original.match(reDefaultObject);
		if (objectMatch) {
			const content = [
				pluginImport,
				"",
				isTs
					? "const nextConfig: NextConfigOverrides = " + objectMatch[1] + ";"
					: "const nextConfig = " + objectMatch[1] + ";",
				"",
				"export default withMdkCheckout(nextConfig);",
				"",
			].join("\n");
			const writeResult = writeFileWithBackup(configPath, content);
			return {
				status: "updated",
				path: configPath,
				backupPath:
					writeResult.status === "updated-with-backup"
						? writeResult.backupPath
						: undefined,
			};
		}

		const reNamed = /export\s+default\s+([a-zA-Z0-9_]+)\s*;?/;
		const namedMatch = original.match(reNamed);
		if (namedMatch) {
			const name = namedMatch[1];
			const patched =
				isTs && original.includes("NextConfig")
					? patchNextConfigTypes(original)
					: original;
			const lines = [
				pluginImport,
				patched.replace(reNamed, `export default withMdkCheckout(${name});`),
			];
			const writeResult = writeFileWithBackup(configPath, lines.join("\n"));
			return {
				status: "updated",
				path: configPath,
				backupPath:
					writeResult.status === "updated-with-backup"
						? writeResult.backupPath
						: undefined,
			};
		}
	}

	return {
		status: "skipped",
		path: configPath,
		reason:
			"unrecognized format; wrap your export with withMdkCheckout, e.g. export default withMdkCheckout(yourConfig)",
	};
}

function scaffoldAppRouter(
	appDir: string,
	isTypeScript: boolean,
): { added: string[]; skipped: string[] } {
	const added: string[] = [];
	const skipped: string[] = [];

	const routePath = path.join(
		appDir,
		"api",
		"mdk",
		`route.${isTypeScript ? "ts" : "js"}`,
	);
	const routeResult = writeFileIfAbsent(
		routePath,
		createAppRouteContent(isTypeScript),
	);
	if (routeResult.status === "created") {
		added.push(routeResult.path);
	} else {
		skipped.push(routeResult.path);
	}

	const pagePath = path.join(
		appDir,
		"checkout",
		"[id]",
		`page.${isTypeScript ? "tsx" : "js"}`,
	);
	const pageResult = writeFileIfAbsent(
		pagePath,
		createAppCheckoutPageContent(isTypeScript),
	);
	if (pageResult.status === "created") {
		added.push(pageResult.path);
	} else {
		skipped.push(pageResult.path);
	}

	return { added, skipped };
}

export async function scaffoldNextJs(options: {
	detection: NextJsDetection;
	jsonMode: boolean;
	skipInstall?: boolean;
}): Promise<ScaffoldSummary> {
	const { detection, jsonMode, skipInstall } = options;
	if (!detection.rootDir) {
		throw new Error("Next.js project root not found for scaffolding.");
	}

	const warnings: string[] = [];
	const rootDir = detection.rootDir;
	const packageManager = detectPackageManager(rootDir);

	const installResult = skipInstall
		? { installed: false, skipped: true }
		: await installNextjsPackage(rootDir, packageManager);

	const configPath =
		findExistingConfig(rootDir, detection.nextConfigPath) ??
		path.join(rootDir, "next.config.js");
	const configResult = updateConfigFile(configPath);

	if (configResult.status === "skipped") {
		warnings.push(
			`Could not automatically update ${path.basename(configPath)} (${configResult.reason}). Please wrap your Next.js config with withMdkCheckout manually.`,
		);
	}

	// Always scaffold App Router files (works even in Pages Router projects since Next.js supports both)
	const appDir = detection.appDir ?? path.join(rootDir, "app");
	const fileResults = scaffoldAppRouter(appDir, detection.usesTypeScript);

	if (!detection.appDir) {
		warnings.push(
			"No app/ directory detected; created App Router scaffolding in app/.",
		);
	}

	if (!jsonMode) {
		if (!installResult.installed && installResult.skipped) {
			console.log("@moneydevkit/nextjs already present; skipping install.");
		}
	}

	return {
		rootDir,
		packageManager,
		installedPackage: installResult.installed,
		installSkipped: installResult.skipped,
		addedFiles: fileResults.added,
		skippedFiles: fileResults.skipped,
		config: configResult,
		warnings,
	};
}
