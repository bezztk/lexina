import { db } from "../database/db.js";

export const WORD_STATUSES = ["unknown", "using", "familiar"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];
export const PARTS_OF_SPEECH = ["noun", "verb", "adjective"] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export interface Word {
  id: number;
  familyId: number;
  term: string;
  partOfSpeech: PartOfSpeech;
  status: WordStatus;
  similarWords: string[];
  exampleSentences: string[];
  createdAt: string;
}

export interface WordFamily {
  id: number;
  createdAt: string;
  forms: Word[];
}

interface WordInput {
  term: string;
  partOfSpeech: PartOfSpeech;
  status: WordStatus;
  similarWords: string[];
  exampleSentences: string[];
}

const selectAll = db.prepare(`
  SELECT words.id, words.family_id AS familyId, words.term,
    words.part_of_speech AS partOfSpeech, words.status,
    words.created_at AS createdAt, word_families.created_at AS familyCreatedAt
  FROM words
  JOIN word_families ON word_families.id = words.family_id
  ORDER BY CASE status
    WHEN 'using' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
    word_families.created_at DESC,
    CASE part_of_speech WHEN 'noun' THEN 0 WHEN 'verb' THEN 1 ELSE 2 END
`);

const selectById = db.prepare<number>(`
  SELECT id, family_id AS familyId, term, part_of_speech AS partOfSpeech, status, created_at AS createdAt
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

type StoredFamilyWord = StoredWord & { familyCreatedAt: string };

export function listWords(): WordFamily[] {
  const families = new Map<number, WordFamily>();
  (selectAll.all() as StoredFamilyWord[]).forEach((storedWord) => {
    const { familyCreatedAt, ...word } = storedWord;
    const family = families.get(word.familyId) ?? {
      id: word.familyId,
      createdAt: familyCreatedAt,
      forms: [],
    };
    family.forms.push(hydrateWord(word));
    families.set(family.id, family);
  });
  const partOrder: Record<PartOfSpeech, number> = { noun: 0, verb: 1, adjective: 2 };
  families.forEach((family) => family.forms.sort(
    (left, right) => partOrder[left.partOfSpeech] - partOrder[right.partOfSpeech],
  ));
  return [...families.values()];
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
  const familyId = Number(db.prepare("INSERT INTO word_families DEFAULT VALUES").run().lastInsertRowid);
  const result = db.prepare(`
    INSERT INTO words (family_id, term, part_of_speech, status)
    VALUES (@familyId, @term, @partOfSpeech, @status)
  `).run({ familyId, ...input });
  const id = Number(result.lastInsertRowid);
  replaceDetails(id, input);
  return getWord(id)!;
});

export const createDerivation = db.transaction((familyId: number, input: WordInput): Word | null => {
  const familyExists = db.prepare("SELECT 1 FROM word_families WHERE id = ?").get(familyId);
  if (!familyExists) return null;
  const duplicate = db.prepare("SELECT 1 FROM words WHERE family_id = ? AND part_of_speech = ?")
    .get(familyId, input.partOfSpeech);
  if (duplicate) return null;
  const result = db.prepare(`
    INSERT INTO words (family_id, term, part_of_speech, status)
    VALUES (@familyId, @term, @partOfSpeech, @status)
  `).run({ familyId, ...input });
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

export const deleteWord = db.transaction((id: number): boolean => {
  const word = getWord(id);
  if (!word) return false;
  const deleted = db.prepare("DELETE FROM words WHERE id = ?").run(id).changes > 0;
  const remainingForms = db.prepare("SELECT 1 FROM words WHERE family_id = ?").get(word.familyId);
  if (!remainingForms) db.prepare("DELETE FROM word_families WHERE id = ?").run(word.familyId);
  return deleted;
});
