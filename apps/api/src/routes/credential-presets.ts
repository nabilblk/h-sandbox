import type { FastifyInstance } from "fastify";
import {
  apiErrorResponse,
  credentialProviderPresetCatalog,
  credentialProviderPresetIds,
  type CredentialProviderPresetId,
  type CredentialProviderPresetResponse,
  type CredentialProviderPresetsResponse
} from "@harakiri/shared";

const isCredentialProviderPresetId = (id: string): id is CredentialProviderPresetId =>
  credentialProviderPresetIds.includes(id as CredentialProviderPresetId);

export const registerCredentialPresetRoutes = async (app: FastifyInstance) => {
  app.get("/v1/credential-presets", async () => ({
    presets: credentialProviderPresetIds.map((id) => credentialProviderPresetCatalog[id])
  }) satisfies CredentialProviderPresetsResponse);

  app.get("/v1/credential-presets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isCredentialProviderPresetId(id)) {
      return reply.code(404).send(apiErrorResponse("credential_preset_not_found", { message: `Unknown credential provider preset: ${id}` }));
    }
    return { preset: credentialProviderPresetCatalog[id] } satisfies CredentialProviderPresetResponse;
  });
};
