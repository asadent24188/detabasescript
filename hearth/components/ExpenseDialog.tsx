"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createExpenseAction } from "@/app/actions";
import { Dialog } from "@/components/Dialog";
import { allocateByWeights, computeShares } from "@/lib/allocate";
import {
  centsToInput,
  formatCents,
  formatHundredths,
  parseDecimalToHundredths,
  parseDollarsToCents,
  todayISO,
} from "@/lib/format";
import type { Category, ExpenseInput, PersonRef, SplitMode } from "@/lib/types";

const modes: { id: SplitMode; label: string; help: string }[] = [
  {
    id: "equal",
    label: "Equally",
    help: "Everyone selected owes the same share. Any extra cents go to the first people in the list.",
  },
  { id: "percent", label: "Percent", help: "Enter percents that add up to 100." },
  { id: "shares", label: "Shares", help: "Someone with 2 shares owes twice what someone with 1 share owes." },
  { id: "exact", label: "Exact", help: "Type what each person owes. The amounts must match the total." },
];

function evenPercents(ids: string[]): Record<string, string> {
  if (ids.length === 0) return {};
  const amounts = allocateByWeights(10_000, ids.map(() => 1));
  return Object.fromEntries(ids.map((id, index) => [id, formatHundredths(amounts[index])]));
}

function evenExacts(ids: string[], total: number): Record<string, string> {
  if (ids.length === 0 || total <= 0) return Object.fromEntries(ids.map((id) => [id, ""]));
  const amounts = allocateByWeights(total, ids.map(() => 1));
  return Object.fromEntries(ids.map((id, index) => [id, centsToInput(amounts[index])]));
}

