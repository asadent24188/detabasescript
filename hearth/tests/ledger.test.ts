import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { allocateByWeights } from "../lib/allocate";
import { openDatabase } from "../lib/db";
import { parseDollarsToCents } from "../lib/format";
import {
  addMemberByName,
  createExpense,
  createGroup,
  createSettlement,
  deleteGroup,
  deleteSettlement,
  getGroupView,
  getPeople,
  startLedger,
} from "../lib/ledger";

test("money parses dollars without floating-point drift", () => {
  assert.equal(parseDollarsToCents("1.15"), 115);
  assert.equal(parseDollarsToCents("0.01"), 1);
  assert.equal(parseDollarsToCents("90"), 9000);
  assert.equal(parseDollarsToCents("1.115"), null);
});

test("extra cents are assigned without changing the total", () => {
  const shares = allocateByWeights(100, [1, 1, 1]);
  assert.deepEqual(shares, [34, 33, 33]);
  assert.equal(
    shares.reduce((total, share) => total + share, 0),
    100,
  );
  assert.deepEqual(allocateByWeights(10_000, [1, 1, 2]), [2500, 2500, 5000]);
});

test("group expenses, uneven splits, and a settlement survive a reload", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hearth-"));
  const filename = path.join(dir, "hearth.db");
  const db = openDatabase(filename);

  startLedger(db, "Alex");
  const groupId = createGroup(db, "Cabin weekend");
  addMemberByName(db, groupId, "Sam");
  addMemberByName(db, groupId, "Jordan");
  const members = getGroupView(db, groupId)!.members;
  const idOf = (name: string) => members.find((member) => member.name === name)!.id;

  createExpense(db, {
    groupId,
    description: "Groceries",
    amountCents: 9000,
    categoryId: "groceries",
    occurredOn: "2026-10-10",
    splitMode: "equal",
    payers: [{ personId: idOf("Alex"), amountCents: 9000 }],
    participants: members.map((member) => ({ personId: member.id, weight: 1 })),
  });

  let view = getGroupView(db, groupId)!;
  const net = (name: string) => view.balances.find((balance) => balance.name === name)!.cents;
  assert.equal(net("Alex"), 6000);
  assert.equal(net("Sam"), -3000);
  assert.equal(net("Jordan"), -3000);
  assert.equal(view.transfers.length, 2);

  createExpense(db, {
    groupId,
    description: "Dinner",
    amountCents: 10_000,
    categoryId: "food",
    occurredOn: "2026-10-11",
    splitMode: "exact",
    payers: [
      { personId: idOf("Alex"), amountCents: 7000 },
      { personId: idOf("Sam"), amountCents: 3000 },
    ],
    participants: [
      { personId: idOf("Alex"), weight: 4000 },
      { personId: idOf("Sam"), weight: 4000 },
      { personId: idOf("Jordan"), weight: 2000 },
    ],
  });

  createExpense(db, {
    groupId,
    description: "Firewood",
    amountCents: 2000,
    categoryId: "other",
    occurredOn: "2026-10-11",
    splitMode: "percent",
    payers: [{ personId: idOf("Jordan"), amountCents: 2000 }],
    participants: [
      { personId: idOf("Alex"), weight: 5000 },
      { personId: idOf("Sam"), weight: 5000 },
    ],
  });

  createExpense(db, {
    groupId,
    description: "Cabin",
    amountCents: 4000,
    categoryId: "rent",
    occurredOn: "2026-10-12",
    splitMode: "shares",
    payers: [{ personId: idOf("Alex"), amountCents: 4000 }],
    participants: [
      { personId: idOf("Alex"), weight: 100 },
      { personId: idOf("Sam"), weight: 100 },
      { personId: idOf("Jordan"), weight: 200 },
    ],
  });

  view = getGroupView(db, groupId)!;
  // Groceries: Alex +60, Sam -30, Jordan -30
  // Dinner: Alex +30, Sam -10, Jordan -20
  // Firewood: Jordan +20, Alex -10, Sam -10
  // Cabin: Alex +30, Sam -10, Jordan -20
  assert.equal(net("Alex"), 11_000);
  assert.equal(net("Sam"), -6000);
  assert.equal(net("Jordan"), -5000);
  assert.equal(
    view.balances.reduce((total, balance) => total + balance.cents, 0),
    0,
  );
  assert.ok(view.activity.some((item) => item.kind === "expense" && item.description === "Dinner"));
  assert.equal(view.activity.find((item) => item.description === "Cabin")?.splitMode, "shares");

  const settlementId = createSettlement(db, {
    groupId,
    fromPersonId: idOf("Sam"),
    toPersonId: idOf("Alex"),
    amountCents: 6000,
    occurredOn: "2026-10-13",
    note: "Cash",
  });

  view = getGroupView(db, groupId)!;
  assert.equal(net("Alex"), 5000);
  assert.equal(net("Sam"), 0);
  assert.equal(net("Jordan"), -5000);
  assert.deepEqual(
    view.transfers.map((transfer) => ({ from: transfer.fromName, to: transfer.toName, cents: transfer.cents })),
    [{ from: "Jordan", to: "Alex", cents: 5000 }],
  );
  assert.ok(view.activity.some((item) => item.kind === "settlement" && item.note === "Cash"));

  const people = getPeople(db);
  assert.equal(people.find((person) => person.name === "Alex")?.cents, 5000);
  assert.equal(people.find((person) => person.name === "Alex")?.isYou, true);

  db.close();
  const reopened = openDatabase(filename);
  const persisted = getGroupView(reopened, groupId)!;
  assert.equal(persisted.balances.find((balance) => balance.name === "Jordan")?.cents, -5000);
  assert.equal(persisted.activity.length, 5);

  deleteSettlement(reopened, settlementId);
  assert.equal(getGroupView(reopened, groupId)!.balances.find((balance) => balance.name === "Sam")?.cents, -6000);

  deleteGroup(reopened, groupId);
  assert.equal(getGroupView(reopened, groupId), null);
  assert.equal(getPeople(reopened).length, 3);
  reopened.close();
});
