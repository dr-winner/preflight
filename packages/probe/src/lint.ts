import type { NetworkTable } from "@preflight/config";
import type { NetworkName } from "@preflight/core";
import { getAddress, isAddress } from "viem";

export type CheckStatus = "pass" | "fail" | "warn" | "unknown";

export interface ProbeCheck {
  key: string;
  status: CheckStatus;
  evidence: Record<string, unknown>;
  hint: string;
}

export interface ProbeInput {
  url: string;
  method: "GET" | "POST";
  payTo?: string;
  expectedNetwork: NetworkName;
}

export interface Exchange {
  status: number;
  headers: Record<string, string>;
  body: string;
  tls?: { protocol: string; authorized: boolean; validTo: string } | null;
  options?: { allowHeaders: string; exposeHeaders: string; status: number } | null;
}

export interface LintContext {
  table: NetworkTable;
  facilitatorSigners: readonly string[];
  supportedAssets: readonly string[];
  facilitatorOk: boolean;
  sellerSettlements: { count: number; first: string | null; last: string | null } | null;
}

const STACK = /at .* \(.*:\d+:\d+\)|Traceback|\/node_modules\//;

function leaksSecret(body: string): boolean {
  if (/x402_[A-Za-z0-9]{16,}/.test(body)) {
    return true;
  }
  return /(?:key|secret|private)[^A-Za-z0-9].{0,40}0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{64}.{0,40}(?:key|secret|private)/i.test(
    body,
  );
}

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

function check(
  key: string,
  status: CheckStatus,
  hint: string,
  evidence: Record<string, unknown> = {},
): ProbeCheck {
  return { key, status, evidence, hint };
}

function urlsMatch(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\/+$/, "");
  return normalize(left) === normalize(right);
}

interface RequiredBody {
  x402Version?: unknown;
  resource?: { url?: unknown };
  accepts?: unknown;
  extensions?: unknown;
}

function decodeRequired(exchange: Exchange): {
  raw: unknown;
  error: string | null;
  legacy: boolean;
} {
  const encoded =
    header(exchange.headers, "payment-required") ?? header(exchange.headers, "x-payment");
  if (encoded !== undefined) {
    try {
      return {
        raw: JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
        error: null,
        legacy: false,
      };
    } catch {
      return { raw: null, error: "payment-required header is not base64 json", legacy: false };
    }
  }
  try {
    const body = JSON.parse(exchange.body) as { x402Version?: unknown };
    if (body.x402Version === 1) {
      return { raw: body, error: null, legacy: true };
    }
  } catch {
    return { raw: null, error: "missing PAYMENT-REQUIRED header", legacy: false };
  }
  return { raw: null, error: "missing PAYMENT-REQUIRED header", legacy: false };
}

