import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentSkillCommands, agentSkillsDocs } from "./agent-skills-docs.js";
import { docPages } from "./docs-content.js";
import { docGroups, searchDocPages } from "./docs-navigation.js";
import { documentationAssets, renderDocMarkdown } from "./docs-export.js";

test("agent skills page is discoverable and exported", () => {
  assert.ok(docGroups.find((group) => group.title === "Getting started")?.pages.includes("agent-skills"));
  for (const query of ["skills", "Claude Code", "coding agent", "harakiri-deploy", "harakiri-sandbox"]) {
    assert.ok(searchDocPages(docPages, query).some((page) => page.id === "agent-skills"), query);
  }
  const assets = documentationAssets();
  assert.match(assets.get("llms.txt")!, /docs\/agent-skills\.md/);
  for (const command of Object.values(agentSkillCommands)) {
    assert.ok(assets.get("docs/agent-skills.md")!.includes(command));
    execFileSync("bash", ["-n"], { input: command });
  }
  assert.match(renderToStaticMarkup(agentSkillsDocs.body), /data-language="bash"/);
});

test("documented skills exist in the repository", () => {
  for (const skill of ["harakiri-sandbox", "harakiri-deploy"]) {
    assert.ok(existsSync(new URL(`../../../skills/${skill}/SKILL.md`, import.meta.url)), skill);
  }
});

test("install guides point to the deploy skill without replacing themselves", () => {
  for (const id of ["install-kubernetes", "install-openshift"]) {
    const page = docPages.find((item) => item.id === id);
    assert.ok(page, id);
    assert.match(renderToStaticMarkup(page.body), /href="#docs\/agent-skills"/, id);
  }
});

test("agent skills page keeps credential and safety boundaries", () => {
  const markdown = renderDocMarkdown(agentSkillsDocs).replace(/\\_/g, "_");
  for (const phrase of ["Never paste it into the agent conversation", "only the sandboxes, commands and routes it created", "token access", "wait for your approval", "never changes SCCs", "do not grant permissions", "Developer Preview"]) {
    assert.ok(markdown.includes(phrase), phrase);
  }
  assert.doesNotMatch(markdown, /hk_(?:live|test)_|--api-key|kill --idle|--access public/);
});
