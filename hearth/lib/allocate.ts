import { LedgerError } from "./errors";
import type { ParticipantInput, ShareRow, SplitMode } from "./types";

const MAX_CENTS = 1_000_000_000;

export function allocateByWeights(totalCents: number, weights: number[]): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new LedgerError("Enter an amount greater than zero.");
  }
  if (weights.length === 0) return [];
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
    throw new LedgerError("Split values have to be positive numbers.");
  }
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) throw new LedgerError("Choose at least one person to split with.");

  const rows = weights.map((weight, index) => {
    const product = totalCents * weight;
    if (!Number.isSafeInteger(product)) throw new LedgerError("That split is too large to calculate.");
    return {
      index,
      base: Math.floor(product / sum),
      remainder: product % sum,
    };
  });

  let leftover = totalCents - rows.reduce((total, row) => total + row.base, 0);
  const order = [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = rows.map((row) => row.base);
  for (const row of order) {
    if (leftover <= 0) break;
    result[row.index] += 1;
    leftover -= 1;
  }
  if (leftover !== 0) throw new LedgerError("Could not split that amount exactly.");
  return result;
}

export function computeShares(
  mode: SplitMode,
  totalCents: number,
  participants: ParticipantInput[],
): { personId: string; amountCents: number }[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0 || totalCents > MAX_CENTS) {
    throw new LedgerError("Enter an amount greater than zero.");
  }
  if (participants.length === 0) throw new LedgerError("Choose at least one person to split with.");
  const ids = participants.map((participant) => participant.personId);
  if (new Set(ids).size !== ids.length) {
    throw new LedgerError("Each person can only appear once in the split.");
  }

  if (mode === "equal") {
    const amounts = allocateByWeights(
      totalCents,
      participants.map(() => 1),
    );
    return participants.map((participant, index) => ({
      personId: participant.personId,
      amountCents: amounts[index],
    }));
  }

  if (mode === "percent") {
    if (participants.some((participant) => !Number.isInteger(participant.weight) || participant.weight < 0)) {
      throw new LedgerError("Enter each percent as a number.");
    }
    const sum = participants.reduce((total, participant) => total + participant.weight, 0);
    if (sum !== 10_000) throw new LedgerError("Percents must add up to 100.");
    const active = participants.filter((participant) => participant.weight > 0);
    if (active.length === 0) throw new LedgerError("Choose at least one person to split with.");
    const amounts = allocateByWeights(
      totalCents,
      active.map((participant) => participant.weight),
    );
    return active.map((participant, index) => ({
      personId: participant.personId,
      amountCents: amounts[index],
    }));
  }

  if (mode === "shares") {
    const active = participants.filter((participant) => participant.weight > 0);
    if (active.length === 0) throw new LedgerError("Enter a share greater than zero for at least one person.");
    if (active.some((participant) => !Number.isInteger(participant.weight) || participant.weight > 100_000)) {
      throw new LedgerError("Enter each share as a positive number.");
    }
    const amounts = allocateByWeights(
      totalCents,
      active.map((participant) => participant.weight),
    );
    return active.map((participant, index) => ({
      personId: participant.personId,
      amountCents: amounts[index],
    }));
  }

  if (mode === "exact") {
    if (participants.some((participant) => !Number.isInteger(participant.weight) || participant.weight < 0)) {
      throw new LedgerError("Enter a valid amount for each person.");
    }
    const active = participants.filter((participant) => participant.weight > 0);
    const sum = active.reduce((total, participant) => total + participant.weight, 0);
    if (sum !== totalCents) throw new LedgerError("Exact amounts must add up to the expense total.");
    return active.map((participant) => ({
      personId: participant.personId,
      amountCents: participant.weight,
    }));
  }

  throw new LedgerError("Choose how to split this expense.");
}

export function namedShares(
  shares: { personId: string; amountCents: number }[],
  names: Map<string, string>,
): ShareRow[] {
  return shares.map((share) => ({
    personId: share.personId,
    name: names.get(share.personId) ?? "Someone",
    amountCents: share.amountCents,
  }));
}
