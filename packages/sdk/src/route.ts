import type { HarakiriClient } from "./index.js";
import type { SandboxRouteResponse, SandboxRouteSummary } from "./protocol.js";
import { createRouteFetch, waitForRouteHttp, type CreateRouteFetchOptions, type WaitForRouteHttpOptions } from "./route-access.js";

/** An explicit exposure. Its scoped fetch sends route credentials, never the control-plane key. */
export class HarakiriRoute implements SandboxRouteResponse {
  #client: HarakiriClient;
  #sandboxId: string;
  readonly route: SandboxRouteSummary;
  readonly accessToken?: string;
  readonly accessHeaderName?: string;

  constructor(client: HarakiriClient, sandboxId: string, response: SandboxRouteResponse) {
    this.#client = client;
    this.#sandboxId = sandboxId;
    this.route = response.route;
    this.accessToken = response.accessToken;
    this.accessHeaderName = response.accessHeaderName;
  }

  get url() { return this.route.url; }
  get port() { return this.route.port; }
  fetch(input: string | URL | Request = "/", init?: RequestInit) {
    return createRouteFetch(this)(input, init);
  }
  /** Adapter for HTTP-based agent SDKs, optionally adding service-level Basic authentication. */
  createFetch(options: CreateRouteFetchOptions = {}) { return createRouteFetch(this, options); }
  waitForHttp(options: WaitForRouteHttpOptions = {}) { return waitForRouteHttp(this, options); }
  delete() { return this.#client.deleteRoute(this.#sandboxId, this.port); }
}
