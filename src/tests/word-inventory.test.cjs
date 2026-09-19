const { test,after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync,rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const directory = mkdtempSync(path.join(tmpdir(),"lexina-tests-"));
process.env.LEXINA_DATABASE_PATH = path.join(directory,"inventory.sqlite");

const repo = require("../dist/server/repositories/word-repository.js");
const { db } = require("../dist/server/database/db.js");
const input = (term,extras = {}) => ({
  term,meaning: "",note: "",status: "draft",exampleSentence: "",
  englishTranslation: "",englishExampleSentence: "",meaningSpaceId: null,tags: [],...extras,
});

test("word schema stores one German example and one English translation pair directly",() => {
  const columns = db.prepare("PRAGMA table_info(word_units)").all().map(column => column.name);
  assert.deepEqual(columns,[
    "id","term","meaning","note","status","example_sentence",
    "english_translation","english_example_sentence","meaning_space_id","created_at",
  ]);
  for (const table of ["unit_examples","translations","space_words","words","similar_words","example_sentences"]) {
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),undefined);
  }

  const word = repo.createWord(input("behutsam",{
    exampleSentence: "Sie öffnete die Tür behutsam.",
    englishTranslation: "carefully",
    englishExampleSentence: "She opened the door carefully.",
  }));
  assert.equal(word.exampleSentence,"Sie öffnete die Tür behutsam.");
  assert.equal(word.englishTranslation,"carefully");
  assert.equal(word.englishExampleSentence,"She opened the door carefully.");

  const row = db.prepare("SELECT example_sentence,english_translation,english_example_sentence FROM word_units WHERE id=?").get(word.id);
  assert.deepEqual(row,{
    example_sentence: "Sie öffnete die Tür behutsam.",
    english_translation: "carefully",
    english_example_sentence: "She opened the door carefully.",
  });
});

test("a word stores at most one meaning space and replacing it overwrites the direct foreign key",() => {
  db.prepare("INSERT INTO tags(name) VALUES (?)").run("Adjektiv");
  const a = repo.saveSpace(null,"Aufrichtigkeit","",[]);
  const b = repo.saveSpace(null,"Korrektheit","",[]);
  const first = repo.createWord(input("falsch",{ meaning: "unaufrichtig",meaningSpaceId: a.id,tags: ["Adjektiv"] }));
  const second = repo.createWord(input("falsch",{ meaning: "nicht korrekt",meaningSpaceId: a.id }));
  assert.deepEqual(first.tags,["Adjektiv"]);
  assert.deepEqual(repo.listSpaces().find(space => space.id === a.id).wordIds,[first.id,second.id]);
  const updated = repo.updateWord(first.id,input("falsch",{
    status: "ready",meaning: "unaufrichtig",meaningSpaceId: b.id,
    exampleSentence: "Das war falsch.",englishTranslation: "wrong",
    englishExampleSentence: "That was wrong.",tags: ["Adjektiv"],
  }));
  assert.equal(updated.status,"ready");
  assert.equal(updated.englishTranslation,"wrong");
  assert.equal(updated.meaningSpaceId,b.id);
  assert.deepEqual(repo.listSpaces().find(space => space.id === a.id).wordIds,[second.id]);
  assert.deepEqual(repo.listSpaces().find(space => space.id === b.id).wordIds,[first.id]);
  assert.throws(() => repo.updateWord(first.id,input("falsch",{ meaningSpaceId: 999999 })));
  assert.equal(repo.getWord(first.id).status,"ready");
  repo.deleteSpace(b.id);
  assert.equal(repo.getWord(first.id).meaningSpaceId,null);
});

test("HTTP validates and persists the simplified word shape alongside other content",async () => {
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
    await request("/api/tags","POST",{ name: "Test" });
    const space = await request("/api/spaces","POST",{ label: "Tempo" });
    const created = await request("/api/words","POST",{
      term: "schnell",status: "draft",meaning: "mit hohem Tempo",exampleSentence: "Er läuft schnell.",
      englishTranslation: "fast",englishExampleSentence: "He runs fast.",meaningSpaceId: space.data.id,tags: ["Test"],
    });
    assert.equal(created.status,201);
    assert.equal(created.data.englishTranslation,"fast");
    assert.equal(created.data.exampleSentence,"Er läuft schnell.");
    assert.equal(created.data.meaningSpaceId,space.data.id);
    assert.deepEqual(created.data.tags,["Test"]);
    assert.equal("language" in created.data,false);
    assert.equal("translations" in created.data,false);
    assert.equal((await request("/api/words","POST",{ term: " " })).status,400);

    const updated = await request("/api/words/" + created.data.id,"PUT",{
      ...created.data,exampleSentence: "Sie antwortete schnell.",englishTranslation: "quickly",
      englishExampleSentence: "She answered quickly.",
    });
    assert.equal(updated.status,200);
    assert.equal(updated.data.englishTranslation,"quickly");

    const quote = await request("/api/quotes","POST",{ type: "quote",content: "Ein Testzitat",tags: ["Test"] });
    assert.equal(quote.status,201);
    const journal = await request("/api/journal","POST",{ content: "Testjournal",entryAt: "2026-09-18T12:00",tags: ["Test"] });
    assert.equal(journal.status,201);
    assert.deepEqual(db.pragma("foreign_key_check"),[]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

after(() => { db.close(); rmSync(directory,{ recursive: true,force: true }); });
