import { Router } from "express";
import type { Request,Response } from "express";
import {
  createVocabularyEntry,deleteVocabularyEntry,deleteVocabularyUnit,
  importVocabularyEntries,listVocabularyEntries,listVocabularyUnits,reviewVocabularyEntry,
  saveVocabularyUnit,selectNextVocabularyEntry,takeVocabularyEntryOut,updateVocabularyEntry,
  type VocabularyEntryInput,type VocabularyReviewResult,
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

function importInput(body: unknown,unitId: number | null): { inputs: VocabularyEntryInput[];error: string | null } {
  if (unitId === null || !Array.isArray(body) || !body.length) return { inputs: [],error: "Das JSON muss mindestens eine Vokabel enthalten." };
  if (body.length > 1000) return { inputs: [],error: "Pro Import sind höchstens 1000 Vokabeln möglich." };
  const inputs: VocabularyEntryInput[] = [];
  for (const [index,item] of body.entries()) {
    if (!item || typeof item !== "object") return { inputs: [],error: `Eintrag ${index + 1} ist ungültig.` };
    const data = Array.isArray(item)
      ? { english: item[0],german: item[1],meaning: item[2] }
      : item as Record<string,unknown>;
    if (Array.isArray(item) && (item.length < 2 || item.length > 3)) return { inputs: [],error: `Eintrag ${index + 1} muss zwei oder drei Werte enthalten.` };
    const englishTerm = text(data.english);
    const germanTranslation = text(data.german);
    if (!englishTerm || !germanTranslation) return { inputs: [],error: `Eintrag ${index + 1} benötigt Englisch und Deutsch.` };
    if (data.meaning !== undefined && typeof data.meaning !== "string") return { inputs: [],error: `Die Bedeutung in Eintrag ${index + 1} ist ungültig.` };
    inputs.push({ unitId,englishTerm,germanTranslation,germanExplanation: text(data.meaning) });
  }
  return { inputs,error: null };
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
vocabularyUnitsRouter.post("/:id/import",safe((request,response) => {
  const parsed = importInput(request.body,id(request.params.id));
  if (parsed.error) return response.status(400).json({ error: parsed.error });
  const entries = importVocabularyEntries(parsed.inputs);
  return response.status(201).json({ imported: entries.length,entries });
}));
vocabularyUnitsRouter.post("/:id/next",safe((request,response) => {
  const unitId = id(request.params.id);
  if (unitId === null) return response.status(400).json({ error: "Ungültige Unit." });
  return response.json(selectNextVocabularyEntry(unitId));
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
vocabularyEntriesRouter.post("/:id/review",safe((request,response) => {
  const entryId = id(request.params.id);
  const result = request.body?.result;
  if (entryId === null || !["known","missed"].includes(result)) return response.status(400).json({ error: "Ungültiges Lernergebnis." });
  const entry = reviewVocabularyEntry(entryId,result as VocabularyReviewResult);
  return entry ? response.json(entry) : response.status(404).json({ error: "Vokabel nicht gefunden." });
}));
vocabularyEntriesRouter.post("/:id/out",safe((request,response) => {
  const entryId = id(request.params.id);
  if (entryId === null) return response.status(400).json({ error: "Ungültige Vokabel." });
  const entry = takeVocabularyEntryOut(entryId);
  return entry ? response.json(entry) : response.status(404).json({ error: "Vokabel nicht gefunden oder bereits aus der Übung." });
}));
