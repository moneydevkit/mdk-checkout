import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeFileIfAbsent, writeFileWithBackup } from "./fs-utils.js";

function tmpFile(filename: string): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdk-fs-utils-"));
	return path.join(tmpDir, filename);
}

test("writeFileIfAbsent creates files and skips identical content", () => {
	const target = tmpFile("a.txt");
	const first = writeFileIfAbsent(target, "hello");
	assert.equal(first.status, "created");

	const second = writeFileIfAbsent(target, "hello");
	assert.equal(second.status, "skipped-exists");
});

test("writeFileWithBackup backs up when overwriting", () => {
	const target = tmpFile("b.txt");
	fs.writeFileSync(target, "original");

	const result = writeFileWithBackup(target, "updated");
	assert.equal(result.status, "updated-with-backup");
	assert.ok(result.backupPath);
	assert.equal(fs.readFileSync(target, "utf8"), "updated");
	assert.equal(
		fs.readFileSync(result.backupPath ?? "", "utf8"),
		"original",
	);
});
