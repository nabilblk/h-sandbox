import { useRef, useState } from "react";
import { Icon } from "./icon";
import { demos, type Demo } from "../demo-catalog";

export function ProductDemo({ demo = demos[0], onTutorial }: { demo?: Demo; onTutorial: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [position, setPosition] = useState(0);
  const chapterIndex = Math.max(0, demo.chapters.findIndex((chapter, index) => position >= chapter.start && (index === demo.chapters.length - 1 || position < demo.chapters[index + 1].start)));
  const chapter = demo.chapters[chapterIndex];
  const seek = (seconds: number) => {
    if (!video.current) return;
    // Paused native text tracks can retain both cues at an exact shared boundary.
    video.current.currentTime = seconds + 0.01;
    setPosition(seconds);
  };
  return <section className="product-demo-section" aria-labelledby="product-demo-title">
    <header className="product-demo-heading"><span className="demo-surface">{demo.surface}</span><h2 id="product-demo-title">{demo.title}</h2><p>{demo.summary}</p></header>
    <div className="product-demo-player">
      <video ref={video} aria-label={demo.title} controls playsInline preload="metadata" poster={demo.poster} onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} onSeeked={(event) => { setPosition(event.currentTarget.currentTime); setWaiting(false); }} onError={() => setFailed(true)} onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)} onLoadedData={() => setWaiting(false)}>
        <source src={demo.video} type="video/mp4" onError={() => setFailed(true)} />
        <track kind="captions" src={demo.captions} srcLang="en" label="English" />
        <a href={demo.video}>Download the walkthrough</a>
      </video>
      {waiting && !failed && <p className="demo-playback-status" role="status">Loading video...</p>}
    </div>
    {failed && <p role="alert">Video unavailable. <button className="btn btn-ghost" onClick={onTutorial}>Open the written tutorial</button></p>}
    {chapter?.guide ? <section className="demo-guide" aria-label="Current chapter guide">
      <header><span className="demo-guide-position">{String(chapterIndex + 1).padStart(2, '0')} / {demo.chapters.length}</span><h3>{chapter.title}</h3><div className="demo-guide-controls">
        <button className="btn btn-ghost btn-sm" disabled={chapterIndex === 0} aria-label="Previous chapter" title="Previous chapter" onClick={() => seek(demo.chapters[chapterIndex - 1].start)}><Icon name="chevron" style={{ transform: 'rotate(180deg)' }} /></button>
        <button className="btn btn-ghost btn-sm" disabled={chapterIndex === demo.chapters.length - 1} aria-label="Next chapter" title="Next chapter" onClick={() => seek(demo.chapters[chapterIndex + 1].start)}><Icon name="chevron" /></button>
      </div></header>
      <div className="demo-guide-body"><p>{chapter.guide}</p><div><span>Observed outcome</span><p>{chapter.outcome}</p></div></div>
    </section> : null}
    <div className="demo-chapters" aria-label="Video chapters">{demo.chapters.map((item, index) => <button key={item.start} className="btn btn-ghost" aria-current={index === chapterIndex ? 'step' : undefined} onClick={() => seek(item.start)}><span>{Math.floor(item.start / 60)}:{String(item.start % 60).padStart(2, "0")}</span>{item.title}</button>)}</div>
    <div className="product-demo-meta"><span>{chapter?.guide ? 'Full UI at normal zoom. Silent, with optional captions. Waiting between chapters edited.' : 'Real execution. Waiting time edited.'}</span><div><a href={demo.transcript}>Transcript</a><a href={demo.provenance}>Capture details</a><a href={demo.video} download>Download video</a></div></div>
    <div className="demo-resources"><button className="btn" onClick={onTutorial}><Icon name="book" />Follow the tutorial</button><a className="btn btn-ghost" href={demo.source}><Icon name="file" />Example source</a></div>
  </section>;
}
