import { HarakiriApiError, type HarakiriSandbox } from "@h-sandbox/sdk";
import { BaseSandbox, type FileDownloadResponse, type FileUploadResponse } from "deepagents";
import { HarakiriExecutionError, HarakiriTransferError, type CommandReference } from "./errors.js";
import { executionOptions, observeCommand, positiveInteger, type ExecutionOptions } from "./execution.js";
import { grepWithOutputStatus } from "./search.js";

export type HarakiriSandboxBackendOptions = ExecutionOptions & {
  /** Total decoded bytes per transfer batch. Default 32 MiB, at most 256 MiB. */
  maxBatchBytes?: number;
};

function fileError(error: unknown): FileUploadResponse["error"] {
  if (!(error instanceof HarakiriApiError)) return null;
  switch (error.code) {
    case "file_not_found": return "file_not_found";
    case "file_permission_denied": return "permission_denied";
    case "invalid_file_path": return "invalid_path";
    default: return null;
  }
}

/** A borrowed, single-sandbox backend. Construction never creates or destroys resources. */
export class HarakiriSandboxBackend extends BaseSandbox {
  readonly #sandbox: HarakiriSandbox;
  readonly #execution: ReturnType<typeof executionOptions>;
  readonly #maxBatchBytes: number;

  constructor(sandbox: HarakiriSandbox, options: HarakiriSandboxBackendOptions = {}) {
    super();
    if (typeof sandbox.files.readBytes !== "function" || typeof sandbox.processes.connect !== "function") {
      throw new TypeError("This adapter requires Harakiri SDK 0.5.0-rc.11 or newer, not npm rc.10.");
    }
    this.#sandbox = sandbox;
    this.#execution = executionOptions(sandbox, options);
    this.#maxBatchBytes = positiveInteger("maxBatchBytes", options.maxBatchBytes ?? 33_554_432, 268_435_456);
  }

  get id() { return this.#sandbox.id; }
  /** Persist only this reference, scoped to your application's tenant and thread. */
  get reference() { return { sandboxId: this.id }; }

  async execute(command: string) {
    if (!command.trim()) throw new TypeError("A nonempty shell command is required.");
    this.#execution.signal?.throwIfAborted();
    let reference: CommandReference;
    try {
      const process = await this.#sandbox.processes.start({
        command, cwd: this.#execution.cwd, timeoutMs: this.#execution.timeoutMs, detached: true
      }, { signal: this.#execution.signal, requestTimeoutMs: this.#execution.requestTimeoutMs });
      reference = process.reference;
    } catch (cause) {
      throw new HarakiriExecutionError("submission", this.id, undefined, cause);
    }
    try {
      await this.#execution.onCommandStarted?.({ ...reference });
    } catch (cause) {
      throw new HarakiriExecutionError("checkpoint", this.id, reference, cause);
    }
    return this.observe(reference);
  }

  /** Read-only command recovery. Never submits a command or resumes a runtime. */
  observe(reference: CommandReference) {
    return observeCommand(this.#sandbox, reference, this.#execution);
  }

  override grep(pattern: string, path = "/", glob: string | null = null, maxCount: number | null = null) {
    return grepWithOutputStatus(this, pattern, path, glob, maxCount);
  }

  async uploadFiles(files: Array<[string, Uint8Array]>): Promise<FileUploadResponse[]> {
    this.#checkBatch(files.length);
    let bytes = 0;
    for (const [, content] of files) {
      if (!(content instanceof Uint8Array)) throw new TypeError("File content must be Uint8Array.");
      bytes += content.byteLength;
      this.#checkBytes(bytes);
    }
    const results: FileUploadResponse[] = [];
    for (const [path, content] of files) {
      try {
        this.#execution.signal?.throwIfAborted();
        if (!validPath(path)) { results.push({ path, error: "invalid_path" }); continue; }
        await this.#sandbox.files.write(this.#path(path), content, {
          createParents: true, signal: this.#execution.signal, requestTimeoutMs: this.#execution.requestTimeoutMs
        });
        results.push({ path, error: null });
      } catch (cause) {
        const error = this.#execution.signal?.aborted ? null : fileError(cause);
        if (error) results.push({ path, error });
        else throw new HarakiriTransferError("upload", this.id, path, results.filter(r => !r.error).map(r => r.path), cause);
      }
    }
    return results;
  }

  async downloadFiles(paths: string[]): Promise<FileDownloadResponse[]> {
    this.#checkBatch(paths.length);
    const results: FileDownloadResponse[] = [];
    let bytes = 0;
    for (const path of paths) {
      try {
        this.#execution.signal?.throwIfAborted();
        if (!validPath(path)) { results.push({ path, content: null, error: "invalid_path" }); continue; }
        const absolute = this.#path(path);
        const request = { signal: this.#execution.signal, requestTimeoutMs: this.#execution.requestTimeoutMs };
        const { file } = await this.#sandbox.files.stat(absolute, request);
        if (file.type === "directory" || file.type === "dir") {
          results.push({ path, content: null, error: "is_directory" });
          continue;
        }
        this.#checkBytes(bytes + file.size);
        const content = await this.#sandbox.files.readBytes(absolute, request);
        bytes += content.byteLength;
        this.#checkBytes(bytes);
        results.push({ path, content, error: null });
      } catch (cause) {
        const error = this.#execution.signal?.aborted ? null : fileError(cause);
        if (error) results.push({ path, content: null, error });
        else throw new HarakiriTransferError("download", this.id, path, results.filter(r => !r.error).map(r => r.path), cause);
      }
    }
    return results;
  }

  #path(path: string) {
    return path.startsWith("/") ? path : `${this.#execution.cwd.replace(/\/+$/, "")}/${path}`;
  }

  #checkBatch(count: number) {
    this.#execution.signal?.throwIfAborted();
    if (count > 64) throw new RangeError("Transfer batches are limited to 64 files.");
  }

  #checkBytes(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.#maxBatchBytes) {
      throw new RangeError(`Transfer batch exceeds ${this.#maxBatchBytes} decoded bytes.`);
    }
  }
}

function validPath(path: string) {
  return typeof path === "string" && path.length > 0 && !path.includes("\0");
}
