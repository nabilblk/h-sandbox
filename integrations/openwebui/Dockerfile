FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY integrations/openwebui/package.json integrations/openwebui/package.json
RUN npm install -g pnpm@11.2.2 \
 && pnpm install --filter @harakiri/openwebui-adapter... --frozen-lockfile
COPY packages/sdk packages/sdk
COPY integrations/openwebui integrations/openwebui
RUN pnpm --filter @harakiri/openwebui-adapter build \
 && pnpm --filter @harakiri/openwebui-adapter deploy --legacy --prod /out

FROM node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out integrations/openwebui
USER node
EXPOSE 8080
CMD ["node", "integrations/openwebui/dist/server.js"]
