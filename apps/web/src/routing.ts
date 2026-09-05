import type { Route } from "./routes/types";

export const isSandboxDetailRoute = (route: string): route is `dashboard/sandboxes/${string}` =>
  /^dashboard\/sandboxes\/[^/]+$/.test(route);

export const isRoute = (route: string): route is Route =>
  route === "landing" ||
  route === "onboarding" ||
  route === "dashboard/sandboxes" ||
  isSandboxDetailRoute(route) ||
  route === "dashboard/templates" ||
  route === "dashboard/vault" ||
  route === "dashboard/members" ||
  route === "dashboard/metrics" ||
  route === "dashboard/keys" ||
  route === "dashboard/settings" ||
  route === "detail" ||
  route === "docs" ||
  route === "demos" ||
  /^demos\/[a-z0-9-]+$/.test(route) ||
  route === "changelog";

export const routeFromHash = (hash: string): Route => {
  const route = hash.replace(/^#/, "");
  return isRoute(route) ? route : "landing";
};

export const sandboxDetailIdFromRoute = (route: Route) => {
  if (!isSandboxDetailRoute(route)) return "";
  try {
    return decodeURIComponent(route.slice("dashboard/sandboxes/".length));
  } catch {
    return route.slice("dashboard/sandboxes/".length);
  }
};

export const isPublicRoute = (route: Route) => route === "landing" || route === "docs" || route === "changelog" || route === "demos" || route.startsWith("demos/");

export const hasOidcResponse = (hash: string) => {
  const fragment = hash.replace(/^#/, "");
  return fragment.includes("state=") && (fragment.includes("code=") || fragment.includes("error="));
};

export const selectInitialRoute = ({
  requestedRoute,
  isOidcResponse,
  returnedRoute,
  pendingPublicRoute
}: {
  requestedRoute: Route;
  isOidcResponse: boolean;
  returnedRoute: string | null;
  pendingPublicRoute: Route | null;
}): Route => {
  if (isOidcResponse && returnedRoute && isRoute(returnedRoute)) return returnedRoute;
  if (!isOidcResponse && requestedRoute === "landing" && pendingPublicRoute) return pendingPublicRoute;
  return requestedRoute;
};
