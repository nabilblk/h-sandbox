import assert from "node:assert/strict";
import test from "node:test";
import {
  canMutateTemplate,
  canReadTemplateRow,
  isSharedPlatformTemplateVisibility,
  parseTemplateVersionAliasRef,
  rankTemplateResolutionCandidate,
  templateResolutionRank,
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

test("parseTemplateVersionAliasRef supports qualified version aliases", () => {
  assert.deepEqual(parseTemplateVersionAliasRef("open-agents-dev:stable"), {
    templateRef: "open-agents-dev",
    versionAlias: "stable"
  });
  assert.deepEqual(parseTemplateVersionAliasRef("agents/open-agents-dev:latest"), {
    templateRef: "agents/open-agents-dev",
    versionAlias: "latest"
  });
  assert.equal(parseTemplateVersionAliasRef("open-agents-dev"), null);
  assert.equal(parseTemplateVersionAliasRef("stable"), null);
  assert.equal(parseTemplateVersionAliasRef("open-agents-dev:"), null);
});

test("rankTemplateResolutionCandidate matches the runtime resolution order", () => {
  const candidate = {
    templateId: "tpl_open_agents",
    templateName: "open-agents-dev",
    templateAliases: ["agents/open-agents-dev", "open-agents"],
    versionId: "tplv_123",
    versionAliases: ["stable", "latest"]
  };

  assert.equal(rankTemplateResolutionCandidate("tpl_open_agents", candidate), templateResolutionRank.templateId);
  assert.equal(rankTemplateResolutionCandidate("open-agents-dev", candidate), templateResolutionRank.templateName);
  assert.equal(rankTemplateResolutionCandidate("agents/open-agents-dev", candidate), templateResolutionRank.templateAlias);
  assert.equal(rankTemplateResolutionCandidate("tplv_123", candidate), templateResolutionRank.versionId);
  assert.equal(rankTemplateResolutionCandidate("stable", candidate), templateResolutionRank.versionAlias);
  assert.equal(rankTemplateResolutionCandidate("missing-template", candidate), templateResolutionRank.noMatch);
});
