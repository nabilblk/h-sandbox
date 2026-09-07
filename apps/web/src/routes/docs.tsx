import { useEffect, useRef } from "react";
import { TopNav, type TopNavProps } from "../components/top-nav";
import { docPages } from "../docs-content";

export const docsPageKey = "harakiri_docs_page";

export const setDocsPageSelection = (pageId: string) => {
  try { sessionStorage.setItem(docsPageKey, pageId); } catch { /* Navigation also works without browser storage. */ }
};

const rememberedDocsPage = () => {
  try { return sessionStorage.getItem(docsPageKey); } catch { return null; }
};

const sectionOrder = ["Getting started", "Concepts", "Tutorials", "Agent demos", "Organization", "Sandboxes", "Templates", "Reference", "Operations"];
const sections = Array.from(new Set(docPages.map((page) => page.section)))
  .sort((a, b) => (sectionOrder.indexOf(a) === -1 ? sectionOrder.length : sectionOrder.indexOf(a))
    - (sectionOrder.indexOf(b) === -1 ? sectionOrder.length : sectionOrder.indexOf(b)));

type DocsRouteProps = TopNavProps & {
  selectedId?: string;
  onSignIn: () => void;
  onSignOut: () => void;
};

export const DocsRoute = ({ selectedId, go, profile, onSignIn, onSignOut, authStatus }: DocsRouteProps) => {
  const remembered = rememberedDocsPage();
  const active = selectedId ?? (docPages.some((item) => item.id === remembered) ? remembered : "quickstart");
  const page = docPages.find((item) => item.id === active);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (page) setDocsPageSelection(page.id);
    window.scrollTo(0, 0);
  }, [page?.id]);

  const jumpToSection = (title: string) => {
    const heading = Array.from(article.current?.querySelectorAll("h2") ?? []).find((item) => item.textContent === title);
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start" });
  };
  return (
    <div className="app">
      <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} authStatus={authStatus} active="docs" />
      <div className="docs-mobile-nav">
        <label htmlFor="docs-page">Documentation</label>
        <select id="docs-page" value={page?.id ?? ""} onChange={(event) => go(`docs/${event.target.value}`)}>
          {!page && <option value="" disabled>Page not found</option>}
          {sections.map((section) => <optgroup label={section} key={section}>
            {docPages.filter((item) => item.section === section).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </optgroup>)}
        </select>
      </div>
      <div className="docs">
        <nav className="docs-side" aria-label="Documentation">
          {sections.map((section) => (
            <div key={section}>
              <div className="docs-section-h">{section}</div>
              {docPages.filter((item) => item.section === section).map((item) => (
                <a key={item.id} href={`#docs/${item.id}`} className={`docs-link ${item.id === page?.id ? "active" : ""}`} aria-current={item.id === page?.id ? "page" : undefined}>{item.title}</a>
              ))}
            </div>
          ))}
        </nav>
        <main className="docs-body">
          <article ref={article}>
            {page ? <>
              <p className="docs-category">{page.section}</p>
              <h1>{page.title}</h1>
              <p className="lede">{page.lede}</p>
              {page.body}
            </> : <>
              <h1>Documentation page not found</h1>
              <p><a href="#docs/quickstart">Open the quickstart</a> or choose a page from the documentation menu.</p>
            </>}
          </article>
        </main>
        {page && <nav className="docs-toc" aria-label="On this page">
          <div className="docs-toc-h">On this page</div>
          {page.toc.map((item) => <button type="button" key={item} onClick={() => jumpToSection(item)}>{item}</button>)}
        </nav>}
      </div>
    </div>
  );
};
