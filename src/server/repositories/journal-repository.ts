import { db } from "../database/db.js";

export interface JournalEntry {
  id: number;
  content: string;
  entryAt: string;
  createdAt: string;
  updatedAt: string | null;
  tags: string[];
}

interface JournalInput {
  content: string;
  entryAt: string;
  tags: string[];
}

const selectById = db.prepare<number>(`
  SELECT id, content, entry_at AS entryAt, created_at AS createdAt,
    updated_at AS updatedAt
  FROM journal_entries WHERE id = ?
`);

function hydrate(entry: Omit<JournalEntry, "tags">): JournalEntry {
  const tags = db.prepare("SELECT t.name FROM tags t JOIN journal_tags jt ON jt.tag_id=t.id WHERE jt.journal_id=? ORDER BY t.name COLLATE NOCASE").all(entry.id) as { name: string }[];
  return { ...entry,tags: tags.map(tag => tag.name) };
}

export function listJournalEntries(limit = 50): JournalEntry[] {
  const entries = db.prepare<number>(`
    SELECT id, content, entry_at AS entryAt, created_at AS createdAt,
      updated_at AS updatedAt
    FROM journal_entries
    WHERE id IN (SELECT id FROM journal_entries ORDER BY entry_at DESC,id DESC LIMIT ?)
    ORDER BY substr(entry_at,1,10) DESC,entry_at ASC,id ASC
  `).all(limit) as Omit<JournalEntry, "tags">[];
  return entries.map(hydrate);
}

export function getJournalEntry(id: number): JournalEntry | null {
  const entry = selectById.get(id) as Omit<JournalEntry, "tags"> | undefined;
  return entry ? hydrate(entry) : null;
}

function replaceTags(id: number,tags: string[]): void {
  db.prepare("DELETE FROM journal_tags WHERE journal_id=?").run(id);
  const findTag = db.prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE");
  const linkTag = db.prepare("INSERT INTO journal_tags(journal_id,tag_id) VALUES (?,?)");
  for (const name of [...new Set(tags)]) {
    const tag = findTag.get(name) as { id: number } | undefined;
    if (tag) linkTag.run(id,tag.id);
  }
}

export const createJournalEntry = db.transaction((input: JournalInput): JournalEntry => {
  const result = db.prepare(`
    INSERT INTO journal_entries (content, entry_at) VALUES (@content, @entryAt)
  `).run(input);
  const id = Number(result.lastInsertRowid);
  replaceTags(id,input.tags);
  return getJournalEntry(id)!;
});

export const updateJournalEntry = db.transaction((id: number, input: JournalInput): JournalEntry | null => {
  const result = db.prepare(`
    UPDATE journal_entries
    SET content = @content, entry_at = @entryAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = @id
  `).run({ id, ...input });
  if (!result.changes) return null;
  replaceTags(id,input.tags);
  return getJournalEntry(id);
});

export function deleteJournalEntry(id: number): boolean {
  return db.prepare("DELETE FROM journal_entries WHERE id = ?").run(id).changes > 0;
}
