const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const PALETTE = ["#9a3b1e", "#1f6b4a", "#2c4c7c", "#6b4c7a", "#8a5a12", "#8f3140", "#0f6f78", "#4e5d28"];

export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

export function formatSignedCents(cents: number): string {
  if (cents > 0) return `+${formatCents(cents)}`;
  return formatCents(cents);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function parseDecimalToHundredths(input: string): number | null {
  const cleaned = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(hundredths)) return null;
  return hundredths;
}

export function formatHundredths(hundredths: number): string {
  const sign = hundredths < 0 ? "-" : "";
  const abs = Math.abs(hundredths);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function formatDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  if (!year || !month || !date) return iso;
  return day.format(new Date(Date.UTC(year, month - 1, date)));
}

export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function personColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function balancePhrase(name: string, cents: number, you = false): string {
  const amount = formatCents(Math.abs(cents));
  if (cents === 0) return you ? "You're settled up" : `${name} is settled`;
  if (cents > 0) return you ? `You're owed ${amount}` : `${name} is owed ${amount}`;
  return you ? `You owe ${amount}` : `${name} owes ${amount}`;
}
