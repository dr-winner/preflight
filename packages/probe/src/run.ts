import type { NetworkTable } from "@preflight/config";
import { safeFetch, type Lookup } from "./fetch.js";
import { lintExchange, type Exchange, type ProbeCheck, type ProbeInput } from "./lint.js";

export async function probeTarget(
  input: ProbeInput,
  options: {
    table: NetworkTable;
    userAgent: string;
    lookup?: Lookup;
    fetchImpl?: typeof fetch;
  },
): Promise<ProbeCheck[]> {
  const doFetch = options.fetchImpl ?? fetch;
  let facilitatorOk = false;
  let signers: string[] = [];
  let supportedAssets: string[] = [];
  try {
    const supported = await doFetch(`${options.table.facilitatorUrl}/supported`);
    if (supported.ok) {
      const body = (await supported.json()) as {
        kinds?: {
          scheme?: string;
          network?: string;
          extra?: { supportedAssets?: { asset?: string }[] };
        }[];
        signers?: Record<string, string[]>;
      };
      const kind = body.kinds?.find(
        (item) => item.scheme === "exact" && item.network === options.table.caip2,
      );
      facilitatorOk = kind !== undefined;
      signers = body.signers?.[options.table.caip2] ?? [];
      supportedAssets =
        kind?.extra?.supportedAssets?.flatMap((asset) => (asset.asset ? [asset.asset] : [])) ?? [];
    }
  } catch {
    facilitatorOk = false;
  }
  if (supportedAssets.length === 0) {
    supportedAssets = options.table.x402Assets.map((asset) => asset.address);
  }

  try {
    const response = await safeFetch(input.url, {
      method: input.method,
      userAgent: options.userAgent,
      ...(options.lookup === undefined ? {} : { lookup: options.lookup }),
    });
    const exchange: Exchange = {
      status: response.status,
      headers: response.headers,
      body: response.body,
    };
    return lintExchange(input, exchange, {
      table: options.table,
      facilitatorSigners: signers,
      supportedAssets,
      facilitatorOk,
      sellerSettlements: null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "probe failed";
    return [
      {
        key: "probe.blocked",
        status: "fail",
        evidence: { reason },
        hint: "Provide a public https hostname. Preflight will not probe private or raw-IP hosts.",
      },
    ];
  }
}
