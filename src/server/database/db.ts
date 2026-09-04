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
const databasePath = path.resolve(sourceRoot, "..", "data", "lexina.sqlite");

export const db = new Database(databasePath);
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY,
    term TEXT NOT NULL,
    part_of_speech TEXT NOT NULL DEFAULT 'noun'
      CHECK (part_of_speech IN ('noun', 'verb', 'adjective')),
    status TEXT NOT NULL DEFAULT 'unknown'
      CHECK (status IN ('unknown', 'learning', 'using', 'familiar')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const wordColumns = db.pragma("table_info(words)") as { name: string }[];
if (!wordColumns.some(({ name }) => name === "part_of_speech")) {
  db.exec(`ALTER TABLE words ADD COLUMN part_of_speech TEXT NOT NULL DEFAULT 'noun'
    CHECK (part_of_speech IN ('noun', 'verb', 'adjective'))`);
}
if (wordColumns.some(({ name }) => name === "note")) {
  db.exec("ALTER TABLE words DROP COLUMN note");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS similar_words (
    id INTEGER PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_similar_words_word_position
    ON similar_words(word_id, position);

  CREATE TABLE IF NOT EXISTS example_sentences (
    id INTEGER PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_example_sentences_word_position
    ON example_sentences(word_id, position);

  CREATE INDEX IF NOT EXISTS idx_words_status_created_at
    ON words(status, created_at DESC);

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
