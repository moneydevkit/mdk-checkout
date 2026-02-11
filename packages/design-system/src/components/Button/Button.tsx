"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/cn"

/**
 * Design-system Button matching Figma Design System.
 * Variants: primary (green outline), secondary (gray outline), tertiary (solid fill), subtle (no border).
 * Sizes: sm, md, lg, xl.
 *
 * Uses design tokens from manifest.json:
 * - Primary border: --text-highlight
 * - Secondary border: --component-button-secondary-outline
 * - Tertiary bg/text: --component-button-tertiary-bg, --component-button-tertiary-text
 * - Text: --text-primary
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "rounded-[12px] border border-[var(--text-highlight)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--text-highlight)]/10",
        secondary:
          "rounded-[12px] border border-[var(--component-button-secondary-outline)] bg-transparent text-[var(--text-primary)] hover:border-[var(--text-secondary)]",
        tertiary:
          "rounded-[12px] border border-[var(--component-button-tertiary-bg)] bg-[var(--component-button-tertiary-bg)] text-[var(--component-button-tertiary-text)] hover:opacity-90",
        subtle:
          "rounded-[12px] bg-transparent text-[var(--text-primary)] hover:bg-[var(--system-recessed)]",
      },
      size: {
        sm: "gap-2 p-2 text-xs [&_svg]:size-3",
        md: "gap-3 px-4 py-4 text-base [&_svg]:size-4",
        lg: "gap-4 p-5 text-lg [&_svg]:size-6",
        xl: "gap-4 p-6 text-xl [&_svg]:size-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type ?? "button"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
