import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { pipeline, Transform, type TransformCallback } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServiceTarget } from "./access.js";
import { ServiceProxyError, type ServiceLimits } from "./limits.js";
import { serviceRequestHeaders, serviceResponseHeaders, serviceUrl } from "./target.js";

class ByteLimit extends Transform {
  #bytes = 0;
  constructor(
    readonly maximum: number,
    readonly status: number,
    readonly code: ServiceProxyError["code"]
  ) {
    super();
  }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback) {
    this.#bytes += chunk.length;
    done(this.#bytes > this.maximum ? new ServiceProxyError(this.status, this.code) : null, chunk);
  }
}

export const proxyServiceHttp = async (
  request: FastifyRequest,
  reply: FastifyReply,
  target: ServiceTarget,
  controller: AbortController,
  limits: ServiceLimits
) => {
  const destination = serviceUrl(target, request.raw.url ?? request.url);
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (contentLength > limits.requestBytes) throw new ServiceProxyError(413, "route_proxy_request_too_large");
  const upload = new ByteLimit(limits.requestBytes, 413, "route_proxy_request_too_large");
  const outgoing = (destination.url.protocol === "https:" ? httpsRequest : httpRequest)(destination.url, {
    method: request.method,
    headers: serviceRequestHeaders(request.headers, target),
    signal: controller.signal,
    maxHeaderSize: limits.headerBytes,
    agent: false
  });
  let failure: Error | undefined;
  const fail = (error: Error) => {
    failure ??= error;
    outgoing.destroy(error);
  };
  const connectTimer = setTimeout(
    () => fail(new ServiceProxyError(504, "route_proxy_connect_timeout")),
    limits.connectTimeoutMs
  );
  outgoing.setTimeout(limits.idleTimeoutMs, () => fail(new ServiceProxyError(504, "route_proxy_idle_timeout")));
  const cleanup = () => {
    clearTimeout(connectTimer);
    request.raw.unpipe(upload);
    upload.destroy();
    outgoing.destroy();
  };
  reply.raw.once("close", cleanup);
  try {
    const responsePromise = new Promise<IncomingMessage>((resolve, reject) => {
      outgoing.once("response", resolve);
      outgoing.on("error", (error) =>
        reject(failure ?? (controller.signal.reason instanceof ServiceProxyError ? controller.signal.reason : error))
      );
      upload.once("error", fail);
    });
    request.raw.pipe(upload).pipe(outgoing);
    const upstream = await responsePromise;
    clearTimeout(connectTimer);
    const hasBody = request.method !== "HEAD" && upstream.statusCode !== 204 && upstream.statusCode !== 304;
    if (hasBody && Number(upstream.headers["content-length"] ?? 0) > limits.responseBytes) {
      upstream.destroy();
      throw new ServiceProxyError(502, "route_proxy_response_too_large");
    }
    const headers = serviceResponseHeaders(upstream.headers, destination, target.routeKey);
    for (const [name, value] of Object.entries(headers)) if (value !== undefined) reply.header(name, value);
    reply.code(upstream.statusCode ?? 502);
    const download = new ByteLimit(limits.responseBytes, 502, "route_proxy_response_too_large");
    // Fastify owns the readable's backpressure and aborts it if the consumer disconnects.
    void reply.send(download);
    pipeline(upstream, download, () => outgoing.destroy());
    return reply;
  } catch (error) {
    cleanup();
    // Do not destroy the incoming socket before Fastify can send a stable failure.
    reply.header("connection", "close");
    if (error instanceof ServiceProxyError) throw error;
    throw new ServiceProxyError(502, "route_proxy_upstream_unreachable");
  }
};
