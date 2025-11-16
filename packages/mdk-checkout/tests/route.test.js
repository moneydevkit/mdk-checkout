import test from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.join(__dirname, "../dist/index.js");
const distServer = path.join(__dirname, "../dist/server/index.js");
const pkgJsonPath = path.join(__dirname, "../package.json");

test("build emits top-level bundle", () => {
  assert.ok(existsSync(distIndex), "dist/index.js should exist");
});

test("build emits server bundle", () => {
  assert.ok(existsSync(distServer), "dist/server/index.js should exist");
});

test("package exports contain server entry", () => {
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  assert.ok(pkgJson.exports?.["./server"], "./server export must be defined");
});
