FROM node:26-bookworm-slim AS build
WORKDIR /app
ARG VITE_PUBLIC_API_URL=http://127.0.0.1:18082
ARG VITE_PUBLIC_KEYCLOAK_URL=http://127.0.0.1:18084
ARG VITE_PUBLIC_KEYCLOAK_REALM=harakiri
ARG VITE_PUBLIC_KEYCLOAK_CLIENT_ID=harakiri-web
ENV VITE_PUBLIC_API_URL=${VITE_PUBLIC_API_URL}
ENV VITE_PUBLIC_KEYCLOAK_URL=${VITE_PUBLIC_KEYCLOAK_URL}
ENV VITE_PUBLIC_KEYCLOAK_REALM=${VITE_PUBLIC_KEYCLOAK_REALM}
ENV VITE_PUBLIC_KEYCLOAK_CLIENT_ID=${VITE_PUBLIC_KEYCLOAK_CLIENT_ID}
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install -g pnpm@11.2.2 && pnpm install --frozen-lockfile=false
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @harakiri/shared build && pnpm --filter @harakiri/web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
