import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { assessAddress, classifyUrl } from "./ssrf.js";
import { ProbeError, safeFetch, type UpstreamResponse } from "./fetch.js";

const blockedUrls = [
  ["userinfo", "https://user:pass@example.com/"],
  ["file scheme", "file:///etc/passwd"],
  ["ftp scheme", "ftp://example.com/"],
  ["javascript scheme", "javascript:alert(1)"],
  ["ssh port", "https://example.com:22/"],
  ["localhost", "http://localhost/"],
  ["localhost subdomain", "http://foo.localhost/"],
  ["local tld", "http://printer.local/"],
  ["internal tld", "http://db.internal/"],
  ["metadata hostname", "http://metadata.google.internal/"],
  ["raw ipv4", "http://1.2.3.4/"],
  ["raw loopback", "http://127.0.0.1/"],
  ["decimal ip", "http://2130706433/"],
  ["octal ip", "http://0177.0.0.1/"],
  ["hex ip", "http://0x7f.0.0.1/"],
  ["ipv6 loopback", "http://[::1]/"],
] as const;

const blockedAddresses = [
  ["private 10", "10.1.2.3"],
  ["private 172", "172.16.0.1"],
  ["private 192.168", "192.168.1.1"],
  ["loopback", "127.0.0.1"],
  ["link-local metadata", "169.254.169.254"],
  ["cgnat", "100.64.0.1"],
  ["this-network", "0.1.2.3"],
  ["documentation", "192.0.2.1"],
  ["documentation 198", "198.51.100.1"],
  ["documentation 203", "203.0.113.1"],
  ["ietf", "192.0.0.1"],
  ["6to4", "192.88.99.1"],
  ["benchmark", "198.18.0.1"],
  ["multicast", "224.0.0.1"],
  ["broadcast", "255.255.255.255"],
  ["ipv6 loopback", "::1"],
  ["ipv6 ula", "fc00::1"],
  ["ipv6 link-local", "fe80::1"],
  ["ipv6 documentation", "2001:db8::1"],
  ["ipv6 discard", "100::1"],
  ["nat64", "64:ff9b::192.0.2.1"],
  ["ipv4-mapped loopback", "::ffff:127.0.0.1"],
  ["ipv4-mapped metadata", "::ffff:169.254.169.254"],
] as const;

describe("SSRF guards", () => {
  it("covers at least 25 blocked urls and addresses", () => {
    expect(blockedUrls.length + blockedAddresses.length).toBeGreaterThanOrEqual(25);
  });

  it.each(blockedUrls)("rejects %s", (_name, value) => {
    expect(classifyUrl(value).ok).toBe(false);
  });

  it.each(blockedAddresses)("rejects %s", (_name, value) => {
    expect(assessAddress(value).ok).toBe(false);
  });

  it("accepts a public unicast address", () => {
    expect(assessAddress("1.1.1.1").ok).toBe(true);
    expect(assessAddress("2606:4700:4700::1111").ok).toBe(true);
  });

  it("rejects a lookup that mixes a public address with a private one", async () => {
    await expect(
      safeFetch("https://example.com/paid", {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
        lookup: async () => ["1.1.1.1", "10.0.0.1"],
      }),
    ).rejects.toThrow(/private/);
  });

  it("does not connect to a raw loopback listener", async () => {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      res.end("nope");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    await expect(
      safeFetch(`http://127.0.0.1:${port}/`, {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
      }),
    ).rejects.toBeInstanceOf(ProbeError);
    expect(hits).toBe(0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("stops a redirect onto a metadata address", async () => {
    let hops = 0;
    await expect(
      safeFetch("https://example.com/start", {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
        lookup: async () => ["1.1.1.1"],
        request: async () => {
          hops += 1;
          const response: UpstreamResponse = {
            status: 302,
            headers: { location: "http://169.254.169.254/computeMetadata/v1/" },
            body: null,
          };
          return response;
        },
      }),
    ).rejects.toThrow(/raw ip|link-local/);
    expect(hops).toBe(1);
  });

  it("aborts a slow response", async () => {
    await expect(
      safeFetch("https://example.com/slow", {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
        totalTimeoutMs: 30,
        lookup: async () => ["1.1.1.1"],
        request: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      }),
    ).rejects.toThrow(/timeout/);
  });

  it("rejects an oversized body", async () => {
    await expect(
      safeFetch("https://example.com/big", {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
        maxBodyBytes: 8,
        lookup: async () => ["1.1.1.1"],
        request: async () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: (async function* () {
            yield new TextEncoder().encode("0123456789abcdef");
          })(),
        }),
      }),
    ).rejects.toThrow(/body exceeds cap/);
  });

  it("returns while a redirect body is still streaming", async () => {
    let pulled = 0;
    const started = Date.now();
    const response = await safeFetch("https://example.com/redirect", {
      userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
      totalTimeoutMs: 500,
      lookup: async () => ["1.1.1.1"],
      request: async (url) => {
        if (url.hostname === "example.com") {
          return {
            status: 302,
            headers: { location: "https://other.example/next" },
            body: (async function* () {
              yield new Uint8Array(0);
              pulled += 1;
              await new Promise(() => undefined);
            })(),
          };
        }
        return { status: 204, headers: {}, body: null };
      },
    });
    expect(response.status).toBe(204);
    expect(Date.now() - started).toBeLessThan(500);
    expect(pulled).toBe(0);
  });

  it("returns while an oversized body keeps streaming", async () => {
    let yielded = 0;
    const started = Date.now();
    await expect(
      safeFetch("https://example.com/stream", {
        userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
        maxBodyBytes: 8,
        totalTimeoutMs: 500,
        lookup: async () => ["1.1.1.1"],
        request: async () => ({
          status: 200,
          headers: {},
          body: (async function* () {
            while (true) {
              yielded += 1;
              yield new Uint8Array(64);
              await new Promise(() => undefined);
            }
          })(),
        }),
      }),
    ).rejects.toThrow(/body exceeds cap/);
    expect(Date.now() - started).toBeLessThan(500);
    expect(yielded).toBe(1);
  });

  it("does not forward a POST body or caller headers across origins", async () => {
    const seen: { method: string; body?: string; caller?: string }[] = [];
    const response = await safeFetch("https://example.com/start", {
      method: "POST",
      body: '{"secret":true}',
      headers: { "x-caller": "1" },
      userAgent: "PreflightBot/1.0 (+https://preflight.example/bot)",
      lookup: async () => ["1.1.1.1"],
      request: async (url, init) => {
        seen.push({
          method: init.method,
          ...(init.body === undefined ? {} : { body: init.body }),
          ...(init.headers["x-caller"] === undefined ? {} : { caller: init.headers["x-caller"] }),
        });
        if (url.hostname === "example.com") {
          return {
            status: 302,
            headers: { location: "https://other.example/next" },
            body: null,
          };
        }
        return { status: 200, headers: { "content-type": "application/json" }, body: null };
      },
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.body).toBe('{"secret":true}');
    expect(seen[0]?.caller).toBe("1");
    expect(seen[1]?.method).toBe("GET");
    expect(seen[1]?.body).toBeUndefined();
    expect(seen[1]?.caller).toBeUndefined();
  });
});
