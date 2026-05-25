import { config } from "../../config.js";
import { callOpenSandbox } from "./opensandbox-client.js";
import { routeHost, routeKeyFor, routeUrl } from "./route-targets.js";
import type { SandboxRouteTarget } from "./opensandbox-types.js";

const publicRouteTarget = (target: string | null) => {
  if (!target) return null;
  const withScheme = /^https?:\/\//.test(target) ? target : `http://${target}`;
  return withScheme.replace("http://opensandbox-server.opensandbox-system.svc.cluster.local", config.publicOpenSandboxUrl);
};

const serverProxyUrl = (opensandboxId: string, port: number) =>
  `${config.sandboxRouteLocalFallbackUrl.replace(/\/+$/, "")}/v1/sandboxes/${opensandboxId}/proxy/${port}/`;

export const routePolicyMetadata = () => ({
  "harakiri.route_mode": config.sandboxRouteMode,
  "harakiri.route_base_domain": config.sandboxRouteBaseDomain,
  "harakiri.route_public_scheme": config.sandboxRoutePublicScheme,
  "harakiri.route_max_per_sandbox": String(config.sandboxMaxRoutesPerSandbox),
  "harakiri.route_max_per_org": String(config.sandboxMaxRoutesPerOrg)
});

export const ensureSandboxRoute = async (opensandboxId: string, port: number): Promise<SandboxRouteTarget> => {
  const routeKey = routeKeyFor(opensandboxId, port);
  const gatewayHost = `${routeKey}.${config.sandboxRouteBaseDomain}`;
  const gatewayUrl = routeUrl(gatewayHost);

  if (["opensandbox-ingress", "opensandbox-gateway", "gateway"].includes(config.sandboxRouteMode)) {
    try {
      await callOpenSandbox<{ url?: string; endpoint?: string; headers?: Record<string, string> | null }>(`/v1/sandboxes/${opensandboxId}/endpoints/${port}`);
      return {
        routeKey,
        host: gatewayHost,
        url: gatewayUrl,
        targetUrl: gatewayUrl,
        provider: "opensandbox-gateway",
        providerRouteId: routeKey,
        state: "ready"
      };
    } catch (error) {
      if (!config.openSandboxAllowFallback) {
        return {
          routeKey,
          host: gatewayHost,
          url: gatewayUrl,
          targetUrl: gatewayUrl,
          provider: "opensandbox-gateway",
          providerRouteId: routeKey,
          state: "provisioning"
        };
      }
    }
    return {
      routeKey,
      host: gatewayHost,
      url: gatewayUrl,
      targetUrl: gatewayUrl,
      provider: "opensandbox-gateway",
      providerRouteId: routeKey,
      state: "provisioning"
    };
  }

  try {
    const result = await callOpenSandbox<{ url?: string; endpoint?: string }>(`/v1/sandboxes/${opensandboxId}/endpoints/${port}?use_server_proxy=true`);
    const targetUrl = publicRouteTarget(result.url ?? result.endpoint ?? null) ?? serverProxyUrl(opensandboxId, port);
    return {
      routeKey,
      host: routeHost(targetUrl),
      url: targetUrl,
      targetUrl,
      provider: "opensandbox-server-proxy",
      providerRouteId: routeKey,
      state: "ready"
    };
  } catch (error) {
    if (!config.openSandboxAllowFallback) {
      const targetUrl = serverProxyUrl(opensandboxId, port);
      return {
        routeKey,
        host: routeHost(targetUrl),
        url: targetUrl,
        targetUrl,
        provider: "opensandbox-server-proxy",
        providerRouteId: routeKey,
        state: "provisioning"
      };
    }
    const targetUrl = serverProxyUrl(opensandboxId, port);
    return {
      routeKey,
      host: routeHost(targetUrl),
      url: targetUrl,
      targetUrl,
      provider: "opensandbox-server-proxy",
      providerRouteId: routeKey,
      state: "provisioning"
    };
  }
};
