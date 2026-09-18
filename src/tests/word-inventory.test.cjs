const { test,after } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { mkdtempSync,readdirSync,rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { migrateWordInventory,legacyStatus } = require("../dist/server/database/word-inventory-migration.js");
const directory = mkdtempSync(path.join(tmpdir(),"lexina-tests-"));
function seed(databasePath = ":memory:") {
  const db = new Database(databasePath);
  db.pragma("foreign_keys=ON");
  db.exec("CREATE TABLE words(id INTEGER PRIMARY KEY,term TEXT,status TEXT,created_at TEXT,note TEXT,part_of_speech TEXT,family_id INTEGER); CREATE TABLE similar_words(id INTEGER PRIMARY KEY,word_id INTEGER,value TEXT,position INTEGER); CREATE TABLE example_sentences(id INTEGER PRIMARY KEY,word_id INTEGER,value TEXT,position INTEGER); CREATE TABLE quotes(id INTEGER PRIMARY KEY,type TEXT,content TEXT,note TEXT,created_at TEXT); CREATE TABLE journal_entries(id INTEGER PRIMARY KEY,content TEXT,entry_at TEXT,created_at TEXT,updated_at TEXT);");
  const insert = db.prepare("INSERT INTO words VALUES (?,?,?,?,?,?,?)");
  insert.run(1,"unehrlich / nicht aufrichtig","unknown","2020-01-01","Gemeinsame Notiz","adjective",42);
  insert.run(2,"nicht korrekt","using","2020-01-02","","adjective",null);
  insert.run(3,"behutsam","familiar","2020-01-03","Einzelnotiz","adjective",null);
  insert.run(4,"sakin","learning","2020-01-04","","adjective",null);
  db.exec("INSERT INTO similar_words VALUES (1,1,'unehrlich',0),(2,1,'falsch',1),(3,2,'falsch',0); INSERT INTO example_sentences VALUES (1,1,'Gemeinsames Beispiel',0),(2,3,'Sie öffnete es behutsam.',0); INSERT INTO quotes VALUES (1,'quote','Zitat','Notiz','2020-01-01'); INSERT INTO journal_entries VALUES (1,'Journal','2020-01-01T12:00','2020-01-01',null);");
  return db;
}
test("migration preserves cards, order, senses, notes, examples and extra metadata; restart is idempotent",() => {
  const db = seed();
  migrateWordInventory(db);
  const spaces = db.prepare("SELECT * FROM meaning_spaces ORDER BY id").all();
  assert.equal(spaces.length,2);
  assert.equal(spaces[0].label,"unehrlich / nicht aufrichtig");
  assert.equal(spaces[0].note,"Gemeinsame Notiz");
  assert.deepEqual(JSON.parse(spaces[0].examples),["Gemeinsames Beispiel"]);
  assert.equal(JSON.parse(spaces[0].legacy_data).card.family_id,42);
  const words = db.prepare("SELECT * FROM word_units ORDER BY id").all();
  assert.equal(words.length,5);
  assert.deepEqual(words.map(w => w.status),["draft","draft","learning","ready","learning"]);
  assert.equal(words.filter(w => w.term === "falsch").length,2);
  assert.ok(words.every(w => w.language === "de"));
  assert.equal(words.find(w => w.term === "behutsam").note,"Einzelnotiz");
  assert.deepEqual(db.prepare("SELECT value FROM unit_examples").all(),[{ value: "Sie öffnete es behutsam." }]);
  assert.deepEqual(db.prepare("SELECT w.term FROM space_words s JOIN word_units w ON w.id=s.word_id WHERE s.space_id=? ORDER BY s.position").all(spaces[0].id).map(w => w.term),["unehrlich","falsch"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM words").get().n,4);
  assert.equal(db.prepare("SELECT content FROM quotes").get().content,"Zitat");
  assert.equal(db.prepare("SELECT content FROM journal_entries").get().content,"Journal");
  const snapshot = JSON.stringify(db.prepare("SELECT * FROM word_units").all());
  migrateWordInventory(db);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM word_units").all()),snapshot);
  assert.equal(db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n,1);
  assert.deepEqual(db.pragma("foreign_key_check"),[]);
  db.close();
});
test("backup is made before migration and is not replaced on restart",() => {
  const databasePath = path.join(directory,"old.sqlite");
  const db = seed(databasePath);
  db.pragma("journal_mode=WAL");
  migrateWordInventory(db,databasePath);
  const backups = readdirSync(directory).filter(name => name.startsWith("old.sqlite.") && name.endsWith(".bak"));
  assert.equal(backups.length,1);
  const backup = new Database(path.join(directory,backups[0]),{ readonly: true });
  assert.equal(backup.prepare("SELECT COUNT(*) AS n FROM words").get().n,4);
  assert.equal(backup.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='word_units'").get().n,0);
  backup.close();
  migrateWordInventory(db,databasePath);
  assert.equal(readdirSync(directory).filter(name => name.startsWith("old.sqlite.") && name.endsWith(".bak")).length,1);
  db.close();
});
test("failed migration rolls back and retains every original row",() => {
  const db = seed();
  db.prepare("UPDATE similar_words SET value='' WHERE id=1").run();
  assert.throws(() => migrateWordInventory(db));
  assert.equal(db.prepare("SELECT count(*) AS n FROM words").get().n,4);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='word_units'").get().n,0);
  db.close();
});
test("legacy status mapping remains conservative",() => {
  for (const value of ["unknown","unexpected","new"]) assert.equal(legacyStatus(value),"draft");
  for (const value of ["using","learning"]) assert.equal(legacyStatus(value),"learning");
  for (const value of ["familiar","finished","learned"]) assert.equal(legacyStatus(value),"ready");
});

// Repository and HTTP checks use a separate database, never the user's data.
process.env.LEXINA_DATABASE_PATH = path.join(directory,"inventory.sqlite");
const repo = require("../dist/server/repositories/word-repository.js");
const { db } = require("../dist/server/database/db.js");
const input = (term,extras = {}) => ({ term,language: "de",meaning: "",note: "",status: "draft",exampleSentences: [],spaceIds: [],translations: [],...extras });
test("independent words, homographs, all manual status transitions and per-space order",() => {
  const a = repo.saveSpace(null,"Aufrichtigkeit","",[]);
  const b = repo.saveSpace(null,"Korrektheit","",[]);
  const first = repo.createWord(input("falsch",{ meaning: "unaufrichtig",spaceIds: [a.id,b.id] }));
  const second = repo.createWord(input("falsch",{ meaning: "nicht korrekt",spaceIds: [a.id,b.id] }));
  const unattached = repo.createWord(input("tek",{ language: "tr" }));
  assert.deepEqual(unattached.spaceIds,[]);
  assert.equal(unattached.status,"draft");
  repo.reorderSpace(a.id,[second.id,first.id]);
  assert.deepEqual(repo.listSpaces().find(s => s.id === a.id).wordIds,[second.id,first.id]);
  assert.deepEqual(repo.listSpaces().find(s => s.id === b.id).wordIds,[first.id,second.id]);
  for (const status of ["learning","ready","draft","ready","learning","draft"]) {
    assert.equal(repo.updateWord(unattached.id,input("tek",{ language: "tr",status })).status,status);
  }
  repo.updateWord(first.id,input("falsch",{ spaceIds: [a.id,b.id],exampleSentences: ["Ein Beispiel."] }));
  assert.deepEqual(repo.listSpaces().find(s => s.id === a.id).wordIds,[second.id,first.id]);
  assert.throws(() => repo.reorderSpace(a.id,[first.id,first.id]));
  assert.deepEqual(repo.listSpaces().find(s => s.id === a.id).wordIds,[second.id,first.id]);
  assert.throws(() => repo.updateWord(first.id,input("verändert",{ spaceIds: [999999] })));
  assert.equal(repo.getWord(first.id).term,"falsch");
  repo.unlinkSpaceWord(a.id,first.id);
  assert.ok(repo.getWord(first.id));
  assert.deepEqual(repo.getWord(first.id).spaceIds,[b.id]);
  repo.saveSpace(b.id,"Korrektheit","Notiz",[],[second.id]);
  assert.ok(repo.getWord(first.id));
  assert.deepEqual(repo.getWord(first.id).spaceIds,[]);
  repo.deleteSpace(a.id);
  assert.ok(repo.getWord(second.id));
  repo.deleteWord(second.id);
  assert.equal(repo.getWord(second.id),null);
  assert.deepEqual(repo.listSpaces().find(s => s.id === b.id).wordIds,[]);
});
test("translations preserve nuance, adopt drafts idempotently, link existing senses and detach on deletion",() => {
  const origin = repo.createWord(input("falsch",{ translations: [
    { language: "en",text: "insincere",note: "nicht aufrichtig",linkedWordId: null },
    { language: "en",text: "wrong",note: "nicht korrekt",linkedWordId: null },
    { language: "tr",text: "yanlış",note: "",linkedWordId: null },
  ] }));
  const adopted = repo.adoptTranslation(origin.id,origin.translationIds[0],null);
  assert.equal(adopted.language,"en");
  assert.equal(adopted.status,"draft");
  assert.equal(adopted.note,"nicht aufrichtig");
  assert.equal(repo.adoptTranslation(origin.id,origin.translationIds[0],null).id,adopted.id);
  const existing = repo.createWord(input("wrong",{ language: "en",status: "learning",meaning: "nicht korrekt" }));
  assert.equal(repo.adoptTranslation(origin.id,origin.translationIds[1],existing.id).id,existing.id);
  assert.equal(repo.getWord(existing.id).status,"learning");
  assert.throws(() => repo.adoptTranslation(origin.id,origin.translationIds[2],existing.id));
  assert.throws(() => repo.updateWord(existing.id,input("wrong",{ language: "tr" })));
  repo.deleteWord(adopted.id);
  assert.equal(repo.getWord(origin.id).translations[0].linkedWordId,null);
  assert.equal(repo.getWord(origin.id).translations[1].note,"nicht korrekt");
  repo.deleteWord(origin.id);
  assert.equal(db.prepare("SELECT count(*) AS n FROM translations WHERE word_id=?").get(origin.id).n,0);
  assert.ok(repo.getWord(existing.id));
});
test("HTTP capture defaults, validation, space relationships, translations and quote/journal CRUD",async () => {
  const express = require("express");
  const { wordsRouter,spacesRouter } = require("../dist/server/routes/words.js");
  const { quotesRouter,tagsRouter } = require("../dist/server/routes/quotes.js");
  const { journalRouter } = require("../dist/server/routes/journal.js");
  const app = express();
  app.use(express.json());
  app.use("/api/words",wordsRouter); app.use("/api/spaces",spacesRouter);
  app.use("/api/quotes",quotesRouter); app.use("/api/tags",tagsRouter); app.use("/api/journal",journalRouter);
  const server = app.listen(0,"127.0.0.1");
  await new Promise(resolve => server.once("listening",resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function request(url,method = "GET",body) {
    const response = await fetch(base + url,{ method,headers: { "Content-Type": "application/json" },...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status,data: response.status === 204 ? null : await response.json() };
  }
  try {
    const quick = await request("/api/words","POST",{ term: "schnell" });
    assert.equal(quick.status,201); assert.equal(quick.data.status,"draft"); assert.equal(quick.data.language,"de");
    assert.deepEqual(quick.data.spaceIds,[]);
    assert.equal((await request("/api/words","POST",{ term: " ",language: "xx" })).status,400);
    assert.equal((await request("/api/words","POST",{ term: "x",translations: [null] })).status,400);
    const ready = await request("/api/words/" + quick.data.id,"PUT",{ term: "schnell",status: "ready",language: "en" });
    assert.equal(ready.status,200); assert.equal(ready.data.status,"ready");
    const space = await request("/api/spaces","POST",{ label: "Tempo",note: "Persönliche Ordnung" });
    const linked = await request("/api/words/" + quick.data.id,"PUT",{ ...ready.data,spaceIds: [space.data.id],translations: [{ language: "de",text: "schnell",note: "Tempo" }] });
    assert.equal(linked.status,200);
    const adoption = await request("/api/words/" + quick.data.id + "/translations/" + linked.data.translationIds[0] + "/adopt","POST",{});
    assert.equal(adoption.status,200); assert.equal(adoption.data.status,"draft");
    assert.equal((await request("/api/spaces/" + space.data.id + "/order","PUT",{ wordIds: [quick.data.id,quick.data.id] })).status,400);
    assert.equal((await request("/api/spaces/" + space.data.id,"PUT",{ label: "Tempo",wordIds: [] })).status,200);
    assert.ok(repo.getWord(quick.data.id));
    await request("/api/tags","POST",{ name: "Test" });
    const quote = await request("/api/quotes","POST",{ type: "quote",content: "Ein Testzitat",note: "Notiz",tags: ["Test"] });
    assert.equal(quote.status,201);
    assert.ok((await request("/api/quotes")).data.some(q => q.id === quote.data.id && q.tags.includes("Test")));
    assert.equal((await request("/api/quotes/" + quote.data.id,"PUT",{ type: "poem",content: "Gedicht",tags: [] })).status,200);
    assert.equal((await request("/api/quotes/" + quote.data.id,"DELETE")).status,204);
    const journal = await request("/api/journal","POST",{ content: "Testjournal",entryAt: "2026-09-18T12:00" });
    assert.equal(journal.status,201);
    assert.ok((await request("/api/journal?date=2026-09-18")).data.some(j => j.id === journal.data.id));
    assert.equal((await request("/api/journal/" + journal.data.id,"PUT",{ content: "Bearbeitet",entryAt: "2026-09-18T13:00" })).status,200);
    assert.equal((await request("/api/journal/" + journal.data.id,"DELETE")).status,204);
    assert.deepEqual(db.pragma("foreign_key_check"),[]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
after(() => { db.close(); rmSync(directory,{ recursive: true,force: true }); });
