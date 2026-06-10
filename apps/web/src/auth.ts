import Keycloak, { type KeycloakTokenParsed } from "keycloak-js";
import { env } from "./runtime-config";

const defaultKeycloakUrl = () => "http://127.0.0.1:8081";

const KEYCLOAK_URL = env.PUBLIC_KEYCLOAK_URL ?? env.VITE_PUBLIC_KEYCLOAK_URL ?? defaultKeycloakUrl();
const KEYCLOAK_REALM = env.PUBLIC_KEYCLOAK_REALM ?? env.VITE_PUBLIC_KEYCLOAK_REALM ?? "harakiri";
const KEYCLOAK_CLIENT_ID = env.PUBLIC_KEYCLOAK_CLIENT_ID ?? env.VITE_PUBLIC_KEYCLOAK_CLIENT_ID ?? "harakiri-web";
const ENABLE_SILENT_CHECK_SSO =
  (env.PUBLIC_KEYCLOAK_SILENT_CHECK_SSO ?? env.VITE_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO) === "true";

const returnRouteKey = "harakiri_auth_return_route";
const broadcastStorageKey = "harakiri_auth_event";
const broadcastChannelName = "harakiri-auth";
const legacyTokenKey = "harakiri_access_token";
const legacyProfileKey = "harakiri_profile";

export type UserProfile = {
  email?: string;
  name?: string;
  sub?: string;
};

export type AuthStatus = "checking" | "authenticated" | "anonymous" | "expired" | "signing-out" | "error";

export type AuthSnapshot = {
  status: AuthStatus;
  profile: UserProfile | null;
  error?: string;
};

type AuthEvent = "logout" | "session-expired";

export class AuthSessionExpiredError extends Error {
  constructor(message = "Your session expired. Sign in again.") {
    super(message);
    this.name = "AuthSessionExpiredError";
  }
}

type KeycloakClient = Pick<
  Keycloak,
  | "authenticated"
  | "token"
  | "tokenParsed"
  | "idToken"
  | "idTokenParsed"
  | "init"
  | "login"
  | "logout"
  | "updateToken"
  | "clearToken"
  | "loadUserProfile"
  | "onAuthSuccess"
  | "onAuthRefreshSuccess"
  | "onAuthRefreshError"
  | "onAuthLogout"
  | "onTokenExpired"
>;

type KeycloakClientFactory = () => KeycloakClient;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

const appBaseUri = () => `${window.location.origin}${window.location.pathname}`;
const loginRedirectUri = () => appBaseUri();
const postLogoutRedirectUri = () => `${appBaseUri()}#landing`;
const silentCheckSsoUri = () => `${window.location.origin}/silent-check-sso.html`;

const isInternalRoute = (route: string) => {
  return (
    route === "landing" ||
    route === "onboarding" ||
    route === "detail" ||
    route === "docs" ||
    route === "changelog" ||
    route.startsWith("dashboard/")
  );
};

