# Money Dev Kit Examples

This repository contains example applications demonstrating how to integrate Money Dev Kit into your projects. These examples use published npm packages and represent real-world usage patterns.

## Examples

### [mdk-nextjs-demo](./mdk-nextjs-demo)

A Next.js application demonstrating the Money Dev Kit checkout flow integration. This example shows:
- Client-side checkout navigation with `useCheckout` hook
- Hosted checkout page rendering with `<Checkout />` component
- Server-side API route setup
- Next.js configuration with the MDK plugin

**Live Demo:** [https://mdk-nextjs-demo-brown.vercel.app](https://mdk-nextjs-demo-brown.vercel.app)

## Getting Started

Each example is a standalone project with its own dependencies and setup instructions. Navigate to the example directory and follow its README.

```bash
cd mdk-nextjs-demo
npm install
npm run dev
```

## Requirements

- Node.js 20 or later
- npm or pnpm
- Money Dev Kit API credentials (get them at [moneydevkit.com](https://moneydevkit.com) or run `npx @moneydevkit/create`)

## Using Published Packages

All examples in this repository use published versions of Money Dev Kit packages:
- `@moneydevkit/nextjs` - Next.js integration components
- `@moneydevkit/core` - Core Lightning functionality
- `@moneydevkit/create` - CLI for generating credentials

For the latest stable versions:
```bash
npm install @moneydevkit/nextjs
```

For beta releases:
```bash
npm install @moneydevkit/nextjs@beta
```

## Contributing

Want to add a new example? Follow these guidelines:
1. Each example should be in its own directory at the repository root
2. Use published npm packages (not local tarballs)
3. Include a detailed README with setup instructions
4. Add your example to the CI workflow matrix in [.github/workflows/ci.yml](./.github/workflows/ci.yml)
5. Ensure the example builds and runs successfully

## Development & Integration Testing

This repository is for **user-facing examples** with published packages. For integration testing with local development builds, see the [mdk-checkout](https://github.com/moneydevkit/mdk-checkout) repository.

## License

MIT
