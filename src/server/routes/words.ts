import { Router } from "express";
import type { Request, Response } from "express";
import {
  WORD_STATUSES, createWord, deleteWord, listWords, updateWord,
  listSpaces, saveSpace, deleteSpace, reorderSpace, unlinkSpaceWord,
  type WordInput, type WordStatus,
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
  const spaceIds = data.spaceIds ?? [];
  const tags = textList(data.tags);
  if (!term || !WORD_STATUSES.includes(status as WordStatus) || !Array.isArray(spaceIds)
    || spaceIds.some(v => id(v) === null || typeof v !== "number")
    || new Set(spaceIds).size !== spaceIds.length || !tags) return null;
  return {
    term,status: status as WordStatus,meaning: text(data.meaning),note: text(data.note),
    exampleSentence: text(data.exampleSentence),englishTranslation: text(data.englishTranslation),
    englishExampleSentence: text(data.englishExampleSentence),spaceIds,tags,
  };
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
    const examples = textList(request.body?.exampleSentences);
    const wordIds = request.body?.wordIds;
    if (wordIds !== undefined && (!Array.isArray(wordIds) || wordIds.some(v => typeof v !== "number" || id(v) === null)))
      return response.status(400).json({ error: "Ungültige Zuordnungen." });
    if (!label || !examples || (method === "put" && spaceId === null)) return response.status(400).json({ error: "Bezeichnung oder Beispiele sind ungültig." });
    const space = saveSpace(spaceId,label,text(request.body?.note),examples,wordIds);
    return space ? response.status(method === "post" ? 201 : 200).json(space) : response.status(404).json({ error: "Bedeutungsraum nicht gefunden." });
  }));
}
spacesRouter.delete("/:id", (request,response) => {
  const spaceId = id(request.params.id);
  return spaceId !== null && deleteSpace(spaceId) ? response.status(204).end() : response.status(404).json({ error: "Bedeutungsraum nicht gefunden." });
});
spacesRouter.put("/:id/order", safe((request,response) => {
  const spaceId = id(request.params.id);
  const wordIds = request.body?.wordIds;
  if (spaceId === null || !Array.isArray(wordIds) || wordIds.some(v => typeof v !== "number" || id(v) === null))
    return response.status(400).json({ error: "Ungültige Reihenfolge." });
  return reorderSpace(spaceId,wordIds) ? response.status(204).end() : response.status(404).json({ error: "Bedeutungsraum nicht gefunden." });
}));
spacesRouter.delete("/:id/words/:wordId", (request,response) => {
  const spaceId = id(request.params.id), wordId = id(request.params.wordId);
  return spaceId !== null && wordId !== null && unlinkSpaceWord(spaceId,wordId) ? response.status(204).end() : response.status(404).json({ error: "Zuordnung nicht gefunden." });
});
