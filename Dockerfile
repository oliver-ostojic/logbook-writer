FROM node:20-slim AS base

# Install Python 3, pip, and build tools for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

WORKDIR /app

# ── deps: install node modules (cached layer) ───────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy all package.json files so pnpm can resolve the workspace graph
COPY apps/api/package.json          apps/api/
COPY apps/solver-python/            apps/solver-python/
COPY packages/domain/package.json   packages/domain/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile --filter=@logbook-writer/api... --filter=@logbook-writer/domain --filter=@logbook-writer/shared-types

# ── python deps ──────────────────────────────────────────────────────────────
RUN python3 -m pip install --no-cache-dir --break-system-packages ortools>=9.8.3296

# ── build ────────────────────────────────────────────────────────────────────
COPY packages/domain/    packages/domain/
COPY packages/shared-types/ packages/shared-types/
COPY apps/api/           apps/api/

RUN pnpm turbo run build --filter=@logbook-writer/api...

# ── runtime ──────────────────────────────────────────────────────────────────
EXPOSE 4000

CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && cd /app && node apps/api/dist/index.js"]
