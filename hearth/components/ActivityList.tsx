"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteExpenseAction, deleteSettlementAction } from "@/app/actions";
import { formatCents, formatDay, todayISO } from "@/lib/format";
import type { ActivityItem, ShareRow, SplitMode } from "@/lib/types";

const splitLabels: Record<SplitMode, string> = {
  equal: "Split equally",
  percent: "Split by percent",
  shares: "Split by shares",
  exact: "Split by exact amounts",
};

function payersPhrase(payers: ShareRow[] = []): string {
  if (payers.length === 0) return "Someone paid";
  return payers.map((payer) => `${payer.name} paid ${formatCents(payer.amountCents)}`).join(", ");
}

function sharesPhrase(item: ActivityItem): string {
  const label = splitLabels[item.splitMode ?? "equal"];
  const shares = item.shares ?? [];
  if (shares.length === 0) return label;
  return `${label}: ${shares.map((share) => `${share.name} ${formatCents(share.amountCents)}`).join(", ")}`;
}

function groupDays(items: ActivityItem[]) {
  const days: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last?.day === item.occurredOn) last.items.push(item);
    else days.push({ day: item.occurredOn, items: [item] });
  }
  return days;
}

export function ActivityList({ items, showGroup = false }: { items: ActivityItem[]; showGroup?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(item: ActivityItem) {
    const label = item.kind === "expense" ? item.description : "this payment";
    if (!window.confirm(`Remove ${label}? Balances will update.`)) return;
    setPendingId(item.id);
    startTransition(async () => {
      const result = item.kind === "expense" ? await deleteExpenseAction(item.id) : await deleteSettlementAction(item.id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="empty">Expenses and payments will show up here.</p>;
  }

  const today = todayISO();

  return (
    <div className="timeline" data-testid="activity-list">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {groupDays(items).map((group) => (
        <section key={group.day}>
          <h3 className="day-label">{group.day === today ? "Today" : formatDay(group.day)}</h3>
          <ul className="event-list">
            {group.items.map((item) => (
              <li key={item.id} className="event">
                <span
                  className="event-mark"
                  style={{ background: item.kind === "expense" ? item.categoryTint : "#2a211b" }}
                  aria-hidden="true"
                >
                  {item.kind === "expense" ? item.categoryName?.slice(0, 1) : "$"}
                </span>
                <div className="event-body">
                  {item.kind === "expense" ? (
                    <>
                      <p className="event-title">{item.description}</p>
                      <p className="event-meta">
                        {payersPhrase(item.payers)}
                        {item.categoryName ? ` · ${item.categoryName}` : ""}
                      </p>
                      <p className="event-meta">{sharesPhrase(item)}</p>
                    </>
                  ) : (
                    <>
                      <p className="event-title">
                        {item.fromName} paid {item.toName}
                      </p>
                      <p className="event-meta">Settlement{item.note ? ` · ${item.note}` : ""}</p>
                    </>
                  )}
                  {showGroup ? (
                    <p className="event-meta">
                      <Link href={`/groups/${item.groupId}`}>{item.groupName}</Link>
                    </p>
                  ) : null}
                </div>
                <div className="event-side">
                  <span className="money">{formatCents(item.amountCents)}</span>
                  <button type="button" className="btn ghost tiny" disabled={pendingId === item.id} onClick={() => remove(item)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
