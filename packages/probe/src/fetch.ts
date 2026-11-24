import { Agent, request as undiciRequest, type Dispatcher } from "undici";
import { assessAll, classifyUrl } from "./ssrf.js";

export const DEFAULT_CONNECT_TIMEOUT_MS = 3_000;
export const DEFAULT_TOTAL_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
export const DEFAULT_MAX_HEADER_BYTES = 16 * 1024;
export const DEFAULT_MAX_REDIRECTS = 3;

export interface LookupResult {
  address: string;
  family: 4 | 6;
}

export type Lookup = (hostname: string) => Promise<readonly string[]>;

export interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  pinnedAddress: string;
}

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeError";
  }
}

export interface UpstreamResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array> | null;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD" | "OPTIONS" | "POST";
  body?: string;
  headers?: Record<string, string>;
  lookup?: Lookup;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBodyBytes?: number;
  maxHeaderBytes?: number;
  maxRedirects?: number;
  userAgent: string;
  dispatcherFactory?: (pinned: string, servername: string | undefined) => Dispatcher;
  request?: (
    url: URL,
    init: {
      method: string;
      dispatcher: Dispatcher;
      signal: AbortSignal;
      headers: Record<string, string>;
      body?: string;
    },
  ) => Promise<UpstreamResponse>;
}

const defaultLookup: Lookup = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

function headerBytes(headers: Record<string, string>): number {
  return Object.entries(headers).reduce(
    (sum, [name, value]) => sum + name.length + value.length + 4,
    0,
  );
}

function normalizeHeaders(
  headers: Iterable<[string, string | string[] | undefined]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (value === undefined) {
      continue;
    }
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export function pinnedDispatcher(address: string, servername: string | undefined): Dispatcher {
  return new Agent({
    connect: {
      servername,
      lookup: (
        _hostname: string,
        _options: unknown,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
      ) => {
        const family = address.includes(":") ? 6 : 4;
        callback(null, address, family);
      },
    },
  });
}

function destroyBody(body: AsyncIterable<Uint8Array> | null): void {
  if (body === null) {
    return;
  }
  const stream = body as AsyncIterable<Uint8Array> & {
    destroy?: (error?: Error) => void;
    return?: (value?: undefined) => Promise<IteratorResult<Uint8Array>>;
  };
  try {
    if (typeof stream.destroy === "function") {
      stream.destroy(new Error("probe aborted"));
      return;
    }
    if (typeof stream.return === "function") {
      void stream.return(undefined).catch(() => undefined);
    }
  } catch {
    // The stream is already closed.
  }
}

function destroyDispatcher(dispatcher: Dispatcher): void {
  const closer = dispatcher as Dispatcher & {
    destroy?: (error?: Error) => void | Promise<void>;
  };
  if (typeof closer.destroy !== "function") {
    return;
  }
  try {
    const result = closer.destroy(new Error("probe finished"));
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // The dispatcher is already closed.
  }
}

async function readCapped(
  body: AsyncIterable<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (body === null) {
    return "";
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > maxBytes) {
        throw new ProbeError("response body exceeds cap");
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    destroyBody(body);
    throw error;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeResponse> {
  const lookup = options.lookup ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  let current = rawUrl;
  let method = options.method ?? "GET";
  let postBody = options.body;
  let callerHeaders = options.headers;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const classified = classifyUrl(current);
    if (!classified.ok) {
      throw new ProbeError(classified.reason);
    }
    const url = classified.url;
    let addresses: readonly string[];
    try {
      addresses = await lookup(url.hostname);
    } catch {
      throw new ProbeError("dns lookup failed");
    }
    const addressDecision = assessAll(addresses);
    if (!addressDecision.ok) {
      throw new ProbeError(addressDecision.reason);
    }
    const pinned = addresses[0];
    if (pinned === undefined) {
      throw new ProbeError("no addresses");
    }

    const dispatcher = (options.dispatcherFactory ?? pinnedDispatcher)(
      pinned,
      url.protocol === "https:" ? url.hostname : undefined,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), totalTimeoutMs);
    let upstreamBody: AsyncIterable<Uint8Array> | null = null;
    try {
      const headersToSend = {
        "user-agent": options.userAgent,
        accept: "application/json",
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...(callerHeaders ?? {}),
      };
      const response =
        options.request === undefined
          ? await undiciRequest(url, {
              method,
              dispatcher,
              signal: controller.signal,
              headersTimeout: connectTimeoutMs,
              bodyTimeout: totalTimeoutMs,
              headers: headersToSend,
              ...(method === "POST" ? { body: postBody ?? "{}" } : {}),
            }).then(
              (upstream: {
                statusCode: number;
                headers: Record<string, string | string[] | undefined>;
                body: AsyncIterable<Uint8Array>;
              }) => ({
                status: upstream.statusCode,
                headers: upstream.headers as Record<string, string | string[] | undefined>,
                body: upstream.body,
              }),
            )
          : await options.request(url, {
              method,
              dispatcher,
              signal: controller.signal,
              headers: headersToSend,
              ...(method === "POST" ? { body: postBody ?? "{}" } : {}),
            });
      upstreamBody = response.body;
      const headers = normalizeHeaders(Object.entries(response.headers));
      if (headerBytes(headers) > maxHeaderBytes) {
        throw new ProbeError("response headers exceed cap");
      }
      if (response.status >= 300 && response.status < 400) {
        const location = headers.location;
        if (location === undefined || hop === maxRedirects) {
          throw new ProbeError("redirect not allowed");
        }
        const nextUrl = new URL(location, url);
        if (nextUrl.origin !== url.origin) {
          method = "GET";
          postBody = undefined;
          callerHeaders = {};
        }
        current = nextUrl.toString();
        continue;
      }
      const body = await readCapped(response.body, maxBodyBytes);
      upstreamBody = null;
      return { url: url.toString(), status: response.status, headers, body, pinnedAddress: pinned };
    } catch (error) {
      if (error instanceof ProbeError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProbeError("timeout");
      }
      throw new ProbeError(error instanceof Error ? error.message : "request failed");
    } finally {
      clearTimeout(timer);
      destroyBody(upstreamBody);
      destroyDispatcher(dispatcher);
    }
  }

  throw new ProbeError("too many redirects");
}
