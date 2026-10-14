import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS people_name_unique ON people(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, person_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tint TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id TEXT NOT NULL REFERENCES categories(id),
  split_mode TEXT NOT NULL CHECK (split_mode IN ('equal', 'percent', 'shares', 'exact')),
  occurred_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_payers (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (expense_id, person_id)
);

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (expense_id, person_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_person_id TEXT NOT NULL REFERENCES people(id),
  to_person_id TEXT NOT NULL REFERENCES people(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  CHECK (from_person_id <> to_person_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CATEGORIES: { id: string; name: string; tint: string }[] = [
  { id: "food", name: "Food & drink", tint: "#c24e2a" },
  { id: "groceries", name: "Groceries", tint: "#2f6f5e" },
  { id: "rent", name: "Rent & housing", tint: "#3d5a80" },
  { id: "transport", name: "Transport", tint: "#8a5a2a" },
  { id: "utilities", name: "Utilities", tint: "#6b4c7a" },
  { id: "fun", name: "Entertainment", tint: "#a33b4a" },
  { id: "travel", name: "Travel", tint: "#1f6b4a" },
  { id: "shopping", name: "Shopping", tint: "#b08a2e" },
  { id: "health", name: "Health", tint: "#3f6f8a" },
  { id: "other", name: "Other", tint: "#5c534a" },
];

export function openDatabase(filename: string): Database.Database {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(SCHEMA);
  const insertCategory = db.prepare(`INSERT OR IGNORE INTO categories (id, name, tint) VALUES (?, ?, ?)`);
  const seed = db.transaction(() => {
    for (const category of CATEGORIES) insertCategory.run(category.id, category.name, category.tint);
  });
  seed();
  return db;
}

const globalStore = globalThis as unknown as { __hearthDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalStore.__hearthDb) {
    const filename = process.env.HEARTH_DB_PATH ?? path.join(process.cwd(), "data", "hearth.db");
    globalStore.__hearthDb = openDatabase(filename);
  }
  return globalStore.__hearthDb;
}
