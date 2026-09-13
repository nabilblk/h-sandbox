import type { HarakiriClient, WaitForCommandOptions, GetCommandLogsOptions } from "./index.js";
import type { SandboxCommandResponse, SandboxCommandSummary } from "./protocol.js";
import type { CommandStreamOptions } from "./command-stream.js";
import { HarakiriCommandEndedError } from "./operation-errors.js";

/** A durable command reference. Reconnecting never submits the command again. */
export class HarakiriProcess implements SandboxCommandResponse {
  #client: HarakiriClient;

  constructor(client: HarakiriClient, public command: SandboxCommandSummary) {
    this.#client = client;
  }

  get id() { return this.command.id; }
  get sandboxId() { return this.command.sandboxId; }
  get status() { return this.command.status; }
  /** Safe to persist in an application job record. Contains no authentication material. */
  get reference() { return { sandboxId: this.sandboxId, commandId: this.id }; }

  async refresh() {
    this.command = (await this.#client.getCommand(this.sandboxId, this.id)).command;
    return this;
  }

  /** Waits for success by default; failed/killed outcomes throw with command metadata. */
  async wait(options: WaitForCommandOptions = {}) {
    try {
      this.command = (await this.#client.waitForCommand(this.sandboxId, this.id, options)).command;
      return this.command;
    } catch (error) {
      if (error instanceof HarakiriCommandEndedError) this.command = error.command;
      throw error;
    }
  }

  /** Preserves log cursor/coverage metadata; command summaries are not a complete log archive. */
  logs(options: GetCommandLogsOptions = {}) {
    return this.#client.getCommandLogs(this.sandboxId, this.id, options);
  }

  /** Read-only SSE observation with explicit cursor recovery; does not restart work. */
  events(options: CommandStreamOptions = {}) {
    return this.#client.streamCommand(this.sandboxId, this.id, options);
  }

  async kill() {
    this.command = (await this.#client.killCommand(this.sandboxId, this.id)).command;
    return this.command;
  }
}
