import { useState } from "react";
import { TopNav, type TopNavProps } from "../components/top-nav";
import { Icon } from "../components/icon";
import { ProductDemo } from "../components/product-demo";
import { demos, type Demo } from "../demo-catalog";
import { setDocsPageSelection } from "../docs-selection";

export const DemosRoute = ({ selectedId, ...navigation }: TopNavProps & { selectedId?: string }) => {
  const [surface, setSurface] = useState<"All" | Demo["surface"]>("All");
  const selected = selectedId ? demos.find((demo) => demo.id === selectedId) : demos[0];
  const visible = demos.filter((demo) => surface === "All" || demo.surface === surface);
  return <div className="app">
    <TopNav {...navigation} active="demos" />
    <main className="demo-library">
      <header className="demo-library-heading"><h1>Demos</h1><span>{demos.length} workflows</span></header>
      <div className="demo-library-layout">
        <aside className="demo-library-index" aria-label="Demo library">
          <div className="demo-filters" role="group" aria-label="Filter demos">
            {(["All", "CLI", "UI", "SDK"] as const).map((item) => <button key={item} type="button" aria-pressed={surface === item} onClick={() => { setSurface(item); if (item !== "All" && selected?.surface !== item) { const first = demos.find((demo) => demo.surface === item); if (first) navigation.go(`demos/${first.id}`); } }}>{item}</button>)}
          </div>
          <nav aria-label="Workflows">{visible.map((demo) => <a key={demo.id} className={`demo-library-item ${demo.id === selected?.id ? "selected" : ""}`} href={`#demos/${demo.id}`} aria-current={demo.id === selected?.id ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigation.go(`demos/${demo.id}`); }}>
            <div className="demo-thumbnail"><img src={demo.poster} alt="" loading="lazy" /><span><Icon name="play" />{Math.floor(demo.seconds / 60)}:{String(demo.seconds % 60).padStart(2, "0")}</span></div>
            <span className="demo-surface">{demo.surface}</span><strong>{demo.title}</strong>
          </a>)}</nav>
          {!visible.length && <p className="demo-empty">No published {surface} demos yet.</p>}
        </aside>
        {selected ? <ProductDemo key={selected.id} demo={selected} onTutorial={() => { setDocsPageSelection(selected.tutorialId); navigation.go("docs"); }} /> : <section className="demo-empty"><h2>Demo not found</h2><button className="btn" onClick={() => navigation.go("demos")}>All demos<Icon name="arrowR" /></button></section>}
      </div>
    </main>
  </div>;
};
