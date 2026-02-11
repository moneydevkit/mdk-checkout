#syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate

# Build stage - build packages and deploy bundle
FROM base AS builder
WORKDIR /workspace

RUN apk add --no-cache libc6-compat

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package sources
COPY packages packages
COPY examples/mdk-nextjs-demo examples/mdk-nextjs-demo

# Install and build library packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @moneydevkit/core run build
RUN pnpm --filter @moneydevkit/nextjs run build

# Create self-contained production bundle with all dependencies
# This must happen BEFORE building Next.js so turbopack hashes match runtime node_modules
RUN pnpm --filter mdk-nextjs-demo deploy --legacy /deploy

# Build Next.js in the deployed bundle so module hashes match runtime
WORKDIR /deploy

# Accept build argument for Next.js build-time env vars
ARG NEXT_PUBLIC_MDK_PREVIEW
ENV NEXT_PUBLIC_MDK_PREVIEW=${NEXT_PUBLIC_MDK_PREVIEW}

RUN pnpm run build

# Production image
FROM base AS production
WORKDIR /app

RUN apk add --no-cache curl libc6-compat

# Copy deployed bundle with built Next.js output
COPY --from=builder /deploy ./

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production

CMD ["pnpm", "start"]
