import { callExecd, runExecdCommand } from "./opensandbox-execd.js";
import type { ExecdFileInfo, SandboxFileEntry } from "./opensandbox-types.js";

const normalizedDirectory = (path: string) => {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return safePath.length > 1 ? safePath.replace(/\/+$/, "") : safePath;
};

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const directRelativePath = (cwd: string, fullPath: string) => {
  if (cwd === "/") return fullPath.replace(/^\/+/, "");
  const prefix = `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : "";
};

const modeString = (mode: ExecdFileInfo["mode"]) => (mode == null ? undefined : String(mode).padStart(4, "0"));

const listFilesWithSearch = async (opensandboxId: string, cwd: string) => {
  const query = new URLSearchParams({ path: cwd, pattern: "*" });
  const body = await callExecd(opensandboxId, `/files/search?${query.toString()}`);
  const entries = JSON.parse(body) as ExecdFileInfo[];
  if (!Array.isArray(entries)) throw new Error("OpenSandbox execd files/search returned an unexpected response");

  const seenDirs = new Set<string>();
  const files: SandboxFileEntry[] = [];
  for (const entry of entries) {
    const relative = directRelativePath(cwd, entry.path);
    if (!relative) continue;
    const [firstSegment, ...rest] = relative.split("/").filter(Boolean);
    if (!firstSegment) continue;
    if (rest.length > 0) {
      const dirPath = cwd === "/" ? `/${firstSegment}` : `${cwd}/${firstSegment}`;
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        files.push({ path: dirPath, name: firstSegment, type: "directory", size: 0 });
      }
      continue;
    }
    files.push({
      path: entry.path,
      name: firstSegment,
      type: "file",
      size: Number(entry.size) || 0,
      mode: modeString(entry.mode),
      modifiedAt: entry.modified_at ?? entry.created_at ?? null,
      owner: entry.owner,
      group: entry.group
    });
  }

  return {
    cwd,
    files: files.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === "directory") return -1;
      if (b.type === "directory") return 1;
      return a.type.localeCompare(b.type);
    })
  };
};

const findType = (type: string): SandboxFileEntry["type"] => {
  if (type === "d") return "directory";
  if (type === "f") return "file";
  if (type === "l") return "symlink";
  return "other";
};

const listFilesWithCommand = async (opensandboxId: string, cwd: string) => {
  const command = `find ${shellQuote(cwd)} -mindepth 1 -maxdepth 1 -printf '%y\\t%p\\t%s\\t%m\\t%u\\t%g\\t%T@\\n' 2>/dev/null || true`;
  const result = await runExecdCommand({ opensandboxId, command });
  const files = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): SandboxFileEntry | null => {
      const [type, path, size, mode, owner, group, modified] = line.split("\t");
      if (!type || !path) return null;
      const modifiedSeconds = Number(modified);
      return {
        path,
        name: path.split("/").filter(Boolean).pop() ?? path,
        type: findType(type),
        size: Number(size) || 0,
        mode: modeString(mode),
        owner,
        group,
        modifiedAt: Number.isFinite(modifiedSeconds) ? new Date(modifiedSeconds * 1000).toISOString() : null
      };
    })
    .filter((file): file is SandboxFileEntry => Boolean(file))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      if (a.type === "directory") return -1;
      if (b.type === "directory") return 1;
      return a.type.localeCompare(b.type);
    });
  return { cwd, files };
};

export const listFilesInSandbox = async (opensandboxId: string, path = "/") => {
  const cwd = normalizedDirectory(path);
  try {
    return await listFilesWithSearch(opensandboxId, cwd);
  } catch {
    return listFilesWithCommand(opensandboxId, cwd);
  }
};
