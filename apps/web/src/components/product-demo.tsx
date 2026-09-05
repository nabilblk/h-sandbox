import { useRef, useState } from "react";
import { Icon } from "./icon";
import { demos, type Demo } from "../demo-catalog";

export function ProductDemo({ demo = demos[0], onTutorial }: { demo?: Demo; onTutorial: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  return <section className="product-demo-section" aria-labelledby="product-demo-title">
    <header className="product-demo-heading"><span className="demo-surface">{demo.surface}</span><h2 id="product-demo-title">{demo.title}</h2><p>{demo.summary}</p></header>
    <div className="product-demo-player">
      <video ref={video} aria-label={demo.title} controls playsInline preload="metadata" poster={demo.poster} onError={() => setFailed(true)} onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)} onLoadedData={() => setWaiting(false)}>
        <source src={demo.video} type="video/mp4" onError={() => setFailed(true)} />
        <track kind="captions" src={demo.captions} srcLang="en" label="English" />
        <a href={demo.video}>Download the walkthrough</a>
      </video>
      {waiting && !failed && <p className="demo-playback-status" role="status">Loading video...</p>}
    </div>
    {failed && <p role="alert">Video unavailable. <button className="btn btn-ghost" onClick={onTutorial}>Open the written tutorial</button></p>}
    <div className="demo-chapters" aria-label="Video chapters">{demo.chapters.map((chapter) => <button key={chapter.start} className="btn btn-ghost" onClick={() => { if (video.current) video.current.currentTime = chapter.start; }}><span>{Math.floor(chapter.start / 60)}:{String(chapter.start % 60).padStart(2, "0")}</span>{chapter.title}</button>)}</div>
    <div className="product-demo-meta"><span>Real execution. Waiting time edited.</span><div><a href={demo.transcript}>Transcript</a><a href={demo.provenance}>Capture details</a></div></div>
    <div className="demo-resources"><button className="btn" onClick={onTutorial}><Icon name="book" />Follow the tutorial</button><a className="btn btn-ghost" href={demo.source}><Icon name="file" />Example source</a></div>
  </section>;
}
