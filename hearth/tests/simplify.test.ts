import assert from "node:assert/strict";
import test from "node:test";
import { simplifyDebts, type Balance, type Transfer } from "../lib/simplify";

function settles(balances: Balance[], transfers: Transfer[]): boolean {
  const nets = new Map(balances.map((balance) => [balance.personId, balance.cents]));
  for (const transfer of transfers) {
    const from = (nets.get(transfer.fromId) ?? 0) + transfer.cents;
    const to = (nets.get(transfer.toId) ?? 0) - transfer.cents;
    if (from > 0 || to < 0) return false;
    nets.set(transfer.fromId, from);
    nets.set(transfer.toId, to);
  }
  return [...nets.values()].every((cents) => cents === 0);
}

function minTransferCount(amounts: number[]): number {
  const debts = amounts.filter((amount) => amount !== 0);
  let best = Number.POSITIVE_INFINITY;
  function search(index: number, steps: number) {
    if (steps >= best) return;
    while (index < debts.length && debts[index] === 0) index += 1;
    if (index === debts.length) {
      best = steps;
      return;
    }
    const seen = new Set<number>();
    for (let other = index + 1; other < debts.length; other += 1) {
      if (debts[index] * debts[other] >= 0 || seen.has(debts[other])) continue;
      seen.add(debts[other]);
      const previous = debts[other];
      debts[other] += debts[index];
      search(index + 1, steps + 1);
      debts[other] = previous;
      if (previous === -debts[index]) break;
    }
  }
  search(0, 0);
  return best;
}

function assertOptimal(balances: Balance[]) {
  const transfers = simplifyDebts(balances);
  assert.equal(settles(balances, transfers), true);
  for (const transfer of transfers) {
    assert.ok(transfer.cents > 0);
    const from = balances.find((balance) => balance.personId === transfer.fromId);
    const to = balances.find((balance) => balance.personId === transfer.toId);
    assert.ok(from && from.cents < 0);
    assert.ok(to && to.cents > 0);
  }
  const optimum = minTransferCount(balances.map((balance) => balance.cents));
  assert.equal(transfers.length, optimum);
}

test("an already settled group needs no payments", () => {
  assert.deepEqual(
    simplifyDebts([
      { personId: "a", cents: 0 },
      { personId: "b", cents: 0 },
    ]),
    [],
  );
});

test("one debt is a single payment", () => {
  assertOptimal([
    { personId: "alex", cents: 3_000 },
    { personId: "sam", cents: -3_000 },
  ]);
});

test("simplifies to fewer payments than matching the largest balances", () => {
  const balances: Balance[] = [
    { personId: "a", cents: 400 },
    { personId: "b", cents: 300 },
    { personId: "c", cents: 200 },
    { personId: "d", cents: 100 },
    { personId: "e", cents: -500 },
    { personId: "f", cents: -500 },
  ];
  const transfers = simplifyDebts(balances);
  assert.equal(transfers.length, 4);
  assertOptimal(balances);
});

test("small random ledgers match the fewest-payment count", () => {
  let seed = 0xdecaf;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let trial = 0; trial < 40; trial += 1) {
    const count = 2 + Math.floor(random() * 4);
    const cents: number[] = [];
    for (let index = 0; index < count - 1; index += 1) {
      cents.push(Math.floor(random() * 31) - 15);
    }
    cents.push(-cents.reduce((total, value) => total + value, 0));
    const balances = cents.map((value, index) => ({ personId: `p${index}`, cents: value }));
    assertOptimal(balances);
  }
});
