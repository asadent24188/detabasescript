import type Database from "better-sqlite3";
import { computeShares } from "./allocate";
import { LedgerError } from "./errors";
import { simplifyDebts } from "./simplify";
import { requireText } from "./text";
import type {
  ActivityItem,
  BalanceRow,
  DashboardData,
  ExpenseInput,
  GroupView,
  PersonRef,
  PersonSummary,
  SettlementInput,
  ShareRow,
  SplitMode,
} from "./types";

type PersonRow = { id: string; name: string; createdAt: string };

const MAX_CENTS = 1_000_000_000;
const SPLIT_MODES = new Set<SplitMode>(["equal", "percent", "shares", "exact"]);

function timestamp(): string {
  return new Date().toISOString();
}

function isUniqueConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = String((error as { code: string }).code);
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT";
}

export function listPeople(db: Database.Database): PersonRow[] {
  return db
    .prepare(`SELECT id, name, created_at AS createdAt FROM people ORDER BY name COLLATE NOCASE`)
    .all() as PersonRow[];
}

export function getMe(db: Database.Database): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'me'`).get() as { value: string } | undefined;
  if (!row) return null;
  const person = db.prepare(`SELECT id FROM people WHERE id = ?`).get(row.value) as { id: string } | undefined;
  return person?.id ?? null;
}

export function setMe(db: Database.Database, personId: string): void {
  const person = db.prepare(`SELECT id FROM people WHERE id = ?`).get(personId);
  if (!person) throw new LedgerError("Choose someone on this ledger.");
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('me', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(personId);
}

function findPersonByName(db: Database.Database, name: string): PersonRow | undefined {
  return db
    .prepare(
      `SELECT id, name, created_at AS createdAt FROM people
       WHERE name = ? COLLATE NOCASE`,
    )
    .get(name) as PersonRow | undefined;
}

export function createPerson(db: Database.Database, name: string): PersonRow {
  const cleaned = requireText(name, "Enter a name.", 40, "Names must be 40 characters or fewer.");
  const existing = findPersonByName(db, cleaned);
  if (existing) throw new LedgerError(`${existing.name} is already on this ledger.`);
  const person: PersonRow = { id: crypto.randomUUID(), name: cleaned, createdAt: timestamp() };
  try {
    db.prepare(`INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)`).run(person.id, person.name, person.createdAt);
  } catch (error) {
    if (isUniqueConstraint(error)) throw new LedgerError(`${cleaned} is already on this ledger.`);
    throw error;
  }
  return person;
}

export function addPerson(db: Database.Database, name: string): string {
  const person = createPerson(db, name);
  if (!getMe(db)) setMe(db, person.id);
  return person.id;
}

export function startLedger(db: Database.Database, name: string): string {
  const existing = findPersonByName(db, requireText(name, "Enter your name.", 40, "Names must be 40 characters or fewer."));
  const person = existing ?? createPerson(db, name);
  setMe(db, person.id);
  return person.id;
}

export function createGroup(db: Database.Database, name: string): string {
  const cleaned = requireText(name, "Enter a group name.", 40, "Group names must be 40 characters or fewer.");
  const id = crypto.randomUUID();
  const me = getMe(db);
  const createdAt = timestamp();
  const insert = db.transaction(() => {
    db.prepare(`INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)`).run(id, cleaned, createdAt);
    if (me) db.prepare(`INSERT INTO group_members (group_id, person_id) VALUES (?, ?)`).run(id, me);
  });
  insert();
  return id;
}

export function addMemberByName(db: Database.Database, groupId: string, name: string): string {
  const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(groupId);
  if (!group) throw new LedgerError("That group is gone.");
  const cleaned = requireText(name, "Enter a name.", 40, "Names must be 40 characters or fewer.");
  const existing = findPersonByName(db, cleaned);
  const person = existing ?? createPerson(db, cleaned);
  const already = db
    .prepare(`SELECT 1 AS ok FROM group_members WHERE group_id = ? AND person_id = ?`)
    .get(groupId, person.id);
  if (already) throw new LedgerError(`${person.name} is already in this group.`);
  db.prepare(`INSERT INTO group_members (group_id, person_id) VALUES (?, ?)`).run(groupId, person.id);
  return person.id;
}

export function removeMember(db: Database.Database, groupId: string, personId: string): void {
  const used = db
    .prepare(
      `SELECT 1 AS ok FROM expense_payers ep
       JOIN expenses e ON e.id = ep.expense_id
       WHERE e.group_id = ? AND ep.person_id = ?
       UNION ALL
       SELECT 1 FROM expense_shares es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = ? AND es.person_id = ?
       UNION ALL
       SELECT 1 FROM settlements
       WHERE group_id = ? AND (from_person_id = ? OR to_person_id = ?)
       LIMIT 1`,
    )
    .get(groupId, personId, groupId, personId, groupId, personId, personId);
  if (used) {
    throw new LedgerError("This person is part of an expense or payment, so they stay in the group.");
  }
  const result = db.prepare(`DELETE FROM group_members WHERE group_id = ? AND person_id = ?`).run(groupId, personId);
  if (result.changes === 0) throw new LedgerError("That person is not in this group.");
}

function memberIds(db: Database.Database, groupId: string): Set<string> {
  const rows = db.prepare(`SELECT person_id AS personId FROM group_members WHERE group_id = ?`).all(groupId) as {
    personId: string;
  }[];
  return new Set(rows.map((row) => row.personId));
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new LedgerError("Choose a valid date.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new LedgerError("Choose a valid date.");
  }
}

export function createExpense(db: Database.Database, input: ExpenseInput): string {
  const description = requireText(
    input.description,
    "Add a short description.",
    80,
    "Descriptions must be 80 characters or fewer.",
  );
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_CENTS) {
    throw new LedgerError("Enter an amount greater than zero.");
  }
  if (!SPLIT_MODES.has(input.splitMode)) throw new LedgerError("Choose how to split this expense.");
  assertDate(input.occurredOn);

  const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(input.groupId);
  if (!group) throw new LedgerError("That group is gone.");
  const category = db.prepare(`SELECT id FROM categories WHERE id = ?`).get(input.categoryId);
  if (!category) throw new LedgerError("Choose a category.");

  const members = memberIds(db, input.groupId);
  if (members.size === 0) throw new LedgerError("Add someone to the group before recording an expense.");
  if (input.payers.length === 0) throw new LedgerError("Say who paid.");

  const payerIds = input.payers.map((payer) => payer.personId);
  if (new Set(payerIds).size !== payerIds.length) throw new LedgerError("Each payer can only be listed once.");

  let paid = 0;
  for (const payer of input.payers) {
    if (!members.has(payer.personId)) throw new LedgerError("Payers have to be in the group.");
    if (!Number.isInteger(payer.amountCents) || payer.amountCents <= 0) {
      throw new LedgerError("Each payer needs an amount greater than zero.");
    }
    paid += payer.amountCents;
  }
  if (paid !== input.amountCents) throw new LedgerError("The payers' amounts must add up to the total.");

  for (const participant of input.participants) {
    if (!members.has(participant.personId)) throw new LedgerError("Only people in the group can share an expense.");
  }

  const shares = computeShares(input.splitMode, input.amountCents, input.participants);
  const id = crypto.randomUUID();
  const createdAt = timestamp();
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO expenses (
        id, group_id, description, amount_cents, category_id, split_mode, occurred_on, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.groupId, description, input.amountCents, input.categoryId, input.splitMode, input.occurredOn, createdAt);
    const insertPayer = db.prepare(
      `INSERT INTO expense_payers (expense_id, person_id, amount_cents) VALUES (?, ?, ?)`,
    );
    for (const payer of input.payers) insertPayer.run(id, payer.personId, payer.amountCents);
    const insertShare = db.prepare(
      `INSERT INTO expense_shares (expense_id, person_id, amount_cents) VALUES (?, ?, ?)`,
    );
    for (const share of shares) {
      if (share.amountCents > 0) insertShare.run(id, share.personId, share.amountCents);
    }
  });
  insert();
  return id;
}

export function deleteExpense(db: Database.Database, expenseId: string): string {
  const row = db.prepare(`SELECT group_id AS groupId FROM expenses WHERE id = ?`).get(expenseId) as
    | { groupId: string }
    | undefined;
  if (!row) throw new LedgerError("That expense is already gone.");
  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(expenseId);
  return row.groupId;
}

export function createSettlement(db: Database.Database, input: SettlementInput): string {
  if (input.fromPersonId === input.toPersonId) throw new LedgerError("A person can't pay themselves.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_CENTS) {
    throw new LedgerError("Enter an amount greater than zero.");
  }
  assertDate(input.occurredOn);
  const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(input.groupId);
  if (!group) throw new LedgerError("That group is gone.");
  const members = memberIds(db, input.groupId);
  if (!members.has(input.fromPersonId) || !members.has(input.toPersonId)) {
    throw new LedgerError("Both people need to be in the group.");
  }
  const note = input.note.trim() ? requireText(input.note, "", 140, "Notes must be 140 characters or fewer.") : null;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO settlements (
      id, group_id, from_person_id, to_person_id, amount_cents, occurred_on, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.groupId, input.fromPersonId, input.toPersonId, input.amountCents, input.occurredOn, note, timestamp());
  return id;
}

export function deleteSettlement(db: Database.Database, settlementId: string): string {
  const row = db.prepare(`SELECT group_id AS groupId FROM settlements WHERE id = ?`).get(settlementId) as
    | { groupId: string }
    | undefined;
  if (!row) throw new LedgerError("That payment is already gone.");
  db.prepare(`DELETE FROM settlements WHERE id = ?`).run(settlementId);
  return row.groupId;
}

export function deleteGroup(db: Database.Database, groupId: string): void {
  const result = db.prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
  if (result.changes === 0) throw new LedgerError("That group is already gone.");
}

type NetMaps = Map<string, Map<string, number>>;

function emptyNet(people: string[]): Map<string, number> {
  return new Map(people.map((id) => [id, 0]));
}

function addNet(nets: Map<string, number>, personId: string, delta: number) {
  nets.set(personId, (nets.get(personId) ?? 0) + delta);
}

function groupNets(db: Database.Database): { nets: NetMaps; groupIds: string[] } {
  const groups = db.prepare(`SELECT id FROM groups`).all() as { id: string }[];
  const nets: NetMaps = new Map();
  for (const group of groups) {
    const members = [...memberIds(db, group.id)];
    nets.set(group.id, emptyNet(members));
  }

  const payers = db
    .prepare(
      `SELECT e.group_id AS groupId, ep.person_id AS personId, ep.amount_cents AS amountCents
       FROM expense_payers ep JOIN expenses e ON e.id = ep.expense_id`,
    )
    .all() as { groupId: string; personId: string; amountCents: number }[];
  for (const payer of payers) addNet(nets.get(payer.groupId) ?? new Map(), payer.personId, payer.amountCents);

  const shares = db
    .prepare(
      `SELECT e.group_id AS groupId, es.person_id AS personId, es.amount_cents AS amountCents
       FROM expense_shares es JOIN expenses e ON e.id = es.expense_id`,
    )
    .all() as { groupId: string; personId: string; amountCents: number }[];
  for (const share of shares) addNet(nets.get(share.groupId) ?? new Map(), share.personId, -share.amountCents);

  const settlements = db
    .prepare(
      `SELECT group_id AS groupId, from_person_id AS fromId, to_person_id AS toId, amount_cents AS amountCents
       FROM settlements`,
    )
    .all() as { groupId: string; fromId: string; toId: string; amountCents: number }[];
  for (const settlement of settlements) {
    const net = nets.get(settlement.groupId);
    if (!net) continue;
    addNet(net, settlement.fromId, settlement.amountCents);
    addNet(net, settlement.toId, -settlement.amountCents);
  }

  return { nets, groupIds: groups.map((group) => group.id) };
}

function nameMap(db: Database.Database): Map<string, string> {
  const people = listPeople(db);
  return new Map(people.map((person) => [person.id, person.name]));
}

function loadActivity(db: Database.Database, groupId: string | null): ActivityItem[] {
  const names = nameMap(db);
  const expenseSql = groupId
    ? `SELECT e.id, e.group_id AS groupId, g.name AS groupName, e.description, e.amount_cents AS amountCents,
              e.category_id AS categoryId, c.name AS categoryName, c.tint AS categoryTint,
              e.split_mode AS splitMode, e.occurred_on AS occurredOn, e.created_at AS createdAt
       FROM expenses e
       JOIN groups g ON g.id = e.group_id
       JOIN categories c ON c.id = e.category_id
       WHERE e.group_id = ?`
    : `SELECT e.id, e.group_id AS groupId, g.name AS groupName, e.description, e.amount_cents AS amountCents,
              e.category_id AS categoryId, c.name AS categoryName, c.tint AS categoryTint,
              e.split_mode AS splitMode, e.occurred_on AS occurredOn, e.created_at AS createdAt
       FROM expenses e
       JOIN groups g ON g.id = e.group_id
       JOIN categories c ON c.id = e.category_id`;
  const expenses = db.prepare(expenseSql).all(...(groupId ? [groupId] : [])) as {
    id: string;
    groupId: string;
    groupName: string;
    description: string;
    amountCents: number;
    categoryName: string;
    categoryTint: string;
    splitMode: SplitMode;
    occurredOn: string;
    createdAt: string;
  }[];

  const payerSql = groupId
    ? `SELECT ep.expense_id AS expenseId, ep.person_id AS personId, ep.amount_cents AS amountCents
       FROM expense_payers ep JOIN expenses e ON e.id = ep.expense_id
       WHERE e.group_id = ?`
    : `SELECT ep.expense_id AS expenseId, ep.person_id AS personId, ep.amount_cents AS amountCents
       FROM expense_payers ep`;
  const shareSql = groupId
    ? `SELECT es.expense_id AS expenseId, es.person_id AS personId, es.amount_cents AS amountCents
       FROM expense_shares es JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = ?`
    : `SELECT es.expense_id AS expenseId, es.person_id AS personId, es.amount_cents AS amountCents
       FROM expense_shares es`;
  const payerRows = db.prepare(payerSql).all(...(groupId ? [groupId] : [])) as {
    expenseId: string;
    personId: string;
    amountCents: number;
  }[];
  const shareRows = db.prepare(shareSql).all(...(groupId ? [groupId] : [])) as {
    expenseId: string;
    personId: string;
    amountCents: number;
  }[];

  const payersByExpense = new Map<string, ShareRow[]>();
  for (const row of payerRows) {
    const list = payersByExpense.get(row.expenseId) ?? [];
    list.push({ personId: row.personId, name: names.get(row.personId) ?? "Someone", amountCents: row.amountCents });
    payersByExpense.set(row.expenseId, list);
  }
  const sharesByExpense = new Map<string, ShareRow[]>();
  for (const row of shareRows) {
    const list = sharesByExpense.get(row.expenseId) ?? [];
    list.push({ personId: row.personId, name: names.get(row.personId) ?? "Someone", amountCents: row.amountCents });
    sharesByExpense.set(row.expenseId, list);
  }

  const settlementSql = groupId
    ? `SELECT s.id, s.group_id AS groupId, g.name AS groupName, s.from_person_id AS fromId,
              s.to_person_id AS toId, s.amount_cents AS amountCents, s.occurred_on AS occurredOn,
              s.note, s.created_at AS createdAt
       FROM settlements s JOIN groups g ON g.id = s.group_id
       WHERE s.group_id = ?`
    : `SELECT s.id, s.group_id AS groupId, g.name AS groupName, s.from_person_id AS fromId,
              s.to_person_id AS toId, s.amount_cents AS amountCents, s.occurred_on AS occurredOn,
              s.note, s.created_at AS createdAt
       FROM settlements s JOIN groups g ON g.id = s.group_id`;
  const settlements = db.prepare(settlementSql).all(...(groupId ? [groupId] : [])) as {
    id: string;
    groupId: string;
    groupName: string;
    fromId: string;
    toId: string;
    amountCents: number;
    occurredOn: string;
    note: string | null;
    createdAt: string;
  }[];

  const items: ActivityItem[] = [
    ...expenses.map((expense) => ({
      kind: "expense" as const,
      id: expense.id,
      groupId: expense.groupId,
      groupName: expense.groupName,
      occurredOn: expense.occurredOn,
      createdAt: expense.createdAt,
      description: expense.description,
      amountCents: expense.amountCents,
      categoryName: expense.categoryName,
      categoryTint: expense.categoryTint,
      splitMode: expense.splitMode,
      payers: (payersByExpense.get(expense.id) ?? []).sort((a, b) => b.amountCents - a.amountCents),
      shares: (sharesByExpense.get(expense.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    })),
    ...settlements.map((settlement) => ({
      kind: "settlement" as const,
      id: settlement.id,
      groupId: settlement.groupId,
      groupName: settlement.groupName,
      occurredOn: settlement.occurredOn,
      createdAt: settlement.createdAt,
      description: "Payment",
      amountCents: settlement.amountCents,
      fromId: settlement.fromId,
      fromName: names.get(settlement.fromId) ?? "Someone",
      toId: settlement.toId,
      toName: names.get(settlement.toId) ?? "Someone",
      note: settlement.note,
    })),
  ];

  items.sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return items;
}

function balancesFromNet(net: Map<string, number>, names: Map<string, string>, members: PersonRef[]): BalanceRow[] {
  const ids = new Set<string>(members.map((member) => member.id));
  for (const [personId, cents] of net) {
    if (cents !== 0) ids.add(personId);
  }
  return [...ids]
    .map((personId) => ({
      id: personId,
      name: names.get(personId) ?? "Someone",
      cents: net.get(personId) ?? 0,
    }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
}

export function getGroupView(db: Database.Database, groupId: string): GroupView | null {
  const group = db
    .prepare(`SELECT id, name, created_at AS createdAt FROM groups WHERE id = ?`)
    .get(groupId) as { id: string; name: string; createdAt: string } | undefined;
  if (!group) return null;

  const names = nameMap(db);
  const members = (
    db
      .prepare(
        `SELECT p.id, p.name FROM group_members gm
         JOIN people p ON p.id = gm.person_id
         WHERE gm.group_id = ?
         ORDER BY p.name COLLATE NOCASE`,
      )
      .all(groupId) as PersonRef[]
  );
  const memberIdSet = new Set(members.map((member) => member.id));
  const otherPeople = listPeople(db)
    .filter((person) => !memberIdSet.has(person.id))
    .map((person) => ({ id: person.id, name: person.name }));
  const categories = db.prepare(`SELECT id, name, tint FROM categories ORDER BY name COLLATE NOCASE`).all() as GroupView["categories"];
  const { nets } = groupNets(db);
  const net = nets.get(groupId) ?? new Map<string, number>();
  const balances = balancesFromNet(net, names, members);
  const transfers = simplifyDebts(balances.map((balance) => ({ personId: balance.id, cents: balance.cents })))
    .map((transfer) => ({
      fromId: transfer.fromId,
      fromName: names.get(transfer.fromId) ?? "Someone",
      toId: transfer.toId,
      toName: names.get(transfer.toId) ?? "Someone",
      cents: transfer.cents,
    }))
    .sort((a, b) => b.cents - a.cents || a.fromName.localeCompare(b.fromName));
  const meId = getMe(db);
  const yourRow = meId ? balances.find((balance) => balance.id === meId) : undefined;

  return {
    group,
    meId,
    categories,
    members,
    otherPeople,
    balances,
    transfers,
    activity: loadActivity(db, groupId),
    yourCents: yourRow ? yourRow.cents : meId && memberIdSet.has(meId) ? 0 : null,
  };
}

export function getGroupName(db: Database.Database, groupId: string): string | null {
  const row = db.prepare(`SELECT name FROM groups WHERE id = ?`).get(groupId) as { name: string } | undefined;
  return row?.name ?? null;
}

export function getDashboard(db: Database.Database): DashboardData {
  const meId = getMe(db);
  const people = listPeople(db);
  const me = people.find((person) => person.id === meId) ?? null;
  const { nets } = groupNets(db);
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.created_at AS createdAt,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS memberCount
       FROM groups g
       ORDER BY g.created_at DESC`,
    )
    .all() as { id: string; name: string; createdAt: string; memberCount: number }[];

  const activity = loadActivity(db, null);
  const latestByGroup = new Map<string, string>();
  for (const item of activity) {
    const current = latestByGroup.get(item.groupId);
    if (!current || item.createdAt > current) latestByGroup.set(item.groupId, item.createdAt);
  }

  let yourCents = 0;
  const summaries = groups
    .map((group) => {
      const net = nets.get(group.id) ?? new Map<string, number>();
      const yours = meId && net.has(meId) ? (net.get(meId) ?? 0) : null;
      if (yours !== null) yourCents += yours;
      return {
        id: group.id,
        name: group.name,
        memberCount: group.memberCount,
        yourCents: yours,
        latestAt: latestByGroup.get(group.id) ?? group.createdAt,
      };
    })
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));

  return {
    me: me ? { id: me.id, name: me.name } : null,
    peopleCount: people.length,
    yourCents,
    groups: summaries,
    activity: activity.slice(0, 12),
  };
}

export function getPeople(db: Database.Database): PersonSummary[] {
  const meId = getMe(db);
  const people = listPeople(db);
  const { nets } = groupNets(db);
  const groups = db.prepare(`SELECT id, name FROM groups`).all() as { id: string; name: string }[];
  const groupName = new Map(groups.map((group) => [group.id, group.name]));

  return people
    .map((person) => {
      const memberships: PersonSummary["groups"] = [];
      let cents = 0;
      for (const [groupId, net] of nets) {
        if (!net.has(person.id)) continue;
        const groupCents = net.get(person.id) ?? 0;
        cents += groupCents;
        memberships.push({ id: groupId, name: groupName.get(groupId) ?? "Group", cents: groupCents });
      }
      memberships.sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: person.id,
        name: person.name,
        isYou: person.id === meId,
        cents,
        groups: memberships,
      };
    })
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.name.localeCompare(b.name));
}
