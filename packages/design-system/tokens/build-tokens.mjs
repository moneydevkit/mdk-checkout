#!/usr/bin/env node
/**
 * Build script that transforms W3C Design Tokens JSON into:
 * - CSS custom properties (variables.css)
 * - Tailwind preset (tailwind-preset.js)
 * - Agent-friendly markdown documentation (tokens.md)
 *
 * Reads from manifest.json which references theme-specific token files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, "design-tokens", "manifest.json")
const TOKENS_DIR = join(__dirname, "design-tokens")
const OUTPUT_DIR = join(__dirname, "..", "generated")

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

/**
 * Parse the manifest and load all referenced token files
 */
function parseTokensFromManifest() {
  const manifestRaw = readFileSync(MANIFEST_PATH, "utf-8")
  const manifest = JSON.parse(manifestRaw)

  const tokens = {
    dark: {},
    light: {},
  }

  // Load theme token files from manifest
  for (const [collectionName, collection] of Object.entries(manifest.collections || {})) {
    for (const [modeName, modeFiles] of Object.entries(collection.modes || {})) {
      for (const file of modeFiles) {
        const filePath = join(TOKENS_DIR, file)
        if (existsSync(filePath)) {
          const fileContent = JSON.parse(readFileSync(filePath, "utf-8"))

          // Determine if this is dark or light theme based on filename
          if (file.includes("dark")) {
            tokens.dark = deepMerge(tokens.dark, fileContent)
          } else if (file.includes("light")) {
            tokens.light = deepMerge(tokens.light, fileContent)
          }
        }
      }
    }
  }

  return tokens
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const result = { ...target }

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Flatten nested token structure into a flat map
 * Returns: { "text.primary": { $type, $value }, ... }
 */
function flattenTokens(obj, prefix = "") {
  const result = {}

  for (const [key, value] of Object.entries(obj)) {
    // Skip schema and description metadata
    if (key.startsWith("$")) continue

    const path = prefix ? `${prefix}.${key}` : key

    // If this is a token (has $value), add it
    if (value && typeof value === "object" && "$value" in value) {
      result[path] = { $type: value.$type, $value: value.$value }
      // Also check for nested tokens within this token
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (!nestedKey.startsWith("$") && nestedValue && typeof nestedValue === "object") {
          Object.assign(result, flattenTokens({ [nestedKey]: nestedValue }, path))
        }
      }
    }
    // Otherwise recurse into nested objects
    else if (value && typeof value === "object") {
      Object.assign(result, flattenTokens(value, path))
    }
  }

  return result
}

/**
 * Convert a token path to a CSS variable name
 * e.g., "text.primary" -> "--text-primary"
 */
function toCssVarName(path) {
  return "--" + path.replace(/\./g, "-")
}

/**
 * Generate CSS custom properties file
 */
function generateCSS(tokens) {
  const lightFlat = flattenTokens(tokens.light)
  const darkFlat = flattenTokens(tokens.dark)

  const lines = [
    "/**",
    " * Design System CSS Variables",
    " * Auto-generated from tokens/design-tokens/manifest.json",
    " * Do not edit directly - run `pnpm build:tokens` to regenerate",
    " */",
    "",
  ]

  // Light mode (default) variables
  lines.push(":root {")

  // Group tokens by category
  const categories = groupByCategory(lightFlat)

  for (const [category, categoryTokens] of Object.entries(categories)) {
    lines.push(`  /* ${formatCategoryName(category)} */`)
    for (const [path, token] of Object.entries(categoryTokens)) {
      lines.push(`  ${toCssVarName(path)}: ${token.$value};`)
    }
    lines.push("")
  }

  lines.push("}")
  lines.push("")

  // Dark mode variables
  lines.push(".dark {")

  const darkCategories = groupByCategory(darkFlat)

  for (const [category, categoryTokens] of Object.entries(darkCategories)) {
    lines.push(`  /* ${formatCategoryName(category)} */`)
    for (const [path, token] of Object.entries(categoryTokens)) {
      lines.push(`  ${toCssVarName(path)}: ${token.$value};`)
    }
    lines.push("")
  }

  lines.push("}")

  return lines.join("\n")
}

/**
 * Group flat tokens by their top-level category
 */
function groupByCategory(flatTokens) {
  const groups = {}

  for (const [path, token] of Object.entries(flatTokens)) {
    const category = path.split(".")[0]
    if (!groups[category]) {
      groups[category] = {}
    }
    groups[category][path] = token
  }

  return groups
}

/**
 * Format category name for CSS comments
 */
