import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";

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

const wordTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='word_units'").get();
const wordColumns = wordTable
  ? (db.prepare("PRAGMA table_info(word_units)").all() as { name: string }[]).map(column => column.name)
  : [];
const currentWordColumns = ["id","term","meaning","note","status","example_sentence","english_translation","english_example_sentence","meaning_space_id","created_at"];
if (wordTable && (wordColumns.length !== currentWordColumns.length || currentWordColumns.some(column => !wordColumns.includes(column)))) {
  db.exec(`
    DROP TABLE IF EXISTS word_tags;
    DROP TABLE IF EXISTS space_words;
    DROP TABLE IF EXISTS unit_examples;
    DROP TABLE IF EXISTS translations;
    DROP TABLE IF EXISTS word_units;
    DROP TABLE IF EXISTS meaning_spaces;
  `);
}

db.exec(`
  DROP TABLE IF EXISTS space_words;
  DROP TABLE IF EXISTS unit_examples;
  DROP TABLE IF EXISTS translations;
  DROP TABLE IF EXISTS similar_words;
  DROP TABLE IF EXISTS example_sentences;
  DROP TABLE IF EXISTS words;
  DROP TABLE IF EXISTS schema_migrations;
`);

const meaningTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meaning_spaces'").get();
const meaningColumns = meaningTable
  ? (db.prepare("PRAGMA table_info(meaning_spaces)").all() as { name: string }[]).map(column => column.name)
  : [];
if (meaningColumns.includes("note") && !meaningColumns.includes("explanation"))
  db.exec("ALTER TABLE meaning_spaces RENAME COLUMN note TO explanation");
if (meaningColumns.includes("examples")) db.exec("ALTER TABLE meaning_spaces DROP COLUMN examples");

db.exec(`
  CREATE TABLE IF NOT EXISTS meaning_spaces (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL CHECK(length(trim(label)) > 0),
    explanation TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS word_units (
    id INTEGER PRIMARY KEY,
    term TEXT NOT NULL CHECK(length(trim(term)) > 0),
    meaning TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','learning')),
    example_sentence TEXT NOT NULL DEFAULT '',
    english_translation TEXT NOT NULL DEFAULT '',
    english_example_sentence TEXT NOT NULL DEFAULT '',
    meaning_space_id INTEGER REFERENCES meaning_spaces(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_unit_status_created ON word_units(status,created_at DESC,id DESC);
  CREATE INDEX IF NOT EXISTS idx_unit_meaning_space ON word_units(meaning_space_id);

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

  CREATE TABLE IF NOT EXISTS word_tags (
    word_id INTEGER NOT NULL REFERENCES word_units(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (word_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_word_tags_tag_id ON word_tags(tag_id);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    entry_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_at
    ON journal_entries(entry_at);

  CREATE TABLE IF NOT EXISTS journal_tags (
    journal_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (journal_id, tag_id)
  );

  CREATE INDEX IF NOT EXISTS idx_journal_tags_tag_id ON journal_tags(tag_id);
`);
