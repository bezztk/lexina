import { Router } from "express";
import type { Request, Response } from "express";
import {
  WORD_STATUSES, createWord, deleteWord, importWords, listWords, updateWord,
  listSpaces, saveSpace, deleteSpace,
  type WordImportInput, type WordInput, type WordStatus,
} from "../repositories/word-repository.js";
export const wordsRouter = Router();
export const spacesRouter = Router();

const id = (value: unknown): number | null => {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function textList(value: unknown): string[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every(v => typeof v === "string") ? value.map(v => v.trim()).filter(Boolean) : null;
}
export function parseInput(body: unknown): WordInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  const term = text(data.term);
  const status = data.status ?? "draft";
  const meaningSpaceId = data.meaningSpaceId == null || data.meaningSpaceId === "" ? null : id(data.meaningSpaceId);
  const tags = textList(data.tags);
  if (!term || !WORD_STATUSES.includes(status as WordStatus)
    || (data.meaningSpaceId != null && data.meaningSpaceId !== "" && (meaningSpaceId === null || typeof data.meaningSpaceId !== "number")) || !tags) return null;
  return {
    term,status: status as WordStatus,meaning: text(data.meaning),
    exampleSentence: text(data.exampleSentence),englishTranslation: text(data.englishTranslation),
    englishExampleSentence: text(data.englishExampleSentence),meaningSpaceId,tags,
  };
}
function importWordInput(value: unknown,label: string): { input: WordInput | null;error: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { input: null,error: `${label} ist ungültig.` };
  const data = value as Record<string,unknown>;
  const stringFields = ["meaning","exampleSentence","englishTranslation","englishExampleSentence"] as const;
  const invalidField = stringFields.find(field => data[field] !== undefined && typeof data[field] !== "string");
  if (invalidField) return { input: null,error: `${label}: Das Feld „${invalidField}“ muss Text enthalten.` };
  const tags = textList(data.tags);
  if (!text(data.term)) return { input: null,error: `${label} benötigt das Feld „term“.` };
  if (data.status !== undefined && !WORD_STATUSES.includes(data.status as WordStatus))
    return { input: null,error: `${label}: „status“ muss draft, learning oder ready sein.` };
  if (!tags) return { input: null,error: `${label}: „tags“ muss eine Liste aus Texten sein.` };
  return { input: {
    term: text(data.term),status: (data.status ?? "draft") as WordStatus,meaning: text(data.meaning),
    exampleSentence: text(data.exampleSentence),englishTranslation: text(data.englishTranslation),
    englishExampleSentence: text(data.englishExampleSentence),meaningSpaceId: null,tags,
  },error: null };
}
export function parseImportInput(body: unknown): { input: WordImportInput | null;error: string | null } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { input: null,error: "Das JSON muss ein Objekt mit „meanings“ und/oder „words“ sein." };
  const data = body as Record<string,unknown>;
  const meanings = data.meanings ?? [];
  const standaloneWords = data.words ?? [];
  if (!Array.isArray(meanings) || !Array.isArray(standaloneWords))
    return { input: null,error: "„meanings“ und „words“ müssen Listen sein." };
  const input: WordImportInput = { meanings: [],words: [] };
  let wordCount = standaloneWords.length;
  for (const [meaningIndex,value] of meanings.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { input: null,error: `Bedeutung ${meaningIndex + 1} ist ungültig.` };
    const meaning = value as Record<string,unknown>;
    if (!text(meaning.label)) return { input: null,error: `Bedeutung ${meaningIndex + 1} benötigt das Feld „label“.` };
    if (meaning.explanation !== undefined && typeof meaning.explanation !== "string")
      return { input: null,error: `Bedeutung ${meaningIndex + 1}: „explanation“ muss Text enthalten.` };
    if (!Array.isArray(meaning.words) || !meaning.words.length)
      return { input: null,error: `Bedeutung ${meaningIndex + 1} benötigt mindestens ein Wort in „words“.` };
    const words: WordInput[] = [];
    for (const [wordIndex,word] of meaning.words.entries()) {
      const parsed = importWordInput(word,`Wort ${wordIndex + 1} in Bedeutung ${meaningIndex + 1}`);
      if (parsed.error) return { input: null,error: parsed.error };
      words.push(parsed.input!);
    }
    wordCount += words.length;
    input.meanings.push({ label: text(meaning.label),explanation: text(meaning.explanation),words });
  }
  for (const [wordIndex,word] of standaloneWords.entries()) {
    const parsed = importWordInput(word,`Freies Wort ${wordIndex + 1}`);
    if (parsed.error) return { input: null,error: parsed.error };
    input.words.push(parsed.input!);
  }
  if (!wordCount) return { input: null,error: "Das JSON muss mindestens ein Wort enthalten." };
  if (wordCount > 1000) return { input: null,error: "Pro Import sind höchstens 1000 Wörter möglich." };
  return { input,error: null };
}
// Transactions in the repository roll back invalid relations; present readable errors.
const safe = (handler: (request: Request,response: Response) => unknown) => (request: Request,response: Response) => {
  try { handler(request,response); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Ungültige Eingabe." }); }
};
wordsRouter.get("/", (_request,response) => response.json(listWords()));
wordsRouter.post("/", safe((request,response) => {
  const input = parseInput(request.body);
  if (!input) return response.status(400).json({ error: "Wort, Status oder Ergänzungen sind ungültig." });
  return response.status(201).json(createWord(input));
}));
wordsRouter.post("/import", safe((request,response) => {
  const parsed = parseImportInput(request.body);
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const imported = importWords(parsed.input!);
  return response.status(201).json({ importedWords: imported.words.length,importedMeanings: imported.spaces.length });
}));
wordsRouter.put("/:id", safe((request,response) => {
  const input = parseInput(request.body);
  const wordId = id(request.params.id);
  if (!input || wordId === null) return response.status(400).json({ error: "Ungültige Eingabe." });
  const word = updateWord(wordId,input);
  return word ? response.json(word) : response.status(404).json({ error: "Wort nicht gefunden." });
}));
wordsRouter.delete("/:id", (request,response) => {
  const wordId = id(request.params.id);
  return wordId !== null && deleteWord(wordId) ? response.status(204).end() : response.status(404).json({ error: "Wort nicht gefunden." });
});
spacesRouter.get("/", (_request,response) => response.json(listSpaces()));
for (const method of ["post", "put"] as const) {
  spacesRouter[method](method === "post" ? "/" : "/:id", safe((request,response) => {
    const spaceId = method === "post" ? null : id(request.params.id);
    const label = text(request.body?.label);
    if (!label || (method === "put" && spaceId === null)) return response.status(400).json({ error: "Bezeichnung ist ungültig." });
    const space = saveSpace(spaceId,label,text(request.body?.explanation));
    return space ? response.status(method === "post" ? 201 : 200).json(space) : response.status(404).json({ error: "Bedeutungsraum nicht gefunden." });
  }));
}
spacesRouter.delete("/:id", (request,response) => {
  const spaceId = id(request.params.id);
  return spaceId !== null && deleteSpace(spaceId) ? response.status(204).end() : response.status(404).json({ error: "Bedeutungsraum nicht gefunden." });
});