export function ExpenseDialog({
  groupId,
  members,
  categories,
  meId,
  onClose,
}: {
  groupId: string;
  members: PersonRef[];
  categories: Category[];
  meId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = members.map((member) => member.id);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "other");
  const [date, setDate] = useState(todayISO);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [included, setIncluded] = useState<Record<string, boolean>>(() => Object.fromEntries(ids.map((id) => [id, true])));
  const [percentText, setPercentText] = useState<Record<string, string>>(() => evenPercents(ids));
  const [shareText, setShareText] = useState<Record<string, string>>(() => Object.fromEntries(ids.map((id) => [id, "1"])));
  const [exactText, setExactText] = useState<Record<string, string>>(() => evenExacts(ids, 0));
  const [splitTouched, setSplitTouched] = useState(false);
  const [multi, setMulti] = useState(false);
  const [singlePayerId, setSinglePayerId] = useState(members.find((member) => member.id === meId)?.id ?? ids[0] ?? "");
  const [payerRows, setPayerRows] = useState<{ key: string; personId: string; amount: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountCents = parseDollarsToCents(amount);
  const selectedIds = members.filter((member) => included[member.id]).map((member) => member.id);

  function nameOf(personId: string) {
    return members.find((member) => member.id === personId)?.name ?? "Someone";
  }

  function rebalance(mode: SplitMode, nextIds: string[], nextAmount = amount) {
    if (mode === "percent") setPercentText(evenPercents(nextIds));
    if (mode === "shares") setShareText(Object.fromEntries(nextIds.map((id) => [id, "1"])));
    if (mode === "exact") setExactText(evenExacts(nextIds, parseDollarsToCents(nextAmount) ?? 0));
  }

  function onAmountChange(value: string) {
    setAmount(value);
    if (splitMode === "exact" && !splitTouched) {
      setExactText(evenExacts(selectedIds, parseDollarsToCents(value) ?? 0));
    }
  }

  function switchMode(mode: SplitMode) {
    setSplitMode(mode);
    setSplitTouched(false);
    rebalance(mode, selectedIds);
  }

  function togglePerson(personId: string) {
    const nextIncluded = { ...included, [personId]: !included[personId] };
    setIncluded(nextIncluded);
    const nextIds = members.filter((member) => nextIncluded[member.id]).map((member) => member.id);
    if (!splitTouched) {
      rebalance(splitMode, nextIds);
      return;
    }
    if (nextIncluded[personId]) {
      if (splitMode === "percent" && !percentText[personId]) {
        setPercentText((current) => ({ ...current, [personId]: "0.00" }));
      }
      if (splitMode === "shares" && !shareText[personId]) {
        setShareText((current) => ({ ...current, [personId]: "1" }));
      }
      if (splitMode === "exact" && !exactText[personId]) {
        setExactText((current) => ({ ...current, [personId]: "0.00" }));
      }
    }
  }

  function enableMulti() {
    const others = members.filter((member) => member.id !== singlePayerId);
    if (others.length === 0 || amountCents === null || amountCents <= 0) return;
    const first = Math.floor(amountCents / 2);
    setPayerRows([
      { key: crypto.randomUUID(), personId: singlePayerId, amount: centsToInput(first) },
      { key: crypto.randomUUID(), personId: others[0].id, amount: centsToInput(amountCents - first) },
    ]);
    setMulti(true);
  }

  function splitPayersEvenly() {
    if (amountCents === null || amountCents <= 0 || payerRows.length === 0) return;
    const amounts = allocateByWeights(amountCents, payerRows.map(() => 1));
    setPayerRows(payerRows.map((row, index) => ({ ...row, amount: centsToInput(amounts[index]) })));
  }

  function addPayer() {
    const used = new Set(payerRows.map((row) => row.personId));
    const next = members.find((member) => !used.has(member.id));
    if (!next) return;
    const assigned = payerRows.reduce((total, row) => total + (parseDollarsToCents(row.amount) ?? 0), 0);
    const remaining = amountCents === null ? 0 : Math.max(0, amountCents - assigned);
    setPayerRows([...payerRows, { key: crypto.randomUUID(), personId: next.id, amount: remaining ? centsToInput(remaining) : "" }]);
  }

  const draft = buildDraft();

  function buildDraft(): { error: string | null; payload: ExpenseInput | null; shares: { personId: string; amountCents: number }[] } {
    if (amountCents === null || amountCents <= 0) {
      return { error: amount.trim() ? "Enter an amount like 42.50." : "Enter the total to split.", payload: null, shares: [] };
    }
    if (!description.trim()) {
      return { error: "Add a short description.", payload: null, shares: [] };
    }
    if (!date) return { error: "Choose a date.", payload: null, shares: [] };

    let payers: ExpenseInput["payers"] = [];
    if (!multi) {
      if (!singlePayerId) return { error: "Say who paid.", payload: null, shares: [] };
      payers = [{ personId: singlePayerId, amountCents }];
    } else {
      if (payerRows.length < 2) return { error: "Add at least two payers, or switch back to one.", payload: null, shares: [] };
      let paid = 0;
      const seen = new Set<string>();
      for (const row of payerRows) {
        if (seen.has(row.personId)) return { error: "Each payer can only be listed once.", payload: null, shares: [] };
        seen.add(row.personId);
        const cents = parseDollarsToCents(row.amount);
        if (cents === null || cents <= 0) {
          return { error: `Enter the amount ${nameOf(row.personId)} paid.`, payload: null, shares: [] };
        }
        payers.push({ personId: row.personId, amountCents: cents });
        paid += cents;
      }
      if (paid !== amountCents) {
        return {
          error: `Payers add up to ${formatCents(paid)}, but the expense is ${formatCents(amountCents)}.`,
          payload: null,
          shares: [],
        };
      }
    }

    const participants: ExpenseInput["participants"] = [];
    for (const personId of selectedIds) {
      if (splitMode === "equal") {
        participants.push({ personId, weight: 1 });
        continue;
      }
      const raw = splitMode === "percent" ? percentText[personId] : splitMode === "shares" ? shareText[personId] : exactText[personId];
      const parsed = splitMode === "exact" ? parseDollarsToCents(raw ?? "") : parseDecimalToHundredths(raw ?? "");
      if (parsed === null) {
        const kind = splitMode === "percent" ? "percent" : splitMode === "shares" ? "share" : "amount";
        return { error: `Enter a ${kind} for ${nameOf(personId)}.`, payload: null, shares: [] };
      }
      participants.push({ personId, weight: parsed });
    }

    try {
      const shares = computeShares(splitMode, amountCents, participants);
      return {
        error: null,
        shares,
        payload: {
          groupId,
          description,
          amountCents,
          categoryId,
          occurredOn: date,
          splitMode,
          payers,
          participants,
        },
      };
    } catch (caught) {
      return { error: caught instanceof Error ? caught.message : "That split doesn't add up.", payload: null, shares: [] };
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.payload) {
      setError(draft.error);
      return;
    }
    const payload = draft.payload;
    startTransition(async () => {
      const result = await createExpenseAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const shownError = error ?? draft.error;
  const payerAssigned = payerRows.reduce((total, row) => total + (parseDollarsToCents(row.amount) ?? 0), 0);

  return (
    <Dialog title="Add expense" titleId="expense-title" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label className="amount-field">
          <span>Amount</span>
          <span className="amount-wrap">
            <span className="currency" aria-hidden="true">
              $
            </span>
            <input
              className="amount-input"
              data-testid="expense-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              autoFocus
            />
          </span>
        </label>

        <label className="field">
          <span>Description</span>
          <input
            className="input"
            data-testid="expense-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner, groceries, cabin deposit"
            maxLength={80}
          />
        </label>

        <div className="field">
          <span>Category</span>
          <div className="categories">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={category.id === categoryId ? "cat on" : "cat"}
                aria-pressed={category.id === categoryId}
                onClick={() => setCategoryId(category.id)}
              >
                <span className="cat-dot" style={{ background: category.tint }} />
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Date</span>
          <input className="input date-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <fieldset className="field">
          <legend>Paid by</legend>
          {!multi ? (
            <div className="payer-single">
              <select className="input" aria-label="Who paid" value={singlePayerId} onChange={(event) => setSinglePayerId(event.target.value)}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn ghost"
                data-testid="payer-multi"
                onClick={enableMulti}
                disabled={members.length < 2 || amountCents === null}
              >
                Several people paid
              </button>
            </div>
          ) : (
            <div className="stack-form tight">
              {payerRows.map((row) => (
                <div key={row.key} className="person-line">
                  <select
                    className="input"
                    aria-label="Payer"
                    value={row.personId}
                    onChange={(event) =>
                      setPayerRows((rows) => rows.map((item) => (item.key === row.key ? { ...item, personId: event.target.value } : item)))
                    }
                  >
                    {members
                      .filter((member) => member.id === row.personId || !payerRows.some((item) => item.personId === member.id))
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                  <input
                    className="input money-input"
                    inputMode="decimal"
                    aria-label={`Amount paid by ${nameOf(row.personId)}`}
                    value={row.amount}
                    onChange={(event) =>
                      setPayerRows((rows) => rows.map((item) => (item.key === row.key ? { ...item, amount: event.target.value } : item)))
                    }
                  />
                  <button
                    type="button"
                    className="btn ghost tiny"
                    onClick={() => {
                      const next = payerRows.filter((item) => item.key !== row.key);
                      if (next.length <= 1) {
                        setSinglePayerId(next[0]?.personId ?? singlePayerId);
                        setMulti(false);
                        setPayerRows([]);
                        return;
                      }
                      setPayerRows(next);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="row-actions">
                <button type="button" className="btn ghost tiny" onClick={addPayer} disabled={payerRows.length >= members.length}>
                  Add payer
                </button>
                <button type="button" className="btn ghost tiny" onClick={splitPayersEvenly}>
                  Split payment evenly
                </button>
              </div>
              {amountCents !== null ? (
                <p className={payerAssigned === amountCents ? "hint" : "error"}>
                  Payers add up to {formatCents(payerAssigned)} of {formatCents(amountCents)}.
                </p>
              ) : null}
            </div>
          )}
        </fieldset>

        <fieldset className="field">
          <legend>Split</legend>
          <div className="seg-row" role="radiogroup" aria-label="Split method">
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={splitMode === mode.id}
                data-testid={`split-mode-${mode.id}`}
                className={splitMode === mode.id ? "seg on" : "seg"}
                onClick={() => switchMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="hint">{modes.find((mode) => mode.id === splitMode)?.help}</p>
          <ul className="split-list">
            {members.map((member) => (
              <li key={member.id} className="person-line">
                <label className="check">
                  <input type="checkbox" checked={Boolean(included[member.id])} onChange={() => togglePerson(member.id)} />
                  <span>{member.name}</span>
                </label>
                {splitMode === "percent" && included[member.id] ? (
                  <label className="suffix-field">
                    <input
                      className="input money-input"
                      inputMode="decimal"
                      aria-label={`Percent for ${member.name}`}
                      value={percentText[member.id] ?? ""}
                      onChange={(event) => {
                        setSplitTouched(true);
                        setPercentText((current) => ({ ...current, [member.id]: event.target.value }));
                      }}
                    />
                    <span>%</span>
                  </label>
                ) : null}
                {splitMode === "shares" && included[member.id] ? (
                  <label className="suffix-field">
                    <input
                      className="input money-input"
                      inputMode="decimal"
                      aria-label={`Shares for ${member.name}`}
                      value={shareText[member.id] ?? ""}
                      onChange={(event) => {
                        setSplitTouched(true);
                        setShareText((current) => ({ ...current, [member.id]: event.target.value }));
                      }}
                    />
                    <span>shares</span>
                  </label>
                ) : null}
                {splitMode === "exact" && included[member.id] ? (
                  <label className="suffix-field">
                    <span aria-hidden="true">$</span>
                    <input
                      className="input money-input"
                      inputMode="decimal"
                      aria-label={`Amount for ${member.name}`}
                      value={exactText[member.id] ?? ""}
                      onChange={(event) => {
                        setSplitTouched(true);
                        setExactText((current) => ({ ...current, [member.id]: event.target.value }));
                      }}
                    />
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
          {splitMode !== "equal" ? (
            <button
              type="button"
              className="btn ghost tiny"
              onClick={() => {
                setSplitTouched(false);
                rebalance(splitMode, selectedIds);
              }}
            >
              Balance evenly
            </button>
          ) : null}
        </fieldset>

        {draft.shares.length > 0 ? (
          <div className="preview" data-testid="split-preview">
            <p>Each person owes</p>
            <ul>
              {draft.shares.map((share) => (
                <li key={share.personId}>
                  <span>{nameOf(share.personId)}</span>
                  <span className="money">{formatCents(share.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error || (amount.trim() && draft.error) ? (
          <p className={error ? "error" : "hint"} role={error ? "alert" : undefined}>
            {error ?? draft.error}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" data-testid="expense-submit" disabled={pending || !draft.payload}>
            {pending ? "Saving…" : "Save expense"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
