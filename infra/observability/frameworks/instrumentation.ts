import * as CallbackManagerModule from "@langchain/core/callbacks/manager";
import { isPatched, LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import { ScopedTracerProvider } from "./scoped-provider.js";

/** Internal candidate recipe. No global OTel provider or context manager is installed. */
export function instrumentDeepAgents() {
  if (process.env.LANGCHAIN_CALLBACKS_BACKGROUND !== "false") {
    throw new Error("Set LANGCHAIN_CALLBACKS_BACKGROUND=false before instrumentation setup");
  }
  if (isPatched()) throw new Error("LangChain already has OpenInference instrumentation; use its existing provider");
  const router = new ScopedTracerProvider();
  const instrumentation = new LangChainInstrumentation({ tracerProvider: router, instrumentationConfig: { enabled: false },
    traceConfig: { hideInputs: true, hideOutputs: true, hideInputMessages: true, hideOutputMessages: true,
      hideInputText: true, hideOutputText: true, hideInputImages: true, hideLLMTools: true, hidePrompts: true }
  });
  instrumentation.manuallyInstrument(CallbackManagerModule);
  // The public upstream API does not undo manual ESM instrumentation. This is
  // process-lifetime qualification only, not a reusable public SDK helper.
  return { router, async shutdown() { instrumentation.disable(); await router.shutdown(); } };
}
