FROM node:22-bookworm-slim AS dependencies
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/supervise-server.mjs ./scripts/supervise-server.mjs
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG VITE_APP_MODE=cloud
ENV VITE_APP_MODE=$VITE_APP_MODE
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/ui/dist ./ui/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/scripts/supervise-server.mjs ./scripts/supervise-server.mjs
# Catalog discovery is intentionally data-driven at runtime. Keep the two
# authoritative catalog asset trees available in the production image.
COPY --from=build /app/ui/src/designer/controls ./ui/src/designer/controls
COPY --from=build /app/ui/nodes ./ui/nodes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY python-service ./python-service
COPY llm-provider/proto ./llm-provider/proto
COPY projects ./projects
RUN pip3 install --break-system-packages --no-cache-dir -r python-service/requirements.txt
ENV NODE_ENV=production PORT=3001 FORMFLOW_MODE=cloud FORMFLOW_ROOT=/app PYTHON_EXECUTABLE=/usr/bin/python3
EXPOSE 3001
CMD ["node", "scripts/supervise-server.mjs", "node", "server/dist/index.js"]
