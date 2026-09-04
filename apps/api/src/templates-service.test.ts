import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveTemplateForOrganization,
  createTemplate,
  listTemplateVersions,
  promoteTemplate,
  updateTemplateEgress
} from "./services/templates.js";
import type { RuntimeTemplate } from "./templates.js";

const teamTemplate: RuntimeTemplate = {
  id: "open-agents-dev",
  name: "Open Agents Dev",
  description: "Agent runtime",
  image: "docker.io/library/python@sha256:abc",
  imageDigest: "sha256:abc",
  icon: "file",
  tags: ["agents"],
  aliases: ["agents"],
  bootMs: 220,
  visibility: "private",
  status: "ready",
  ownerScope: "team",
  defaultEntrypoint: ["sleep", "3600"],
  cpuCount: 2,
  memoryMb: 2048,
  workdir: "/workspace",
  defaultPorts: [3000],
  runtimeFamily: "python",
  latestVersionId: "tplv_ready",
  templateVersionId: "tplv_ready"
};

const orgEgressSettingsRow = () => ({
  defaultEgressPolicy: { mode: "open", presets: [], allow: [], deny: [] },
  egressAllowedPresets: ["python-package-install", "node-package-install", "git-hosting", "llm-apis", "browser-basic"],
  egressCustomDomainsEnabled: true,
  egressMaxRules: 128,
  egressRedactDomains: false
});

test("createTemplate validates, inserts, resolves, and audits a custom template", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const result = await createTemplate(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      template: {
        name: "Open Agents Dev",
        description: "Agent runtime",
        image: "ubuntu:24.04",
        icon: "file",
        tags: ["agents"],
        aliases: ["agents"],
        visibility: "private",
        defaultEntrypoint: ["sleep", "3600"],
        cpuCount: 2,
        memoryMb: 2048,
        workdir: "/workspace",
        defaultPorts: [3000],
        runtimeFamily: "python"
      }
    },
    {
      idFactory: () => "tpl_generated",
      resolveTemplateFn: async () => teamTemplate,
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT id FROM templates")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO templates")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  assert.equal(result.kind === "created" ? result.template?.id : null, "open-agents-dev");
  const insert = calls.find((call) => call.text.includes("INSERT INTO templates"));
  assert.ok(insert);
  assert.deepEqual(insert.params?.slice(0, 5), ["open-agents-dev", "org_tpl", "Open Agents Dev", "Agent runtime", "ubuntu:24.04"]);
  assert.equal(audits[0].action, "template.create");
  assert.deepEqual(audits[0].metadata, { imageUri: "ubuntu:24.04", status: "building", credentialSlotCount: 0 });
});

test("createTemplate expands credential slots from provider presets", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ metadata?: Record<string, unknown> }> = [];
  const result = await createTemplate(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      template: {
        name: "Agent With Credentials",
        description: "Agent runtime",
        image: "ubuntu:24.04",
        icon: "file",
        tags: ["agents"],
        aliases: ["agent-with-credentials"],
        visibility: "private",
        defaultEntrypoint: ["sleep", "3600"],
        cpuCount: 2,
        memoryMb: 2048,
        workdir: "/workspace",
        defaultPorts: [3000],
        runtimeFamily: "python",
        credentialSlots: [
          { providerPresetId: "openai" },
          { providerPresetId: "github", required: false, envName: "GH_TOKEN" }
        ]
      }
    },
    {
      idFactory: () => "agent-with-credentials",
      resolveTemplateFn: async () => ({
        ...teamTemplate,
        id: "agent-with-credentials",
        credentialSlots: []
      }),
      recordAudit: async (_organizationId, _userId, _actorLabel, _action, _targetType, _targetId, metadata) => {
        audits.push({ metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("SELECT id FROM templates")) return { rowCount: 0, rows: [] as never[] };
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("INSERT INTO templates")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "created");
  const insert = calls.find((call) => call.text.includes("INSERT INTO templates"));
  const slots = JSON.parse(insert?.params?.[15] as string);
  assert.deepEqual(slots.map((slot: any) => [slot.id, slot.providerPresetId, slot.required, slot.envName]), [
    ["openai", "openai", true, "OPENAI_API_KEY"],
    ["github", "github", false, "GH_TOKEN"]
  ]);
  assert.equal(JSON.stringify(slots).includes("sk_"), false);
  assert.equal(audits[0].metadata?.credentialSlotCount, 2);
});

test("listTemplateVersions resolves the requested template before querying versions", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const result = await listTemplateVersions(
    { organizationId: "org_tpl", templateId: "agents" },
    {
      resolveTemplateFn: async () => teamTemplate,
      query: async (text, params) => {
        calls.push({ text, params });
        return {
          rowCount: 1,
          rows: [
            {
              id: "tplv_ready",
              templateId: "open-agents-dev",
              status: "ready",
              credentialSlots: [{ id: "openai", providerPresetId: "openai", required: true }]
            }
          ] as never[]
        };
      }
    }
  );

  assert.equal(result.kind, "found");
  assert.deepEqual(calls[0].params, ["open-agents-dev", "org_tpl"]);
  if (result.kind === "found") assert.equal(result.versions[0].id, "tplv_ready");
  if (result.kind === "found") assert.deepEqual(result.versions[0].credentialSlots?.map((slot) => slot.providerPresetId), ["openai"]);
});

