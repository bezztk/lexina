import { db } from "../database/db.js";

export const WORD_STATUSES = ["unknown", "learning", "using", "familiar"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

export interface Word {
  id: number;
  term: string;
  note: string | null;
  status: WordStatus;
  createdAt: string;
}

interface WordInput {
  term: string;
  note: string | null;
  status: WordStatus;
}

const selectAll = db.prepare(`
  SELECT id, term, note, status, created_at AS createdAt
  FROM words
  ORDER BY CASE status
    WHEN 'learning' THEN 0 WHEN 'using' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
    created_at DESC
`);

const selectById = db.prepare<number>(`
  SELECT id, term, note, status, created_at AS createdAt FROM words WHERE id = ?
`);

export function listWords(): Word[] {
  return selectAll.all() as Word[];
}

export function getWord(id: number): Word | null {
  return (selectById.get(id) as Word | undefined) ?? null;
}

export function createWord(input: WordInput): Word {
  const result = db.prepare(`
    INSERT INTO words (term, note, status) VALUES (@term, @note, @status)
  `).run(input);
  return getWord(Number(result.lastInsertRowid))!;
}

export function updateWord(id: number, input: WordInput): Word | null {
  const result = db.prepare(`
    UPDATE words SET term = @term, note = @note, status = @status WHERE id = @id
  `).run({ id, ...input });
  return result.changes ? getWord(id) : null;
}

export function deleteWord(id: number): boolean {
  return db.prepare("DELETE FROM words WHERE id = ?").run(id).changes > 0;
}
