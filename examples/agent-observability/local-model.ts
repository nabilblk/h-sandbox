import { ChatOllama } from "@langchain/ollama";

/** Local inference only; callers supply their isolated Ollama endpoint. */
export function localModel(baseUrl: string, model: string) {
  return new ChatOllama({ baseUrl, model, temperature: 0, numCtx: 4096, numPredict: 512,
    numThread: 2, think: false, maxRetries: 0, keepAlive: "1m" });
}
