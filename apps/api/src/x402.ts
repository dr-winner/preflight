import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/hono";
import type { MiddlewareHandler } from "hono";
import type { AppConfig } from "./config.js";

export function passivePayment(
  config: AppConfig,
  syncFacilitatorOnStart: boolean,
): MiddlewareHandler {
  const payTo = config.sellerPayTo;
  const apiKey = config.x402ApiKey;
  if (payTo === undefined || apiKey === undefined) {
    throw new Error("SELLER_PAY_TO and X402_API_KEY are required to mount x402");
  }
  const asset = config.network.table.x402Assets.find(
    (item) => item.symbol === "USDC" && item.transfer === "eip3009",
  );
  if (asset === undefined) {
    throw new Error("the selected network has no eip3009 USDC asset");
  }

  const headers = { "X-API-Key": apiKey };
  const facilitator = new HTTPFacilitatorClient({
    url: config.network.table.facilitatorUrl,
    createAuthHeaders: async () => ({ verify: headers, settle: headers, supported: headers }),
  });
  const server = new x402ResourceServer(facilitator).register("eip155:*", new ExactEvmScheme());
  return paymentMiddleware(
    {
      "POST /v1/preflight/passive": {
        accepts: {
          scheme: "exact",
          network: config.network.table.caip2,
          payTo,
          price: {
            asset: asset.address,
            amount: config.pricePassiveAtomic,
            extra: { name: asset.name, version: asset.version },
          },
          maxTimeoutSeconds: 60,
        },
        description: "Passive preflight check",
        mimeType: "application/json",
      },
    },
    server,
    undefined,
    undefined,
    syncFacilitatorOnStart,
  );
}
