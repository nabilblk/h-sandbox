import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { auth, type AuthSnapshot } from "./auth";
import { Brand } from "./components/brand";
import { Icon } from "./components/icon";
import { ChangelogRoute } from "./routes/changelog";
import { DashboardShellRoute } from "./routes/dashboard-shell";
import { DemosRoute } from "./routes/demos";
import { LandingRoute } from "./routes/landing";
import { OnboardingRoute } from "./routes/onboarding";
import { SandboxDetailRoute } from "./routes/sandbox-detail";
import type { Route } from "./routes/types";
import {
  hasOidcResponse,
  isDocsRoute,
  isPublicRoute,
  isRoute,
  isSandboxDetailRoute,
  routeFromHash,
  sandboxDetailIdFromRoute,
  selectInitialRoute
} from "./routing";
import "./styles.css";
import "./styles-landing.css";
import "./styles-app.css";
import "./styles-docs.css";

const DocsRoute = lazy(() => import("./routes/docs").then((module) => ({ default: module.DocsRoute })));
import "./styles-demos.css";
import "./styles-workspaces.css";
import "./styles-capacity.css";
import "./styles-usage.css";

const pendingPublicRouteKey = "harakiri_pending_public_route";

const rememberPublicDeepLink = (route: Route) => {
  if (route !== "landing" && isPublicRoute(route)) sessionStorage.setItem(pendingPublicRouteKey, route);
};

const consumePublicDeepLink = () => {
  const route = sessionStorage.getItem(pendingPublicRouteKey);
  sessionStorage.removeItem(pendingPublicRouteKey);
  return route && isRoute(route) && isPublicRoute(route) ? route : null;
};

const SignInGate = ({
  onSignIn,
  title = "Sign in with Keycloak.",
  message = "Dashboard, sandbox detail, onboarding, API keys, usage, and settings require a Keycloak session."
}: {
  onSignIn: () => void;
  title?: string;
  message?: string;
}) => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">{title}</h1>
        <p className="onb-sub">{message}</p>
        <div className="onb-foot"><button className="btn btn-primary" onClick={onSignIn}>Sign in <Icon name="arrowR" size={11} /></button></div>
      </div>
    </div>
  </div>
);

const LoadingGate = ({ title = "Checking session." }: { title?: string }) => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">{title}</h1>
      </div>
    </div>
  </div>
);

const App = ({ initialAuth, initialRoute }: { initialAuth: AuthSnapshot; initialRoute: Route }) => {
  const [route, setRoute] = useState<Route>(initialRoute);
  const [detailId, setDetailId] = useState(sandboxDetailIdFromRoute(initialRoute));
  const [authState, setAuthState] = useState<AuthSnapshot>(initialAuth);
  const [onboardingGate, setOnboardingGate] = useState<"checking" | "allowed">("checking");
  const authenticated = authState.status === "authenticated";
  const profile = authenticated ? authState.profile : null;

  const resolveRoute = async (nextRoute: Route) => {
    if (nextRoute !== "onboarding" || !auth.isAuthenticated()) return nextRoute;
    const me = await api.me().catch(() => null);
    return me?.user?.onboardingCompletedAt ? "dashboard/sandboxes" : nextRoute;
  };

  useEffect(() => {
    const unsubscribe = auth.subscribe(setAuthState);
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    if (location.hash.slice(1) !== route) location.hash = route;
  }, [route]);

  useEffect(() => {
    const onHash = () => {
      const nextRoute = routeFromHash(location.hash);
      const nextDetailId = sandboxDetailIdFromRoute(nextRoute);
      if (nextDetailId) setDetailId(nextDetailId);
      setRoute(nextRoute);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (route !== "onboarding" || !auth.isAuthenticated()) {
      setOnboardingGate("checking");
      return;
    }
    let cancelled = false;
    setOnboardingGate("checking");
    resolveRoute("onboarding").then((resolvedRoute) => {
      if (cancelled) return;
      if (resolvedRoute === "onboarding") setOnboardingGate("allowed");
      else setRoute(resolvedRoute);
    });
    return () => { cancelled = true; };
  }, [route, authState.status]);

  const go = (r: Route) => { setRoute(r); window.scrollTo(0, 0); };
  const openSandbox = (id: string) => {
    setDetailId(id);
    go(`dashboard/sandboxes/${encodeURIComponent(id)}`);
  };
  const signIn = () => void auth.signIn(route);
  const signOut = () => { void auth.signOut(); };

  if (authState.status === "signing-out") return <LoadingGate title="Signing out." />;
  if (!isPublicRoute(route) && authState.status === "checking") return <LoadingGate />;
  if (!isPublicRoute(route) && !authenticated) {
    return (
      <SignInGate
        onSignIn={signIn}
        title={authState.status === "expired" ? "Session expired." : authState.status === "error" ? "Unable to verify session." : "Sign in with Keycloak."}
        message={authState.status === "expired" ? "Sign in again to continue where you left off." : authState.error ?? undefined}
      />
    );
  }
  if (route === "onboarding" && authenticated && onboardingGate !== "allowed") return <LoadingGate title="Opening dashboard." />;
  const routeDetailId = sandboxDetailIdFromRoute(route) || detailId;
  return route === "landing" ? (
    <LandingRoute go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} authStatus={authState.status} />
  ) : route === "onboarding" ? (
    <OnboardingRoute go={go} profile={profile} />
  ) : (route === "detail" || isSandboxDetailRoute(route)) && routeDetailId ? (
    <SandboxDetailRoute id={routeDetailId} go={go} openSandbox={openSandbox} />
  ) : isDocsRoute(route) ? (
    <Suspense fallback={<main className="docs-loading" role="status">Loading documentation...</main>}><DocsRoute selectedId={route === "docs" ? undefined : route.slice(5)} go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} authStatus={authState.status} /></Suspense>
  ) : route === "demos" || route.startsWith("demos/") ? (
    <DemosRoute go={go} selectedId={route === "demos" ? undefined : route.slice(6)} profile={profile} onSignIn={signIn} onSignOut={signOut} authStatus={authState.status} />
  ) : route === "changelog" ? (
    <ChangelogRoute go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} authStatus={authState.status} />
  ) : (
    <DashboardShellRoute route={route === "detail" ? "dashboard/sandboxes" : route} go={go} openSandbox={openSandbox} profile={profile} onSignOut={signOut} />
  );
};

const boot = async () => {
  const requestedRoute = routeFromHash(location.hash);
  const isOidcResponse = hasOidcResponse(location.hash);
  rememberPublicDeepLink(requestedRoute);
  const shouldInitializeAuth = !isPublicRoute(requestedRoute) || isOidcResponse;
  if (!isPublicRoute(requestedRoute)) auth.rememberReturnRoute(requestedRoute);
  if (!shouldInitializeAuth) auth.clearLocalSession("anonymous", undefined, false);
  const initialAuth = shouldInitializeAuth ? await auth.init() : auth.snapshot();
  const pendingPublicRoute = consumePublicDeepLink();
  const restoredPublicRoute = !isOidcResponse && requestedRoute === "landing" ? pendingPublicRoute : null;
  const returnedRoute = isOidcResponse
    ? initialAuth.status === "authenticated"
      ? auth.consumeReturnRoute()
      : auth.peekReturnRoute()
    : null;
  const initialRoute = selectInitialRoute({
    requestedRoute,
    isOidcResponse,
    returnedRoute,
    pendingPublicRoute: restoredPublicRoute
  });
  createRoot(document.getElementById("root")!).render(<App initialAuth={initialAuth} initialRoute={initialRoute} />);
};

void boot();
