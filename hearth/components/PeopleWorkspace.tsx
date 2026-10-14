"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addPersonAction, setMeAction } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Money } from "@/components/Money";
import { balancePhrase, formatSignedCents } from "@/lib/format";
import type { PersonSummary } from "@/lib/types";

export function PeopleWorkspace({ people }: { people: PersonSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addPerson(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addPersonAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setError(null);
      router.refresh();
    });
  }

  function makeYou(personId: string) {
    startTransition(async () => {
      const result = await setMeAction(personId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="page-title">Everyone on this ledger</h1>
          <p className="lede">Overall balance adds what someone is owed, or owes, in every group. Payments stay inside each group.</p>
        </div>
      </header>

      <form className="inline-form" onSubmit={addPerson}>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Add a person"
          aria-label="New person's name"
          maxLength={40}
        />
        <button className="btn primary" disabled={pending || !name.trim()}>
          Add person
        </button>
      </form>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {people.length === 0 ? (
        <p className="empty">Add yourself first. You can mark who you are and Hearth will keep that balance on the home page.</p>
      ) : (
        <ul className="person-list">
          {people.map((person) => (
            <li key={person.id} className="person-card" data-testid="person-row">
              <div className="person-main">
                <Avatar id={person.id} name={person.name} size={42} />
                <div>
                  <h2>
                    {person.name}
                    {person.isYou ? <span className="you">You</span> : null}
                  </h2>
                  <p className="muted">{balancePhrase(person.name, person.cents, person.isYou)}</p>
                </div>
              </div>
              <div className="person-side">
                <Money cents={person.cents} signed />
                {person.isYou ? null : (
                  <button type="button" className="btn ghost tiny" disabled={pending} onClick={() => makeYou(person.id)}>
                    This is me
                  </button>
                )}
              </div>
              {person.groups.length > 0 ? (
                <ul className="subdues">
                  {person.groups.map((group) => (
                    <li key={group.id}>
                      <Link href={`/groups/${group.id}`}>{group.name}</Link>
                      <span className="money">{formatSignedCents(group.cents)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Not in a group yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
