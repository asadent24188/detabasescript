import { personColor } from "@/lib/format";

export function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const letter = [...name.trim()][0]?.toUpperCase() || "?";
  return (
    <span
      className="avatar"
      style={{ background: personColor(id), width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
