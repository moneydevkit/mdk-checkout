import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for @moneydevkit packages
  transpilePackages: ['@moneydevkit/ghost', '@moneydevkit/nextjs', '@moneydevkit/core'],
}

export default nextConfig
