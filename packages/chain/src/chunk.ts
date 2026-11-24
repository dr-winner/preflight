export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Split `[fromBlock, toBlock]` so each chunk has `toBlock - fromBlock <= maxSpan`.
 * Forno mainnet rejects a difference above 5000. Sepolia rejects a difference above 100000.
 */
export function chunkBlockRange(
  fromBlock: bigint,
  toBlock: bigint,
  maxSpan: bigint,
): readonly BlockRange[] {
  if (maxSpan < 1n) {
    throw new Error("maxSpan must be at least 1");
  }
  if (toBlock < fromBlock) {
    throw new Error("toBlock is before fromBlock");
  }

  const chunks: BlockRange[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + maxSpan > toBlock ? toBlock : cursor + maxSpan;
    chunks.push({ fromBlock: cursor, toBlock: end });
    if (end === toBlock) {
      break;
    }
    cursor = end + 1n;
  }
  return chunks;
}
