import { randomUUID } from "node:crypto";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { probeTarget, type ProbeCheck } from "@preflight/probe";
import type { Context } from "hono";
import type { AppConfig } from "./config.js";
import type { PaymentStore } from "./payments.js";
import type { ReportSigner, UnsignedReport } from "./report/signer.js";

export interface PassiveBody {
  network?: "mainnet" | "testnet";
  x402Url?: string;
  x402Method?: "GET" | "POST";
  payTo?: string;
}

function asBody(value: unknown): PassiveBody {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ...(record.network === "mainnet" || record.network === "testnet"
      ? { network: record.network }
      : {}),
    ...(typeof record.x402Url === "string" ? { x402Url: record.x402Url } : {}),
    ...(record.x402Method === "GET" || record.x402Method === "POST"
      ? { x402Method: record.x402Method }
      : {}),
    ...(typeof record.payTo === "string" ? { payTo: record.payTo } : {}),
  };
}

export function passiveHandler(config: AppConfig, signer: ReportSigner) {
  return async (c: Context) => {
    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      parsed = {};
    }
    const body = asBody(parsed);
    const results: ProbeCheck[] =
      body.x402Url === undefined
        ? []
        : await probeTarget(
            {
              url: body.x402Url,
              method: body.x402Method ?? "GET",
              ...(body.payTo === undefined ? {} : { payTo: body.payTo }),
              expectedNetwork: body.network ?? config.network.network,
            },
            {
              table: config.network.table,
              userAgent: `PreflightBot/1.0 (+${config.publicBaseUrl}/bot)`,
            },
          );

    const unsigned: UnsignedReport = {
      reportId: randomUUID(),
      version: 1,
      network: body.network ?? config.network.network,
      generatedAt: new Date().toISOString(),
      input: { ...body },
      results,
      disclaimer:
        "Heuristic pre-check; organisers decide eligibility. Chain checks arrive with packages/checks.",
    };
    return c.json(await signer.sign(unsigned));
  };
}

export async function rememberPayment(
  header: string | undefined,
  store: PaymentStore,
  payTo: string,
): Promise<void> {
  if (header === undefined || header === "") {
    return;
  }
  const decoded = decodePaymentResponseHeader(header) as {
    success?: boolean;
    transaction?: string;
    payer?: string;
    network?: string;
    amount?: string;
  };
  if (decoded.success !== true || typeof decoded.transaction !== "string") {
    return;
  }
  await store.save({
    txHash: decoded.transaction,
    payer: decoded.payer ?? null,
    network: decoded.network ?? "",
    asset: null,
    amount: decoded.amount ?? null,
    payTo,
    settledAt: new Date().toISOString(),
  });
}
