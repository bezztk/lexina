import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const VERSION = "word-inventory-v1";
type LegacyRow = Record<string, unknown> & { id: number; term: string; status: string; created_at: string };
export function legacyStatus(status: string): string {
  if (["using", "learning"].includes(status)) return "learning";
  if (["familiar", "finished", "learned"].includes(status)) return "ready";
  return "draft";
}

export function migrateWordInventory(db: Database.Database, databasePath?: string): void {
  const exists = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  if (exists("schema_migrations") && db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(VERSION)) return;
  // Consistent snapshot (including committed WAL data) before any changes.
  // Backup failure stops migration; random suffix prevents overwriting backups.
  if (databasePath) {
    const backup = `${databasePath}.before-word-inventory-${Date.now()}-${randomUUID()}.bak`;
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  }
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE word_units (
        id INTEGER PRIMARY KEY, term TEXT NOT NULL CHECK(length(trim(term)) > 0),
        language TEXT NOT NULL DEFAULT 'de' CHECK(language IN ('de','en','tr')),
        meaning TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','learning')),
        legacy_data TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE meaning_spaces (
        id INTEGER PRIMARY KEY, label TEXT NOT NULL CHECK(length(trim(label)) > 0),
        note TEXT NOT NULL DEFAULT '', examples TEXT NOT NULL DEFAULT '[]', legacy_data TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE space_words (
        space_id INTEGER NOT NULL REFERENCES meaning_spaces(id) ON DELETE CASCADE,
        word_id INTEGER NOT NULL REFERENCES word_units(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, PRIMARY KEY(space_id,word_id), UNIQUE(space_id,position)
      );
      CREATE TABLE unit_examples (
        id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL REFERENCES word_units(id) ON DELETE CASCADE,
        value TEXT NOT NULL, position INTEGER NOT NULL
      );
      CREATE TABLE translations (
        id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL REFERENCES word_units(id) ON DELETE CASCADE,
        language TEXT NOT NULL CHECK(language IN ('de','en','tr')), text TEXT NOT NULL CHECK(length(trim(text)) > 0),
        note TEXT NOT NULL DEFAULT '', linked_word_id INTEGER REFERENCES word_units(id) ON DELETE SET NULL,
        position INTEGER NOT NULL
      );
      CREATE INDEX idx_unit_status_created ON word_units(status,created_at DESC,id DESC);
      CREATE INDEX idx_space_words_word ON space_words(word_id);
      CREATE INDEX idx_translations_word ON translations(word_id,position);
      CREATE INDEX idx_unit_examples_word ON unit_examples(word_id,position);
    `);
    const cards = exists("words") ? db.prepare("SELECT * FROM words ORDER BY id").all() as LegacyRow[] : [];
    const insertWord = db.prepare("INSERT INTO word_units(term,status,created_at,note,legacy_data) VALUES (?,?,?,?,?)");
    const insertExample = db.prepare("INSERT INTO unit_examples(word_id,value,position) VALUES (?,?,?)");
    let expectedWords = 0;
    let expectedSpaces = 0;
    let expectedLinks = 0;
    for (const card of cards) {
      const similar = exists("similar_words")
        ? db.prepare("SELECT * FROM similar_words WHERE word_id=? ORDER BY position,id").all(card.id) as Record<string, unknown>[] : [];
      const examples = exists("example_sentences")
        ? db.prepare("SELECT * FROM example_sentences WHERE word_id=? ORDER BY position,id").all(card.id) as Record<string, unknown>[] : [];
      const original = JSON.stringify({ card, similarWords: similar, exampleSentences: examples });
      const note = typeof card.note === "string" ? card.note : "";
      if (similar.length) {
        const spaceId = Number(db.prepare("INSERT INTO meaning_spaces(label,note,examples,legacy_data,created_at) VALUES (?,?,?,?,?)")
          .run(card.term, note, JSON.stringify(examples.map(row => row.value)), original, card.created_at).lastInsertRowid);
        expectedSpaces++;
        similar.forEach((row, position) => {
          // Never merge identical spellings: separate senses remain separate units.
          const wordId = Number(insertWord.run(String(row.value), legacyStatus(card.status), card.created_at, "", original).lastInsertRowid);
          db.prepare("INSERT INTO space_words VALUES (?,?,?)").run(spaceId, wordId, position);
          expectedWords++;
          expectedLinks++;
        });
      } else {
        const wordId = Number(insertWord.run(card.term, legacyStatus(card.status), card.created_at, note, original).lastInsertRowid);
        examples.forEach((row, position) => insertExample.run(wordId, String(row.value), position));
        expectedWords++;
      }
    }
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    if (count("word_units") !== expectedWords || count("meaning_spaces") !== expectedSpaces || count("space_words") !== expectedLinks
      || (db.pragma("foreign_key_check") as unknown[]).length) throw new Error("Migration konnte nicht vollständig überprüft werden.");
    // Keep original tables and complete row snapshots for historical information.
    db.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(VERSION);
  })();
}
