# ─── Multi-stage Dockerfile ───────────────────────────────────────────────────
#
# Stage 1 (builder): install ALL dependencies, compile TypeScript.
# Stage 2 (production): copy only compiled JS + prod node_modules.
#   → Final image contains no TypeScript compiler, no devDependencies.
#     Typically 60–70% smaller than a single-stage build.
#
# Security:
#   - Non-root user (nodejs:1001) — reduces blast radius of container escape
#   - No curl/wget in final image (healthcheck uses node's http module)
#   - Only /app/uploads needs write access; everything else can be read-only
#
# Build args: NODE_ENV (default: production)

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
LABEL stage=builder

WORKDIR /app

# Dependency layer — cached if package.json unchanged
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL deps (devDeps needed for tsc + prisma generate)
RUN npm ci --ignore-scripts

# Generate Prisma client (must run before tsc)
RUN npx prisma generate

# Source compilation
COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# Re-install without devDeps for the production layer
# (avoids shipping tsc, ts-jest, etc. in the final image)
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /app

# Create non-root user before copying files (so chown works)
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001 -G nodejs

# Copy only runtime artefacts — nothing from Stage 1 that isn't needed
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules/
COPY --from=builder --chown=nodejs:nodejs /app/dist        ./dist/
COPY --from=builder --chown=nodejs:nodejs /app/prisma      ./prisma/
COPY --chown=nodejs:nodejs                package.json     ./

# Upload directory needs write access at runtime
RUN mkdir -p uploads && chown nodejs:nodejs uploads

USER nodejs

EXPOSE 3000

# Healthcheck via Node's built-in http (no curl/wget required in image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exitCode = r.statusCode === 200 ? 0 : 1; }).on('error', () => { process.exitCode = 1; })"

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
