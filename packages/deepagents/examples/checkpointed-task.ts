import { Annotation, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import { HarakiriSandboxBackend, type CommandReference, type HarakiriExecuteResponse } from "@h-sandbox/deepagents";

const TaskState = Annotation.Root({
  reference: Annotation<CommandReference>(),
  approved: Annotation<boolean>(),
  result: Annotation<HarakiriExecuteResponse>()
});

/** The application supplies an authorized resolver and its persistent checkpointer. */
export function createTaskReviewGraph(
  resolveBackend: (sandboxId: string) => Promise<HarakiriSandboxBackend>,
  checkpointer: BaseCheckpointSaver
) {
  return new StateGraph(TaskState)
    .addNode("review", (state) => {
      // Put the interrupt before effects: LangGraph may re-enter this node on resume.
      const approved = interrupt({ reference: state.reference, question: "Retrieve this task's result?" });
      if (approved !== true) throw new Error("Result retrieval was not approved.");
      return { approved: true };
    })
    .addNode("observe", async (state) => {
      const backend = await resolveBackend(state.reference.sandboxId);
      return { result: await backend.observe(state.reference) };
    })
    .addEdge(START, "review")
    .addEdge("review", "observe")
    .addEdge("observe", END)
    .compile({ checkpointer });
}
