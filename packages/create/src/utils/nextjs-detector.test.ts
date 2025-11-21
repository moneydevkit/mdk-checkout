import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { detectNextJsProject } from "./nextjs-detector.js";

function makeTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "mdk-nextjs-detector-"));
}

test("detects Next.js via dependency and app directory", () => {
	const tmp = makeTempDir();
	fs.writeFileSync(
		path.join(tmp, "package.json"),
		JSON.stringify(
			{ name: "app", dependencies: { next: "^15.0.0" } },
			null,
			2,
		),
	);
	fs.mkdirSync(path.join(tmp, "app"), { recursive: true });

	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.equal(detection.rootDir, tmp);
	assert.ok(detection.appDir?.endsWith("app"));
	assert.equal(detection.nextVersion, "^15.0.0");
	assert.equal(detection.versionIsSupported, true);
});

test("detects Next.js via next.config.* when dependency is missing", () => {
	const tmp = makeTempDir();
	fs.writeFileSync(path.join(tmp, "next.config.js"), "module.exports = {};\n");

	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.equal(detection.nextConfigPath, path.join(tmp, "next.config.js"));
});

test("returns not found when no signals exist", () => {
	const tmp = makeTempDir();
	const detection = detectNextJsProject(tmp);
	assert.equal(detection.found, false);
	assert.equal(detection.rootDir, undefined);
});

test("marks unsupported when Next.js version is below 15", () => {
	const tmp = makeTempDir();
	fs.writeFileSync(
		path.join(tmp, "package.json"),
		JSON.stringify(
			{ name: "legacy", dependencies: { next: "^14.2.0" } },
			null,
			2,
		),
	);

	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.equal(detection.versionIsSupported, false);
});

test("detects src/app layout", () => {
	const tmp = makeTempDir();
	fs.mkdirSync(path.join(tmp, "src", "app"), { recursive: true });
	fs.writeFileSync(
		path.join(tmp, "package.json"),
		JSON.stringify({ name: "src-app", dependencies: { next: "^15.0.0" } }),
	);
	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.ok(detection.appDir?.endsWith(path.join("src", "app")));
});