const sanitizeRoute = (route?: string | null) => {
  const normalized = (route ?? "").replace(/^#/, "").trim();
  return isInternalRoute(normalized) ? normalized : "dashboard/sandboxes";
};

const getClaimString = (claims: KeycloakTokenParsed | undefined, key: string) => {
  const value = claims?.[key];
  return typeof value === "string" && value ? value : undefined;
};

const profileFromClaims = (claims: KeycloakTokenParsed | undefined): UserProfile | null => {
  if (!claims) return null;
  const given = getClaimString(claims, "given_name");
  const family = getClaimString(claims, "family_name");
  const composedName = [given, family].filter(Boolean).join(" ");
  return {
    sub: getClaimString(claims, "sub"),
    email: getClaimString(claims, "email"),
    name: getClaimString(claims, "name") ?? (composedName || undefined)
  };
};

const defaultClientFactory: KeycloakClientFactory = () =>
  new Keycloak({
    url: KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_CLIENT_ID
  });

export const createAuthSession = (clientFactory: KeycloakClientFactory = defaultClientFactory) => {
  let client: KeycloakClient | null = null;
  let initPromise: Promise<AuthSnapshot> | null = null;
  let refreshPromise: Promise<string> | null = null;
  let channel: BroadcastChannel | null = null;
  let clearing = false;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  let snapshot: AuthSnapshot = { status: "checking", profile: null };

  const emit = () => {
    for (const listener of listeners) listener(snapshot);
  };

  const setSnapshot = (next: AuthSnapshot) => {
    snapshot = next;
    emit();
  };

  const removeLegacyStorage = () => {
    if (!isBrowser()) return;
    window.localStorage.removeItem(legacyTokenKey);
    window.localStorage.removeItem(legacyProfileKey);
  };

  const parsedProfile = () => {
    const claims = client?.idTokenParsed ?? client?.tokenParsed;
    return profileFromClaims(claims);
  };

  const broadcast = (event: AuthEvent) => {
    if (!isBrowser()) return;
    const payload = JSON.stringify({ event, at: Date.now() });
    channel?.postMessage({ event });
    window.localStorage.setItem(broadcastStorageKey, payload);
    window.localStorage.removeItem(broadcastStorageKey);
  };

  const clearLocalSession = (status: AuthStatus = "anonymous", error?: unknown, shouldBroadcast = true) => {
    removeLegacyStorage();
    if (!clearing) {
      clearing = true;
      try {
        client?.clearToken();
      } catch {
        // The adapter may not be initialized in tests or early render paths.
      } finally {
        clearing = false;
      }
    }
    setSnapshot({
      status,
      profile: null,
      error: error instanceof Error ? error.message : typeof error === "string" ? error : undefined
    });
    if (shouldBroadcast) broadcast(status === "expired" ? "session-expired" : "logout");
  };

  const handleExternalEvent = (event: AuthEvent) => {
    clearLocalSession(event === "session-expired" ? "expired" : "anonymous", undefined, false);
  };

  const ensureBroadcastListeners = () => {
    if (!isBrowser() || channel) return;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(broadcastChannelName);
      channel.onmessage = (message) => {
        const event = (message.data as { event?: AuthEvent } | undefined)?.event;
        if (event === "logout" || event === "session-expired") handleExternalEvent(event);
      };
    }
    window.addEventListener("storage", (event) => {
      if (event.key !== broadcastStorageKey || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as { event?: AuthEvent };
        if (payload.event === "logout" || payload.event === "session-expired") handleExternalEvent(payload.event);
      } catch {
        // Ignore unrelated storage writes.
      }
    });
  };

  const ensureClient = () => {
    if (!client) {
      client = clientFactory();
      client.onAuthSuccess = () => setSnapshot({ status: "authenticated", profile: parsedProfile() });
      client.onAuthRefreshSuccess = () => setSnapshot({ status: "authenticated", profile: parsedProfile() });
      client.onAuthRefreshError = () => clearLocalSession("expired", new AuthSessionExpiredError());
    client.onAuthLogout = () => {
      if (!clearing) clearLocalSession("anonymous", undefined, false);
    };
      client.onTokenExpired = () => {
        void getAccessToken(30).catch(() => undefined);
      };
    }
    return client;
  };

  const init = async () => {
    if (!isBrowser()) {
      setSnapshot({ status: "anonymous", profile: null });
      return snapshot;
    }
    if (initPromise) return initPromise;
    ensureBroadcastListeners();
    removeLegacyStorage();
    setSnapshot({ status: "checking", profile: null });
    const keycloak = ensureClient();
    initPromise = keycloak
      .init({
        onLoad: "check-sso",
        flow: "standard",
        pkceMethod: "S256",
        useNonce: true,
        responseMode: "fragment",
        scope: "openid email profile",
        redirectUri: loginRedirectUri(),
        checkLoginIframe: false,
        ...(ENABLE_SILENT_CHECK_SSO ? { silentCheckSsoRedirectUri: silentCheckSsoUri() } : {})
      })
      .then((authenticated) => {
        setSnapshot(authenticated ? { status: "authenticated", profile: parsedProfile() } : { status: "anonymous", profile: null });
        return snapshot;
      })
      .catch((error: unknown) => {
        setSnapshot({
          status: "error",
          profile: null,
          error: error instanceof Error ? error.message : "Unable to initialize sign-in."
        });
        return snapshot;
      });
    return initPromise;
  };

  const signIn = async (returnTo?: string) => {
    if (!isBrowser()) return;
    const nextRoute = sanitizeRoute(returnTo ?? window.location.hash.slice(1));
    const existingRoute = peekReturnRoute();
    rememberReturnRoute(existingRoute && existingRoute !== "landing" && nextRoute === "landing" ? existingRoute : nextRoute);
    await init();
    if (snapshot.status === "authenticated") return;
    await ensureClient().login({ redirectUri: loginRedirectUri(), scope: "openid email profile" });
  };

  async function getAccessToken(minValiditySeconds = 30) {
    await init();
    const keycloak = ensureClient();
    if (!keycloak.authenticated) return null;
    if (refreshPromise) return refreshPromise;
    refreshPromise = keycloak
      .updateToken(minValiditySeconds)
      .then(() => {
        if (!keycloak.token) throw new AuthSessionExpiredError();
        setSnapshot({ status: "authenticated", profile: parsedProfile() });
        return keycloak.token;
      })
      .catch((error: unknown) => {
        clearLocalSession("expired", error instanceof Error ? error : new AuthSessionExpiredError());
        throw error instanceof Error ? error : new AuthSessionExpiredError();
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  const signOut = async () => {
    if (!isBrowser()) return;
    await init();
    removeLegacyStorage();
    window.sessionStorage.removeItem(returnRouteKey);
    broadcast("logout");
    setSnapshot({ status: "signing-out", profile: null });
    const keycloak = ensureClient();
    if (keycloak.authenticated || keycloak.idToken) {
      try {
        void keycloak.logout({ redirectUri: postLogoutRedirectUri(), logoutMethod: "GET" });
        return;
      } catch {
        // Fall through to local cleanup if the provider logout redirect cannot start.
      }
    }
    clearLocalSession("anonymous", undefined, false);
    window.location.hash = "landing";
  };

  const consumeReturnRoute = () => {
    if (!isBrowser()) return null;
    const route = window.sessionStorage.getItem(returnRouteKey);
    if (!route) return null;
    window.sessionStorage.removeItem(returnRouteKey);
    return sanitizeRoute(route);
  };

  const peekReturnRoute = () => {
    if (!isBrowser()) return null;
    const route = window.sessionStorage.getItem(returnRouteKey);
    return route ? sanitizeRoute(route) : null;
  };

  const rememberReturnRoute = (route?: string | null) => {
    if (!isBrowser()) return;
    window.sessionStorage.setItem(returnRouteKey, sanitizeRoute(route));
  };

  return {
    init,
    signIn,
    signOut,
    getAccessToken,
    clearLocalSession,
    consumeReturnRoute,
    peekReturnRoute,
    rememberReturnRoute,
    isAuthenticated: () => snapshot.status === "authenticated",
    profile: () => snapshot.profile,
    snapshot: () => snapshot,
    subscribe: (listener: (snapshot: AuthSnapshot) => void) => {
      listeners.add(listener);
      listener(snapshot);
      return () => { listeners.delete(listener); };
    }
  };
};

export type AuthSession = ReturnType<typeof createAuthSession>;

export const auth = createAuthSession();
