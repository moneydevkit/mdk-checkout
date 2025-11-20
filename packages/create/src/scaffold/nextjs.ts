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
	ensureDir,
	readFileSafe,
	writeFileIfAbsent,
	writeFileWithBackup,
	type WriteResult,
} from "../utils/fs-utils.js";

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
	const ext = isTypeScript ? "ts" : "js";
	if (ext === "ts") {
		return 'export { POST } from "@moneydevkit/nextjs/server/route";\n';
	}
	return 'export { POST } from "@moneydevkit/nextjs/server/route";\n';
}

function createAppCheckoutPageContent(isTypeScript: boolean): string {
	if (isTypeScript) {
		return [
			'"use client";',
			"",
			'import { Checkout } from "@moneydevkit/nextjs";',
			"",
			"type CheckoutPageProps = { params: { id: string } };",
			"",
			"export default function CheckoutPage({ params }: CheckoutPageProps) {",
			"  return <Checkout id={params.id} />;",
			"}",
			"",
		].join("\n");
	}

	return [
		'"use client";',
		"",
		'import { Checkout } from "@moneydevkit/nextjs";',
		"",
		"export default function CheckoutPage({ params }) {",
		"  return <Checkout id={params.id} />;",
		"}",
		"",
	].join("\n");
}

function createPagesApiRouteContent(isTypeScript: boolean): string {
	if (isTypeScript) {
		return [
			'import type { NextApiRequest, NextApiResponse } from "next";',
			'import { POST as appRouteHandler } from "@moneydevkit/nextjs/server/route";',
			"",
			"export default async function handler(req: NextApiRequest, res: NextApiResponse) {",
			"  const url = `http://${req.headers.host ?? \"localhost\"}${req.url ?? \"/api/mdk\"}`;",
			"  const request = new Request(url, {",
			"    method: req.method || \"POST\",",
			"    headers: req.headers as Record<string, string>,",
			"    body:",
			'      req.method === "GET" || req.method === "HEAD"',
			"        ? undefined",
			"        : typeof req.body === \"string\"",
			"          ? req.body",
			"          : JSON.stringify(req.body ?? {}),",
			"  });",
			"",
			"  const response = await appRouteHandler(request);",
			"  res.status(response.status);",
			"  response.headers.forEach((value, key) => {",
			"    res.setHeader(key, value);",
			"  });",
			"  const body = await response.arrayBuffer();",
			"  res.send(Buffer.from(body));",
			"}",
			"",
		].join("\n");
	}

	return [
		'import { POST as appRouteHandler } from "@moneydevkit/nextjs/server/route";',
		"",
		"export default async function handler(req, res) {",
		"  const url = `http://${req.headers.host ?? \"localhost\"}${req.url ?? \"/api/mdk\"}`;",
		"  const request = new Request(url, {",
		"    method: req.method || \"POST\",",
		"    headers: req.headers,",
		"    body:",
		'      req.method === "GET" || req.method === "HEAD"',
		"        ? undefined",
		"        : typeof req.body === \"string\"",
		"          ? req.body",
		"          : JSON.stringify(req.body ?? {}),",
		"  });",
		"",
		"  const response = await appRouteHandler(request);",
		"  res.status(response.status);",
		"  response.headers.forEach((value, key) => {",
		"    res.setHeader(key, value);",
		"  });",
		"  const body = await response.arrayBuffer();",
		"  res.send(Buffer.from(body));",
		"}",
		"",
	].join("\n");
}

function createPagesCheckoutContent(isTypeScript: boolean): string {
	if (isTypeScript) {
		return [
			'"use client";',
			"",
			"import { useRouter } from \"next/router\";",
			'import { Checkout } from "@moneydevkit/nextjs";',
			"",
			"export default function CheckoutPage() {",
			"  const router = useRouter();",
			"  const id = Array.isArray(router.query.id)",
			"    ? router.query.id[0]",
			"    : router.query.id;",
			"",
			"  if (!id) {",
			"    return null;",
			"  }",
			"",
			"  return <Checkout id={id as string} />;",
			"}",
			"",
		].join("\n");
	}

	return [
		'"use client";',
		"",
		"import { useRouter } from \"next/router\";",
		'import { Checkout } from "@moneydevkit/nextjs";',
		"",
		"export default function CheckoutPage() {",
		"  const router = useRouter();",
		"  const id = Array.isArray(router.query.id)",
		"    ? router.query.id[0]",
		"    : router.query.id;",
		"",
		"  if (!id) {",
		"    return null;",
		"  }",
		"",
		"  return <Checkout id={id} />;",
		"}",
		"",
	].join("\n");
}

function updateConfigFile(configPath: string): ConfigResult {
	if (!fs.existsSync(configPath)) {
		const content = [
			'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";',
			"",
			"const nextConfig = {};",
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
				'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";',
				"",
				"const nextConfig = " + objectMatch[1] + ";",
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
			const lines = [
				'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";',
				original.replace(reNamed, `export default withMdkCheckout(${name});`),
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

	return { status: "skipped", path: configPath, reason: "unrecognized format" };
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

function scaffoldPagesRouter(
	pagesDir: string,
	isTypeScript: boolean,
): { added: string[]; skipped: string[] } {
	const added: string[] = [];
	const skipped: string[] = [];

	const apiPath = path.join(
		pagesDir,
		"api",
		`mdk.${isTypeScript ? "ts" : "js"}`,
	);
	const apiResult = writeFileIfAbsent(
		apiPath,
		createPagesApiRouteContent(isTypeScript),
	);
	if (apiResult.status === "created") {
		added.push(apiResult.path);
	} else {
		skipped.push(apiResult.path);
	}

	const checkoutPath = path.join(
		pagesDir,
		"checkout",
		`[id].${isTypeScript ? "tsx" : "js"}`,
	);
	const checkoutResult = writeFileIfAbsent(
		checkoutPath,
		createPagesCheckoutContent(isTypeScript),
	);
	if (checkoutResult.status === "created") {
		added.push(checkoutResult.path);
	} else {
		skipped.push(checkoutResult.path);
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

	let fileResults: { added: string[]; skipped: string[] };
	if (detection.appDir) {
		fileResults = scaffoldAppRouter(detection.appDir, detection.usesTypeScript);
	} else if (detection.pagesDir) {
		fileResults = scaffoldPagesRouter(
			detection.pagesDir,
			detection.usesTypeScript,
		);
	} else {
		// Default to App Router layout.
		fileResults = scaffoldAppRouter(
			path.join(rootDir, "app"),
			detection.usesTypeScript,
		);
		warnings.push(
			"No app/ or pages/ directory detected; created App Router scaffolding in app/.",
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
