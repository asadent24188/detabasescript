export type Balance = {
  personId: string;
  cents: number;
};

export type Transfer = {
  fromId: string;
  toId: string;
  cents: number;
};

type Bucket = {
  id: string;
  cents: number;
};

const NODE_LIMIT = 20_000;

function greedy(debtors: Bucket[], creditors: Bucket[]): Transfer[] {
  const debtQueue = debtors.map((bucket) => ({ ...bucket })).filter((bucket) => bucket.cents > 0);
  const creditQueue = creditors.map((bucket) => ({ ...bucket })).filter((bucket) => bucket.cents > 0);
  debtQueue.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  creditQueue.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtQueue.length && creditorIndex < creditQueue.length) {
    const pay = Math.min(debtQueue[debtorIndex].cents, creditQueue[creditorIndex].cents);
    if (pay > 0) {
      transfers.push({
        fromId: debtQueue[debtorIndex].id,
        toId: creditQueue[creditorIndex].id,
        cents: pay,
      });
    }
    debtQueue[debtorIndex].cents -= pay;
    creditQueue[creditorIndex].cents -= pay;
    if (debtQueue[debtorIndex].cents === 0) debtorIndex += 1;
    if (creditQueue[creditorIndex].cents === 0) creditorIndex += 1;
  }
  return transfers;
}

function nonZeroCount(buckets: Bucket[]): number {
  let count = 0;
  for (const bucket of buckets) if (bucket.cents > 0) count += 1;
  return count;
}

function settles(balances: Balance[], transfers: Transfer[]): boolean {
  const nets = new Map(balances.map((balance) => [balance.personId, balance.cents]));
  for (const transfer of transfers) {
    nets.set(transfer.fromId, (nets.get(transfer.fromId) ?? 0) + transfer.cents);
    nets.set(transfer.toId, (nets.get(transfer.toId) ?? 0) - transfer.cents);
  }
  for (const cents of nets.values()) if (cents !== 0) return false;
  return true;
}

/**
 * Fewest debtor-to-creditor payments that bring every balance to zero.
 * Each payment is between someone who owes and someone who is owed, and
 * never larger than either remaining amount. The search is optimal for
 * ordinary group sizes; past the node limit it keeps the best correct
 * settlement found, which is at least the greedy matching.
 */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const sum = balances.reduce((total, balance) => total + balance.cents, 0);
  if (sum !== 0) throw new Error("Balances do not sum to zero.");

  const debtors: Bucket[] = balances
    .filter((balance) => balance.cents < 0)
    .map((balance) => ({ id: balance.personId, cents: -balance.cents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  const creditors: Bucket[] = balances
    .filter((balance) => balance.cents > 0)
    .map((balance) => ({ id: balance.personId, cents: balance.cents }))
    .sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));

  if (debtors.length === 0) return [];

  const seed = greedy(debtors, creditors);
  let best = seed;
  let nodes = 0;

  function consider(candidate: Transfer[]) {
    if (candidate.length < best.length) best = candidate.map((transfer) => ({ ...transfer }));
  }

  function pay(debtor: Bucket, creditor: Bucket, amount: number, acc: Transfer[], next: () => void) {
    debtor.cents -= amount;
    creditor.cents -= amount;
    acc.push({ fromId: debtor.id, toId: creditor.id, cents: amount });
    next();
    acc.pop();
    debtor.cents += amount;
    creditor.cents += amount;
  }

  function search(start: number, acc: Transfer[]) {
    nodes += 1;
    if (nodes > NODE_LIMIT) return;
    if (acc.length >= best.length) return;
    const bound = Math.max(nonZeroCount(debtors), nonZeroCount(creditors));
    if (acc.length + bound >= best.length) return;

    let debtorIndex = start;
    while (debtorIndex < debtors.length && debtors[debtorIndex].cents === 0) debtorIndex += 1;
    if (debtorIndex >= debtors.length) {
      consider(acc);
      return;
    }

    const debtor = debtors[debtorIndex];
    const exact = creditors.find((creditor) => creditor.cents === debtor.cents);
    if (exact) {
      pay(debtor, exact, debtor.cents, acc, () => search(debtorIndex, acc));
      return;
    }

    const tried = new Set<number>();
    for (const creditor of creditors) {
      if (creditor.cents === 0 || tried.has(creditor.cents)) continue;
      tried.add(creditor.cents);
      const amount = Math.min(debtor.cents, creditor.cents);
      pay(debtor, creditor, amount, acc, () => search(debtorIndex, acc));
      if (nodes > NODE_LIMIT) return;
    }
  }

  search(0, []);
  if (!settles(balances, best)) return seed;
  return best;
}
