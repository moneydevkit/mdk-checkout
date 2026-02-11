import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "./Button"

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "tertiary", "subtle"],
      description: "The visual style of the button",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
      description: "The size of the button",
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
    asChild: {
      control: "boolean",
      description: "Render as child element (for composition)",
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary Button",
  },
}

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary Button",
  },
}

export const Tertiary: Story = {
  args: {
    variant: "tertiary",
    children: "Tertiary Button",
  },
}

export const Subtle: Story = {
  args: {
    variant: "subtle",
    children: "Subtle Button",
  },
}

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small Button",
  },
}

export const Medium: Story = {
  args: {
    size: "md",
    children: "Medium Button",
  },
}

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large Button",
  },
}

export const ExtraLarge: Story = {
  args: {
    size: "xl",
    children: "Extra Large Button",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled Button",
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 items-center">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="subtle">Subtle</Button>
      </div>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
}
