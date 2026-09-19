import { db } from "../database/db.js";

export interface VocabularyUnit {
  id: number;
  label: string;
  entryCount: number;
  createdAt: string;
}

export interface VocabularyEntry {
  id: number;
  unitId: number;
  englishTerm: string;
  germanTranslation: string;
  germanExplanation: string;
  createdAt: string;
}

export interface VocabularyEntryInput {
  unitId: number;
  englishTerm: string;
  germanTranslation: string;
  germanExplanation: string;
}

export function listVocabularyUnits(): VocabularyUnit[] {
  return db.prepare(`
    SELECT u.id,u.label,u.created_at AS createdAt,count(e.id) AS entryCount
    FROM vocabulary_units u
    LEFT JOIN vocabulary_entries e ON e.unit_id=u.id
    GROUP BY u.id
    ORDER BY u.created_at,u.id
  `).all() as VocabularyUnit[];
}

export function getVocabularyUnit(id: number): VocabularyUnit | null {
  return listVocabularyUnits().find(unit => unit.id === id) || null;
}

export function saveVocabularyUnit(id: number | null,label: string): VocabularyUnit | null {
  if (id === null) id = Number(db.prepare("INSERT INTO vocabulary_units(label) VALUES (?)").run(label).lastInsertRowid);
  else if (!db.prepare("UPDATE vocabulary_units SET label=? WHERE id=?").run(label,id).changes) return null;
  return getVocabularyUnit(id);
}

export function deleteVocabularyUnit(id: number): boolean {
  return db.prepare("DELETE FROM vocabulary_units WHERE id=?").run(id).changes > 0;
}

export function listVocabularyEntries(unitId: number): VocabularyEntry[] {
  return db.prepare(`
    SELECT id,unit_id AS unitId,english_term AS englishTerm,
      german_translation AS germanTranslation,german_explanation AS germanExplanation,
      created_at AS createdAt
    FROM vocabulary_entries WHERE unit_id=? ORDER BY created_at,id
  `).all(unitId) as VocabularyEntry[];
}

export function getVocabularyEntry(id: number): VocabularyEntry | null {
  return (db.prepare(`
    SELECT id,unit_id AS unitId,english_term AS englishTerm,
      german_translation AS germanTranslation,german_explanation AS germanExplanation,
      created_at AS createdAt
    FROM vocabulary_entries WHERE id=?
  `).get(id) as VocabularyEntry | undefined) || null;
}

export function createVocabularyEntry(input: VocabularyEntryInput): VocabularyEntry {
  const id = Number(db.prepare(`
    INSERT INTO vocabulary_entries(unit_id,english_term,german_translation,german_explanation)
    VALUES (@unitId,@englishTerm,@germanTranslation,@germanExplanation)
  `).run(input).lastInsertRowid);
  return getVocabularyEntry(id)!;
}

export const importVocabularyEntries = db.transaction((inputs: VocabularyEntryInput[]): VocabularyEntry[] => {
  const insert = db.prepare(`
    INSERT INTO vocabulary_entries(unit_id,english_term,german_translation,german_explanation)
    VALUES (@unitId,@englishTerm,@germanTranslation,@germanExplanation)
  `);
  const ids = inputs.map(input => Number(insert.run(input).lastInsertRowid));
  return ids.map(id => getVocabularyEntry(id)!);
});

export function updateVocabularyEntry(id: number,input: VocabularyEntryInput): VocabularyEntry | null {
  const result = db.prepare(`
    UPDATE vocabulary_entries SET unit_id=@unitId,english_term=@englishTerm,
      german_translation=@germanTranslation,german_explanation=@germanExplanation WHERE id=@id
  `).run({ id,...input });
  return result.changes ? getVocabularyEntry(id) : null;
}

export function deleteVocabularyEntry(id: number): boolean {
  return db.prepare("DELETE FROM vocabulary_entries WHERE id=?").run(id).changes > 0;
}
