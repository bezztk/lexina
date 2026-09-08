import type { PartOfSpeech } from "../repositories/word-repository.js";

const DWDS_SNIPPET_URL = "https://www.dwds.de/api/wb/snippet/";

interface DwdsEntry {
  input?: unknown;
  lemma?: unknown;
  wortart?: unknown;
}

export interface DwdsWordData {
  term: string;
  partOfSpeech: PartOfSpeech;
}

export function extractDwdsTerm(source: string): string {
  const value = source.trim();
  if (!value) throw new Error("Bitte einen DWDS-Link oder ein Wort eingeben.");
  if (!/^https?:\/\//i.test(value)) return value;

  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Der DWDS-Link ist ungültig."); }

  if (!['dwds.de', 'www.dwds.de'].includes(url.hostname.toLowerCase())) {
    throw new Error("Bitte einen Link von dwds.de verwenden.");
  }
  const match = url.pathname.match(/^\/wb\/([^/]+)\/?$/);
  if (!match?.[1]) throw new Error("Der Link muss auf einen DWDS-Worteintrag verweisen.");
  return decodeURIComponent(match[1]).trim();
}

export function mapDwdsPartOfSpeech(value: string): PartOfSpeech | null {
  const normalized = value.toLocaleLowerCase("de");
  if (normalized.includes("substantiv") || normalized.includes("nomen")) return "noun";
  if (normalized.includes("verb")) return "verb";
  if (normalized.includes("adjektiv")) return "adjective";
  return null;
}

export async function fetchDwdsWord(source: string): Promise<DwdsWordData> {
  const query = extractDwdsTerm(source);
  let response: Response;
  try {
    response = await fetch(`${DWDS_SNIPPET_URL}?q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json", "User-Agent": "Lexina/1.0 (personal vocabulary import)" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("DWDS ist gerade nicht erreichbar.");
  }
  if (!response.ok) throw new Error("DWDS ist gerade nicht erreichbar.");

  const payload: unknown = await response.json();
  const entries = Array.isArray(payload) ? payload as DwdsEntry[] : [];
  const supported = entries.map((entry) => ({
    entry,
    partOfSpeech: typeof entry.wortart === "string" ? mapDwdsPartOfSpeech(entry.wortart) : null,
  })).filter((item): item is { entry: DwdsEntry; partOfSpeech: PartOfSpeech } => item.partOfSpeech !== null);

  if (!supported.length) {
    throw new Error("DWDS hat dazu keinen unterstützten Eintrag als Nomen, Verb oder Adjektiv gefunden.");
  }
  const first = supported[0]!;
  const lemma = typeof first.entry.lemma === "string" ? first.entry.lemma.trim() : query;
  return { term: lemma || query, partOfSpeech: first.partOfSpeech };
}
