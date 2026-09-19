import { db } from "../database/db.js";

export interface SeedResult {
  tags: number;
  spaces: number;
  words: number;
  quotes: number;
  journalEntries: number;
}

const demoTags = ["Alltag","Achtsamkeit","Aufrichtigkeit","Gefühl","Literatur","Natur","Sprache"];

const demoSpaces = [
  { label: "Achtsame Bewegung",explanation: "Wörter für ruhige, bewusste Bewegung." },
  { label: "Aufrichtigkeit",explanation: "Offene und ehrliche Formen des Ausdrucks." },
  { label: "Vergänglichkeit",explanation: "Eindrücke und Dinge, die nicht von Dauer sind." },
];

const demoWords = [
  { term: "behutsam",meaning: "vorsichtig und mit besonderer Aufmerksamkeit",status: "ready",exampleSentence: "Sie legte den Brief behutsam auf den Tisch.",englishTranslation: "carefully",englishExampleSentence: "She carefully placed the letter on the table.",space: "Achtsame Bewegung",tags: ["Achtsamkeit","Alltag"] },
  { term: "schlendern",meaning: "ohne Eile und ohne festes Ziel gehen",status: "learning",exampleSentence: "Am Abend schlenderten wir durch den Park.",englishTranslation: "to stroll",englishExampleSentence: "We strolled through the park in the evening.",space: "Achtsame Bewegung",tags: ["Alltag","Natur"] },
  { term: "aufrichtig",meaning: "ehrlich und ohne Verstellung",status: "ready",exampleSentence: "Ihre aufrichtige Freude war sofort spürbar.",englishTranslation: "sincere",englishExampleSentence: "Her sincere joy was immediately noticeable.",space: "Aufrichtigkeit",tags: ["Gefühl","Sprache"] },
  { term: "unverhohlen",meaning: "offen gezeigt und nicht verborgen",status: "draft",exampleSentence: "Er äußerte unverhohlen seine Zweifel.",englishTranslation: "openly",englishExampleSentence: "He openly expressed his doubts.",space: "Aufrichtigkeit",tags: ["Sprache"] },
  { term: "flüchtig",meaning: "nur sehr kurz andauernd",status: "learning",exampleSentence: "Ein flüchtiges Lächeln huschte über ihr Gesicht.",englishTranslation: "fleeting",englishExampleSentence: "A fleeting smile crossed her face.",space: "Vergänglichkeit",tags: ["Gefühl","Literatur"] },
  { term: "vergänglich",meaning: "nicht dauerhaft bestehend",status: "draft",exampleSentence: "Auch der schönste Sommer ist vergänglich.",englishTranslation: "transient",englishExampleSentence: "Even the loveliest summer is transient.",space: "Vergänglichkeit",tags: ["Natur","Literatur"] },
] as const;

const demoQuotes = [
  { type: "quote",content: "Manchmal wird ein Gedanke erst klar, wenn man ihn leise ausspricht.",note: "Über Sprache und Aufmerksamkeit",tags: ["Sprache","Achtsamkeit"] },
  { type: "poem",content: "Zwischen zwei Schritten\nwartet der Weg\nauf unseren Blick.",note: null,tags: ["Natur","Literatur"] },
  { type: "quote",content: "Ein ehrliches Wort braucht selten eine laute Stimme.",note: null,tags: ["Aufrichtigkeit","Sprache"] },
  { type: "poem",content: "Der Abend sammelt\ndas Licht von den Dächern\nund trägt es davon.",note: null,tags: ["Natur","Literatur"] },
  { type: "quote",content: "Was flüchtig ist, kann dennoch lange in uns bleiben.",note: "Gedanke zur Vergänglichkeit",tags: ["Gefühl","Literatur"] },
] as const;

const demoJournal = [
  { time: "08:15",content: "Den Morgen ruhig begonnen und beim ersten Kaffee drei neue Wörter notiert.",tags: ["Alltag","Achtsamkeit"] },
  { time: "10:30",content: "Beim Spaziergang bewusst auf kleine Veränderungen im Licht geachtet.",tags: ["Natur","Achtsamkeit"] },
  { time: "13:05",content: "Eine Formulierung gefunden, die endlich genau den gemeinten Gedanken trifft.",tags: ["Sprache"] },
  { time: "17:40",content: "Ein kurzes Gespräch hat überraschend lange nachgewirkt.",tags: ["Gefühl","Alltag"] },
  { time: "21:10",content: "Den Tag mit ein paar Zeilen beendet und die wichtigsten Eindrücke festgehalten.",tags: ["Literatur","Achtsamkeit"] },
] as const;

export const seedDemoData = db.transaction((date: string): SeedResult => {
  const result: SeedResult = { tags: 0,spaces: 0,words: 0,quotes: 0,journalEntries: 0 };
  const tagIds = new Map<string,number>();
  for (const name of demoTags) {
    result.tags += db.prepare("INSERT INTO tags(name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name).changes;
    const tag = db.prepare("SELECT id FROM tags WHERE name=? COLLATE NOCASE").get(name) as { id: number };
    tagIds.set(name,tag.id);
  }

  const spaceIds = new Map<string,number>();
  for (const space of demoSpaces) {
    let row = db.prepare("SELECT id FROM meaning_spaces WHERE label=? COLLATE NOCASE").get(space.label) as { id: number } | undefined;
    if (!row) {
      const id = Number(db.prepare("INSERT INTO meaning_spaces(label,explanation) VALUES (?,?)").run(space.label,space.explanation).lastInsertRowid);
      row = { id }; result.spaces++;
    }
    spaceIds.set(space.label,row.id);
  }

  const linkTags = (table: "word_tags" | "quote_tags" | "journal_tags",ownerColumn: "word_id" | "quote_id" | "journal_id",ownerId: number,tags: readonly string[]) => {
    const statement = db.prepare(`INSERT OR IGNORE INTO ${table}(${ownerColumn},tag_id) VALUES (?,?)`);
    for (const tag of tags) statement.run(ownerId,tagIds.get(tag));
  };

  for (const word of demoWords) {
    if (db.prepare("SELECT 1 FROM word_units WHERE term=? COLLATE NOCASE").get(word.term)) continue;
    const wordId = Number(db.prepare(`INSERT INTO word_units
      (term,meaning,status,example_sentence,english_translation,english_example_sentence,meaning_space_id)
      VALUES (?,?,?,?,?,?,?)`).run(word.term,word.meaning,word.status,word.exampleSentence,word.englishTranslation,word.englishExampleSentence,spaceIds.get(word.space)).lastInsertRowid);
    linkTags("word_tags","word_id",wordId,word.tags); result.words++;
  }

  for (const entry of demoQuotes) {
    if (db.prepare("SELECT 1 FROM quotes WHERE content=?").get(entry.content)) continue;
    const quoteId = Number(db.prepare("INSERT INTO quotes(type,content,note) VALUES (?,?,?)").run(entry.type,entry.content,entry.note).lastInsertRowid);
    linkTags("quote_tags","quote_id",quoteId,entry.tags); result.quotes++;
  }

  for (const entry of demoJournal) {
    const entryAt = `${date}T${entry.time}`;
    if (db.prepare("SELECT 1 FROM journal_entries WHERE entry_at=? AND content=?").get(entryAt,entry.content)) continue;
    const journalId = Number(db.prepare("INSERT INTO journal_entries(content,entry_at) VALUES (?,?)").run(entry.content,entryAt).lastInsertRowid);
    linkTags("journal_tags","journal_id",journalId,entry.tags); result.journalEntries++;
  }
  return result;
});
