export const progressLine = (line: string) => `-> ${line}`;

export const runtimeLine = (durationMs: number) => `ok runtime=${(durationMs / 1000).toFixed(2)}s`;

export const durationLine = (durationMs: number) => `${(durationMs / 1000).toFixed(2)}s`;

export const templateBuildLogLine = (stream: string, message: string) => {
  const prefix = stream === "stderr" ? "!!" : "  ";
  return `${prefix} ${message}`;
};

export const templateBuildSuccessLines = (input: {
  buildId: string;
  templateId: string;
  templateVersionId?: string | null;
  imageDigest?: string | null;
  durationMs?: number | null;
}) => {
  const lines = [`success. build=${input.buildId}`];
  if (input.templateVersionId) lines.push(`version=${input.templateVersionId}`);
  if (input.imageDigest) lines.push(`image=${input.imageDigest}`);
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) lines.push(`duration=${durationLine(input.durationMs)}`);
  lines.push(`next: harakiri create --template ${input.templateId} --name sandbox`);
  return lines;
};

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
