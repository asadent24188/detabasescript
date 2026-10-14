"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createGroupAction } from "@/app/actions";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createGroupAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      router.push(`/groups/${result.id}`);
      router.refresh();
    });
  }

  return (
    <div className="create-group">
      <form className="inline-form" onSubmit={submit}>
        <input
          className="input"
          data-testid="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New group"
          aria-label="New group name"
          maxLength={40}
        />
        <button className="btn primary" data-testid="group-submit" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create group"}
        </button>
      </form>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
