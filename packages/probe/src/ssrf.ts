import ipaddr from "ipaddr.js";

const ALLOWED_PORTS = new Set([80, 443, 8443]);

export type UrlDecision = { ok: true; url: URL } | { ok: false; reason: string };

export type AddressDecision = { ok: true } | { ok: false; reason: string };

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

function isDecimalIp(hostname: string): boolean {
  if (!/^\d+$/.test(hostname)) {
    return false;
  }
  const value = Number(hostname);
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function isEncodedQuad(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return false;
  }
  if (!parts.every((part) => /^(0x[0-9a-f]+|\d+)$/i.test(part))) {
    return false;
  }
  return parts.some(
    (part) =>
      part.startsWith("0x") || part.startsWith("0X") || (part.length > 1 && part.startsWith("0")),
  );
}

export function classifyUrl(raw: string): UrlDecision {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable url" };
  }

  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "userinfo" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `scheme ${url.protocol}` };
  }

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, reason: `port ${port}` };
  }

  const host = hostnameOf(url).toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return { ok: false, reason: `blocked hostname ${host}` };
  }
  if (isDecimalIp(host)) {
    return { ok: false, reason: "decimal ip" };
  }
  if (isEncodedQuad(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return { ok: false, reason: "encoded ip" };
  }
  if (ipaddr.isValid(host)) {
    return { ok: false, reason: "raw ip" };
  }

  return { ok: true, url };
}

function blockedV4(address: ipaddr.IPv4): string | null {
  const ranges: ReadonlyArray<readonly [string, number, string]> = [
    ["0.0.0.0", 8, "this-network"],
    ["10.0.0.0", 8, "private"],
    ["100.64.0.0", 10, "cgnat"],
    ["127.0.0.0", 8, "loopback"],
    ["169.254.0.0", 16, "link-local"],
    ["172.16.0.0", 12, "private"],
    ["192.0.0.0", 24, "ietf-protocol"],
    ["192.0.2.0", 24, "documentation"],
    ["192.88.99.0", 24, "6to4-relay"],
    ["192.168.0.0", 16, "private"],
    ["198.18.0.0", 15, "benchmark"],
    ["198.51.100.0", 24, "documentation"],
    ["203.0.113.0", 24, "documentation"],
    ["224.0.0.0", 4, "multicast"],
    ["240.0.0.0", 4, "reserved"],
  ];
  for (const [base, bits, name] of ranges) {
    if (address.match(ipaddr.IPv4.parse(base), bits)) {
      return name;
    }
  }
  if (address.toString() === "255.255.255.255") {
    return "broadcast";
  }
  return null;
}

export function assessAddress(ip: string): AddressDecision {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return { ok: false, reason: "unparseable address" };
  }

  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return assessAddress(v6.toIPv4Address().toString());
    }
    if (v6.match(ipaddr.IPv6.parse("64:ff9b::"), 96)) {
      return { ok: false, reason: "nat64" };
    }
    if (v6.match(ipaddr.IPv6.parse("100::"), 64)) {
      return { ok: false, reason: "discard" };
    }
    const range = v6.range();
    if (range !== "unicast") {
      return { ok: false, reason: `ipv6 ${range}` };
    }
    return { ok: true };
  }

  const v4 = parsed as ipaddr.IPv4;
  const explicit = blockedV4(v4);
  if (explicit !== null) {
    return { ok: false, reason: explicit };
  }
  const range = v4.range();
  if (range !== "unicast") {
    return { ok: false, reason: `ipv4 ${range}` };
  }
  return { ok: true };
}

export function assessAll(addresses: readonly string[]): AddressDecision {
  if (addresses.length === 0) {
    return { ok: false, reason: "no addresses" };
  }
  for (const address of addresses) {
    const decision = assessAddress(address);
    if (!decision.ok) {
      return decision;
    }
  }
  return { ok: true };
}