test("updateTemplateEgress validates workspace guardrails and records template audit", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const result = await updateTemplateEgress(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      templateId: "open-agents-dev",
      egressPolicy: { mode: "restricted", presets: ["python-package-install"], allow: ["api.github.com"], deny: [] }
    },
    {
      resolveTemplateFn: async () => teamTemplate,
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("default_egress_policy")) return { rowCount: 1, rows: [orgEgressSettingsRow()] as never[] };
        if (text.includes("UPDATE templates")) return { rowCount: 1, rows: [] as never[] };
        if (text.includes("UPDATE template_versions")) return { rowCount: 1, rows: [] as never[] };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "updated");
  assert(calls.some((call) => call.text.includes("UPDATE templates")));
  assert(calls.some((call) => call.text.includes("UPDATE template_versions")));
  assert.equal(audits[0].action, "template.egress.updated");
  assert.deepEqual(audits[0].metadata, { mode: "restricted", ruleCount: 7, presetCount: 1 });
});

test("updateTemplateEgress rejects disabled custom domains", async () => {
  const result = await updateTemplateEgress(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      templateId: "open-agents-dev",
      egressPolicy: { mode: "restricted", presets: ["python-package-install"], allow: ["api.github.com"], deny: [] }
    },
    {
      resolveTemplateFn: async () => teamTemplate,
      recordAudit: async () => undefined,
      query: async (text) => {
        if (text.includes("default_egress_policy")) return {
          rowCount: 1,
          rows: [{ ...orgEgressSettingsRow(), egressCustomDomainsEnabled: false }] as never[]
        };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "egress_custom_domains_disabled");
});

test("updateTemplateEgress rejects disabled presets", async () => {
  const result = await updateTemplateEgress(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      templateId: "open-agents-dev",
      egressPolicy: { mode: "restricted", presets: ["llm-apis"], allow: [], deny: [] }
    },
    {
      resolveTemplateFn: async () => teamTemplate,
      recordAudit: async () => undefined,
      query: async (text) => {
        if (text.includes("default_egress_policy")) return {
          rowCount: 1,
          rows: [{ ...orgEgressSettingsRow(), egressAllowedPresets: ["python-package-install"] }] as never[]
        };
        throw new Error(`unexpected query: ${text}`);
      }
    }
  );

  assert.equal(result.kind, "egress_preset_not_allowed");
});

test("promoteTemplate updates aliases/latest version and records audit metadata", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const resolveRefs: string[] = [];
  const result = await promoteTemplate(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      templateId: "open-agents-dev",
      versionId: "tplv_new",
      alias: "stable"
    },
    {
      resolveTemplateFn: async (templateRef) => {
        resolveRefs.push(templateRef);
        return { ...teamTemplate, latestVersionId: templateRef === "tplv_new" ? "tplv_new" : teamTemplate.latestVersionId };
      },
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        if (text.includes("FROM template_versions")) return { rowCount: 1, rows: [{ id: "tplv_new" }] as never[] };
        return { rowCount: 1, rows: [] as never[] };
      }
    }
  );

  assert.equal(result.kind, "promoted");
  assert.deepEqual(resolveRefs, ["open-agents-dev", "tplv_new"]);
  assert(calls.some((call) => call.text.includes("UPDATE template_versions")));
  assert(calls.some((call) => call.text.includes("UPDATE templates SET latest_version_id")));
  assert.equal(audits[0].action, "template.promote");
  assert.deepEqual(audits[0].metadata, { versionId: "tplv_new", alias: "stable" });
});

test("archiveTemplateForOrganization cancels active builds and audits canceled ids", async () => {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const result = await archiveTemplateForOrganization(
    {
      organizationId: "org_tpl",
      userId: "user_tpl",
      actorLabel: "user@test.local",
      templateId: "open-agents-dev"
    },
    {
      archiveTemplateFn: async () => ({ ...teamTemplate, status: "archived" }),
      recordAudit: async (_organizationId, _userId, _actorLabel, action, _targetType, _targetId, metadata) => {
        audits.push({ action, metadata });
      },
      query: async (text, params) => {
        calls.push({ text, params });
        return { rowCount: 2, rows: [{ id: "tplb_1" }, { id: "tplb_2" }] as never[] };
      }
    }
  );

  assert.equal(result.kind, "archived");
  assert.deepEqual(calls[0].params, ["org_tpl", "open-agents-dev", ["queued", "building"]]);
  assert.equal(audits[0].action, "template.archive");
  assert.deepEqual(audits[0].metadata, { latestVersionId: "tplv_ready", canceledBuildIds: ["tplb_1", "tplb_2"] });
});
