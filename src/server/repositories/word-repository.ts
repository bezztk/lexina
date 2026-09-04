import { db } from "../database/db.js";

export const WORD_STATUSES = ["unknown", "learning", "using", "familiar"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];
export const PARTS_OF_SPEECH = ["noun", "verb", "adjective"] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export interface Word {
  id: number;
  term: string;
  partOfSpeech: PartOfSpeech;
  status: WordStatus;
  similarWords: string[];
  exampleSentences: string[];
  createdAt: string;
}

interface WordInput {
  term: string;
  partOfSpeech: PartOfSpeech;
  status: WordStatus;
  similarWords: string[];
  exampleSentences: string[];
}

const selectAll = db.prepare(`
  SELECT id, term, part_of_speech AS partOfSpeech, status, created_at AS createdAt
  FROM words
  ORDER BY CASE status
    WHEN 'learning' THEN 0 WHEN 'using' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
    created_at DESC
`);

const selectById = db.prepare<number>(`
  SELECT id, term, part_of_speech AS partOfSpeech, status, created_at AS createdAt
  FROM words WHERE id = ?
`);

const selectSimilarWords = db.prepare<number>(`
  SELECT value FROM similar_words WHERE word_id = ? ORDER BY position
`);

const selectExampleSentences = db.prepare<number>(`
  SELECT value FROM example_sentences WHERE word_id = ? ORDER BY position
`);

type StoredWord = Omit<Word, "similarWords" | "exampleSentences">;

function hydrateWord(word: StoredWord): Word {
  return {
    ...word,
    similarWords: (selectSimilarWords.all(word.id) as { value: string }[]).map(({ value }) => value),
    exampleSentences: (selectExampleSentences.all(word.id) as { value: string }[]).map(({ value }) => value),
  };
}

export function listWords(): Word[] {
  return (selectAll.all() as StoredWord[]).map(hydrateWord);
}

export function getWord(id: number): Word | null {
  const word = selectById.get(id) as StoredWord | undefined;
  return word ? hydrateWord(word) : null;
}

function replaceDetails(wordId: number, input: WordInput): void {
  db.prepare("DELETE FROM similar_words WHERE word_id = ?").run(wordId);
  db.prepare("DELETE FROM example_sentences WHERE word_id = ?").run(wordId);
  const insertSimilar = db.prepare("INSERT INTO similar_words (word_id, value, position) VALUES (?, ?, ?)");
  const insertExample = db.prepare("INSERT INTO example_sentences (word_id, value, position) VALUES (?, ?, ?)");
  input.similarWords.forEach((value, position) => insertSimilar.run(wordId, value, position));
  input.exampleSentences.forEach((value, position) => insertExample.run(wordId, value, position));
}

export const createWord = db.transaction((input: WordInput): Word => {
  const result = db.prepare(`
    INSERT INTO words (term, part_of_speech, status) VALUES (@term, @partOfSpeech, @status)
  `).run(input);
  const id = Number(result.lastInsertRowid);
  replaceDetails(id, input);
  return getWord(id)!;
});

export const updateWord = db.transaction((id: number, input: WordInput): Word | null => {
  const result = db.prepare(`
    UPDATE words SET term = @term, part_of_speech = @partOfSpeech, status = @status
    WHERE id = @id
  `).run({ id, ...input });
  if (!result.changes) return null;
  replaceDetails(id, input);
  return getWord(id);
});

export function deleteWord(id: number): boolean {
  return db.prepare("DELETE FROM words WHERE id = ?").run(id).changes > 0;
}
