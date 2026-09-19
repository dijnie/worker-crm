import { ServiceError } from "./service-error";

export function decimalToCents(value: string): number {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new ServiceError(400, "Amount must be a decimal string with at most two fractional digits", "AMOUNT_INVALID");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const cents = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) * BigInt(negative ? -1 : 1);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new ServiceError(400, "Amount exceeds the supported range", "AMOUNT_OUT_OF_RANGE");
  }
  return Number(cents);
}

export function centsToDecimal(value: number | bigint): string {
  const cents = BigInt(value);
  const magnitude = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`;
}

export function serializeDeal<T extends { amount: number | null }>(deal: T): Omit<T, "amount"> & { amount: string | null } {
  return { ...deal, amount: deal.amount === null ? null : centsToDecimal(deal.amount) };
}
