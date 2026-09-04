export type Route =
  | "landing"
  | "onboarding"
  | "dashboard/sandboxes"
  | `dashboard/sandboxes/${string}`
  | "dashboard/templates"
  | "dashboard/vault"
  | "dashboard/members"
  | "dashboard/metrics"
  | "dashboard/keys"
  | "dashboard/settings"
  | "detail"
  | "docs"
  | "changelog";

export type GoToRoute = (route: Route) => void;
