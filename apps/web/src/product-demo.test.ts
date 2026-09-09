import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ProductDemo } from "./components/product-demo.js";
import { LandingRoute } from "./routes/landing.js";
import { DemosRoute } from "./routes/demos.js";
import { isPublicRoute, routeFromHash } from "./routing.js";

test("full demo uses native controls, captions and transcript", () => {
  const html = renderToStaticMarkup(createElement(ProductDemo, { onTutorial() {} }));
  for (const text of ['controls=""', 'playsInline=""', 'preload="metadata"', 'kind="captions"', 'transcript.md', 'provenance.json', 'poster.webp', 'Follow the tutorial']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("remotion"));
});
test("landing retains the original layout without loading demo media", () => {
  const html = renderToStaticMarkup(createElement(LandingRoute, { go() {}, onSignIn() {}, onSignOut() {} }));
  assert.match(html, /hero-canvas/);
  assert.doesNotMatch(html, /<video|\.mp4|product-demo-section/);
  assert.doesNotMatch(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /remotion/);
});
test("demos have public deep links and do not autoplay", () => {
  for (const route of ["demos", "demos/cli-live-preview"] as const) {
    assert.equal(routeFromHash(`#${route}`), route);
    assert.ok(isPublicRoute(route));
  }
  const html = renderToStaticMarkup(createElement(DemosRoute, { go() {} }));
  assert.match(html, /Demo library/);
  assert.match(html, /Video chapters/);
  assert.doesNotMatch(html, /autoPlay/);
});

test("landing presents the control plane without unverified runtime guarantees", () => {
  const html = renderToStaticMarkup(createElement(LandingRoute, { go() {}, onSignIn() {}, onSignOut() {} }));
  assert.match(html, /Harakiri Sandbox/);
  assert.match(html, /control plane/);
  assert.match(html, /provider interface/);
  assert.match(html, /OpenSandbox powers execution today/);
  assert.match(html, /EXAMPLE WORKFLOW/);
  assert.doesNotMatch(html, /OpenSandbox wrapper|Disposable VMs|microVM|137ms|disk zeroed|rmse=/);
});