export function lintExchange(
  input: ProbeInput,
  exchange: Exchange,
  context: LintContext,
): ProbeCheck[] {
  const results: ProbeCheck[] = [];
  const expectedCaip = context.table.caip2;
  const decoded = decodeRequired(exchange);
  const body = (decoded.raw ?? {}) as RequiredBody;
  const accepts = Array.isArray(body.accepts) ? body.accepts : [];
  const first = (accepts[0] ?? {}) as Record<string, unknown>;

  results.push(
    check(
      "X1",
      exchange.status === 402 ? "pass" : "fail",
      exchange.status === 402 ? "Unpaid call returned 402." : "Unpaid call must return 402.",
      { status: exchange.status },
    ),
  );

  if (decoded.legacy) {
    results.push(check("X2", "warn", "legacy v1; use @x402/* v2", { x402Version: 1 }));
  } else if (decoded.error !== null) {
    results.push(check("X2", "fail", decoded.error));
  } else {
    results.push(check("X2", "pass", "PAYMENT-REQUIRED decoded."));
  }

  const resourceUrl = typeof body.resource?.url === "string" ? body.resource.url : "";
  const shapeOk =
    body.x402Version === 2 &&
    resourceUrl !== "" &&
    accepts.length > 0 &&
    typeof first.scheme === "string" &&
    typeof first.network === "string" &&
    typeof first.amount === "string" &&
    /^\d+$/.test(first.amount) &&
    typeof first.asset === "string" &&
    typeof first.payTo === "string" &&
    typeof first.maxTimeoutSeconds === "number" &&
    typeof first.extra === "object" &&
    first.extra !== null;
  const urlWarn = resourceUrl !== "" && !urlsMatch(resourceUrl, input.url);
  results.push(
    check(
      "X3",
      shapeOk ? (urlWarn ? "warn" : "pass") : "fail",
      shapeOk
        ? urlWarn
          ? "resource.url does not match the probed URL."
          : "Payment requirements have the v2 shape."
        : "Payment requirements are missing required fields.",
      { resourceUrl },
    ),
  );

  const network = typeof first.network === "string" ? first.network : "";
  let networkStatus: CheckStatus = "fail";
  let networkHint = "Network must be eip155:42220 for a mainnet run.";
  if (network === expectedCaip) {
    networkStatus = "pass";
    networkHint = "Network matches the run.";
  } else if (network === "eip155:11142220" && input.expectedNetwork === "mainnet") {
    networkHint = "testnet doesn't count";
  } else if (network === "eip155:11142220" && input.expectedNetwork === "testnet") {
    networkStatus = "pass";
    networkHint = "Practice run accepts Sepolia.";
  }
  results.push(check("X4", networkStatus, networkHint, { network }));

  const payTo = typeof first.payTo === "string" ? first.payTo : "";
  const asset = typeof first.asset === "string" ? first.asset : "";
  const signerSet = new Set(context.facilitatorSigners.map((item) => item.toLowerCase()));
  const zero = "0x0000000000000000000000000000000000000000";
  let payStatus: CheckStatus = "fail";
  let payHint =
    "payTo must be a checksummed address that is not the zero address, the facilitator, or the asset.";
  if (isAddress(payTo) && getAddress(payTo) === payTo && payTo.toLowerCase() !== zero) {
    if (signerSet.has(payTo.toLowerCase())) {
      payHint = "payTo is the facilitator signer.";
    } else if (asset !== "" && payTo.toLowerCase() === asset.toLowerCase()) {
      payHint = "payTo is the asset contract.";
    } else if (input.payTo !== undefined && getAddress(input.payTo) !== getAddress(payTo)) {
      payHint = "PayTo you registered differs";
    } else {
      payStatus = "pass";
      payHint = "payTo is usable.";
    }
  }
  results.push(check("X5", payStatus, payHint));

  const adapters = new Set(context.table.feeCurrencyAdapters.map((item) => item.toLowerCase()));
  const supported = new Set(context.supportedAssets.map((item) => item.toLowerCase()));
  let assetStatus: CheckStatus = "fail";
  let assetHint = "Asset is not in the facilitator supported list.";
  if (adapters.has(asset.toLowerCase())) {
    assetHint = "Fee-currency adapter addresses must not be priced (10^12 error).";
  } else if (supported.has(asset.toLowerCase())) {
    assetStatus = "pass";
    assetHint = "Asset is supported.";
  }
  results.push(check("X6", assetStatus, assetHint, { asset }));

  const extra = (first.extra ?? {}) as Record<string, unknown>;
  const known = context.table.x402Assets.find(
    (item) => item.address.toLowerCase() === asset.toLowerCase(),
  );
  const domainOk =
    known !== undefined && extra.name === known.name && extra.version === known.version;
  results.push(
    check(
      "X7",
      known === undefined ? "fail" : domainOk ? "pass" : "fail",
      domainOk
        ? "EIP-712 name and version match the asset table."
        : "extra.name and extra.version must match the asset table.",
      { name: extra.name ?? null, version: extra.version ?? null },
    ),
  );

  const transfer = extra.assetTransferMethod;
  const sponsoring =
    body.extensions !== null &&
    typeof body.extensions === "object" &&
    "eip2612GasSponsoring" in body.extensions;
  const gasAssets = new Set(["wARS", "wBRL", "wMXN", "wCOP", "wPEN", "wCLP"]);
  let permitStatus: CheckStatus = "pass";
  let permitHint = "Not a permit2 asset.";
  if (known?.transfer === "permit2") {
    if (transfer !== "permit2") {
      permitStatus = "fail";
      permitHint = "extra.assetTransferMethod must be permit2.";
    } else if (gasAssets.has(known.symbol) && !sponsoring) {
      permitStatus = "fail";
      permitHint = "every fresh wallet gets 412 permit2_allowance_required";
    } else if (known.symbol === "cNGN" && sponsoring) {
      permitStatus = "fail";
      permitHint = "cNGN must not advertise eip2612GasSponsoring.";
    } else {
      permitHint = "Permit2 asset is shaped correctly.";
    }
  }
  results.push(check("X8", permitStatus, permitHint));

  const amount = typeof first.amount === "string" ? first.amount : "0";
  const amountNumber = /^\d+$/.test(amount) ? BigInt(amount) : 0n;
  const stable = known !== undefined && ["USDC", "USDT", "USAT"].includes(known.symbol);
  let amountStatus: CheckStatus = amountNumber > 0n ? "pass" : "fail";
  let amountHint = amountNumber > 0n ? "Amount is positive." : "Amount must be greater than zero.";
  if (stable && amountNumber > 1_000_000n) {
    amountStatus = "warn";
    amountHint =
      "Amount is above $1. Stock clients refuse it without spendControls.maxAmountPerPayment.";
  }
  results.push(check("X9", amountStatus, amountHint, { amount }));

  results.push(
    check(
      "X10",
      context.facilitatorOk ? "pass" : "fail",
      context.facilitatorOk
        ? "Facilitator lists the exact scheme."
        : "Facilitator /supported did not list exact for this network.",
    ),
  );

  if (context.sellerSettlements === null) {
    results.push(check("X11", "unknown", "Explorer history could not be read."));
  } else if (context.sellerSettlements.count > 0) {
    results.push(
      check("X11", "pass", "Seller has facilitator settlements.", {
        count: context.sellerSettlements.count,
        first: context.sellerSettlements.first,
        last: context.sellerSettlements.last,
      }),
    );
  } else {
    results.push(check("X11", "warn", "No facilitator settlement to this payTo was found."));
  }

  const selfGated =
    (exchange.status === 401 || exchange.status === 403) &&
    exchange.body.includes("Missing agent authentication headers");
  results.push(
    check(
      "X12",
      selfGated ? "pass" : "unknown",
      selfGated ? "Self-gated endpoint" : "No Self gate was observed on the unpaid response.",
    ),
  );

  const allowOrigin = header(exchange.headers, "access-control-allow-origin");
  const expose = header(exchange.headers, "access-control-expose-headers") ?? "";
  const allowHeaders = exchange.options?.allowHeaders ?? "";
  if (allowOrigin === undefined) {
    results.push(check("X13", "warn", "CORS headers for browser buyers are missing."));
  } else {
    const exposed =
      expose.toLowerCase().includes("payment-required") &&
      expose.toLowerCase().includes("payment-response");
    const allowed =
      allowHeaders.toLowerCase().includes("payment-signature") &&
      allowHeaders.toLowerCase().includes("x-payment");
    results.push(
      check(
        "X13",
        exposed && allowed ? "pass" : "warn",
        exposed && allowed
          ? "Browser buyers can read and send payment headers."
          : "Expose PAYMENT-REQUIRED and PAYMENT-RESPONSE, and allow PAYMENT-SIGNATURE and X-PAYMENT.",
      ),
    );
  }

  const https = input.url.startsWith("https://");
  results.push(check("S1", https ? "pass" : "fail", https ? "HTTPS." : "http is not accepted."));

  if (!https) {
    results.push(check("S2", "fail", "TLS was not checked because the URL is not https."));
  } else if (exchange.tls === undefined || exchange.tls === null) {
    results.push(check("S2", "unknown", "TLS handshake result was not available."));
  } else {
    const expires = new Date(exchange.tls.validTo).getTime();
    const soon = expires - Date.now() < 14 * 24 * 60 * 60 * 1000;
    const modern = exchange.tls.protocol === "TLSv1.2" || exchange.tls.protocol === "TLSv1.3";
    const ok = exchange.tls.authorized && modern && !soon;
    results.push(
      check(
        "S2",
        ok ? "pass" : "fail",
        ok
          ? "Certificate is valid and the protocol is at least TLS 1.2."
          : "Certificate or TLS protocol is not acceptable.",
        { protocol: exchange.tls.protocol },
      ),
    );
  }

  const hsts = header(exchange.headers, "strict-transport-security") ?? "";
  const maxAge = /max-age=(\d+)/i.exec(hsts);
  const age = maxAge?.[1] === undefined ? 0 : Number(maxAge[1]);
  results.push(
    check(
      "S3",
      age >= 15_552_000 ? "pass" : "warn",
      age >= 15_552_000
        ? "HSTS max-age is at least 180 days."
        : "Add Strict-Transport-Security with max-age >= 15552000.",
    ),
  );

  const contentType = header(exchange.headers, "content-type") ?? "";
  const nosniff =
    (header(exchange.headers, "x-content-type-options") ?? "").toLowerCase() === "nosniff";
  const powered = header(exchange.headers, "x-powered-by");
  const server = header(exchange.headers, "server") ?? "";
  const versioned = /\d/.test(server);
  const jsonType = contentType.includes("application/json") || contentType === "";
  const headersOk = nosniff && powered === undefined && !versioned && jsonType;
  results.push(
    check(
      "S4",
      headersOk ? "pass" : "warn",
      headersOk
        ? "Response headers do not leak a version."
        : "Set nosniff, drop X-Powered-By, and keep Server version-free.",
    ),
  );

  const credentials =
    (header(exchange.headers, "access-control-allow-credentials") ?? "").toLowerCase() === "true";
  const starAndCreds = allowOrigin === "*" && credentials;
  const reflected = allowOrigin === "https://preflight-probe.invalid" && credentials;
  results.push(
    check(
      "S5",
      starAndCreds || reflected ? "fail" : "pass",
      starAndCreds || reflected
        ? "CORS reflects an untrusted origin with credentials."
        : "CORS is not credentialed for an arbitrary origin.",
    ),
  );

  results.push(
    check(
      "S6",
      STACK.test(exchange.body) ? "fail" : "pass",
      STACK.test(exchange.body)
        ? "Error body contains a stack trace."
        : "Error body has no stack trace.",
    ),
  );

  results.push(
    check(
      "S7",
      leaksSecret(exchange.body) ? "fail" : "pass",
      leaksSecret(exchange.body)
        ? "Response body matches a secret pattern."
        : "No secret pattern in the body.",
      leaksSecret(exchange.body) ? { location: "body" } : {},
    ),
  );

  return results;
}
