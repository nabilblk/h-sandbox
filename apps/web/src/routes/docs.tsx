import { useEffect, useRef, useState } from "react";
import { TopNav, type TopNavProps } from "../components/top-nav";
import { Icon } from "../components/icon";
import { docPages } from "../docs-content";
import { docSectionHref, docSectionId, groupDocPages, searchDocPages } from "../docs-navigation";
import { setDocsPageSelection, rememberedDocsPage } from "../docs-selection";
export { docsPageKey } from "../docs-selection";
const groups = groupDocPages(docPages);
const orderedPages = groups.flatMap((group) => group.pages);

type DocsRouteProps = TopNavProps & {
  selectedId?: string;
  onSignIn: () => void;
  onSignOut: () => void;
};

export const DocsRoute = ({ selectedId, go, profile, onSignIn, onSignOut, authStatus }: DocsRouteProps) => {
  const [requestedId, queryString] = selectedId?.split("?") ?? [];
  const section = new URLSearchParams(queryString).get("section");
  const remembered = rememberedDocsPage();
  const active = requestedId ?? (docPages.some((item) => item.id === remembered) ? remembered : "overview");
  const page = docPages.find((item) => item.id === active);
  const group = groups.find((item) => item.pages.some((item) => item.id === active));
  const index = orderedPages.findIndex((item) => item.id === active);
  const previous = orderedPages[index - 1];
  const next = index >= 0 ? orderedPages[index + 1] : undefined;
  const article = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("");
  const results = query.trim() ? searchDocPages(orderedPages, query) : [];

  useEffect(() => {
    if (page) setDocsPageSelection(page.id);
    const originalTitle = document.title;
    document.title = `${page?.title ?? "Page not found"} | Harakiri Docs`;
    setQuery("");
    return () => { document.title = originalTitle; };
  }, [page?.id, page?.title]);

  useEffect(() => {
    const headings = Array.from(article.current?.querySelectorAll("h2") ?? []);
    for (const heading of headings) {
      heading.id = docSectionId(heading.textContent ?? "");
      heading.tabIndex = -1;
    }
    const target = headings.find((heading) => heading.id === section);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    } else { window.scrollTo(0, 0); }
    let frame = 0;
    const update = () => {
      const current = headings.filter((heading) => heading.getBoundingClientRect().top <= 160).at(-1);
      setActiveSection(current?.id ?? headings[0]?.id ?? "");
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); };
  }, [page?.id, section]);

  const toc = page?.toc.map((title) => <a key={title} href={docSectionHref(page.id, title)} onClick={(event) => {
    if (window.location.hash !== docSectionHref(page.id, title)) return;
    event.preventDefault();
    const target = article.current?.querySelector<HTMLElement>(`#${docSectionId(title)}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }} aria-current={docSectionId(title) === activeSection ? "location" : undefined}>{title}</a>);

  return <div className="app docs-app">
    <TopNav go={go} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} authStatus={authStatus} active="docs" />
    <a className="docs-skip" href="#docs-content" onClick={(event) => { event.preventDefault(); article.current?.focus(); article.current?.scrollIntoView(); }}>Skip to content</a>
    <div className="docs-toolbar">
      <a className="docs-home" href="#docs/overview"><Icon name="book" size={17} />Documentation</a>
      <div className="docs-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setQuery(""); }} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); search.current?.focus(); } }}>
        <span aria-hidden="true"><Icon name="search" size={16} /></span>
        <input ref={search} type="search" aria-label="Search documentation" aria-controls={query.trim() ? "docs-search-results" : undefined} placeholder="Search documentation..." value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} />
        {query && <button type="button" title="Clear search" aria-label="Clear search" onClick={() => { setQuery(""); search.current?.focus(); }}><Icon name="x" /></button>}
        {query.trim() && <section className="docs-search-results" id="docs-search-results" aria-label="Documentation search results">
          <p role="status">{results.length} {results.length === 1 ? "page" : "pages"} found</p>
          {results.length ? <ul>{results.map((result) => <li key={result.id}><a href={`#docs/${result.id}`} onClick={() => setQuery("")}><strong>{result.title}</strong><span>{result.lede}</span></a></li>)}</ul> : <p>No matches for "{query}". Try a topic such as templates, routes or files.</p>}
        </section>}
      </div>
    </div>
    <div className="docs-mobile-nav">
      <label htmlFor="docs-page">Browse docs</label>
      <select id="docs-page" value={page?.id ?? ""} onChange={(event) => go(`docs/${event.target.value}`)}>
        {!page && <option value="" disabled>Page not found</option>}
        {groups.map((group) => <optgroup label={group.title} key={group.title}>{group.pages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>)}
      </select>
    </div>
    <div className="docs">
      <nav className="docs-side" aria-label="Documentation">
        {groups.map((group) => <div key={group.title}>
          <div className="docs-section-h">{group.title}</div>
          {group.pages.map((item) => <a key={item.id} href={`#docs/${item.id}`} className={`docs-link ${item.id === page?.id ? "active" : ""}`} aria-current={item.id === page?.id ? "page" : undefined}>{item.navTitle ?? item.title}</a>)}
        </div>)}
      </nav>
      <main className="docs-body">
        <article id="docs-content" ref={article} tabIndex={-1}>
          {page ? <>
            <header className="docs-article-header">
              <p className="docs-category">{group?.title ?? page.section}</p>
              <h1>{page.title}</h1>
              <p className="lede">{page.lede}</p>
              <a href={`/docs/${page.id}.md`} className="docs-source-link"><Icon name="file" size={14} /> Markdown</a>
            </header>
            <details className="docs-inline-toc"><summary>On this page</summary><nav aria-label="Page sections">{toc}</nav></details>
            <div className="docs-content" key={page.id}>{page.body}</div>
            <nav className="docs-pagination" aria-label="Reading progression">
              {previous ? <a href={`#docs/${previous.id}`}><span>Previous</span><strong>{previous.navTitle ?? previous.title}</strong></a> : <span />}
              {next && <a href={`#docs/${next.id}`}><span>Next</span><strong>{next.navTitle ?? next.title}<Icon name="arrowR" /></strong></a>}
            </nav>
          </> : <><h1>Documentation page not found</h1><p><a href="#docs/overview">Browse the documentation</a> or <a href="#docs/quickstart">open the quickstart</a>.</p></>}
        </article>
      </main>
      {page && <nav className="docs-toc" aria-label="On this page"><div className="docs-toc-h">On this page</div>{toc}<a className="docs-release-link" href="#changelog">Release notes<Icon name="arrowR" /></a></nav>}
    </div>
  </div>;
};
