# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,id=wangmai-npm,target=/root/.npm npm ci --workspace=@wangmai/frontend --workspace=@wangmai/shared --include-workspace-root --no-audit --no-fund

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build --workspace=@wangmai/shared && npm run build --workspace=@wangmai/frontend

FROM ${NODE_IMAGE} AS runtime
ARG SOURCE_COMMIT=unreleased
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
