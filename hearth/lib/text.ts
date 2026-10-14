import { LedgerError } from "./errors";

export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function requireText(value: string, emptyMessage: string, max: number, longMessage: string): string {
  const cleaned = cleanText(value);
  if (!cleaned) throw new LedgerError(emptyMessage);
  if (cleaned.length > max) throw new LedgerError(longMessage);
  return cleaned;
}
