import { useState } from "react";
import type { UserProfile } from "../auth";
import { TopNav, type TopNavProps } from "../components/top-nav";
import { docPages } from "../docs-content";

export const docsPageKey = "harakiri_docs_page";

export const setDocsPageSelection = (pageId: string) => {
  sessionStorage.setItem(docsPageKey, pageId);
};

type DocsRouteProps = TopNavProps & {
  onSignIn: () => void;
  onSignOut: () => void;
};

export const DocsRoute = ({ go, profile, onSignIn, onSignOut }: DocsRouteProps) => {
  const [active, setActive] = useState(() => {
    const requested = sessionStorage.getItem(docsPageKey);
    return requested && docPages.some((item) => item.id === requested) ? requested : "quickstart";
  });
  const page = docPages.find((item) => item.id === active) ?? docPages[0];
  const sections = Array.from(new Set(docPages.map((item) => item.section)));
  return (
    <div className="app">
      <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} />
      <div className="docs">
        <aside className="docs-side">
          {sections.map((section) => (
            <div key={section}>
              <div className="docs-section-h">{section}</div>
              {docPages.filter((item) => item.section === section).map((item) => (
                <button key={item.id} className={`docs-link ${item.id === page.id ? "active" : ""}`} onClick={() => { setDocsPageSelection(item.id); setActive(item.id); }}>{item.title}</button>
              ))}
            </div>
          ))}
        </aside>
        <main className="docs-body">
          <article>
            <h1>{page.title}</h1>
            <p className="lede">{page.lede}</p>
            {page.body}
          </article>
        </main>
        <aside className="docs-toc">
          <div className="docs-toc-h">On this page</div>
          {page.toc.map((item, index) => <a key={item} className={index === 0 ? "active" : ""}>{item}</a>)}
        </aside>
      </div>
    </div>
  );
};
