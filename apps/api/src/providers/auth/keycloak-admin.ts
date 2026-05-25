import { config } from "../../config.js";

export type KeycloakUserSummary = {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
};

export type KeycloakRequiredActionInput = {
  userId: string;
  actions: string[];
  clientId?: string;
  redirectUri?: string;
  lifespanSeconds?: number;
};

export interface KeycloakAdminClient {
  findUserByEmail(email: string): Promise<KeycloakUserSummary | null>;
  createUser(input: { email: string; firstName?: string; lastName?: string }): Promise<KeycloakUserSummary>;
  executeActionsEmail(input: KeycloakRequiredActionInput): Promise<void>;
}

export class KeycloakAdminError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "KeycloakAdminError";
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const splitName = (email: string) => {
  const localPart = email.split("@")[0] || email;
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  const title = (value: string) => value.slice(0, 1).toUpperCase() + value.slice(1);
  return {
    firstName: parts[0] ? title(parts[0]) : email,
    lastName: parts.slice(1).map(title).join(" ")
  };
};

export class HttpKeycloakAdminClient implements KeycloakAdminClient {
  private readonly baseUrl: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly options = {
      baseUrl: config.keycloakAdminBaseUrl,
      realm: config.keycloakAdminRealm,
      tokenRealm: config.keycloakAdminTokenRealm,
      clientId: config.keycloakAdminClientId,
      clientSecret: config.keycloakAdminClientSecret,
      username: config.keycloakAdminUsername,
      password: config.keycloakAdminPassword
    }
  ) {
    this.baseUrl = trimSlash(options.baseUrl);
  }

  async findUserByEmail(email: string) {
    const users = await this.request<KeycloakUserSummary[]>(
      `/admin/realms/${encodeURIComponent(this.options.realm)}/users?email=${encodeURIComponent(email)}&exact=true`
    );
    return users[0] ?? null;
  }

  async createUser(input: { email: string; firstName?: string; lastName?: string }) {
    const name = splitName(input.email);
    await this.request<void>(`/admin/realms/${encodeURIComponent(this.options.realm)}/users`, {
      method: "POST",
      body: JSON.stringify({
        username: input.email,
        email: input.email,
        firstName: input.firstName ?? name.firstName,
        lastName: input.lastName ?? name.lastName,
        enabled: true,
        emailVerified: false
      })
    });
    const user = await this.findUserByEmail(input.email);
    if (!user) throw new KeycloakAdminError("created Keycloak user was not returned by lookup");
    return user;
  }

  async executeActionsEmail(input: KeycloakRequiredActionInput) {
    const params = new URLSearchParams();
    if (input.clientId) params.set("client_id", input.clientId);
    if (input.redirectUri) params.set("redirect_uri", input.redirectUri);
    if (input.lifespanSeconds) params.set("lifespan", String(input.lifespanSeconds));
    const suffix = params.toString() ? `?${params}` : "";
    await this.request<void>(
      `/admin/realms/${encodeURIComponent(this.options.realm)}/users/${encodeURIComponent(input.userId)}/execute-actions-email${suffix}`,
      {
        method: "PUT",
        body: JSON.stringify(input.actions)
      }
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new KeycloakAdminError(body || `Keycloak admin request failed: ${response.status}`, response.status);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async getToken() {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 10_000) return this.token.value;

    const body = new URLSearchParams({
      grant_type: this.options.clientSecret ? "client_credentials" : "password",
      client_id: this.options.clientId
    });
    if (this.options.clientSecret) {
      body.set("client_secret", this.options.clientSecret);
    } else {
      if (!this.options.username || !this.options.password) {
        throw new KeycloakAdminError("Keycloak admin credentials are not configured");
      }
      body.set("username", this.options.username);
      body.set("password", this.options.password);
    }
    const response = await fetch(`${this.baseUrl}/realms/${encodeURIComponent(this.options.tokenRealm)}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) {
      const error = await response.text().catch(() => "");
      throw new KeycloakAdminError(error || `Keycloak token request failed: ${response.status}`, response.status);
    }
    const token = (await response.json()) as { access_token: string; expires_in?: number };
    this.token = { value: token.access_token, expiresAt: now + Number(token.expires_in ?? 60) * 1000 };
    return this.token.value;
  }
}

export const keycloakAdminClient = new HttpKeycloakAdminClient();
