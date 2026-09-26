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
export const VOCABULARY_PROMPT_KEYS = ["englishTerm","germanTranslation","germanExplanation"] as const;
export type VocabularyPromptKey = (typeof VOCABULARY_PROMPT_KEYS)[number];
export type VocabularyReviewResult = "known" | "missed";

export interface VocabularyDirectionStats {
  attempts: number;
  correct: number;
  correctStreak: number;
  missedStreak: number;
  lastResult: VocabularyReviewResult | null;
  lastReviewedStep: number | null;
}

export interface VocabularyReviewStats {
  total: number;
  correct: number;
  lastResult: VocabularyReviewResult | null;
  directions: Record<VocabularyPromptKey,VocabularyDirectionStats>;
}

export interface VocabularyEntry {
  id: number;
  unitId: number;
  englishTerm: string;
  germanTranslation: string;
  germanExplanation: string;
  status: VocabularyStatus;
  seenCount: number;
  lastSeenStep: number | null;
  lastPromptIndex: number | null;
  reviewStats: VocabularyReviewStats;
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

const emptyDirectionStats = (): VocabularyDirectionStats => ({
  attempts: 0,correct: 0,correctStreak: 0,missedStreak: 0,lastResult: null,lastReviewedStep: null,
});

function getReviewStats(entryId: number): VocabularyReviewStats {
  const directions = Object.fromEntries(VOCABULARY_PROMPT_KEYS.map(key => [key,emptyDirectionStats()])) as Record<VocabularyPromptKey,VocabularyDirectionStats>;
  const rows = db.prepare(`SELECT prompt_key AS promptKey,result,review_step AS reviewStep
    FROM vocabulary_reviews WHERE entry_id=? ORDER BY review_step,id`).all(entryId) as {
      promptKey: VocabularyPromptKey;result: VocabularyReviewResult;reviewStep: number;
    }[];
  let correct = 0;
  for (const row of rows) {
    const stats = directions[row.promptKey];
    stats.attempts += 1;
    stats.lastResult = row.result;
    stats.lastReviewedStep = row.reviewStep;
    if (row.result === "known") {
      correct += 1; stats.correct += 1; stats.correctStreak += 1; stats.missedStreak = 0;
    } else {
      stats.correctStreak = 0; stats.missedStreak += 1;
    }
  }
  return { total: rows.length,correct,lastResult: rows.at(-1)?.result || null,directions };
}

function hydrateEntry(row: Omit<VocabularyEntry,"reviewStats">): VocabularyEntry {
  return { ...row,reviewStats: getReviewStats(row.id) };
}

export function listVocabularyEntries(unitId: number): VocabularyEntry[] {
  const rows = db.prepare(`
    SELECT id,unit_id AS unitId,english_term AS englishTerm,
      german_translation AS germanTranslation,german_explanation AS germanExplanation,
      status,seen_count AS seenCount,last_seen_step AS lastSeenStep,last_prompt_index AS lastPromptIndex,
      created_at AS createdAt
    FROM vocabulary_entries WHERE unit_id=? ORDER BY created_at,id
  `).all(unitId) as Omit<VocabularyEntry,"reviewStats">[];
  return rows.map(hydrateEntry);
}

export function getVocabularyEntry(id: number): VocabularyEntry | null {
  const row = db.prepare(`
    SELECT id,unit_id AS unitId,english_term AS englishTerm,
      german_translation AS germanTranslation,german_explanation AS germanExplanation,
      status,seen_count AS seenCount,last_seen_step AS lastSeenStep,last_prompt_index AS lastPromptIndex,
      created_at AS createdAt
    FROM vocabulary_entries WHERE id=?
  `).get(id) as Omit<VocabularyEntry,"reviewStats"> | undefined;
  return row ? hydrateEntry(row) : null;
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
  const activeEntries = entries.filter(entry => entry.status !== "secure");
  const statusPool = activeEntries.length ? activeEntries : entries;
  const alternatives = statusPool.filter(entry => entry.lastSeenStep !== unit.reviewStep);
  const candidates = alternatives.length ? alternatives : statusPool;
  const unseen = candidates.filter(entry => entry.reviewStats.total === 0);
  let selected: VocabularyEntry;
  if (unseen.length) selected = unseen[Math.floor(Math.random() * unseen.length)]!;
  else {
    selected = candidates.reduce((best,entry) => {
      const score = (unit.reviewStep - (entry.lastSeenStep || 0)) * statusWeights[entry.status as Exclude<VocabularyStatus,"out">]
        + (entry.reviewStats.lastResult === "missed" ? 5 : 0);
      const bestScore = (unit.reviewStep - (best.lastSeenStep || 0)) * statusWeights[best.status as Exclude<VocabularyStatus,"out">]
        + (best.reviewStats.lastResult === "missed" ? 5 : 0);
      return score > bestScore || (score === bestScore && Math.random() < 0.5) ? entry : best;
    });
  }
  const nextStep = unit.reviewStep + 1;
  const availablePromptKeys = VOCABULARY_PROMPT_KEYS.filter(key => key !== "germanExplanation"
    || (selected.status !== "learning" && selected.germanExplanation));
  const unitDirectionCounts = Object.fromEntries(VOCABULARY_PROMPT_KEYS.map(key => [key,0])) as Record<VocabularyPromptKey,number>;
  for (const row of db.prepare(`SELECT r.prompt_key AS promptKey,count(*) AS count
    FROM vocabulary_reviews r JOIN vocabulary_entries e ON e.id=r.entry_id
    WHERE e.unit_id=? GROUP BY r.prompt_key`).all(unitId) as { promptKey: VocabularyPromptKey;count: number }[])
    unitDirectionCounts[row.promptKey] = row.count;
  const promptTargets: Record<VocabularyPromptKey,number> | null = selected.status === "learning"
    ? { englishTerm: 1,germanTranslation: 1,germanExplanation: 0 }
    : selected.status === "consolidating"
      ? { englishTerm: 2,germanTranslation: 2,germanExplanation: selected.germanExplanation ? 1 : 0 }
      : null;
  let promptCandidates = promptTargets
    ? availablePromptKeys.filter(key => selected.reviewStats.directions[key].correct < promptTargets[key])
    : [];
  if (promptCandidates.length) {
    const lowestProgress = Math.min(...promptCandidates.map(key => selected.reviewStats.directions[key].correct / promptTargets![key]));
    promptCandidates = promptCandidates.filter(key => selected.reviewStats.directions[key].correct / promptTargets![key] === lowestProgress);
    const fewestInUnit = Math.min(...promptCandidates.map(key => unitDirectionCounts[key]));
    promptCandidates = promptCandidates.filter(key => unitDirectionCounts[key] === fewestInUnit);
    const oldestReview = Math.min(...promptCandidates.map(key => selected.reviewStats.directions[key].lastReviewedStep || 0));
    promptCandidates = promptCandidates.filter(key => (selected.reviewStats.directions[key].lastReviewedStep || 0) === oldestReview);
  } else {
    const missed = availablePromptKeys.filter(key => selected.reviewStats.directions[key].lastResult === "missed");
    promptCandidates = missed.length ? missed : [...availablePromptKeys].sort((left,right) => {
      const a = selected.reviewStats.directions[left];
      const b = selected.reviewStats.directions[right];
      const accuracyDifference = (a.attempts ? a.correct / a.attempts : 0) - (b.attempts ? b.correct / b.attempts : 0);
      return accuracyDifference || a.attempts - b.attempts || (a.lastReviewedStep || 0) - (b.lastReviewedStep || 0);
    }).slice(0,1);
  }
  const promptKey = promptCandidates[(nextStep - 1) % promptCandidates.length]!;
  const promptIndex = VOCABULARY_PROMPT_KEYS.indexOf(promptKey);
  db.prepare("UPDATE vocabulary_units SET review_step=? WHERE id=?").run(nextStep,unitId);
  db.prepare("UPDATE vocabulary_entries SET seen_count=seen_count+1,last_seen_step=?,last_prompt_index=? WHERE id=?").run(nextStep,promptIndex,selected.id);
  return getVocabularyEntry(selected.id);
});

