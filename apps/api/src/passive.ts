import { randomUUID } from "node:crypto";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { probeTarget, type ProbeCheck } from "@preflight/probe";
import type { Context, MiddlewareHandler } from "hono";
import { getAddress } from "viem";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { PaymentStore } from "./payments.js";
import type { ReportSigner, UnsignedReport } from "./report/signer.js";

const payToSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((value) => {
    if (value === value.toLowerCase()) {
      return true;
    }
    try {
      return getAddress(value) === value;
    } catch {
      return false;
    }
  }, "payTo must be lowercase or EIP-55 checksummed");

export const passiveBodySchema = z
  .object({
    network: z.enum(["mainnet", "testnet"]).optional(),
    x402Url: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      }, "x402Url must be an http(s) URL")
      .optional(),
    x402Method: z.enum(["GET", "POST"]).optional(),
    payTo: payToSchema.optional(),
  })
  .strict();

export type PassiveBody = z.infer<typeof passiveBodySchema>;

export function validatePassiveBody(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "POST") {
      return next();
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", hint: "Body must be a JSON object." }, 400);
    }
    const parsed = passiveBodySchema.safeParse(raw);
    if (!parsed.success) {
      const hint = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return c.json({ error: "invalid_input", hint }, 400);
    }
    c.set("passiveBody", parsed.data);
    return next();
  };
}

export function passiveHandler(config: AppConfig, signer: ReportSigner) {
  return async (c: Context) => {
    const body = c.get("passiveBody") as PassiveBody | undefined;
    if (body === undefined) {
      return c.json({ error: "invalid_input", hint: "Body was not validated." }, 400);
    }
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
