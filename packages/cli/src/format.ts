export const progressLine = (line: string) => `-> ${line}`;

export const runtimeLine = (durationMs: number) => `ok runtime=${(durationMs / 1000).toFixed(2)}s`;

const reset = "\x1b[0m";
const crimsonBg = "\x1b[48;2;184;51;31m";
const creamFg = "\x1b[38;2;255;247;240m";

export const shouldUseColor = () => Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

export const hankoStamp = (color = false) => {
  const mark = " h. ";
  return color ? `${crimsonBg}${creamFg}${mark}${reset}` : mark.trim();
};

export const initBanner = (color = false) => [
  hankoStamp(color),
  "",
  "$ harakiri init",
  progressLine("ok. sealed. ready."),
  "$"
].join("\n");
