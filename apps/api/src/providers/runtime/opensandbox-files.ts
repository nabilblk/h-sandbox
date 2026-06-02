import { callExecd, runExecdCommand } from "./opensandbox-execd.js";
import type { ExecdFileInfo, SandboxFileEntry } from "./opensandbox-types.js";
import type { SandboxFileEncoding } from "@harakiri/shared";

export class OpenSandboxFileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 502
  ) {
    super(message);
  }
}

const normalizedFilePath = (path: string) => {
  if (!path || path.includes("\0")) throw new OpenSandboxFileError("invalid_file_path", "file path is invalid", 400);
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const normalized = safePath
    .replace(/\/+/g, "/")
    .split("/")
    .reduce<string[]>((parts, part) => {
      if (!part || part === ".") return parts;
      if (part === "..") {
        parts.pop();
        return parts;
      }
      parts.push(part);
      return parts;
    }, []);
  return `/${normalized.join("/")}` || "/";
};

const normalizedDirectory = (path: string) => normalizedFilePath(path).replace(/\/+$/, "") || "/";

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const directRelativePath = (cwd: string, fullPath: string) => {
  if (cwd === "/") return fullPath.replace(/^\/+/, "");
  const prefix = `${cwd}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : "";
};

const modeString = (mode: ExecdFileInfo["mode"]) => (mode == null ? undefined : String(mode).padStart(4, "0"));

const statLineToFile = (line: string): SandboxFileEntry => {
  const [type, filePath, size, mode, owner, group, modified] = line.split("\t");
  if (!type || !filePath) throw new OpenSandboxFileError("runtime_files_unavailable", "OpenSandbox execd stat returned an unexpected response");
  const modifiedSeconds = Number(modified);
  return {
    path: filePath,
    name: filePath.split("/").filter(Boolean).pop() ?? filePath,
    type: type as SandboxFileEntry["type"],
    size: Number(size) || 0,
    mode: modeString(mode),
    owner,
    group,
    modifiedAt: Number.isFinite(modifiedSeconds) ? new Date(modifiedSeconds * 1000).toISOString() : null
  };
};

const statCommand = (path: string) => {
  const quoted = shellQuote(path);
  return [
    "set -eu",
    `target=${quoted}`,
    `if [ ! -e "$target" ] && [ ! -L "$target" ]; then echo "file_not_found: $target" >&2; exit 44; fi`,
    `if [ -L "$target" ]; then kind=symlink; elif [ -d "$target" ]; then kind=directory; elif [ -f "$target" ]; then kind=file; else kind=other; fi`,
    `stat -c "$kind\t%n\t%s\t%a\t%U\t%G\t%Y" -- "$target"`
  ].join("\n");
};

const classifyFileCommandFailure = (stderr: string) => {
  if (/file_not_found|No such file or directory/i.test(stderr)) {
    return new OpenSandboxFileError("file_not_found", stderr.trim() || "file not found", 404);
  }
  if (/Permission denied/i.test(stderr)) {
    return new OpenSandboxFileError("file_permission_denied", stderr.trim() || "permission denied", 403);
  }
  if (/not_a_directory|Not a directory/i.test(stderr)) {
    return new OpenSandboxFileError("invalid_file_path", stderr.trim() || "not a directory", 400);
  }
  return new OpenSandboxFileError("runtime_files_unavailable", stderr.trim() || "OpenSandbox execd filesystem command failed");
};

const runFileCommand = async (opensandboxId: string, command: string) => {
  const result = await runExecdCommand({ opensandboxId, command });
  if (result.exitCode !== 0 || result.stderr.trim()) throw classifyFileCommandFailure(result.stderr);
  return result.stdout;
};

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
    source: "opensandbox-files-search",
    warnings: undefined,
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
  const command = [
    "set -eu",
    `target=${shellQuote(cwd)}`,
    `if [ ! -e "$target" ]; then echo "file_not_found: $target" >&2; exit 44; fi`,
    `if [ ! -d "$target" ]; then echo "not_a_directory: $target" >&2; exit 45; fi`,
    `find "$target" -mindepth 1 -maxdepth 1 -printf '%y\\t%p\\t%s\\t%m\\t%u\\t%g\\t%T@\\n'`
  ].join("\n");
  const stdout = await runFileCommand(opensandboxId, command);
  const files = stdout
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
  return {
    cwd,
    files,
    source: "opensandbox-command-fallback",
    warnings: ["OpenSandbox files/search was unavailable; listed direct children through a provider command fallback."]
  };
};

export const listFilesInSandbox = async (opensandboxId: string, path = "/") => {
  const cwd = normalizedDirectory(path);
  try {
    return await listFilesWithSearch(opensandboxId, cwd);
  } catch {
    return listFilesWithCommand(opensandboxId, cwd);
  }
};

export const statFileInSandbox = async (opensandboxId: string, path: string) => {
  const normalized = normalizedFilePath(path);
  const stdout = await runFileCommand(opensandboxId, statCommand(normalized));
  return statLineToFile(stdout.trim().split(/\r?\n/).at(-1) ?? "");
};

export const readFileInSandbox = async (opensandboxId: string, path: string, encoding: SandboxFileEncoding) => {
  const normalized = normalizedFilePath(path);
  const quoted = shellQuote(normalized);
  const stdout = await runFileCommand(opensandboxId, [
    "set -eu",
    `target=${quoted}`,
    `if [ ! -f "$target" ]; then echo "file_not_found: $target" >&2; exit 44; fi`,
    `base64 -w0 -- "$target"`
  ].join("\n"));
  const base64 = stdout.trim();
  return {
    path: normalized,
    encoding,
    content: encoding === "base64" ? base64 : Buffer.from(base64, "base64").toString("utf8")
  };
};

export const writeFileInSandbox = async (
  opensandboxId: string,
  input: { path: string; content: string; encoding: SandboxFileEncoding; createParents?: boolean; mode?: string }
) => {
  const normalized = normalizedFilePath(input.path);
  const contentBase64 = input.encoding === "base64" ? input.content : Buffer.from(input.content).toString("base64");
  const modeCommand = input.mode ? `chmod ${shellQuote(input.mode)} -- "$target"` : "";
  const command = [
    "set -eu",
    `target=${shellQuote(normalized)}`,
    input.createParents ? `mkdir -p -- "$(dirname -- "$target")"` : "",
    `tmp="$target.harakiri-write-$$"`,
    `base64 -d > "$tmp" <<'HARAKIRI_FILE_CONTENT'`,
    contentBase64,
    "HARAKIRI_FILE_CONTENT",
    `mv -- "$tmp" "$target"`,
    modeCommand,
    statCommand(normalized)
  ].filter(Boolean).join("\n");
  const stdout = await runFileCommand(opensandboxId, command);
  return statLineToFile(stdout.trim().split(/\r?\n/).at(-1) ?? "");
};

export const mkdirInSandbox = async (opensandboxId: string, input: { path: string; recursive?: boolean }) => {
  const normalized = normalizedFilePath(input.path);
  const command = [
    "set -eu",
    `target=${shellQuote(normalized)}`,
    input.recursive ? `mkdir -p -- "$target"` : `mkdir -- "$target"`,
    statCommand(normalized)
  ].join("\n");
  const stdout = await runFileCommand(opensandboxId, command);
  return statLineToFile(stdout.trim().split(/\r?\n/).at(-1) ?? "");
};

export const removeFileInSandbox = async (opensandboxId: string, input: { path: string; recursive?: boolean }) => {
  const normalized = normalizedFilePath(input.path);
  const command = [
    "set -eu",
    `target=${shellQuote(normalized)}`,
    `if [ ! -e "$target" ] && [ ! -L "$target" ]; then echo "file_not_found: $target" >&2; exit 44; fi`,
    input.recursive ? `rm -rf -- "$target"` : `rm -- "$target"`
  ].join("\n");
  await runFileCommand(opensandboxId, command);
  return { path: normalized };
};

export const renameFileInSandbox = async (opensandboxId: string, input: { fromPath: string; toPath: string }) => {
  const fromPath = normalizedFilePath(input.fromPath);
  const toPath = normalizedFilePath(input.toPath);
  const command = [
    "set -eu",
    `from_path=${shellQuote(fromPath)}`,
    `to_path=${shellQuote(toPath)}`,
    `if [ ! -e "$from_path" ] && [ ! -L "$from_path" ]; then echo "file_not_found: $from_path" >&2; exit 44; fi`,
    `mv -- "$from_path" "$to_path"`,
    statCommand(toPath)
  ].join("\n");
  const stdout = await runFileCommand(opensandboxId, command);
  return statLineToFile(stdout.trim().split(/\r?\n/).at(-1) ?? "");
};
