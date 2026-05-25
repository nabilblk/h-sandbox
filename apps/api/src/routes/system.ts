import type { FastifyInstance } from "fastify";
import type { BootstrapResponse, HealthResponse } from "@harakiri/shared";
import { openApiDocument } from "@harakiri/shared";
import { config } from "../config.js";

export const publicRoutePaths = new Set(["/health", "/v1/bootstrap", "/openapi.json"]);

export const registerSystemRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({ status: "ok" }) satisfies HealthResponse);

  app.get("/v1/bootstrap", async () => ({
    apiUrl: config.publicApiUrl,
    keycloak: {
      url: process.env.PUBLIC_KEYCLOAK_URL ?? "http://127.0.0.1:8081",
      realm: process.env.PUBLIC_KEYCLOAK_REALM ?? "harakiri",
      clientId: process.env.PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web"
    }
  }) satisfies BootstrapResponse);

  app.get("/openapi.json", async () => openApiDocument);
};
