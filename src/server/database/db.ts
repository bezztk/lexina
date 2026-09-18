import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import { migrateWordInventory } from "./word-inventory-migration.js";

function findSourceRoot(startDirectory: string): string {
  let directory = startDirectory;
  while (!existsSync(path.join(directory, "package.json"))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Projektverzeichnis nicht gefunden.");
    directory = parent;
  }
  return directory;
}

export const sourceRoot = findSourceRoot(__dirname);
const databasePath = process.env.LEXINA_DATABASE_PATH || path.resolve(sourceRoot, "..", "data", "lexina.sqlite");

export const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

migrateWordInventory(db, databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('quote', 'poem')),
    content TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
  );

  CREATE TABLE IF NOT EXISTS quote_tags (
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (quote_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_quote_tags_tag_id ON quote_tags(tag_id);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    entry_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_at
    ON journal_entries(entry_at);
`);
