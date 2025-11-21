import fs from "node:fs";
import path from "node:path";
import semver from "semver";

const NEXT_CONFIG_BASENAMES = [
	"next.config.js",
	"next.config.cjs",
	"next.config.mjs",
	"next.config.ts",
	"next.config.mts",
];

const APP_DIR_CANDIDATES = ["app", path.join("src", "app")];
const PAGES_DIR_CANDIDATES = ["pages", path.join("src", "pages")];

export type NextJsDetection = {
	found: boolean;
	rootDir?: string;
	nextConfigPath?: string;
	appDir?: string;
	pagesDir?: string;
	usesTypeScript: boolean;
	nextVersion?: string;
	versionIsSupported: boolean;
};

function fileExists(target: string): boolean {
	try {
		return fs.existsSync(target);
	} catch {
		return false;
	}
}

function readPackageJson(pkgPath: string): Record<string, unknown> | null {
	try {
		const content = fs.readFileSync(pkgPath, "utf8");
		return JSON.parse(content) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function hasNextDependency(pkg: Record<string, unknown>): boolean {
	const deps = pkg.dependencies as Record<string, string> | undefined;
	const devDeps = pkg.devDependencies as Record<string, string> | undefined;
	return Boolean(deps?.next || devDeps?.next);
}

function extractNextVersion(pkg: Record<string, unknown>): string | undefined {
	const deps = pkg.dependencies as Record<string, string> | undefined;
	const devDeps = pkg.devDependencies as Record<string, string> | undefined;
	return deps?.next ?? devDeps?.next ?? undefined;
}

function findNearestPackageJson(startDir: string): string | undefined {
	let current = path.resolve(startDir);
	while (true) {
		const candidate = path.join(current, "package.json");
		if (fileExists(candidate)) {
			return candidate;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function findNextConfig(rootDir: string): string | undefined {
	for (const basename of NEXT_CONFIG_BASENAMES) {
		const candidate = path.join(rootDir, basename);
		if (fileExists(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

export function detectNextJsProject(startDir: string): NextJsDetection {
	const pkgPath = findNearestPackageJson(startDir);
	const rootDir = pkgPath ? path.dirname(pkgPath) : path.resolve(startDir);
	const pkg = pkgPath ? readPackageJson(pkgPath) : null;

	const hasNext = pkg ? hasNextDependency(pkg) : false;
	const nextVersion = pkg ? extractNextVersion(pkg) : undefined;
	let versionIsSupported = true;

	if (nextVersion) {
		const minVersion = semver.minVersion(nextVersion);
		if (minVersion) {
			versionIsSupported = semver.gte(minVersion, "15.0.0");
		}
	}

	const nextConfigPath = findNextConfig(rootDir);
	const appDir =
		APP_DIR_CANDIDATES.map((candidate) => path.join(rootDir, candidate)).find(
			(candidate) => fileExists(candidate),
		);
	const pagesDir =
		PAGES_DIR_CANDIDATES.map((candidate) => path.join(rootDir, candidate)).find(
			(candidate) => fileExists(candidate),
		);
	const usesTypeScript =
		fileExists(path.join(rootDir, "tsconfig.json")) ||
		fileExists(path.join(rootDir, "next-env.d.ts"));

	const found = Boolean(hasNext || nextConfigPath || appDir || pagesDir);

	return {
		found,
		rootDir: found ? rootDir : undefined,
		nextConfigPath,
		appDir,
		pagesDir,
		usesTypeScript,
		nextVersion,
		versionIsSupported,
	};
}
