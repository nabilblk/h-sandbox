import { BaseSandbox, type GrepResult } from "deepagents";

/** Request-local wrapper for 1.14.0, whose BaseSandbox.grep drops execute metadata. */
class GrepSandbox extends BaseSandbox {
  truncated = false;
  error: string | undefined;

  constructor(private readonly backend: BaseSandbox) { super(); }

  get id() { return this.backend.id; }
  uploadFiles(files: Array<[string, Uint8Array]>) { return this.backend.uploadFiles(files); }
  downloadFiles(paths: string[]) { return this.backend.downloadFiles(paths); }

  async execute(command: string) {
    const result = await this.backend.execute(command);
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      this.error = "Search did not complete normally. Inspect the command before relying on its results.";
      return { ...result, output: "" };
    }
    this.truncated ||= result.truncated === true;
    // Grep emits newline-terminated records. Never parse a clipped tail as a match.
    return this.truncated
      ? { ...result, output: result.output.slice(0, result.output.lastIndexOf("\n") + 1) }
      : result;
  }
}

export async function grepWithOutputStatus(
  backend: BaseSandbox, pattern: string, path: string,
  glob: string | null, maxCount: number | null
): Promise<GrepResult> {
  const search = new GrepSandbox(backend);
  // Reuse upstream quoting, shell construction, match parsing and count limits.
  const result = await search.grep(pattern, path, glob, maxCount);
  if (search.error) return { error: search.error };
  if (!search.truncated) return result;
  return {
    ...result, truncated: true,
    // The pinned framework ignores truncated when there are no matches.
    ...(!result.matches?.length ? {
      error: "Search output was truncated before a complete match could be returned. Narrow the pattern or path."
    } : {})
  };
}
