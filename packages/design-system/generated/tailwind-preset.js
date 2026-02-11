/**
 * Tailwind CSS Preset for MoneyDevKit Design System
 * Auto-generated from tokens/design-tokens/manifest.json
 * Do not edit directly - run `pnpm build:tokens` to regenerate
 */

export default {
  "theme": {
    "extend": {
      "colors": {
        "text": {
          "primary": "var(--text-primary)",
          "secondary": "var(--text-secondary)",
          "highlight": "var(--text-highlight)"
        },
        "background": "var(--background)",
        "system": {
          "divider": "var(--system-divider)",
          "recessed": "var(--system-recessed)"
        },
        "component": {
          "qr": {
            "color": "var(--component-qr-color)",
            "highlight": "var(--component-qr-color-highlight)"
          },
          "button": {
            "tertiary": {
              "text": "var(--component-button-tertiary-text)",
              "bg": "var(--component-button-tertiary-bg)"
            },
            "secondary": {
              "outline": "var(--component-button-secondary-outline)"
            }
          },
          "card": {
            "bg": "var(--component-card-bg)"
          }
        }
      }
    }
  }
}
