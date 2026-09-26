import { HarakiriClient, type HarakiriSandbox } from "@h-sandbox/sdk";
import { HarakiriSandboxBackend, type CommandReference } from "@h-sandbox/deepagents";
import { createDeepAgent } from "deepagents";
import { Command, isInterrupted, type StateSnapshot } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { WorkflowStore, type WorkflowIdentity, type WorkflowRun } from "./durable-store.js";

export class WorkflowRecoveryRequired extends Error {
  constructor(readonly run: WorkflowRun, message: string) {
    super(message);
    this.name = "WorkflowRecoveryRequired";
  }
}

/** Bind an application-authorized sandbox. This never creates or takes ownership of it. */
export async function bindWorkflow(store: WorkflowStore, client: HarakiriClient, identity: WorkflowIdentity, sandboxId: string) {
  const sandbox = await client.sandboxes.connect(sandboxId);
  await sandbox.wait();
  return store.bind(identity, {
    sandboxId: sandbox.id, template: sandbox.template,
    workspaceId: sandbox.summary.workspaceId ?? null,
    cwd: sandbox.summary.workspaceId ? "/workspace" : sandbox.runtimeMetadata.workdir
  });
}

async function runtime(client: HarakiriClient, run: WorkflowRun): Promise<HarakiriSandbox> {
  const sandbox = await client.sandboxes.connect(run.sandboxId);
  if (!["running", "idle"].includes(sandbox.status) ||
    (sandbox.expiresAt && Date.parse(sandbox.expiresAt) <= Date.now())) {
    throw new WorkflowRecoveryRequired(run, "The bound sandbox is not live. Inspect retained storage; do not replay commands in a replacement runtime.");
  }
  if ((sandbox.summary.workspaceId ?? null) !== run.workspaceId) throw new Error("The runtime's workspace does not match the application binding.");
  await sandbox.wait();
  return sandbox;
}

export type AgentAction = { type: "start"; prompt: string } | { type: "approve" | "reject"; checkpointId: string };

export async function runWorkflow(
  store: WorkflowStore, client: HarakiriClient, identity: WorkflowIdentity,
  model: BaseChatModel, action: AgentAction,
  hooks: { onAcknowledged?: (reference: CommandReference) => Promise<void> } = {}
) {
  return store.exclusive(identity, async run => {
    if (run.phase === "invoking") {
      throw new WorkflowRecoveryRequired(run, "The previous invocation did not record a safe boundary. Observe recorded commands; automatic agent replay is disabled.");
    }
    if (run.phase !== (action.type === "start" ? "ready" : "approval")) {
      throw new Error("This action is not valid for the workflow's current phase.");
    }
    const sandbox = await runtime(client, run);
    const backend = new HarakiriSandboxBackend(sandbox, {
      cwd: run.cwd, requestTimeoutMs: 30_000, observationTimeoutMs: 90_000,
      onCommandStarted: async reference => {
        await store.record(run, reference);
        await hooks.onAcknowledged?.(reference);
      }
    });
    const agent = createDeepAgent({
      model, backend, checkpointer: store.checkpointer,
      interruptOn: { execute: true, write_file: true, edit_file: true },
      subagents: [], memory: [], skills: [],
      systemPrompt: `Work in ${run.cwd}. Report verified results. Request one tool action at a time. Do not use external network services.`
    });
    const config = { configurable: { thread_id: run.id }, recursionLimit: 30 };
    if (action.type !== "start") {
      // The pinned agent proxy narrows getState's inferred return type to never.
      const state = await agent.getState(config) as StateSnapshot;
      if (state.config.configurable?.checkpoint_id !== action.checkpointId) {
        throw new Error("The approval checkpoint changed. Inspect the current action before deciding.");
      }
      const pending = state.tasks.flatMap(task => task.interrupts).flatMap(item => {
        const value = item.value as { actionRequests?: unknown[] };
        return value.actionRequests ?? [];
      });
      if (pending.length !== 1) throw new Error("Expected one pending approval. Inspect the checkpoint before making a decision.");
    }
    // Persist before effects. A crash cannot turn an uncertain invocation into an automatic retry.
    await store.phase(run, "invoking");
    const result = await agent.invoke(action.type === "start"
      ? { messages: [{ role: "user", content: action.prompt }] }
      : new Command({ resume: { decisions: [{ type: action.type }] } }), config);
    const phase = isInterrupted(result) ? "approval" : "complete";
    await store.phase(run, phase);
    const checkpoint = await store.checkpointer.getTuple(config);
    return { phase, checkpointId: checkpoint?.config.configurable?.checkpoint_id,
      review: phase === "approval" ? checkpoint?.pendingWrites?.filter(([, channel]) => channel === "__interrupt__").map(([, , value]) => value) : [] };
  });
}

/** Read-only recovery after an acknowledged submission. No graph invocation or runtime replacement. */
export async function observeWorkflowCommand(
  store: WorkflowStore, client: HarakiriClient, identity: WorkflowIdentity, commandId: string
) {
  const run = await store.get(identity);
  const reference = (await store.commands(run)).find(value => value.commandId === commandId);
  if (!reference) throw new Error("This command does not belong to the authenticated workflow.");
  const sandbox = await runtime(client, run);
  return new HarakiriSandboxBackend(sandbox, { cwd: run.cwd, observationTimeoutMs: 90_000 }).observe(reference);
}

/** Explicit recovery creates a new runtime, but never rebinds the old graph or command IDs. */
export async function recoverWorkflowFiles(store: WorkflowStore, client: HarakiriClient, identity: WorkflowIdentity) {
  return store.exclusive(identity, async run => {
    if (!run.workspaceId) throw new WorkflowRecoveryRequired(run, "No retained workspace was bound. Ephemeral sandbox files cannot be recovered by the checkpointer.");
    const old = await client.sandboxes.connect(run.sandboxId);
    if (old.status !== "terminated" || old.summary.capacityPhase !== "released") {
      throw new WorkflowRecoveryRequired(run, "Wait for confirmed termination and capacity release before recovering files.");
    }
    const workspace = await client.workspaces.connect(run.workspaceId);
    if (workspace.status !== "available") throw new WorkflowRecoveryRequired(run, "Workspace is not available. Resolve detachment or storage recovery before creating a replacement.");
    const replacement = await client.sandboxes.create({
      template: run.template, workspaceId: run.workspaceId, name: "framework-files-recovery",
      ttlSeconds: 600, idempotencyKey: `framework-files-${run.id}`, wait: false
    });
    // Caller receives the accepted ID before readiness. Reconnect rather than inventing another key.
    return { sandboxId: replacement.id, workspaceId: run.workspaceId, previousSandboxId: run.sandboxId };
  });
}
