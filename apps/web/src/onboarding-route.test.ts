import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingRoute } from "./routes/onboarding.js";
import { defaultWorkspace } from "./workspace.js";

test("onboarding route renders the account step with profile defaults", () => {
  const markup = renderToStaticMarkup(createElement(OnboardingRoute, {
    go: () => undefined,
    profile: { email: "lyra@k.ai", name: "Lyra Ito" }
  }));

  assert.match(markup, /Welcome to Harakiri/);
  assert.match(markup, /lyra@k.ai/);
  assert.match(markup, /Continue/);
});

test("default workspace derives stable organization defaults from profile", () => {
  assert.deepEqual(defaultWorkspace({ email: "lyra@k.ai", name: "Lyra Ito" }), {
    name: "Lyra Labs",
    slug: "lyra-labs",
    idleTtlSeconds: 300,
    maxConcurrency: 200,
    defaultTemplateId: null,
    defaultEgressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
    egressAllowedPresets: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"],
    egressCustomDomainsEnabled: true,
    egressMaxRules: 128,
    egressRedactDomains: false
  });
});
