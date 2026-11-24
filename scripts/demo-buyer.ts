import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celoSepolia } from "viem/chains";

const key = process.env.DEMO_BUYER_PRIVATE_KEY;
const url = process.env.PREFLIGHT_URL ?? "http://127.0.0.1:3001/v1/preflight/passive";
const rpc = process.env.CELO_SEPOLIA_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";

if (key === undefined || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set DEMO_BUYER_PRIVATE_KEY to a throwaway Celo Sepolia key. Do not commit it.");
  process.exit(1);
}

const account = privateKeyToAccount(key as `0x${string}`);
const publicClient = createPublicClient({ chain: celoSepolia, transport: http(rpc) });
const client = new x402Client().register(
  "eip155:11142220",
  new ExactEvmScheme(toClientEvmSigner(account, publicClient)),
);
const paidFetch = wrapFetchWithPayment(fetch, client);

const response = await paidFetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ network: "testnet" }),
});
const payment =
  response.headers.get("payment-response") ?? response.headers.get("x-payment-response");
const body = await response.text();
console.log(JSON.stringify({ status: response.status, paymentResponse: payment, body }, null, 2));
if (!response.ok) {
  process.exit(1);
}
