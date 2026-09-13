export type EnvironmentClientOptions = {
  /** Defaults to process.env in Node. Explicit values also support browser/test environments. */
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
};

export function clientOptionsFromEnv(options: EnvironmentClientOptions = {}) {
  const env = options.env ?? (typeof process === "undefined" ? {} : process.env);
  const apiUrl = env.HARAKIRI_API_URL?.trim();
  const apiKey = env.HARAKIRI_API_KEY?.trim();
  if (!apiUrl) throw new Error("HARAKIRI_API_URL is required. Set the API URL of your installation.");
  if (!apiKey) throw new Error("HARAKIRI_API_KEY is required. Use a scoped runtime API key.");
  let url: URL;
  try { url = new URL(apiUrl); }
  catch { throw new Error("HARAKIRI_API_URL must be an absolute HTTP(S) URL."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("HARAKIRI_API_URL must be HTTP(S), without credentials, a query or a fragment.");
  }
  if (/[\r\n]/.test(apiKey)) throw new Error("HARAKIRI_API_KEY must not contain line breaks.");
  return { apiUrl: url.toString(), apiKey, fetch: options.fetch };
}
