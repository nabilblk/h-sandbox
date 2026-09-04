import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const roots = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "docs", "packages/cli/README.md", "packages/sdk/README.md"];
const ignoredDirectories = new Set(["artifacts", "node_modules"]);

const markdownFiles = async (path) => {
  const absolute = resolve(root, path);
  const entry = await stat(absolute);
  if (entry.isFile()) return extname(absolute) === ".md" ? [absolute] : [];
  const children = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(children
    .filter((child) => !child.isDirectory() || !ignoredDirectories.has(child.name))
    .map((child) => markdownFiles(resolve(path, child.name))));
  return nested.flat();
};

const linkPattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
const failures = [];

for (const file of (await Promise.all(roots.map(markdownFiles))).flat()) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(linkPattern)) {
    const raw = match[1]?.trim() ?? "";
    const target = raw.startsWith("<") ? raw.slice(1, raw.indexOf(">")) : raw.split(/\s+/)[0];
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#", 1)[0] ?? "");
    if (!path) continue;
    try {
      await stat(resolve(dirname(file), path));
    } catch {
      failures.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
}

if (failures.length) {
  throw new Error(`Broken local Markdown links:\n${failures.join("\n")}`);
}

console.log("Documentation link check passed");
