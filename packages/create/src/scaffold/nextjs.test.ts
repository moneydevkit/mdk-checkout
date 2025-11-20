import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldNextJs } from "./nextjs.js";
import { detectNextJsProject } from "../utils/nextjs-detector.js";

function makeTmpNextApp(): string {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdk-nextjs-scaffold-"));
	fs.writeFileSync(
		path.join(tmp, "package.json"),
		JSON.stringify(
			{
				name: "tmp-next",
				license: "MIT",
				dependencies: {
					next: "15.0.0",
				},
			},
			null,
			2,
		),
	);
	fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
	return tmp;
}

test("scaffoldNextJs creates config, route, and checkout page idempotently", async () => {
	const tmp = makeTmpNextApp();
	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.equal(detection.versionIsSupported, true);

	const first = await scaffoldNextJs({
		detection,
		jsonMode: true,
		skipInstall: true,
	});

	assert.ok(fs.existsSync(path.join(tmp, "next.config.js")));
	assert.ok(
		fs.existsSync(path.join(detection.appDir ?? path.join(tmp, "app"), "api", "mdk", "route.js")),
	);
	assert.ok(
		fs.existsSync(
			path.join(
				detection.appDir ?? path.join(tmp, "app"),
				"checkout",
				"[id]",
				"page.js",
			),
		),
	);
	assert.ok(first.addedFiles.length >= 2);

	const second = await scaffoldNextJs({
		detection,
		jsonMode: true,
		skipInstall: true,
	});

	assert.equal(second.addedFiles.length, 0);
	assert.ok(second.skippedFiles.length >= 2);
});

test("scaffolds inside src/app when present", async () => {
	const tmp = makeTmpNextApp();
	const srcApp = path.join(tmp, "src", "app");
	fs.mkdirSync(srcApp, { recursive: true });

	// remove root app to force src/app usage
	fs.rmSync(path.join(tmp, "app"), { recursive: true, force: true });

	const detection = detectNextJsProject(tmp);
	assert.ok(detection.found);
	assert.ok(detection.appDir?.endsWith(path.join("src", "app")));

	await scaffoldNextJs({
		detection,
		jsonMode: true,
		skipInstall: true,
	});

	assert.ok(fs.existsSync(path.join(srcApp, "api", "mdk", "route.js")));
	assert.ok(fs.existsSync(path.join(srcApp, "checkout", "[id]", "page.js")));
});
