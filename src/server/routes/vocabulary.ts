import { Router } from "express";
import type { Request,Response } from "express";
import {
  createVocabularyEntry,deleteVocabularyEntry,deleteVocabularyUnit,
  listVocabularyEntries,listVocabularyUnits,saveVocabularyUnit,updateVocabularyEntry,
  type VocabularyEntryInput,
} from "../repositories/vocabulary-repository.js";

export const vocabularyUnitsRouter = Router();
export const vocabularyEntriesRouter = Router();

const id = (value: unknown): number | null => {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const safe = (handler: (request: Request,response: Response) => unknown) => (request: Request,response: Response) => {
  try { handler(request,response); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Ungültige Eingabe." }); }
};

function entryInput(body: unknown,unitId: number | null): VocabularyEntryInput | null {
  if (!body || typeof body !== "object" || unitId === null) return null;
  const data = body as Record<string,unknown>;
  const englishTerm = text(data.englishTerm);
  const germanTranslation = text(data.germanTranslation);
  if (!englishTerm || !germanTranslation) return null;
  return { unitId,englishTerm,germanTranslation,germanExplanation: text(data.germanExplanation) };
}

vocabularyUnitsRouter.get("/",(_request,response) => response.json(listVocabularyUnits()));
vocabularyUnitsRouter.post("/",safe((request,response) => {
  const label = text(request.body?.label);
  return label ? response.status(201).json(saveVocabularyUnit(null,label)) : response.status(400).json({ error: "Bezeichnung fehlt." });
}));
vocabularyUnitsRouter.put("/:id",safe((request,response) => {
  const unitId = id(request.params.id);
  const label = text(request.body?.label);
  if (unitId === null || !label) return response.status(400).json({ error: "Ungültige Eingabe." });
  const unit = saveVocabularyUnit(unitId,label);
  return unit ? response.json(unit) : response.status(404).json({ error: "Unit nicht gefunden." });
}));
vocabularyUnitsRouter.delete("/:id",(request,response) => {
  const unitId = id(request.params.id);
  return unitId !== null && deleteVocabularyUnit(unitId) ? response.status(204).end() : response.status(404).json({ error: "Unit nicht gefunden." });
});
vocabularyUnitsRouter.get("/:id/entries",(request,response) => {
  const unitId = id(request.params.id);
  return unitId === null ? response.status(400).json({ error: "Ungültige Unit." }) : response.json(listVocabularyEntries(unitId));
});
vocabularyUnitsRouter.post("/:id/entries",safe((request,response) => {
  const input = entryInput(request.body,id(request.params.id));
  return input ? response.status(201).json(createVocabularyEntry(input)) : response.status(400).json({ error: "Englisch und Deutsch sind erforderlich." });
}));

vocabularyEntriesRouter.put("/:id",safe((request,response) => {
  const entryId = id(request.params.id);
  const input = entryInput(request.body,id(request.body?.unitId));
  if (entryId === null || !input) return response.status(400).json({ error: "Ungültige Eingabe." });
  const entry = updateVocabularyEntry(entryId,input);
  return entry ? response.json(entry) : response.status(404).json({ error: "Vokabel nicht gefunden." });
}));
vocabularyEntriesRouter.delete("/:id",(request,response) => {
  const entryId = id(request.params.id);
  return entryId !== null && deleteVocabularyEntry(entryId) ? response.status(204).end() : response.status(404).json({ error: "Vokabel nicht gefunden." });
});
