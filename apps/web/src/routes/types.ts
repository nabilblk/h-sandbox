export type Route =
  | "landing"
  | "onboarding"
  | "dashboard/sandboxes"
  | "dashboard/templates"
  | "dashboard/metrics"
  | "dashboard/keys"
  | "dashboard/settings"
  | "detail"
  | "docs";

export type GoToRoute = (route: Route) => void;
