import { Router } from "express";
import {
  createQuote,
  createTag,
  deleteQuote,
  deleteTag,
  listQuotes,
  listTags,
  updateQuote,
  type QuoteType,
} from "../repositories/quote-repository.js";

export const quotesRouter = Router();
export const tagsRouter = Router();

function parseInput(body: unknown): { type: QuoteType; content: string; note: string | null; tags: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const content = typeof data.content === "string" ? data.content.trim() : "";
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : null;
  const type = data.type === "quote" || data.type === "poem" ? data.type : null;
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
    : [];
  if (!content || !type) return null;
  return { type, content, note, tags };
}

quotesRouter.get("/", (_request, response) => response.json(listQuotes()));

quotesRouter.post("/", (request, response) => {
  const input = parseInput(request.body);
  if (!input) return response.status(400).json({ error: "Typ oder Inhalt ist ungültig." });
  return response.status(201).json(createQuote(input));
});

quotesRouter.put("/:id", (request, response) => {
  const input = parseInput(request.body);
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || !input) return response.status(400).json({ error: "Ungültige Eingabe." });
  const quote = updateQuote(id, input);
  return quote ? response.json(quote) : response.status(404).json({ error: "Eintrag nicht gefunden." });
});

quotesRouter.delete("/:id", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Ungültige ID." });
  return deleteQuote(id) ? response.status(204).end() : response.status(404).json({ error: "Eintrag nicht gefunden." });
});

tagsRouter.get("/", (_request, response) => response.json(listTags()));

tagsRouter.post("/", (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  if (!name) return response.status(400).json({ error: "Tag-Name fehlt." });
  return response.status(201).json(createTag(name));
});

tagsRouter.delete("/:id", (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Ungültige ID." });
  return deleteTag(id) ? response.status(204).end() : response.status(404).json({ error: "Tag nicht gefunden." });
});