export const reviewVocabularyEntry = db.transaction((id: number,result: VocabularyReviewResult): VocabularyEntry | null => {
  const entry = getVocabularyEntry(id);
  if (!entry) return null;
  if (entry.status === "out") throw new Error("Diese Vokabel ist aus der Übung genommen.");
  if (entry.lastPromptIndex === null || entry.lastSeenStep === null) throw new Error("Die Vokabel wurde noch nicht abgefragt.");
  const promptKey = VOCABULARY_PROMPT_KEYS[entry.lastPromptIndex];
  if (!promptKey || (promptKey === "germanExplanation" && !entry.germanExplanation)) throw new Error("Ungültige Fragerichtung.");
  db.prepare("INSERT INTO vocabulary_reviews(entry_id,prompt_key,result,review_step) VALUES (?,?,?,?)")
    .run(id,promptKey,result,entry.lastSeenStep);
  const stats = getReviewStats(id);
  let status = entry.status;
  if (result === "known") {
    const coreIntroduced = stats.directions.englishTerm.correct >= 1 && stats.directions.germanTranslation.correct >= 1;
    const coreSecure = stats.directions.englishTerm.correct >= 2 && stats.directions.germanTranslation.correct >= 2;
    const meaningSecure = !entry.germanExplanation || stats.directions.germanExplanation.correct >= 1;
    if (entry.status === "learning") status = coreIntroduced ? "consolidating" : "learning";
    else if (entry.status === "consolidating") status = coreSecure && meaningSecure ? "secure" : "consolidating";
  } else if (entry.status === "secure" && stats.directions[promptKey].missedStreak >= 2) status = "consolidating";
  db.prepare("UPDATE vocabulary_entries SET status=? WHERE id=?").run(status,id);
  return getVocabularyEntry(id);
});

export function takeVocabularyEntryOut(id: number): VocabularyEntry | null {
  return db.prepare("UPDATE vocabulary_entries SET status='out' WHERE id=? AND status<>'out'").run(id).changes ? getVocabularyEntry(id) : null;
}
