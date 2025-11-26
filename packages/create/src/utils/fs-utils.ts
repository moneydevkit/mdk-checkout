import fs from "node:fs";
import path from "node:path";

export type WriteResult =
	| { status: "created"; path: string }
	| { status: "updated-with-backup"; path: string; backupPath: string }
	| { status: "skipped-exists"; path: string }
	| { status: "skipped-different"; path: string };

export function ensureDir(filePath: string) {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
}

export function readFileSafe(filePath: string): string | null {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch {
		return null;
	}
}

export function writeFileIfAbsent(filePath: string, content: string): WriteResult {
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

export function writeFileWithBackup(
	filePath: string,
	content: string,
): WriteResult {
	if (!fs.existsSync(filePath)) {
		ensureDir(filePath);
		fs.writeFileSync(filePath, content, "utf8");
		return { status: "created", path: filePath };
	}

	const existing = readFileSafe(filePath) ?? "";

	if (existing.trim() === content.trim()) {
		return { status: "skipped-exists", path: filePath };
	}

	const backupPath = `${filePath}.mdk-backup`;
	fs.writeFileSync(backupPath, existing, "utf8");
	fs.writeFileSync(filePath, content, "utf8");

	return { status: "updated-with-backup", path: filePath, backupPath };
}
