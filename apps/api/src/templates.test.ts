import assert from "node:assert/strict";
import test from "node:test";
import {
  canMutateTemplate,
  canReadTemplateRow,
  isSharedPlatformTemplateVisibility,
  templateReadScopeSql
} from "./templates.js";

test("template read scope allows own templates and shared platform templates", () => {
  assert.equal(canReadTemplateRow({ organizationId: "org_1", visibility: "private" }, "org_1"), true);
  assert.equal(canReadTemplateRow({ organizationId: "org_2", visibility: "public" }, "org_1"), false);
  assert.equal(canReadTemplateRow({ organizationId: null, visibility: "public" }, "org_1"), true);
  assert.equal(canReadTemplateRow({ organizationId: null, visibility: "internal" }, "org_1"), true);
  assert.equal(canReadTemplateRow({ organizationId: null, visibility: "private" }, "org_1"), false);
});

test("template mutation is limited to team-owned templates", () => {
  assert.equal(canMutateTemplate({ ownerScope: "team" }), true);
  assert.equal(canMutateTemplate({ ownerScope: "platform" }), false);
});

test("platform private templates are not shared", () => {
  assert.equal(isSharedPlatformTemplateVisibility("public"), true);
  assert.equal(isSharedPlatformTemplateVisibility("internal"), true);
  assert.equal(isSharedPlatformTemplateVisibility("private"), false);
});

test("templateReadScopeSql encodes the same shared-platform policy", () => {
  assert.equal(
    templateReadScopeSql("tpl", "$7"),
    "(tpl.organization_id = $7 OR (tpl.organization_id IS NULL AND tpl.visibility = ANY(ARRAY['public','internal']::text[])))"
  );
});
