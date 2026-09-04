import { Router } from "express";
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from "../repositories/journal-repository.js";

export const journalRouter = Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function parseInput(body: unknown): { content: string; entryAt: string } | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const content = typeof data.content === "string" ? data.content.trim() : "";
  const entryAt = typeof data.entryAt === "string" ? data.entryAt : "";
  return content && dateTimePattern.test(entryAt) ? { content, entryAt } : null;
}

journalRouter.get("/", (request, response) => {
  const date = typeof request.query.date === "string" ? request.query.date : "";
  if (!datePattern.test(date)) return response.status(400).json({ error: "Ungültiges Datum." });
  return response.json(listJournalEntries(date));
});

journalRouter.post("/", (request, response) => {
  const input = parseInput(request.body);
  if (!input) return response.status(400).json({ error: "Inhalt oder Zeitpunkt ist ungültig." });
  return response.status(201).json(createJournalEntry(input));
});

journalRouter.put("/:id", (request, response) => {
  const input = parseInput(request.body);
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || !input) return response.status(400).json({ error: "Ungültige Eingabe." });
  const entry = updateJournalEntry(id, input);
  return entry ? response.json(entry) : response.status(404).json({ error: "Eintrag nicht gefunden." });
});

journalRouter.delete("/:id", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Ungültige ID." });
  return deleteJournalEntry(id)
    ? response.status(204).end()
    : response.status(404).json({ error: "Eintrag nicht gefunden." });
});
