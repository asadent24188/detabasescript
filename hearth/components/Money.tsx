import { formatCents } from "@/lib/format";

export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  const tone = cents > 0 ? "pos" : cents < 0 ? "neg" : "zero";
  const text = signed && cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
  return <span className={`money ${tone}`}>{text}</span>;
}
