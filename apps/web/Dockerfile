# Static browser assets are architecture-independent; avoid emulating Node.
FROM --platform=$BUILDPLATFORM node:26-bookworm-slim AS build
WORKDIR /app
ARG VITE_PUBLIC_API_URL=http://127.0.0.1:18082
ARG VITE_PUBLIC_KEYCLOAK_URL=http://127.0.0.1:18084
ARG VITE_PUBLIC_KEYCLOAK_REALM=harakiri
ARG VITE_PUBLIC_KEYCLOAK_CLIENT_ID=harakiri-web
ARG VITE_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=false
ENV VITE_PUBLIC_API_URL=${VITE_PUBLIC_API_URL}
ENV VITE_PUBLIC_KEYCLOAK_URL=${VITE_PUBLIC_KEYCLOAK_URL}
ENV VITE_PUBLIC_KEYCLOAK_REALM=${VITE_PUBLIC_KEYCLOAK_REALM}
ENV VITE_PUBLIC_KEYCLOAK_CLIENT_ID=${VITE_PUBLIC_KEYCLOAK_CLIENT_ID}
ENV VITE_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=${VITE_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO}
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN npm install -g pnpm@11.2.2 \
 && pnpm install --filter @harakiri/web... --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/sdk packages/sdk
COPY apps/web apps/web
RUN pnpm --filter @harakiri/shared build && pnpm --filter @h-sandbox/sdk build && pnpm --filter @harakiri/web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# Regenerates /config.js from env at container start (runtime config) before nginx serves.
COPY apps/web/docker-entrypoint.d/40-harakiri-runtime-config.sh /docker-entrypoint.d/40-harakiri-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-harakiri-runtime-config.sh
EXPOSE 80
