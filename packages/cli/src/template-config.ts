export type HarakiriTemplateConfig = {
  name?: string;
  dockerfile?: string;
  visibility?: "public" | "private" | "internal";
  cpuCount?: number;
  memoryMb?: number;
  workdir?: string;
  ports?: number[];
  aliases?: string[];
  tags?: string[];
  image?: string;
  description?: string;
  runtimeFamily?: string;
  startCommand?: string;
  readyCommand?: string;
};

const snakeToCamel = (key: string) => key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

const parseString = (value: string) => {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'") || trimmed.at(-1) !== quote) return null;
  return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
};

const parseScalar = (value: string): string | number | string[] | number[] => {
  const trimmed = value.trim();
  const stringValue = parseString(trimmed);
  if (stringValue !== null) return stringValue;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    const items = inner
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseString(item) ?? (/^-?\d+$/.test(item) ? Number(item) : item));
    return items.every((item) => typeof item === "number") ? (items as number[]) : (items.map(String) as string[]);
  }
  return trimmed;
};

export const parseHarakiriTemplateConfig = (input: string): HarakiriTemplateConfig => {
  const config: Record<string, unknown> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(trimmed);
    if (!match) continue;
    config[snakeToCamel(match[1])] = parseScalar(match[2].replace(/\s+#.*$/, ""));
  }

  const parsed: HarakiriTemplateConfig = {};
  if (typeof config.name === "string") parsed.name = config.name;
  if (typeof config.dockerfile === "string") parsed.dockerfile = config.dockerfile;
  if (config.visibility === "public" || config.visibility === "private" || config.visibility === "internal") parsed.visibility = config.visibility;
  if (Number.isInteger(config.cpuCount)) parsed.cpuCount = config.cpuCount as number;
  if (Number.isInteger(config.memoryMb)) parsed.memoryMb = config.memoryMb as number;
  if (typeof config.workdir === "string") parsed.workdir = config.workdir;
  if (Array.isArray(config.ports) && config.ports.every((port) => Number.isInteger(port))) parsed.ports = config.ports as number[];
  if (Array.isArray(config.aliases) && config.aliases.every((alias) => typeof alias === "string")) parsed.aliases = config.aliases as string[];
  if (Array.isArray(config.tags) && config.tags.every((tag) => typeof tag === "string")) parsed.tags = config.tags as string[];
  if (typeof config.image === "string") parsed.image = config.image;
  if (typeof config.description === "string") parsed.description = config.description;
  if (typeof config.runtimeFamily === "string") parsed.runtimeFamily = config.runtimeFamily;
  if (typeof config.startCommand === "string") parsed.startCommand = config.startCommand;
  if (typeof config.readyCommand === "string") parsed.readyCommand = config.readyCommand;
  return parsed;
};

export const commandToEntrypoint = (command?: string) => {
  const trimmed = command?.trim();
  if (!trimmed) return ["sleep", "3600"];
  return trimmed.match(/"([^"]*)"|'([^']*)'|\S+/g)?.map((part) => {
    if ((part.startsWith("\"") && part.endsWith("\"")) || (part.startsWith("'") && part.endsWith("'"))) return part.slice(1, -1);
    return part;
  }) ?? ["sleep", "3600"];
};
