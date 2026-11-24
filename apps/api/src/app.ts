import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppConfig } from "./config.js";
import { passiveHandler, rememberPayment, validatePassiveBody } from "./passive.js";
import { createMemoryPaymentStore, type PaymentStore } from "./payments.js";
import { createEip191ReportSigner, type ReportSigner } from "./report/signer.js";
import { passivePayment } from "./x402.js";

export interface AppDeps {
  signer?: ReportSigner;
  payments?: PaymentStore;
  syncFacilitatorOnStart?: boolean;
}

export function createApp(config: AppConfig, deps: AppDeps = {}): Hono {
  const app = new Hono();
  const payments = deps.payments ?? createMemoryPaymentStore();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/v1/info", (c) =>
    c.json({
      network: config.network.network,
      chainId: config.network.table.chainId,
      caip2: config.network.table.caip2,
      facilitator: config.network.table.facilitatorUrl,
      pricePassiveAtomic: config.pricePassiveAtomic,
      payTo: config.sellerPayTo ?? null,
      reportSigner: deps.signer?.address ?? null,
    }),
  );

  app.get("/v1/payments/:tx", async (c) => {
    const record = await payments.get(c.req.param("tx"));
    if (record === null) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json(record);
  });

  app.use(
    "/v1/preflight/*",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) =>
        c.json({ error: "body_too_large", hint: "Request body must be at most 16 KB." }, 413),
    }),
  );
  app.use("/v1/preflight/passive", validatePassiveBody());

  const ready =
    config.sellerPayTo !== undefined &&
    config.x402ApiKey !== undefined &&
    deps.signer !== undefined;
  if (!ready || deps.signer === undefined || config.sellerPayTo === undefined) {
    app.post("/v1/preflight/passive", (c) =>
      c.json(
        {
          error: "x402_not_configured",
          hint: "Set SELLER_PAY_TO, X402_API_KEY, and REPORT_SIGNER_PRIVATE_KEY.",
        },
        503,
      ),
    );
    return app;
  }

  const signer = deps.signer;
  const payTo = config.sellerPayTo;
  app.use("/v1/preflight/passive", async (c, next) => {
    await next();
    const encoded =
      c.res.headers.get("payment-response") ?? c.res.headers.get("x-payment-response") ?? undefined;
    await rememberPayment(encoded, payments, payTo);
  });
  app.post(
    "/v1/preflight/passive",
    passivePayment(config, deps.syncFacilitatorOnStart ?? false),
    passiveHandler(config, signer),
  );
  return app;
}

export function signerFromConfig(config: AppConfig): ReportSigner | undefined {
  if (config.reportSignerPrivateKey === undefined) {
    return undefined;
  }
  return createEip191ReportSigner(config.reportSignerPrivateKey);
}
