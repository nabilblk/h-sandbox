import type { HarakiriClient, WaitForWorkspaceOptions } from "./index.js";
import type { WorkspaceResponse, WorkspaceSummary } from "./workspaces.js";

/** Retained storage has a separate lifetime from the sandbox currently attached to it. */
export class HarakiriWorkspace implements WorkspaceResponse {
  #client: HarakiriClient;

  constructor(client: HarakiriClient, public workspace: WorkspaceSummary) { this.#client = client; }
  get id() { return this.workspace.id; }
  get status() { return this.workspace.status; }

  async refresh() {
    this.workspace = (await this.#client.workspaces.get(this.id)).workspace;
    return this;
  }

  async wait(options: WaitForWorkspaceOptions = {}) {
    this.workspace = (await this.#client.workspaces.wait(this.id, options)).workspace;
    return this.workspace;
  }

  /** Archives the record after detachment; does not physically reclaim retained storage. */
  async archive() {
    this.workspace = (await this.#client.workspaces.archive(this.id)).workspace;
    return this.workspace;
  }
}
