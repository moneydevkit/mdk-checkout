import path from "path"
import tailwindcss from "@tailwindcss/vite"
import type { StorybookConfig } from "@storybook/react-vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-themes",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    const projectRoot = path.resolve(__dirname, "..")
    
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(projectRoot, "src"),
    }
    
    config.plugins = [...(config.plugins ?? []), tailwindcss()]
    
    return config
  },
}

export default config
