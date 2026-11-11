/** The deterministic Deep Agents fixture emits two model calls and one tool call. */
export function frameworkSnapshotReady(snapshot, rootName) {
  return !snapshot.partial && snapshot.records.some(span => span.name === rootName)
    && snapshot.records.filter(span => span.attributes["openinference.span.kind"] === "LLM").length === 2
    && snapshot.records.filter(span => span.attributes["openinference.span.kind"] === "TOOL").length === 1;
}
