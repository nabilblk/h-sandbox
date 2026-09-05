type Chapter = { start: number; end: number; caption: string };

function timestamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function workflowCaptions(chapters: Chapter[]) {
  const cues = chapters.flatMap((chapter) => {
    const parts: string[] = [];
    for (const word of chapter.caption.split(/\s+/)) {
      const last = parts.length - 1;
      if (last >= 0 && parts[last]!.length + word.length + 1 <= 72) parts[last] += ` ${word}`;
      else parts.push(word);
    }
    return parts.map((text, index) => ({
      start: chapter.start + (chapter.end - chapter.start) * index / parts.length,
      end: chapter.start + (chapter.end - chapter.start) * (index + 1) / parts.length,
      text,
    }));
  });
  return 'WEBVTT\n\n' + cues.map((cue) => `${timestamp(cue.start)} --> ${timestamp(cue.end)} line:92% position:50% size:90% align:center\n${cue.text}\n`).join('\n');
}
