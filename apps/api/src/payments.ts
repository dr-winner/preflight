/**
 * In-memory stand-in for the `payments` table in unit 3's Drizzle schema.
 * `packages/db` should implement this interface. This module does not migrate Postgres.
 */
export interface PaymentRecord {
  txHash: string;
  payer: string | null;
  network: string;
  asset: string | null;
  amount: string | null;
  payTo: string | null;
  settledAt: string;
}

export interface PaymentStore {
  save(record: PaymentRecord): Promise<void>;
  get(txHash: string): Promise<PaymentRecord | null>;
}

export function createMemoryPaymentStore(): PaymentStore {
  const rows = new Map<string, PaymentRecord>();
  return {
    async save(record) {
      rows.set(record.txHash.toLowerCase(), record);
    },
    async get(txHash) {
      return rows.get(txHash.toLowerCase()) ?? null;
    },
  };
}
