import { Router } from "express";
import {
  WORD_STATUSES,
  createWord,
  deleteWord,
  listWords,
  updateWord,
  type WordStatus,
} from "../repositories/word-repository.js";

export const wordsRouter = Router();

function parseInput(body: unknown): { term: string; note: string | null; status: WordStatus } | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const term = typeof data.term === "string" ? data.term.trim() : "";
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : null;
  const status = typeof data.status === "string" ? data.status : "unknown";
  if (!term || !WORD_STATUSES.includes(status as WordStatus)) return null;
  return { term, note, status: status as WordStatus };
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
