import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import { sourceRoot } from "../database/db.js";

const thesaurusPath = path.resolve(sourceRoot, "..", "data", "openthesaurus.sqlite");

interface SynonymRow {
  word: string;
  synsetId: number;
  levelId: number | null;
  tagCount: number;
}

function openThesaurus(): Database.Database | null {
  return existsSync(thesaurusPath)
    ? new Database(thesaurusPath, { readonly: true, fileMustExist: true })
    : null;
}

function displayPenalty(row: SynonymRow): number {
  const phrasePenalty = /[\s()]/.test(row.word) ? 2 : 0;
  return (row.levelId === null ? 0 : 1) + row.tagCount + phrasePenalty;
}

export function findRelevantSynonyms(term: string, limit = 8): string[] {
  const database = openThesaurus();
  if (!database) return [];

  try {
    const synsets = database.prepare(`
      SELECT DISTINCT synset_id AS synsetId
      FROM term
      WHERE word = ? COLLATE NOCASE
    `).all(term) as { synsetId: number }[];
    if (!synsets.length) return [];

    const placeholders = synsets.map(() => "?").join(", ");
    const rows = database.prepare(`
      SELECT t.word, t.synset_id AS synsetId, t.level_id AS levelId,
        COUNT(tt.tag_id) AS tagCount
      FROM term t
      LEFT JOIN term_tag tt ON tt.term_tags_id = t.id
      WHERE t.synset_id IN (${placeholders})
        AND t.word <> ? COLLATE NOCASE
      GROUP BY t.id
    `).all(...synsets.map(({ synsetId }) => synsetId), term) as SynonymRow[];

    const candidates = new Map<string, { word: string; synsets: Set<number>; penalty: number }>();
    for (const row of rows) {
      const key = row.word.toLocaleLowerCase("de");
      const candidate = candidates.get(key) ?? {
        word: row.word,
        synsets: new Set<number>(),
        penalty: displayPenalty(row),
      };
      candidate.synsets.add(row.synsetId);
      candidate.penalty = Math.min(candidate.penalty, displayPenalty(row));
      candidates.set(key, candidate);
    }

    return [...candidates.values()]
      .sort((left, right) => right.synsets.size - left.synsets.size
        || left.penalty - right.penalty
        || left.word.length - right.word.length
        || left.word.localeCompare(right.word, "de"))
      .slice(0, limit)
      .map(({ word }) => word);
  } finally {
    database.close();
  }
}
