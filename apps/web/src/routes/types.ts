export type Route =
  | "landing"
  | "onboarding"
  | "dashboard/sandboxes"
  | `dashboard/sandboxes/${string}`
  | "dashboard/templates"
  | "dashboard/workspaces"
  | "dashboard/vault"
  | "dashboard/members"
  | "dashboard/metrics"
  | "dashboard/keys"
  | "dashboard/settings"
  | "detail"
  | "docs"
  | `docs/${string}`
  | "demos"
  | `demos/${string}`
  | "changelog";

export type GoToRoute = (route: Route) => void;
