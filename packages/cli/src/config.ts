import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { HarakiriClient } from "@harakiri/sdk";

export type Config = {
  apiUrl: string;
  apiKey?: string;
  lastSandboxId?: string;
};

export const configPath = join(homedir(), ".config", "harakiri", "config.json");
export const defaultApiUrl = process.env.HARAKIRI_API_URL ?? "http://127.0.0.1:8080";
export const defaultKey = process.env.HARAKIRI_API_KEY;

export const loadConfig = async (): Promise<Config> => {
  if (!existsSync(configPath)) return { apiUrl: defaultApiUrl, apiKey: defaultKey };
  const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<Config>;
  return {
    apiUrl: parsed.apiUrl ?? defaultApiUrl,
    apiKey: parsed.apiKey ?? defaultKey,
    lastSandboxId: parsed.lastSandboxId
  };
};

export const saveConfig = async (config: Config) => {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
};

export const apiClient = async () => {
  const config = await loadConfig();
  if (!config.apiKey) throw new Error(`missing API key. Run "harakiri login --api-url ${config.apiUrl} --api-key hk_live_..." first.`);
  return new HarakiriClient({ apiUrl: config.apiUrl, apiKey: config.apiKey });
};
