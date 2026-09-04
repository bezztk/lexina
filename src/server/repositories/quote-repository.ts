import { db } from "../database/db.js";

export type QuoteType = "quote" | "poem";

export interface Quote {
  id: number;
  type: QuoteType;
  content: string;
  note: string | null;
  tags: string[];
  createdAt: string;
}

interface QuoteInput {
  type: QuoteType;
  content: string;
  note: string | null;
  tags: string[];
}

interface QuoteRow extends Omit<Quote, "tags"> {
  tags: string | null;
}

const selectBase = `
  SELECT q.id, q.type, q.content, q.note, q.created_at AS createdAt,
    group_concat(t.name, char(31)) AS tags
  FROM quotes q
  LEFT JOIN quote_tags qt ON qt.quote_id = q.id
  LEFT JOIN tags t ON t.id = qt.tag_id
`;

function mapQuote(row: QuoteRow): Quote {
  return { ...row, tags: row.tags ? row.tags.split(String.fromCharCode(31)) : [] };
}

export function listQuotes(): Quote[] {
  const rows = db.prepare(`${selectBase} GROUP BY q.id ORDER BY q.created_at DESC`).all() as QuoteRow[];
  return rows.map(mapQuote);
}

export function getQuote(id: number): Quote | null {
  const row = db.prepare<number>(`${selectBase} WHERE q.id = ? GROUP BY q.id`).get(id) as
    | QuoteRow
    | undefined;
  return row ? mapQuote(row) : null;
}

function replaceTags(quoteId: number, tags: string[]): void {
  db.prepare("DELETE FROM quote_tags WHERE quote_id = ?").run(quoteId);
  const findTag = db.prepare<string>("SELECT id FROM tags WHERE name = ? COLLATE NOCASE");
  const linkTag = db.prepare("INSERT INTO quote_tags (quote_id, tag_id) VALUES (?, ?)");

  for (const name of [...new Set(tags)]) {
    const tag = findTag.get(name) as { id: number } | undefined;
    if (tag) linkTag.run(quoteId, tag.id);
  }
}

export const createQuote = db.transaction((input: QuoteInput): Quote => {
  const result = db.prepare(`
    INSERT INTO quotes (type, content, note) VALUES (@type, @content, @note)
  `).run(input);
  const id = Number(result.lastInsertRowid);
  replaceTags(id, input.tags);
  return getQuote(id)!;
});

export const updateQuote = db.transaction((id: number, input: QuoteInput): Quote | null => {
  const result = db.prepare(`
    UPDATE quotes SET type = @type, content = @content, note = @note WHERE id = @id
  `).run({ id, ...input });
  if (!result.changes) return null;
  replaceTags(id, input.tags);
  return getQuote(id);
});

export function deleteQuote(id: number): boolean {
  return db.prepare("DELETE FROM quotes WHERE id = ?").run(id).changes > 0;
}

export interface Tag {
  id: number;
  name: string;
}

export function listTags(): Tag[] {
  return db.prepare("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE").all() as Tag[];
}

export function createTag(name: string): Tag {
  db.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
  return db.prepare<string>("SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE").get(name) as Tag;
}

export function deleteTag(id: number): boolean {
  return db.prepare("DELETE FROM tags WHERE id = ?").run(id).changes > 0;
}
