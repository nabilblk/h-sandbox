import { AsyncLocalStorage } from "node:async_hooks";
import type { Context, Span, SpanOptions, Tracer, TracerOptions, TracerProvider } from "@opentelemetry/api";
import { AlwaysOffSampler, TracerProvider as SdkTracerProvider } from "@opentelemetry/sdk-trace";

/** Qualification candidate: route an upstream instrumentor only inside an explicit invocation. */
export class ScopedTracerProvider implements TracerProvider {
  private readonly current = new AsyncLocalStorage<TracerProvider>();
  private readonly disabled = new SdkTracerProvider({ sampler: new AlwaysOffSampler() });
  private closed = false;

  run<T>(provider: TracerProvider, action: () => T): T {
    if (this.closed) throw new Error("The scoped tracer provider is closed");
    if (process.env.LANGCHAIN_CALLBACKS_BACKGROUND !== "false") {
      throw new Error("Scoped Deep Agents tracing requires LANGCHAIN_CALLBACKS_BACKGROUND=false before instrumentation setup");
    }
    return this.current.run(provider, action);
  }

  getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
    const select = () => (this.current.getStore() ?? this.disabled).getTracer(name, version, options);
    function startActiveSpan<F extends (span: Span) => unknown>(name: string, fn: F): ReturnType<F>;
    function startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
    function startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions, context: Context, fn: F): ReturnType<F>;
    function startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions | F, contextOrFn?: Context | F, fn?: F): ReturnType<F> {
      if (typeof options === "function") return select().startActiveSpan(name, options);
      if (typeof contextOrFn === "function") return select().startActiveSpan(name, options, contextOrFn);
      return select().startActiveSpan(name, options, contextOrFn!, fn!);
    }
    return { startSpan: (...args) => select().startSpan(...args), startActiveSpan };
  }

  async shutdown() {
    if (this.closed) return;
    this.closed = true;
    this.current.disable();
    await this.disabled.shutdown();
  }
}