function formatCategoryName(category) {
  return category.charAt(0).toUpperCase() + category.slice(1) + " Colors"
}

/**
 * Generate Tailwind preset
 */
function generateTailwindPreset(tokens) {
  const lightFlat = flattenTokens(tokens.light)
  const darkFlat = flattenTokens(tokens.dark)

  const preset = {
    theme: {
      extend: {
        colors: {
          // Text colors
          text: {
            primary: "var(--text-primary)",
            secondary: "var(--text-secondary)",
            highlight: "var(--text-highlight)",
          },
          // Background
          background: "var(--background)",
          // System colors
          system: {
            divider: "var(--system-divider)",
            recessed: "var(--system-recessed)",
          },
          // Component colors
          component: {
            qr: {
              color: "var(--component-qr-color)",
              highlight: "var(--component-qr-color-highlight)",
            },
            button: {
              tertiary: {
                text: "var(--component-button-tertiary-text)",
                bg: "var(--component-button-tertiary-bg)",
              },
              secondary: {
                outline: "var(--component-button-secondary-outline)",
              },
            },
            card: {
              bg: "var(--component-card-bg)",
            },
          },
        },
      },
    },
  }

  const code = `/**
 * Tailwind CSS Preset for MoneyDevKit Design System
 * Auto-generated from tokens/design-tokens/manifest.json
 * Do not edit directly - run \`pnpm build:tokens\` to regenerate
 */

export default ${JSON.stringify(preset, null, 2)}
`

  return code
}

/**
 * Generate agent-friendly markdown documentation
 */
function generateMarkdown(tokens) {
  const lightFlat = flattenTokens(tokens.light)
  const darkFlat = flattenTokens(tokens.dark)

  const lines = [
    "# MoneyDevKit Design Tokens",
    "",
    "> Auto-generated from `tokens/design-tokens/manifest.json`.",
    "> Do not edit directly - run `pnpm build:tokens` to regenerate.",
    "",
    "This document provides a human and AI-agent friendly reference for all design tokens.",
    "",
  ]

  // Light Mode Tokens
  lines.push("## Light Mode Tokens")
  lines.push("")
  lines.push("| Token | CSS Variable | Value |")
  lines.push("|-------|--------------|-------|")
  for (const [path, token] of Object.entries(lightFlat)) {
    lines.push(`| \`${path}\` | \`${toCssVarName(path)}\` | \`${token.$value}\` |`)
  }
  lines.push("")

  // Dark Mode Tokens
  lines.push("## Dark Mode Tokens")
  lines.push("")
  lines.push("| Token | CSS Variable | Value |")
  lines.push("|-------|--------------|-------|")
  for (const [path, token] of Object.entries(darkFlat)) {
    lines.push(`| \`${path}\` | \`${toCssVarName(path)}\` | \`${token.$value}\` |`)
  }
  lines.push("")

  // Usage section
  lines.push("## Usage")
  lines.push("")
  lines.push("### CSS")
  lines.push("")
  lines.push("```css")
  lines.push(".my-component {")
  lines.push("  background-color: var(--background);")
  lines.push("  color: var(--text-primary);")
  lines.push("  border-color: var(--system-divider);")
  lines.push("}")
  lines.push("```")
  lines.push("")
  lines.push("### Tailwind CSS")
  lines.push("")
  lines.push("```tsx")
  lines.push('<div className="bg-background text-text-primary border-system-divider">')
  lines.push("  Content")
  lines.push("</div>")
  lines.push("```")
  lines.push("")

  return lines.join("\n")
}

/**
 * Main build function
 */
function build() {
  console.log("Building design tokens from manifest.json...")

  const tokens = parseTokensFromManifest()
  const lightFlat = flattenTokens(tokens.light)
  const darkFlat = flattenTokens(tokens.dark)

  console.log(`Found ${Object.keys(lightFlat).length} light mode tokens`)
  console.log(`Found ${Object.keys(darkFlat).length} dark mode tokens`)

  // Generate CSS
  const css = generateCSS(tokens)
  writeFileSync(join(OUTPUT_DIR, "variables.css"), css)
  console.log("Generated: generated/variables.css")

  // Generate Tailwind preset
  const preset = generateTailwindPreset(tokens)
  writeFileSync(join(OUTPUT_DIR, "tailwind-preset.js"), preset)
  console.log("Generated: generated/tailwind-preset.js")

  // Generate Markdown
  const markdown = generateMarkdown(tokens)
  writeFileSync(join(OUTPUT_DIR, "tokens.md"), markdown)
  console.log("Generated: generated/tokens.md")

  console.log("Done!")
}

build()
