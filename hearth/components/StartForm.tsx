"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { startLedgerAction } from "@/app/actions";

export function StartForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await startLedgerAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <label className="field">
        <span>Your name</span>
        <input
          className="input"
          data-testid="start-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Alex"
          maxLength={40}
          autoComplete="name"
          required
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn primary" data-testid="start-submit" disabled={pending || !name.trim()}>
        {pending ? "Saving…" : "Start a ledger"}
      </button>
    </form>
  );
}
