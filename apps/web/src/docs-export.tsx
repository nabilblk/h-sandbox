import { renderToStaticMarkup } from "react-dom/server";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { DocumentationExportContext } from "./components/docs-code";
import { docPages, type DocPage } from "./docs-content";
import { groupDocPages } from "./docs-navigation";

const markdown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
markdown.use(gfm);
markdown.remove((node) => ["BUTTON", "SVG", "STYLE", "SCRIPT"].includes(node.nodeName.toUpperCase()));
markdown.addRule("code-toolbar", { filter: (node) => node.nodeName === "FIGCAPTION" && node.classList.contains("doc-code-bar"), replacement: () => "" });
markdown.addRule("code", {
  filter: (node) => node.nodeName === "PRE" && !!node.querySelector("code"),
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector("code")!;
    const language = code.getAttribute("class")?.split(/\s+/).find((value) => value.startsWith("language-"))?.slice(9) ?? "text";
    const source = code.textContent ?? "";
    const fence = "`".repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1)));
    return `\n\n${fence}${language}\n${source}\n${fence}\n\n`;
  }
});
markdown.addRule("definition", {
  filter: ["dt", "dd"],
  replacement: (content, node) => node.nodeName === "DT" ? `\n\n**${content}**\n` : `\n${content}\n\n`
});
markdown.addRule("documentation-link", {
  filter: (node) => node.nodeName === "A" && (node.getAttribute("href") ?? "").startsWith("#"),
  replacement: (content, node) => {
    const href = (node as HTMLElement).getAttribute("href")!;
    if (!href.startsWith("#docs/")) return `[${content}](/${href})`;
    const [page, query] = href.slice(6).split("?");
    const section = new URLSearchParams(query).get("section");
    return `[${content}](/docs/${page}.md${section ? `#${section}` : ""})`;
  }
});

export function renderDocMarkdown(page: DocPage) {
  const html = renderToStaticMarkup(<DocumentationExportContext.Provider value><h1>{page.title}</h1><p>{page.lede}</p>{page.body}</DocumentationExportContext.Provider>);
  return `${markdown.turndown(html)}\n`;
}

export function documentationAssets() {
  const groups = groupDocPages(docPages);
  const ordered = groups.flatMap((group) => group.pages);
  if (new Set(ordered.map((page) => page.id)).size !== docPages.length || ordered.length !== docPages.length) throw new Error("Documentation inventory is incomplete or duplicated");
  const assets = new Map(ordered.map((page) => [`docs/${page.id}.md`, renderDocMarkdown(page)]));
  const index = (prefix: string) => ["# Harakiri Sandbox", "", "> Self-hosted sandbox control plane for agent applications. OpenSandbox is the current runtime provider. Developer Preview: verify the installed version and runtime profile before relying on a capability.", "", "These pages are generated from the website documentation. Code tabs include all languages. Relative URLs resolve against this installation.", "", `- [Preview scope](${prefix}docs/developer-preview.md)`, `- [Full documentation](${prefix}llms-full.txt)`, `- [Machine-readable inventory](${prefix}docs/index.json)`, "", ...groups.flatMap((group) => [`## ${group.title}`, "", ...group.pages.map((page) => `- [${page.title}](${prefix}docs/${page.id}.md): ${page.lede}`), ""])].join("\n");
  assets.set("llms.txt", index(""));
  assets.set("llms-full.txt", ordered.map((page) => `<!-- docs/${page.id}.md -->\n${assets.get(`docs/${page.id}.md`)}`).join("\n---\n\n"));
  assets.set("docs/index.md", index("../"));
  assets.set("docs/index.json", JSON.stringify(ordered.map((page) => ({ id: page.id, title: page.title, section: page.section, description: page.lede, markdown: `/docs/${page.id}.md`, web: `/#docs/${page.id}` })), null, 2) + "\n");
  return assets;
}
