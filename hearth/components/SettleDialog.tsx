"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSettlementAction } from "@/app/actions";
import { Dialog } from "@/components/Dialog";
import { centsToInput, parseDollarsToCents, todayISO } from "@/lib/format";
import type { PersonRef } from "@/lib/types";

export function SettleDialog({
  groupId,
  members,
  fromId,
  toId,
  amountCents,
  onClose,
}: {
  groupId: string;
  members: PersonRef[];
  fromId: string;
  toId: string;
  amountCents: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(fromId || members[0]?.id || "");
  const [to, setTo] = useState(toId || members.find((member) => member.id !== fromId)?.id || "");
  const [amount, setAmount] = useState(amountCents ? centsToInput(amountCents) : "");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (cents === null || cents <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (from === to) {
      setError("Choose two different people.");
      return;
    }
    startTransition(async () => {
      const result = await createSettlementAction({
        groupId,
        fromPersonId: from,
        toPersonId: to,
        amountCents: cents,
        occurredOn: date,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog title="Record a payment" titleId="settle-title" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <p className="hint">Record money that actually changed hands. The group balances update as soon as you save.</p>
        <label className="field">
          <span>From</span>
          <select className="input" data-testid="settle-from" value={from} onChange={(event) => setFrom(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>To</span>
          <select className="input" data-testid="settle-to" value={to} onChange={(event) => setTo(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Amount</span>
          <input
            className="input"
            data-testid="settle-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="field">
          <span>Note, optional</span>
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={140} placeholder="Cash, transfer, covered dinner" />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" data-testid="settle-submit" disabled={pending}>
            {pending ? "Saving…" : "Save payment"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
