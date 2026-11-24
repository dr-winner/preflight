import type { NetworkTable } from "@preflight/config";
import type {
  Hex,
  TextileClassification,
  TextileLog,
  TextileReader,
  TextileTransfer,
} from "@preflight/core";
import { decodeEventLog, getAddress } from "viem";
import { erc20TransferEvent, textileFillEvent } from "./abi.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FILL_TOPIC = "0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66";

function same(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function topicsOf(log: TextileLog): readonly Hex[] {
  return log.topics;
}

export function createTextileReader(options: { table: NetworkTable }): TextileReader {
  const { table } = options;
  const reactor = table.textileReactor;
  const usdt = table.usdt;
  const corridor = new Set(table.corridorTokens.map((token) => token.address.toLowerCase()));

  return {
    network: table.name,
    reactor,
    async classify(tx): Promise<TextileClassification> {
      const transfers: TextileTransfer[] = [];
      let fill: TextileClassification["fill"] = null;

      for (const log of tx.logs) {
        const topic0 = topicsOf(log)[0];
        if (topic0 === undefined) {
          continue;
        }
        if (same(topic0, TRANSFER_TOPIC) && log.topics.length >= 3) {
          const decoded = decodeEventLog({
            abi: [erc20TransferEvent],
            data: log.data,
            topics: [log.topics[0], log.topics[1], log.topics[2]] as [Hex, Hex, Hex],
          });
          if (decoded.eventName !== "Transfer") {
            continue;
          }
          transfers.push({
            token: getAddress(log.address),
            from: getAddress(decoded.args.from),
            to: getAddress(decoded.args.to),
            value: decoded.args.value,
          });
          continue;
        }
        if (same(topic0, FILL_TOPIC) && log.topics.length >= 4) {
          const decoded = decodeEventLog({
            abi: [textileFillEvent],
            data: log.data,
            topics: [log.topics[0], log.topics[1], log.topics[2], log.topics[3]] as [
              Hex,
              Hex,
              Hex,
              Hex,
            ],
          });
          if (decoded.eventName !== "Fill") {
            continue;
          }
          fill = {
            orderHash: decoded.args.orderHash,
            filler: getAddress(decoded.args.filler),
            swapper: getAddress(decoded.args.swapper),
            nonce: decoded.args.nonce,
          };
        }
      }

      const touched = transfers.filter(
        (transfer) => same(transfer.from, tx.from) || same(transfer.to, tx.from),
      );
      const corridorHit = touched.find(
        (transfer) =>
          corridor.has(transfer.token.toLowerCase()) &&
          (usdt === null || !same(transfer.token, usdt)),
      );
      const touchesUsdt = usdt !== null && touched.some((transfer) => same(transfer.token, usdt));

      return {
        hash: tx.hash,
        toReactor: reactor !== null && tx.to !== null && same(tx.to, reactor),
        success: tx.status === "success",
        from: getAddress(tx.from),
        corridorToken: corridorHit === undefined ? null : corridorHit.token,
        touchesUsdt,
        transfers,
        fill,
      };
    },
  };
}
