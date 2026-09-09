FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY db/migrations db/migrations
RUN npm install -g pnpm@11.2.2 \
 && pnpm install --filter @harakiri/api... --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @harakiri/shared build && pnpm --filter @harakiri/api build

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/db db
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api apps/api
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
