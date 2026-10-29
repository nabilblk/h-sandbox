import { sandboxRouteStates, type SandboxRouteState } from "@harakiri/shared";
import { constantEquals, hashApiKey } from "../../crypto.js";
import { query as defaultQuery } from "../../db.js";
import type { Query } from "../query.js";

export const sandboxRouteAccessTokenHeader = "x-harakiri-route-token";
export const sandboxRouteAccessTokenQueryParam = "harakiri_route_token";

type RouteRow = {
  id: string;
  routeKey: string;
  host: string;
  targetUrl: string;
  provider: string;
  state: string;
  accessMode: string;
  accessTokenHash: string | null;
  accessHeaderName: string | null;
};

export type ServiceTarget = {
  kind: "ok";
  targetUrl: string;
  headerName: string;
  provider: string;
  host: string;
  routeKey: string;
};

export type SandboxRouteProxyTargetResult =
  | { kind: "not_found" }
  | { kind: "route_not_ready"; state: SandboxRouteState }
  | { kind: "public_route" }
  | { kind: "unauthorized"; headerName: string }
  | ServiceTarget;

export const getSandboxRouteProxyTarget = async (
  input: { routeKey: string; token?: string | null; touch?: boolean },
  query: Query = defaultQuery
): Promise<SandboxRouteProxyTargetResult> => {
  const result = await query<RouteRow>(
    `SELECT r.id::text, r.route_key AS "routeKey", r.host,
            r.target_url AS "targetUrl", r.provider, r.state,
            COALESCE(r.access_mode, 'public') AS "accessMode",
            r.access_token_hash AS "accessTokenHash",
            r.access_header_name AS "accessHeaderName"
     FROM sandbox_routes r JOIN sandboxes s ON s.id = r.sandbox_id AND s.organization_id = r.organization_id
     WHERE r.route_key = $1 AND r.state <> 'terminated'
       AND s.status = 'running'
       AND (s.expires_at IS NULL OR s.expires_at > now())
       AND (s.provider_expires_at IS NULL OR s.provider_expires_at > now())
     ORDER BY r.created_at DESC LIMIT 1`,
    [input.routeKey]
  );
  const route = result.rows[0];
  if (!route) return { kind: "not_found" };
  const state = sandboxRouteStates.includes(route.state as SandboxRouteState)
    ? (route.state as SandboxRouteState)
    : "unhealthy";
  if (state !== "ready") return { kind: "route_not_ready", state };
  const headerName = route.accessHeaderName ?? sandboxRouteAccessTokenHeader;
  if (route.accessMode !== "token") return { kind: "public_route" };
  if (!route.accessTokenHash || !input.token || !constantEquals(hashApiKey(input.token), route.accessTokenHash)) {
    return { kind: "unauthorized", headerName };
  }
  if (input.touch !== false) {
    await query("UPDATE sandbox_routes SET last_used_at = now(), updated_at = now() WHERE id = $1", [route.id]);
  }
  return {
    kind: "ok",
    targetUrl: route.targetUrl,
    headerName,
    provider: route.provider,
    host: route.host,
    routeKey: route.routeKey
  };
};
