# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json

FROM base AS dependencies
RUN --mount=type=cache,id=wangmai-npm,target=/root/.npm npm ci --workspace=@wangmai/backend --workspace=@wangmai/shared --include-workspace-root --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN npm run build --workspace=@wangmai/shared && npm run build --workspace=@wangmai/backend

FROM base AS production-dependencies
RUN --mount=type=cache,id=wangmai-npm,target=/root/.npm npm ci --omit=dev --workspace=@wangmai/backend --workspace=@wangmai/shared --include-workspace-root=false --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=production-dependencies --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
USER node
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
