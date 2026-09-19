import { db } from "../database/db.js";
export const WORD_STATUSES = ["draft", "ready", "learning"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];
export interface WordInput {
  term: string; meaning: string; note: string; status: WordStatus;
  exampleSentence: string; englishTranslation: string; englishExampleSentence: string;
  meaningSpaceId: number | null; tags?: string[];
}
export interface Word extends Omit<WordInput, "tags"> { id: number; createdAt: string; tags: string[] }
export interface Space { id: number; label: string; note: string; exampleSentences: string[]; wordIds: number[] }
const selectWord = `SELECT id,term,meaning,note,status,example_sentence AS exampleSentence,
  english_translation AS englishTranslation,english_example_sentence AS englishExampleSentence,
  meaning_space_id AS meaningSpaceId,created_at AS createdAt FROM word_units`;

function hydrate(row: Record<string, unknown>): Word {
  const id = Number(row.id);
  return {
    ...row,
    tags: (db.prepare("SELECT t.name FROM tags t JOIN word_tags wt ON wt.tag_id=t.id WHERE wt.word_id=? ORDER BY t.name COLLATE NOCASE").all(id) as { name: string }[]).map(r => r.name),
  } as Word;
}
export function listWords(): Word[] {
  return (db.prepare(selectWord + " ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END,created_at DESC,id DESC").all() as Record<string, unknown>[]).map(hydrate);
}
export function getWord(id: number): Word | null {
  const row = db.prepare(selectWord + " WHERE id=?").get(id) as Record<string, unknown> | undefined;
  return row ? hydrate(row) : null;
}
function replaceDetails(id: number, input: WordInput): void {
  if (input.meaningSpaceId !== null && !db.prepare("SELECT 1 FROM meaning_spaces WHERE id=?").get(input.meaningSpaceId))
    throw new Error("Bedeutungsraum nicht gefunden.");
  db.prepare("DELETE FROM word_tags WHERE word_id=?").run(id);
  const findTag = db.prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE");
  const linkTag = db.prepare("INSERT INTO word_tags(word_id,tag_id) VALUES (?,?)");
  for (const name of [...new Set(input.tags || [])]) {
    const tag = findTag.get(name) as { id: number } | undefined;
    if (tag) linkTag.run(id,tag.id);
  }
}
export const createWord = db.transaction((input: WordInput): Word => {
  const id = Number(db.prepare(`INSERT INTO word_units
    (term,meaning,note,status,example_sentence,english_translation,english_example_sentence,meaning_space_id)
    VALUES (@term,@meaning,@note,@status,@exampleSentence,@englishTranslation,@englishExampleSentence,@meaningSpaceId)`).run(input).lastInsertRowid);
  replaceDetails(id,input);
  return getWord(id)!;
});
export const updateWord = db.transaction((id: number,input: WordInput): Word | null => {
  if (!db.prepare(`UPDATE word_units SET term=@term,meaning=@meaning,note=@note,status=@status,
    example_sentence=@exampleSentence,english_translation=@englishTranslation,
    english_example_sentence=@englishExampleSentence,meaning_space_id=@meaningSpaceId WHERE id=@id`).run({ ...input,id }).changes) return null;
  replaceDetails(id,input);
  return getWord(id)!;
});
export function deleteWord(id: number): boolean { return db.prepare("DELETE FROM word_units WHERE id=?").run(id).changes > 0; }

export function listSpaces(): Space[] {
  return (db.prepare("SELECT id,label,note,examples FROM meaning_spaces ORDER BY label COLLATE NOCASE,id").all() as Record<string, unknown>[]).map(row => ({
    id: Number(row.id), label: String(row.label), note: String(row.note), exampleSentences: JSON.parse(String(row.examples)),
    wordIds: (db.prepare("SELECT id FROM word_units WHERE meaning_space_id=? ORDER BY created_at,id").all(Number(row.id)) as { id: number }[]).map(r => r.id),
  }));
}
export const saveSpace = db.transaction((id: number | null,label: string,note: string,examples: string[]): Space | null => {
  if (id === null) id = Number(db.prepare("INSERT INTO meaning_spaces(label,note,examples) VALUES (?,?,?)").run(label,note,JSON.stringify(examples)).lastInsertRowid);
  else if (!db.prepare("UPDATE meaning_spaces SET label=?,note=?,examples=? WHERE id=?").run(label,note,JSON.stringify(examples),id).changes) return null;
  return listSpaces().find(s => s.id === id)!;
});
export function deleteSpace(id: number): boolean { return db.prepare("DELETE FROM meaning_spaces WHERE id=?").run(id).changes > 0; }
