import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectPackageManager } from "./package-manager.js";

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "mdk-pm-"));
}

test("detects pnpm from lockfile", () => {
	const tmp = tempDir();
	fs.writeFileSync(path.join(tmp, "pnpm-lock.yaml"), "");
	assert.equal(detectPackageManager(tmp), "pnpm");
});

test("defaults to npm when no lockfiles exist", () => {
	const tmp = tempDir();
	assert.equal(detectPackageManager(tmp), "npm");
});
