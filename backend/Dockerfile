# ── builder ──────────────────────────────────────────────────────────────────
# Pinned to immutable digest — update via Dependabot (docker ecosystem) or
# by running: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
# Multi-arch: buildx resolves the correct per-platform digest for linux/amd64 and linux/arm64.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

# ── runner ───────────────────────────────────────────────────────────────────
# Image size target: <300MB
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN (getent group node || addgroup -S -g 1000 node) && (getent passwd node || adduser -S -u 1000 -G node node)
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ── runtime (compatibility alias) ─────────────────────────────────────────────
FROM runner AS runtime
