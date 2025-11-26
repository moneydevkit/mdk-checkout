import fs from "node:fs";
import path from "node:path";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun";

export function detectPackageManager(rootDir: string): PackageManager {
	if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) return "pnpm";
	if (fs.existsSync(path.join(rootDir, "yarn.lock"))) return "yarn";
	if (fs.existsSync(path.join(rootDir, "bun.lockb"))) return "bun";
	if (fs.existsSync(path.join(rootDir, "package-lock.json"))) return "npm";
	return "npm";
}

export function hasDependency(rootDir: string, depName: string): boolean {
	try {
		const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return Boolean(pkg.dependencies?.[depName] || pkg.devDependencies?.[depName]);
	} catch {
		return false;
	}
}
