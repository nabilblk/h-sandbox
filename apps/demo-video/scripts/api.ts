import { setTimeout as delay } from 'node:timers/promises';
export function demoApi(apiUrl: string, apiKey: string) {
  return async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${apiUrl}${path}`, { method, headers: { 'x-api-key': apiKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`Harakiri ${method} ${path} returned ${response.status}`);
    return response.json();
  };
}
export async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 60_000): Promise<T> {
  const until = performance.now() + timeout;
  while (true) {
    const value = await read();
    if (accept(value)) return value;
    if (performance.now() >= until) throw new Error('Timed out waiting for verified runtime state');
    await delay(500);
  }
}
export async function cleanupRuntime(api: ReturnType<typeof demoApi>, id: string, routeUrl?: string) {
  await api(`/v1/sandboxes/${encodeURIComponent(id)}`, 'DELETE');
  await poll(() => api(`/v1/sandboxes/${encodeURIComponent(id)}`), (value) => value.sandbox.status === 'terminated');
  await poll(() => api(`/v1/sandboxes/${encodeURIComponent(id)}/routes`), (value) => value.routes.every((route: { state: string }) => ['deleted', 'terminated', 'inactive'].includes(route.state)));
  if (routeUrl) await poll(async () => {
    try { return (await fetch(routeUrl, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })).status; }
    catch { return 0; }
  }, (status) => status === 0 || status >= 400);
}
