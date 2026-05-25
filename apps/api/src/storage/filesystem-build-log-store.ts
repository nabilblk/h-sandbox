import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { redactText } from "../redaction.js";
import type { AppendBuildLogInput, BuildLogRecord, BuildLogStore } from "./build-log-store.js";

const safeBuildId = (buildId: string) => {
  const normalized = buildId.trim();
  if (!/^[A-Za-z0-9_.:-]+$/.test(normalized)) throw new Error(`unsafe build id: ${buildId}`);
  return normalized;
};

export class FileSystemBuildLogStore implements BuildLogStore {
  readonly kind = "filesystem";

  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(buildId: string) {
    const target = resolve(this.root, `${safeBuildId(buildId)}.jsonl`);
    if (!target.startsWith(`${this.root}${sep}`) && target !== this.root) throw new Error(`unsafe build id: ${buildId}`);
    return target;
  }

  async append(input: AppendBuildLogInput): Promise<BuildLogRecord> {
    const existing = await this.list(input.buildId);
    const record: BuildLogRecord = {
      lineNo: existing.length ? existing[existing.length - 1].lineNo + 1 : 1,
      stream: input.stream,
      message: redactText(input.message),
      createdAt: input.createdAt ?? new Date().toISOString()
    };
    const path = this.pathFor(input.buildId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${existing.map((item) => JSON.stringify(item)).join("\n")}${existing.length ? "\n" : ""}${JSON.stringify(record)}\n`);
    return record;
  }

  async list(buildId: string, options: { afterLineNo?: number; limit?: number } = {}): Promise<BuildLogRecord[]> {
    let raw = "";
    try {
      raw = await readFile(this.pathFor(buildId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const afterLineNo = options.afterLineNo ?? 0;
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BuildLogRecord)
      .filter((line) => line.lineNo > afterLineNo)
      .slice(0, limit);
  }

  async delete(buildId: string): Promise<number> {
    const hadLogs = (await this.list(buildId)).length > 0;
    await rm(this.pathFor(buildId), { force: true });
    return hadLogs ? 1 : 0;
  }
}
