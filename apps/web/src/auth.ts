const env = import.meta.env ?? ({} as ImportMetaEnv);

const defaultKeycloakUrl = () => {
  return "http://127.0.0.1:8081";
};

const KEYCLOAK_URL = env.PUBLIC_KEYCLOAK_URL ?? env.VITE_PUBLIC_KEYCLOAK_URL ?? defaultKeycloakUrl();
const KEYCLOAK_REALM = env.PUBLIC_KEYCLOAK_REALM ?? env.VITE_PUBLIC_KEYCLOAK_REALM ?? "harakiri";
const KEYCLOAK_CLIENT_ID = env.PUBLIC_KEYCLOAK_CLIENT_ID ?? env.VITE_PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web";

const verifierKey = "harakiri_pkce_verifier";
const returnRouteKey = "harakiri_return_route";
const tokenKey = "harakiri_access_token";
const profileKey = "harakiri_profile";

const b64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomString = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return b64(bytes);
};

const sha256 = async (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

const redirectUri = () => `${location.origin}${location.pathname}`;

export type UserProfile = {
  email?: string;
  name?: string;
  sub?: string;
};

export const auth = {
  token() {
    return localStorage.getItem(tokenKey);
  },
  profile(): UserProfile | null {
    const raw = localStorage.getItem(profileKey);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  },
  async signIn() {
    const verifier = randomString();
    sessionStorage.setItem(verifierKey, verifier);
    sessionStorage.setItem(returnRouteKey, location.hash.slice(1) || "dashboard/sandboxes");
    const challenge = b64(await sha256(verifier));
    const params = new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state: randomString(),
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    location.href = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth?${params}`;
  },
  async handleCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) return null;
    const verifier = sessionStorage.getItem(verifierKey);
    if (!verifier) throw new Error("Missing PKCE verifier");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier
    });
    const response = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(await response.text());
    const token = (await response.json()) as { access_token: string };
    localStorage.setItem(tokenKey, token.access_token);
    const payload = JSON.parse(atob(token.access_token.split(".")[1])) as UserProfile;
    localStorage.setItem(profileKey, JSON.stringify(payload));
    const route = sessionStorage.getItem(returnRouteKey) || "dashboard/sandboxes";
    sessionStorage.removeItem(verifierKey);
    sessionStorage.removeItem(returnRouteKey);
    history.replaceState(null, "", `${location.pathname}#${route}`);
    return route;
  },
  signOut() {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(profileKey);
    location.hash = "landing";
  }
};
