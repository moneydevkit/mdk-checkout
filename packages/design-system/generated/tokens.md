# MoneyDevKit Design Tokens

> Auto-generated from `tokens/design-tokens/manifest.json`.
> Do not edit directly - run `pnpm build:tokens` to regenerate.

This document provides a human and AI-agent friendly reference for all design tokens.

## Light Mode Tokens

| Token | CSS Variable | Value |
|-------|--------------|-------|
| `text.primary` | `--text-primary` | `#000000` |
| `text.secondary` | `--text-secondary` | `#676767` |
| `text.highlight` | `--text-highlight` | `#00cb91` |
| `background` | `--background` | `#ebebeb` |
| `system.divider` | `--system-divider` | `#dddddd` |
| `system.recessed` | `--system-recessed` | `#f6f6f6` |
| `component.qr.color` | `--component-qr-color` | `#00737b` |
| `component.qr.color.highlight` | `--component-qr-color-highlight` | `#01d0d0` |
| `component.button.tertiary.text` | `--component-button-tertiary-text` | `#ffffff` |
| `component.button.tertiary.bg` | `--component-button-tertiary-bg` | `#000000` |
| `component.button.secondary.outline` | `--component-button-secondary-outline` | `#d1d1d1` |
| `component.card.bg` | `--component-card-bg` | `#ffffff` |

## Dark Mode Tokens

| Token | CSS Variable | Value |
|-------|--------------|-------|
| `text.primary` | `--text-primary` | `#ffffff` |
| `text.secondary` | `--text-secondary` | `#cccccc` |
| `text.highlight` | `--text-highlight` | `#82ffc1` |
| `background` | `--background` | `#1e1e1e` |
| `system.divider` | `--system-divider` | `#636363` |
| `system.recessed` | `--system-recessed` | `#000000` |
| `component.qr.color` | `--component-qr-color` | `#00bba7` |
| `component.qr.color.highlight` | `--component-qr-color-highlight` | `#acfff5` |
| `component.button.tertiary.text` | `--component-button-tertiary-text` | `#000000` |
| `component.button.tertiary.bg` | `--component-button-tertiary-bg` | `#ffffff` |
| `component.button.secondary.outline` | `--component-button-secondary-outline` | `#3d3d3d` |
| `component.card.bg` | `--component-card-bg` | `#181818` |

## Usage

### CSS

```css
.my-component {
  background-color: var(--background);
  color: var(--text-primary);
  border-color: var(--system-divider);
}
```

### Tailwind CSS

```tsx
<div className="bg-background text-text-primary border-system-divider">
  Content
</div>
```
