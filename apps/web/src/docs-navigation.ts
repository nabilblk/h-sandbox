import type { DocPage } from "./docs-content";
import { Children, isValidElement, type ReactNode } from "react";

// Ordering is editorial, independent of where a page's content is maintained.
export const docGroups = [
  { title: "Getting started", pages: ["overview", "developer-preview", "ui-product-tour", "quickstart", "vision-architecture", "sdk-cli"] },
  { title: "Self-hosting", pages: ["install-kubernetes", "backup-recovery"] },
  { title: "Concepts", pages: ["execution-capacity", "workspaces", "authorization", "security-model"] },
  { title: "Sandbox guides", pages: ["create-sandbox", "sandbox-lifecycle", "sandbox-processes", "filesystem-artifacts", "routes", "outbound-access", "credential-vault"] },
  { title: "Templates", pages: ["custom-templates", "template-builds", "sdk-usage", "opencode-template", "open-agents-template", "template-troubleshooting"] },
  { title: "Tutorials", pages: ["hands-on-tutorials", "cli-live-preview", "persistent-workspaces"] },
  { title: "Agent workflows", pages: ["cli-agent-repair", "ui-agent-app", "sdk-agent-report", "browser-agent-qa"] },
  { title: "Reference", pages: ["api-reference", "cli-reference", "workspace-reference", "errors-troubleshooting"] },
  { title: "Administration", pages: ["team-members", "session-management", "workspace-operations"] }
] as const;

export function groupDocPages(pages: DocPage[]) {
  return docGroups.map((group) => ({ title: group.title, pages: group.pages.flatMap((id) => {
    const page = pages.find((item) => item.id === id);
    return page ? [page] : [];
  }) }));
}

function contentText(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<{ children?: ReactNode }>(child)) return "";
    return contentText(child.props.children);
  }).join(" ");
}

const searchText = new WeakMap<DocPage, string>();
export function searchDocPages(pages: DocPage[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return pages.filter((page) => {
    let text = searchText.get(page);
    if (!text) {
      text = [page.title, page.lede, page.section, ...page.toc, contentText(page.body)].join(" ").toLocaleLowerCase();
      searchText.set(page, text);
    }
    return words.every((word) => text.includes(word));
  });
}

export const docSectionId = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const docSectionHref = (page: string, title: string) => `#docs/${page}?section=${docSectionId(title)}`;
