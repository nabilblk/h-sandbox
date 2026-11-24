import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");

const markdownFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat();
};

const skillDirectories = async () =>
  (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

const frontmatter = (source) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) return undefined;
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
};

// Every command and subcommand name registered by the published CLI.
const cliCommandNames = async () => {
  const directory = join(root, "packages/cli/src/commands");
  const names = new Set();
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = await readFile(join(directory, file), "utf8");
    for (const match of source.matchAll(/\.(?:command|alias)\("([a-z][a-z-]*)/g)) names.add(match[1]);
  }
  return names;
};

// Words after `harakiri` inside code spans and fenced blocks, until a flag, variable or quote.
const cliInvocations = (source) => {
  const code = [...source.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map((match) => match[0]).join("\n");
  return [...code.matchAll(/(?:^|[\s($|;&`])harakiri((?:[ \t]+[a-z][a-z-]*)+)/gm)]
    .map((match) => match[1].trim().split(/\s+/));
};

test("each skill has valid, matching frontmatter", async () => {
  const directories = await skillDirectories();
  assert.ok(directories.length > 0, "expected at least one skill");
  for (const directory of directories) {
    const source = await readFile(join(skillsRoot, directory, "SKILL.md"), "utf8");
    const meta = frontmatter(source);
    assert.ok(meta, `${directory}: missing frontmatter`);
    assert.equal(meta.name, directory, `${directory}: name must match its directory`);
    assert.match(meta.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(meta.name.length <= 64, `${directory}: name too long`);
    assert.ok(meta.description && meta.description.length <= 1024, `${directory}: description must be 1-1024 characters`);
    assert.doesNotMatch(meta.description, /[<>]/, `${directory}: description must not contain angle brackets`);
    assert.ok(source.split("\n").length <= 500, `${directory}: keep SKILL.md under 500 lines; move detail into references`);
  }
});

test("relative links in skills resolve", async () => {
  const failures = [];
  for (const file of await markdownFiles(skillsRoot)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const path = decodeURIComponent(target.split("#", 1)[0]);
      try {
        await stat(resolve(dirname(file), path));
      } catch {
        failures.push(`${file.slice(root.length + 1)} -> ${target}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("skills resolve release versions instead of hardcoding candidates", async () => {
  for (const file of await markdownFiles(skillsRoot)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\b\d+\.\d+\.\d+-rc\.\d+\b/, `${file.slice(root.length + 1)} pins a release candidate; point to the tagged guide or receipt`);
  }
});

test("skills never include API key material", async () => {
  for (const file of await markdownFiles(skillsRoot)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /hk_(?:live|test)_[A-Za-z0-9_]{8,}/, `${file.slice(root.length + 1)} contains an API key`);
  }
});

test("every CLI command used by a skill exists", async () => {
  const known = await cliCommandNames();
  assert.ok(known.has("create") && known.has("expose"), "CLI command discovery failed");
  const missing = [];
  for (const file of await markdownFiles(skillsRoot)) {
    for (const words of cliInvocations(await readFile(file, "utf8"))) {
      if (words.some((word) => !known.has(word))) missing.push(`${file.slice(root.length + 1)}: harakiri ${words.join(" ")}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("CLI invocation extraction stops at arguments", () => {
  assert.deepEqual(cliInvocations("`harakiri command session create \"$SBX\" --cwd /w`"), [["command", "session", "create"]]);
  assert.deepEqual(cliInvocations("```bash\nSBX=$(harakiri create --template x)\n```"), [["create"]]);
  assert.deepEqual(cliInvocations("the `harakiri` CLI and harakiri-deploy"), []);
});
