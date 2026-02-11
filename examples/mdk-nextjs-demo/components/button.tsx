"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs))
}

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "rounded-[12px] border border-[var(--mdk-text-highlight)] bg-transparent text-[var(--mdk-text-primary)] hover:bg-[var(--mdk-text-highlight)]/10",
        secondary:
          "rounded-[12px] border border-[var(--mdk-button-secondary-outline)] bg-transparent text-[var(--mdk-text-primary)] hover:border-[var(--mdk-text-secondary)]",
        tertiary:
          "rounded-[12px] border border-[var(--mdk-button-tertiary-bg)] bg-[var(--mdk-button-tertiary-bg)] text-[var(--mdk-button-tertiary-text)] hover:opacity-90",
        subtle:
          "rounded-[12px] bg-transparent text-[var(--mdk-text-primary)] hover:bg-[var(--mdk-system-recessed)]",
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
