import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { docPages } from "./docs-content.js";
import { groupDocPages, searchDocPages } from "./docs-navigation.js";
import { usageObservationsDocs, usageTutorialDocs, operatorMonitoringDocs } from "./usage-observations-docs.js";

test("usage has discoverable concept, tutorial and operator docs with explicit release boundaries", () => {
  const navigation = groupDocPages(docPages).flatMap((group) => group.pages.map((page) => page.id));
  for (const page of [usageObservationsDocs, usageTutorialDocs, operatorMonitoringDocs]) {
    assert.ok(navigation.includes(page.id));
    assert.ok(docPages.some((doc) => doc.id === page.id));
    assert.ok(searchDocPages(docPages, page.title).some((doc) => doc.id === page.id));
  }
  const concept = renderToStaticMarkup(usageObservationsDocs.body).replace(/<[^>]*>/g, " ");
  for (const term of ["not yet published", "slot-seconds", "sampleCount", "unobservedCount", "1,500", "org:read", "usage_history_limit_exceeded", "CPU", "billing"]) assert.ok(concept.includes(term), term);
  const operator = renderToStaticMarkup(operatorMonitoringDocs.body).replace(/<[^>]*>/g, " ");
  for (const term of ["not a TLS endpoint", "free inodes", "physical disk", "qualified", "NetworkPolicy"]) assert.ok(operator.includes(term), term);
});
