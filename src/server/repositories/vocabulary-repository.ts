import { db } from "../database/db.js";

export interface VocabularyUnit {
  id: number;
  label: string;
  entryCount: number;
  learningCount: number;
  consolidatingCount: number;
  secureCount: number;
  outCount: number;
  reviewStep: number;
  createdAt: string;
}

export const VOCABULARY_STATUSES = ["learning","consolidating","secure","out"] as const;
export type VocabularyStatus = (typeof VOCABULARY_STATUSES)[number];

export interface VocabularyEntry {
  id: number;
  unitId: number;
  englishTerm: string;
  germanTranslation: string;
  germanExplanation: string;
  status: VocabularyStatus;
  seenCount: number;
  lastSeenStep: number | null;
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
    SELECT u.id,u.label,u.review_step AS reviewStep,u.created_at AS createdAt,count(e.id) AS entryCount,
      sum(CASE WHEN e.status='learning' THEN 1 ELSE 0 END) AS learningCount,
      sum(CASE WHEN e.status='consolidating' THEN 1 ELSE 0 END) AS consolidatingCount,
      sum(CASE WHEN e.status='secure' THEN 1 ELSE 0 END) AS secureCount,
      sum(CASE WHEN e.status='out' THEN 1 ELSE 0 END) AS outCount
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
      status,seen_count AS seenCount,last_seen_step AS lastSeenStep,
      created_at AS createdAt
    FROM vocabulary_entries WHERE unit_id=? ORDER BY created_at,id
  `).all(unitId) as VocabularyEntry[];
}

export function getVocabularyEntry(id: number): VocabularyEntry | null {
  return (db.prepare(`
    SELECT id,unit_id AS unitId,english_term AS englishTerm,
      german_translation AS germanTranslation,german_explanation AS germanExplanation,
      status,seen_count AS seenCount,last_seen_step AS lastSeenStep,
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

const statusWeights: Record<Exclude<VocabularyStatus,"out">,number> = {
  learning: 1,
  consolidating: 0.6,
  secure: 0.3,
};

export const selectNextVocabularyEntry = db.transaction((unitId: number): VocabularyEntry | null => {
  const unit = db.prepare("SELECT review_step AS reviewStep FROM vocabulary_units WHERE id=?").get(unitId) as { reviewStep: number } | undefined;
  if (!unit) throw new Error("Unit nicht gefunden.");
  const entries = listVocabularyEntries(unitId).filter(entry => entry.status !== "out");
  if (!entries.length) return null;
  const unseen = entries.filter(entry => entry.lastSeenStep === null);
  let selected: VocabularyEntry;
  if (unseen.length) selected = unseen[Math.floor(Math.random() * unseen.length)]!;
  else {
    selected = entries.reduce((best,entry) => {
      const score = (unit.reviewStep - entry.lastSeenStep!) * statusWeights[entry.status as Exclude<VocabularyStatus,"out">];
      const bestScore = (unit.reviewStep - best.lastSeenStep!) * statusWeights[best.status as Exclude<VocabularyStatus,"out">];
      return score > bestScore || (score === bestScore && Math.random() < 0.5) ? entry : best;
    });
  }
  const nextStep = unit.reviewStep + 1;
  db.prepare("UPDATE vocabulary_units SET review_step=? WHERE id=?").run(nextStep,unitId);
  db.prepare("UPDATE vocabulary_entries SET seen_count=seen_count+1,last_seen_step=? WHERE id=?").run(nextStep,selected.id);
  return getVocabularyEntry(selected.id);
});

export function reviewVocabularyEntry(id: number,status: VocabularyStatus): VocabularyEntry | null {
  return db.prepare("UPDATE vocabulary_entries SET status=? WHERE id=?").run(status,id).changes ? getVocabularyEntry(id) : null;
}
