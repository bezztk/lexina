import { Router } from "express";
import {
  WORD_STATUSES,
  PARTS_OF_SPEECH,
  createWord,
  deleteWord,
  listWords,
  updateWord,
  type WordStatus,
  type PartOfSpeech,
} from "../repositories/word-repository.js";

export const wordsRouter = Router();

function parseInput(body: unknown): {
  term: string;
  partOfSpeech: PartOfSpeech;
  status: WordStatus;
  similarWords: string[];
  exampleSentences: string[];
} | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const term = typeof data.term === "string" ? data.term.trim() : "";
  const status = typeof data.status === "string" ? data.status : "unknown";
  const partOfSpeech = typeof data.partOfSpeech === "string" ? data.partOfSpeech : "noun";
  const cleanList = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  if (!term || !WORD_STATUSES.includes(status as WordStatus)
    || !PARTS_OF_SPEECH.includes(partOfSpeech as PartOfSpeech)) return null;
  return {
    term,
    status: status as WordStatus,
    partOfSpeech: partOfSpeech as PartOfSpeech,
    similarWords: cleanList(data.similarWords),
    exampleSentences: cleanList(data.exampleSentences),
  };
}

wordsRouter.get("/", (_request, response) => response.json(listWords()));

wordsRouter.post("/", (request, response) => {
  const input = parseInput(request.body);
  if (!input) return response.status(400).json({ error: "Begriff oder Status ist ungültig." });
  return response.status(201).json(createWord(input));
});

wordsRouter.put("/:id", (request, response) => {
  const input = parseInput(request.body);
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || !input) return response.status(400).json({ error: "Ungültige Eingabe." });
  const word = updateWord(id, input);
  return word ? response.json(word) : response.status(404).json({ error: "Wort nicht gefunden." });
});

wordsRouter.delete("/:id", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Ungültige ID." });
  return deleteWord(id) ? response.status(204).end() : response.status(404).json({ error: "Wort nicht gefunden." });
});
