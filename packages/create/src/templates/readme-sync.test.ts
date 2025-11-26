import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const templateDir = path.resolve(__dirname, "nextjs/app");

/**
 * Extracts code blocks from README that have a file path comment on the first line.
 * Returns a map of file path -> code content (without the comment line).
 */
function extractCodeBlocksFromReadme(readmePath: string): Map<string, string> {
  const content = fs.readFileSync(readmePath, "utf8");
  const blocks = new Map<string, string>();

  // Match code blocks with ```js or ```jsx
  const codeBlockRegex = /```(?:js|jsx|ts|tsx)\n(\/\/ (app\/[^\n]+)\n)([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const filePath = match[2]; // e.g., "app/api/mdk/route.js"
    const code = match[3].trimEnd(); // Code without the comment line
    blocks.set(filePath, code);
  }

  return blocks;
}

test("templates match README code examples", () => {
  const readmePath = path.join(repoRoot, "README.md");
  const codeBlocks = extractCodeBlocksFromReadme(readmePath);

  // Map README paths to template paths
  const pathMappings: Record<string, string> = {
    "app/api/mdk/route.js": path.join(templateDir, "api/mdk/route.js"),
    "app/checkout/[id]/page.js": path.join(templateDir, "checkout/[id]/page.js"),
  };

  for (const [readmePath, templatePath] of Object.entries(pathMappings)) {
    const expectedCode = codeBlocks.get(readmePath);
    if (!expectedCode) {
      throw new Error(`README does not contain code block for ${readmePath}`);
    }

    const actualCode = fs.readFileSync(templatePath, "utf8").trimEnd();

    assert.equal(
      actualCode,
      expectedCode,
      `Template ${readmePath} does not match README.\n\nExpected:\n${expectedCode}\n\nActual:\n${actualCode}`,
    );
  }
});
