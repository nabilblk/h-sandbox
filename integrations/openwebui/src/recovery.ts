import { HarakiriApiError, type HarakiriClient } from "@h-sandbox/sdk";
import type { Binding, BindingStore } from "./bindings.js";
import { AdapterError } from "./config.js";

export const bindingSummary = (binding: Binding) => ({
  generation: binding.generation,
  workspaceId: binding.workspaceId ?? null,
  sandboxId: binding.sandboxId ?? null,
  workspaceCreationPending: binding.workspaceIntent && !binding.workspaceId,
  sandboxCreationPending: binding.sandboxIntent && !binding.sandboxId,
  routeCreationPending: binding.routeIntent && !binding.grant,
  hasGrant: Boolean(binding.grant),
  createdAt: new Date(binding.createdAt).toISOString()
});

/** Explicit operator action: invalidate the old grant, never recreate the runtime. */
export const resetServiceGrant = async (
  client: HarakiriClient,
  store: BindingStore,
  key: string,
  expectedGeneration: string,
  signal: AbortSignal
) =>
  store.withBinding(
    key,
    async (binding, save) => {
      if (binding.generation !== expectedGeneration) throw new AdapterError(409, "binding_generation_changed");
      if (!binding.sandboxId) throw new AdapterError(409, "sandbox_identity_unconfirmed");
      const { sandbox } = await client.getSandbox(binding.sandboxId, { signal });
      if (sandbox.status !== "running") throw new AdapterError(409, "sandbox_recovery_required");

      // Persist fail-closed state first. An uncertain delete can be repeated explicitly;
      // normal traffic cannot reuse the old grant or race a replacement disclosure.
      binding.grant = undefined;
      binding.routeIntent = true;
      await save(binding);
      try {
        await client.routes.delete(binding.sandboxId, 8000, { signal });
      } catch (error) {
        if (!(error instanceof HarakiriApiError && error.status === 404)) throw error;
      }
      const { routes } = await client.routes.list(binding.sandboxId, { signal });
      if (routes.some((route) => route.port === 8000 && route.state !== "terminated")) {
        throw new AdapterError(409, "route_deletion_unconfirmed");
      }
      binding.routeIntent = false;
      await save(binding);
      return bindingSummary(binding);
    },
    signal
  );
