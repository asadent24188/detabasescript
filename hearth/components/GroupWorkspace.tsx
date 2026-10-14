"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addMemberAction, deleteGroupAction, removeMemberAction } from "@/app/actions";
import { ActivityList } from "@/components/ActivityList";
import { Avatar } from "@/components/Avatar";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Money } from "@/components/Money";
import { SettleDialog } from "@/components/SettleDialog";
import { balancePhrase, formatCents } from "@/lib/format";
import type { GroupView, TransferRow } from "@/lib/types";

export function GroupWorkspace({ data }: { data: GroupView }) {
  const router = useRouter();
  const [memberName, setMemberName] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleSeed, setSettleSeed] = useState<{ fromId: string; toId: string; cents: number | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const you = data.members.find((member) => member.id === data.meId);

  function addMember(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addMemberAction(data.group.id, memberName);
      if (!result.ok) {
        setMemberError(result.error);
        return;
      }
      setMemberName("");
      setMemberError(null);
      router.refresh();
    });
  }

  function removeMember(personId: string, name: string) {
    if (!window.confirm(`Remove ${name} from ${data.group.name}?`)) return;
    startTransition(async () => {
      const result = await removeMemberAction(data.group.id, personId);
      if (!result.ok) {
        setMemberError(result.error);
        return;
      }
      setMemberError(null);
      router.refresh();
    });
  }

  function openSettle(transfer?: TransferRow) {
    if (data.members.length < 2) return;
    const chosen = transfer ?? data.transfers[0];
    const debtor = data.balances.find((balance) => balance.cents < 0);
    const creditor = data.balances.find((balance) => balance.cents > 0);
    setSettleSeed({
      fromId: chosen?.fromId ?? debtor?.id ?? data.members[0].id,
      toId: chosen?.toId ?? creditor?.id ?? data.members.find((member) => member.id !== data.members[0].id)?.id ?? "",
      cents: chosen?.cents ?? null,
    });
  }

  function destroyGroup() {
    if (!window.confirm(`Delete ${data.group.name}? Expenses and payments in it will be removed.`)) return;
    startTransition(async () => {
      const result = await deleteGroupAction(data.group.id);
      if (!result.ok) {
        setMemberError(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Group</p>
          <h1 className="page-title">{data.group.name}</h1>
        </div>
        <button
          type="button"
          className="btn primary"
          data-testid="open-expense"
          disabled={data.members.length === 0}
          onClick={() => setExpenseOpen(true)}
        >
          Add expense
        </button>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>People</h2>
          <form className="inline-form" onSubmit={addMember}>
            <input
              className="input"
              data-testid="member-name"
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Add a person"
              aria-label="Person's name"
              list="known-people"
              maxLength={40}
            />
            <datalist id="known-people">
              {data.otherPeople.map((person) => (
                <option key={person.id} value={person.name} />
              ))}
            </datalist>
            <button className="btn" data-testid="member-submit" disabled={pending || !memberName.trim()}>
              Add
            </button>
          </form>
        </div>
        {data.members.length === 0 ? (
          <p className="empty">Add the people who share costs in this group.</p>
        ) : (
          <ul className="members">
            {data.members.map((member) => (
              <li key={member.id} className="chip" data-testid="member-chip">
                <Avatar id={member.id} name={member.name} />
                <span>{member.name}</span>
                {member.id === data.meId ? <span className="you">You</span> : null}
                <button
                  type="button"
                  className="chip-x"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => removeMember(member.id, member.name)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {memberError ? (
          <p className="error" role="alert">
            {memberError}
          </p>
        ) : null}
      </section>

      <div className="group-grid">
        <section className="panel" data-testid="balance-list">
          <div className="panel-head">
            <h2>Who owes whom</h2>
            <button type="button" className="btn" data-testid="open-settle" disabled={data.members.length < 2} onClick={() => openSettle()}>
              Record a payment
            </button>
          </div>
          {data.yourCents !== null && you ? (
            <p className="banner" data-testid="your-group-balance">
              {balancePhrase(you.name, data.yourCents, true)} in this group
            </p>
          ) : null}
          {data.balances.length === 0 ? (
            <p className="empty">Add someone, then add an expense.</p>
          ) : (
            <ul className="balance-rows">
              {data.balances.map((balance) => (
                <li key={balance.id}>
                  <Avatar id={balance.id} name={balance.name} />
                  <span>{balance.name}</span>
                  <Money cents={balance.cents} signed />
                </li>
              ))}
            </ul>
          )}
          <h3 className="subhead">Fewest payments</h3>
          {data.transfers.length === 0 ? (
            <p className="hint">
              {data.activity.length === 0
                ? "Add an expense and Hearth will list the fewest payments that settle the group."
                : "No one owes anyone in this group."}
            </p>
          ) : (
            <>
              <ul className="transfer-list" data-testid="transfer-list">
                {data.transfers.map((transfer) => (
                  <li key={`${transfer.fromId}-${transfer.toId}`} data-testid="transfer-row">
                    <p>
                      <strong>{transfer.fromName}</strong> owes <strong>{transfer.toName}</strong>{" "}
                      <span className="money">{formatCents(transfer.cents)}</span>
                    </p>
                    <button type="button" className="btn tiny" data-testid="record-payment" onClick={() => openSettle(transfer)}>
                      Record payment
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">These are the fewest payments that bring everyone in the group to zero.</p>
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Activity</h2>
          </div>
          <ActivityList items={data.activity} />
        </section>
      </div>

      <button type="button" className="btn ghost danger-text" onClick={destroyGroup} disabled={pending}>
        Delete group
      </button>

      {expenseOpen ? (
        <ExpenseDialog
          groupId={data.group.id}
          members={data.members}
          categories={data.categories}
          meId={data.meId}
          onClose={() => setExpenseOpen(false)}
        />
      ) : null}
      {settleSeed ? (
        <SettleDialog
          groupId={data.group.id}
          members={data.members}
          fromId={settleSeed.fromId}
          toId={settleSeed.toId}
          amountCents={settleSeed.cents}
          onClose={() => setSettleSeed(null)}
        />
      ) : null}
    </div>
  );
}
