import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    }
  },
  // Copy CSS files to dist
  onSuccess: async () => {
    const { copyFile, mkdir } = await import("fs/promises")
    const { existsSync } = await import("fs")
    
    // Ensure dist/styles directory exists
    if (!existsSync("dist/styles")) {
      await mkdir("dist/styles", { recursive: true })
    }
    
    // Copy base.css to dist
    await copyFile("src/styles/base.css", "dist/styles/base.css")
  },
})
