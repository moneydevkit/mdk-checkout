import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { NextJsDetection } from "../utils/nextjs-detector.js";

type PackageManager = "pnpm" | "yarn" | "npm" | "bun";

type WriteResult =
	| { status: "created"; path: string }
	| { status: "skipped-exists"; path: string }
	| { status: "skipped-different"; path: string };

type ConfigResult =
	| { status: "created"; path: string }
	| { status: "updated"; path: string }
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

function ensureDir(filePath: string) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
}

function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

function writeFileIfAbsent(filePath: string, content: string): WriteResult {
	if (fs.existsSync(filePath)) {
		const existing = readFileSafe(filePath);
		if (existing?.trim() === content.trim()) {
			return { status: "skipped-exists", path: filePath };
		}
		return { status: "skipped-different", path: filePath };
	}
	ensureDir(filePath);
	fs.writeFileSync(filePath, content, "utf8");
	return { status: "created", path: filePath };
}

function detectPackageManager(rootDir: string): PackageManager {
	if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
	if (fs.existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
	if (fs.existsSync(path.join(rootDir, "bun.lockb"))) return "bun";
	if (fs.existsSync(path.join(rootDir, "package-lock.json"))) return "npm";
	return "npm";
}

function hasDependency(pkgJsonPath: string, depName: string): boolean {
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return Boolean(pkg.dependencies?.[depName] || pkg.devDependencies?.[depName]);
	} catch {
		return false;
	}
}

async function installNextjsPackage(
	rootDir: string,
	packageManager: PackageManager,
): Promise<{ installed: boolean; skipped: boolean }> {
	const pkgJsonPath = path.join(rootDir, "package.json");
	if (hasDependency(pkgJsonPath, "@moneydevkit/nextjs")) {
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

function updateConfigFile(
	configPath: string,
	isTypeScript: boolean,
): ConfigResult {
	if (!fs.existsSync(configPath)) {
		const content = [
			'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";',
			"",
			"const nextConfig = {};",
			"",
			"export default withMdkCheckout(nextConfig);",
			"",
		].join("\n");

		ensureDir(configPath);
		fs.writeFileSync(configPath, content, "utf8");
		return { status: "created", path: configPath };
	}

	const original = readFileSafe(configPath) ?? "";

	if (
		original.includes("@moneydevkit/nextjs/next-plugin") ||
		original.includes("withMdkCheckout")
	) {
		return { status: "skipped", path: configPath, reason: "already configured" };
	}

	if (original.includes("module.exports")) {
		const re = /module\\.exports\\s*=\\s*(\\{[\\s\\S]*?\\});?/;
		const match = original.match(re);

		if (match) {
			const prefix =
				'const withMdkCheckout = require("@moneydevkit/nextjs/next-plugin").default ?? require("@moneydevkit/nextjs/next-plugin");\n';
			const replaced = original.replace(
				re,
				`module.exports = withMdkCheckout(${match[1]});`,
			);
			fs.writeFileSync(configPath, `${prefix}${replaced}`, "utf8");
			return { status: "updated", path: configPath };
		}
	}

	if (original.includes("export default")) {
		const reDefaultObject = /export\\s+default\\s+(\\{[\\s\\S]*?\\});?/;
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
			fs.writeFileSync(configPath, content, "utf8");
			return { status: "updated", path: configPath };
		}

		const reNamed = /export\\s+default\\s+([a-zA-Z0-9_]+)\\s*;?/;
		const namedMatch = original.match(reNamed);
		if (namedMatch) {
			const name = namedMatch[1];
			const lines = [
				'import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";',
				original.replace(reNamed, `export default withMdkCheckout(${name});`),
			];
			fs.writeFileSync(configPath, lines.join("\n"), "utf8");
			return { status: "updated", path: configPath };
		}
	}

	return { status: "skipped", path: configPath, reason: "unrecognized format" };
}

function scaffoldAppRouter(
	rootDir: string,
	isTypeScript: boolean,
): { added: string[]; skipped: string[] } {
	const added: string[] = [];
	const skipped: string[] = [];

	const routePath = path.join(
		rootDir,
		"app",
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
		rootDir,
		"app",
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
	rootDir: string,
	isTypeScript: boolean,
): { added: string[]; skipped: string[] } {
	const added: string[] = [];
	const skipped: string[] = [];

	const apiPath = path.join(
		rootDir,
		"pages",
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
		rootDir,
		"pages",
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
}): Promise<ScaffoldSummary> {
	const { detection, jsonMode } = options;
	if (!detection.rootDir) {
		throw new Error("Next.js project root not found for scaffolding.");
	}

	const warnings: string[] = [];
	const rootDir = detection.rootDir;
	const packageManager = detectPackageManager(rootDir);

	const installResult = await installNextjsPackage(rootDir, packageManager);

	const configPath =
		findExistingConfig(rootDir, detection.nextConfigPath) ??
		path.join(rootDir, "next.config.js");
	const configResult = updateConfigFile(configPath, detection.usesTypeScript);

	if (configResult.status === "skipped") {
		warnings.push(
			`Could not automatically update ${path.basename(configPath)} (${configResult.reason}). Please wrap your Next.js config with withMdkCheckout manually.`,
		);
	}

	let fileResults: { added: string[]; skipped: string[] };
	if (detection.appDir) {
		fileResults = scaffoldAppRouter(rootDir, detection.usesTypeScript);
	} else if (detection.pagesDir) {
		fileResults = scaffoldPagesRouter(rootDir, detection.usesTypeScript);
	} else {
		// Default to App Router layout.
		fileResults = scaffoldAppRouter(rootDir, detection.usesTypeScript);
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
