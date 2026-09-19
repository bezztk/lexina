import { db } from "../database/db.js";
export const WORD_STATUSES = ["draft", "ready", "learning"] as const;
export const LANGUAGES = ["de", "en", "tr"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];
export type Language = (typeof LANGUAGES)[number];
export interface TranslationInput { language: Language; text: string; note: string; linkedWordId: number | null }
export interface WordInput {
  term: string; language: Language; meaning: string; note: string; status: WordStatus;
  exampleSentences: string[]; spaceIds: number[]; translations: TranslationInput[]; tags?: string[];
}
export interface Word extends Omit<WordInput, "tags"> { id: number; createdAt: string; legacyData: unknown; translationIds: number[]; tags: string[] }
export interface Space { id: number; label: string; note: string; exampleSentences: string[]; wordIds: number[]; legacyData: unknown }
const selectWord = "SELECT id,term,language,meaning,note,status,created_at AS createdAt,legacy_data AS legacyData FROM word_units";

function hydrate(row: Record<string, unknown>): Word {
  const id = Number(row.id);
  const translations = db.prepare("SELECT id,language,text,note,linked_word_id AS linkedWordId FROM translations WHERE word_id=? ORDER BY position,id").all(id) as (TranslationInput & { id: number })[];
  return {
    ...row, legacyData: row.legacyData ? JSON.parse(String(row.legacyData)) : null,
    exampleSentences: (db.prepare("SELECT value FROM unit_examples WHERE word_id=? ORDER BY position,id").all(id) as { value: string }[]).map(r => r.value),
    spaceIds: (db.prepare("SELECT space_id AS id FROM space_words WHERE word_id=? ORDER BY space_id").all(id) as { id: number }[]).map(r => r.id),
    tags: (db.prepare("SELECT t.name FROM tags t JOIN word_tags wt ON wt.tag_id=t.id WHERE wt.word_id=? ORDER BY t.name COLLATE NOCASE").all(id) as { name: string }[]).map(r => r.name),
    translations: translations.map(({ id: _id, ...translation }) => translation), translationIds: translations.map(t => t.id),
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
  for (const spaceId of input.spaceIds) if (!db.prepare("SELECT 1 FROM meaning_spaces WHERE id=?").get(spaceId)) throw new Error("Bedeutungsraum nicht gefunden.");
  for (const t of input.translations) {
    if (t.linkedWordId !== null) {
      const linked = getWord(t.linkedWordId);
      if (!linked || linked.language !== t.language || linked.id === id) throw new Error("Die verknüpfte Worteinheit muss existieren und zur Zielsprache passen.");
    }
  }
  db.prepare("DELETE FROM unit_examples WHERE word_id=?").run(id);
  input.exampleSentences.forEach((value, position) => db.prepare("INSERT INTO unit_examples(word_id,value,position) VALUES (?,?,?)").run(id, value, position));
  // Keep existing positions in every space; append newly selected memberships.
  const current = getWord(id)!.spaceIds;
  for (const spaceId of current) if (!input.spaceIds.includes(spaceId)) db.prepare("DELETE FROM space_words WHERE space_id=? AND word_id=?").run(spaceId,id);
  for (const spaceId of input.spaceIds) if (!current.includes(spaceId)) {
    db.prepare("INSERT INTO space_words(space_id,word_id,position) SELECT ?,?,COALESCE(MAX(position),-1)+1 FROM space_words WHERE space_id=?").run(spaceId,id,spaceId);
  }
  db.prepare("DELETE FROM translations WHERE word_id=?").run(id);
  input.translations.forEach((t, position) => db.prepare("INSERT INTO translations(word_id,language,text,note,linked_word_id,position) VALUES (?,?,?,?,?,?)")
    .run(id,t.language,t.text,t.note,t.linkedWordId,position));
  db.prepare("DELETE FROM word_tags WHERE word_id=?").run(id);
  const findTag = db.prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE");
  const linkTag = db.prepare("INSERT INTO word_tags(word_id,tag_id) VALUES (?,?)");
  for (const name of [...new Set(input.tags || [])]) {
    const tag = findTag.get(name) as { id: number } | undefined;
    if (tag) linkTag.run(id,tag.id);
  }
}
export const createWord = db.transaction((input: WordInput): Word => {
  const id = Number(db.prepare("INSERT INTO word_units(term,language,meaning,note,status) VALUES (@term,@language,@meaning,@note,@status)").run(input).lastInsertRowid);
  replaceDetails(id,input);
  return getWord(id)!;
});
export const updateWord = db.transaction((id: number,input: WordInput): Word | null => {
  const incompatible = db.prepare("SELECT 1 FROM translations WHERE linked_word_id=? AND language<>? LIMIT 1").get(id,input.language);
  if (incompatible) throw new Error("Die Sprache passt nicht zu Übersetzungen, die auf dieses Wort verweisen. Bitte zuerst deren Verknüpfung lösen.");
  if (!db.prepare("UPDATE word_units SET term=@term,language=@language,meaning=@meaning,note=@note,status=@status WHERE id=@id").run({ ...input,id }).changes) return null;
  replaceDetails(id,input);
  return getWord(id)!;
});
export function deleteWord(id: number): boolean { return db.prepare("DELETE FROM word_units WHERE id=?").run(id).changes > 0; }

export function listSpaces(): Space[] {
  return (db.prepare("SELECT id,label,note,examples,legacy_data AS legacyData FROM meaning_spaces ORDER BY label COLLATE NOCASE,id").all() as Record<string, unknown>[]).map(row => ({
    id: Number(row.id), label: String(row.label), note: String(row.note), exampleSentences: JSON.parse(String(row.examples)),
    legacyData: row.legacyData ? JSON.parse(String(row.legacyData)) : null,
    wordIds: (db.prepare("SELECT word_id AS id FROM space_words WHERE space_id=? ORDER BY position").all(Number(row.id)) as { id: number }[]).map(r => r.id),
  }));
}
export const saveSpace = db.transaction((id: number | null,label: string,note: string,examples: string[],wordIds?: number[]): Space | null => {
  if (wordIds && id !== null) {
    const current = listSpaces().find(s => s.id === id);
    if (!current) return null;
    if (new Set(wordIds).size !== wordIds.length || wordIds.some(wordId => !current.wordIds.includes(wordId)))
      throw new Error("Ungültige Zuordnungen. Neue Wörter bitte im Worteditor zuweisen.");
    db.prepare("DELETE FROM space_words WHERE space_id=?").run(id);
    wordIds.forEach((wordId,position) => db.prepare("INSERT INTO space_words VALUES (?,?,?)").run(id,wordId,position));
  }
  if (id === null) id = Number(db.prepare("INSERT INTO meaning_spaces(label,note,examples) VALUES (?,?,?)").run(label,note,JSON.stringify(examples)).lastInsertRowid);
  else if (!db.prepare("UPDATE meaning_spaces SET label=?,note=?,examples=? WHERE id=?").run(label,note,JSON.stringify(examples),id).changes) return null;
  return listSpaces().find(s => s.id === id)!;
});
export function deleteSpace(id: number): boolean { return db.prepare("DELETE FROM meaning_spaces WHERE id=?").run(id).changes > 0; }
export const reorderSpace = db.transaction((id: number,wordIds: number[]): boolean => {
  const space = listSpaces().find(s => s.id === id);
  if (!space) return false;
  if (wordIds.length !== space.wordIds.length || new Set(wordIds).size !== wordIds.length || wordIds.some(wordId => !space.wordIds.includes(wordId)))
    throw new Error("Die Reihenfolge muss alle zugeordneten Wörter genau einmal enthalten.");
  db.prepare("DELETE FROM space_words WHERE space_id=?").run(id);
  wordIds.forEach((wordId,position) => db.prepare("INSERT INTO space_words VALUES (?,?,?)").run(id,wordId,position));
  return true;
});
export function unlinkSpaceWord(spaceId: number,wordId: number): boolean {
  return db.prepare("DELETE FROM space_words WHERE space_id=? AND word_id=?").run(spaceId,wordId).changes > 0;
}
export const adoptTranslation = db.transaction((wordId: number,translationId: number,targetId: number | null): Word => {
  const translation = db.prepare("SELECT language,text,note,linked_word_id AS linkedWordId FROM translations WHERE id=? AND word_id=?").get(translationId,wordId) as TranslationInput | undefined;
  if (!translation) throw new Error("Übersetzung nicht gefunden.");
  if (targetId === null && translation.linkedWordId !== null) return getWord(translation.linkedWordId)!;
  const word = targetId === null ? createWord({
    term: translation.text,language: translation.language,meaning: "",note: translation.note,status: "draft",exampleSentences: [],spaceIds: [],translations: [],
  }) : getWord(targetId);
  if (!word || word.language !== translation.language || word.id === wordId) throw new Error("Passende Worteinheit in der Zielsprache auswählen.");
  db.prepare("UPDATE translations SET linked_word_id=? WHERE id=?").run(word.id,translationId);
  return word;
});
