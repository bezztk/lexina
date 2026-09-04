import { db } from "../database/db.js";

export interface JournalEntry {
  id: number;
  content: string;
  entryAt: string;
  createdAt: string;
  updatedAt: string | null;
}

interface JournalInput {
  content: string;
  entryAt: string;
}

const selectById = db.prepare<number>(`
  SELECT id, content, entry_at AS entryAt, created_at AS createdAt,
    updated_at AS updatedAt
  FROM journal_entries WHERE id = ?
`);

export function listJournalEntries(date: string): JournalEntry[] {
  return db.prepare<string>(`
    SELECT id, content, entry_at AS entryAt, created_at AS createdAt,
      updated_at AS updatedAt
    FROM journal_entries
    WHERE substr(entry_at, 1, 10) = ?
    ORDER BY entry_at ASC
  `).all(date) as JournalEntry[];
}

export function getJournalEntry(id: number): JournalEntry | null {
  return (selectById.get(id) as JournalEntry | undefined) ?? null;
}

export function createJournalEntry(input: JournalInput): JournalEntry {
  const result = db.prepare(`
    INSERT INTO journal_entries (content, entry_at) VALUES (@content, @entryAt)
  `).run(input);
  return getJournalEntry(Number(result.lastInsertRowid))!;
}

export function updateJournalEntry(id: number, input: JournalInput): JournalEntry | null {
  const result = db.prepare(`
    UPDATE journal_entries
    SET content = @content, entry_at = @entryAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = @id
  `).run({ id, ...input });
  return result.changes ? getJournalEntry(id) : null;
}

export function deleteJournalEntry(id: number): boolean {
  return db.prepare("DELETE FROM journal_entries WHERE id = ?").run(id).changes > 0;
}
