import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { auth, type UserProfile } from "./auth";
import { Brand } from "./components/brand";
import { Icon } from "./components/icon";
import { DashboardShellRoute } from "./routes/dashboard-shell";
import { DocsRoute } from "./routes/docs";
import { LandingRoute } from "./routes/landing";
import { OnboardingRoute } from "./routes/onboarding";
import { SandboxDetailRoute } from "./routes/sandbox-detail";
import type { Route } from "./routes/types";
import "./styles.css";
import "./styles-landing.css";
import "./styles-app.css";

const SignInGate = ({ onSignIn }: { onSignIn: () => void }) => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">Sign in with Keycloak.</h1>
        <p className="onb-sub">Dashboard, sandbox detail, onboarding, API keys, usage, and settings require a Keycloak session.</p>
        <div className="onb-foot"><button className="btn btn-primary" onClick={onSignIn}>Sign in <Icon name="arrowR" size={11} /></button></div>
      </div>
    </div>
  </div>
);

const LoadingGate = () => (
  <div className="onb">
    <div className="onb-bar"><Brand /></div>
    <div className="onb-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 760 }}>
      <div className="onb-body">
        <h1 className="onb-h">Opening dashboard.</h1>
      </div>
    </div>
  </div>
);

const App = () => {
  const [route, setRoute] = useState<Route>(() => (location.hash.slice(1) as Route) || "landing");
  const [detailId, setDetailId] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(() => auth.profile());
  const [onboardingGate, setOnboardingGate] = useState<"checking" | "allowed">("checking");
  const resolveRoute = async (nextRoute: Route) => {
    if (nextRoute !== "onboarding" || !auth.token()) return nextRoute;
    const me = await api.me().catch(() => null);
    return me?.user?.onboardingCompletedAt ? "dashboard/sandboxes" : nextRoute;
  };
  useEffect(() => { auth.handleCallback().then(async (nextRoute) => { if (nextRoute) { setProfile(auth.profile()); setRoute(await resolveRoute(nextRoute as Route)); } }).catch((error) => console.error(error)); }, []);
  useEffect(() => { location.hash = route; }, [route]);
  useEffect(() => { const onHash = () => setRoute((location.hash.slice(1) as Route) || "landing"); window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  useEffect(() => {
    if (route !== "onboarding" || !auth.token()) {
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
  }, [route]);
  const go = (r: Route) => { setRoute(r); window.scrollTo(0, 0); };
  const openSandbox = (id: string) => { setDetailId(id); go("detail"); };
  const signIn = () => void auth.signIn();
  const signOut = () => { auth.signOut(); setProfile(null); };
  if (route !== "landing" && route !== "docs" && !auth.token()) return <SignInGate onSignIn={signIn} />;
  if (route === "onboarding" && auth.token() && onboardingGate !== "allowed") return <LoadingGate />;
  return route === "landing" ? <LandingRoute go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} /> : route === "onboarding" ? <OnboardingRoute go={go} profile={profile} /> : route === "detail" && detailId ? <SandboxDetailRoute id={detailId} go={go} /> : route === "docs" ? <DocsRoute go={go} profile={profile} onSignIn={signIn} onSignOut={signOut} /> : <DashboardShellRoute route={route === "detail" ? "dashboard/sandboxes" : route} go={go} openSandbox={openSandbox} profile={profile} onSignOut={signOut} />;
};

createRoot(document.getElementById("root")!).render(<App />);
