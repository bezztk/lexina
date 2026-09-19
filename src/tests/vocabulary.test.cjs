const { test,after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync,rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const directory = mkdtempSync(path.join(tmpdir(),"lexina-vocabulary-tests-"));
process.env.LEXINA_DATABASE_PATH = path.join(directory,"vocabulary.sqlite");

const repo = require("../dist/server/repositories/vocabulary-repository.js");
const { db } = require("../dist/server/database/db.js");

test("units contain separate vocabulary entries and delete them through the relation",() => {
  const unit = repo.saveVocabularyUnit(null,"Unit 1");
  const entry = repo.createVocabularyEntry({
    unitId: unit.id,
    englishTerm: "to achieve",
    germanTranslation: "erreichen",
    germanExplanation: "ein Ziel erfolgreich verwirklichen",
  });
  assert.deepEqual(repo.listVocabularyEntries(unit.id),[entry]);
  assert.equal(repo.getVocabularyUnit(unit.id).entryCount,1);
  assert.equal(repo.updateVocabularyEntry(entry.id,{ ...entry,englishTerm: "to accomplish" }).englishTerm,"to accomplish");
  assert.equal(repo.saveVocabularyUnit(unit.id,"Unit One").label,"Unit One");
  assert.equal(repo.deleteVocabularyUnit(unit.id),true);
  assert.deepEqual(repo.listVocabularyEntries(unit.id),[]);
  assert.deepEqual(db.pragma("foreign_key_check"),[]);
});

test("training selects the highest weighted recency score and persists reviews",() => {
  const unit = repo.saveVocabularyUnit(null,"Training");
  const makeEntry = englishTerm => repo.createVocabularyEntry({ unitId: unit.id,englishTerm,germanTranslation: englishTerm,germanExplanation: "" });
  const learning = makeEntry("learning");
  const consolidating = makeEntry("consolidating");
  const secure = makeEntry("secure");
  const out = makeEntry("out");
  db.prepare("UPDATE vocabulary_units SET review_step=200 WHERE id=?").run(unit.id);
  db.prepare("UPDATE vocabulary_entries SET status='learning',last_seen_step=180,seen_count=1 WHERE id=?").run(learning.id);
  db.prepare("UPDATE vocabulary_entries SET status='consolidating',last_seen_step=160,seen_count=1 WHERE id=?").run(consolidating.id);
  db.prepare("UPDATE vocabulary_entries SET status='secure',last_seen_step=100,seen_count=1 WHERE id=?").run(secure.id);
  db.prepare("UPDATE vocabulary_entries SET status='out',last_seen_step=1,seen_count=1 WHERE id=?").run(out.id);
  const selected = repo.selectNextVocabularyEntry(unit.id);
  assert.equal(selected.id,secure.id);
  assert.equal(selected.lastSeenStep,201);
  assert.equal(selected.seenCount,2);
  assert.equal(selected.lastPromptIndex,0);
  assert.equal(repo.reviewVocabularyEntry(secure.id,"consolidating").status,"consolidating");
  const counts = repo.getVocabularyUnit(unit.id);
  assert.deepEqual([counts.learningCount,counts.consolidatingCount,counts.secureCount,counts.outCount],[1,2,0,1]);
});

test("training rotates the prompted side for each vocabulary entry",() => {
  const unit = repo.saveVocabularyUnit(null,"Prompt rotation");
  const entry = repo.createVocabularyEntry({
    unitId: unit.id,englishTerm: "reliable",germanTranslation: "zuverlässig",germanExplanation: "verlässlich",
  });
  assert.deepEqual([
    repo.selectNextVocabularyEntry(unit.id).lastPromptIndex,
    repo.selectNextVocabularyEntry(unit.id).lastPromptIndex,
    repo.selectNextVocabularyEntry(unit.id).lastPromptIndex,
    repo.selectNextVocabularyEntry(unit.id).lastPromptIndex,
  ],[0,1,2,0]);
  assert.equal(repo.getVocabularyEntry(entry.id).seenCount,4);
});

test("vocabulary HTTP endpoints validate and persist units and entries",async () => {
  const express = require("express");
  const { vocabularyUnitsRouter,vocabularyEntriesRouter } = require("../dist/server/routes/vocabulary.js");
  const app = express();
  app.use(express.json());
  app.use("/api/vocabulary-units",vocabularyUnitsRouter);
  app.use("/api/vocabulary-entries",vocabularyEntriesRouter);
  const server = app.listen(0,"127.0.0.1");
  await new Promise(resolve => server.once("listening",resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function request(url,method = "GET",body) {
    const response = await fetch(base + url,{ method,headers: { "Content-Type": "application/json" },...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status,data: response.status === 204 ? null : await response.json() };
  }
  try {
    assert.equal((await request("/api/vocabulary-units","POST",{ label: " " })).status,400);
    const unit = await request("/api/vocabulary-units","POST",{ label: "Unit 2" });
    assert.equal(unit.status,201);
    assert.equal((await request(`/api/vocabulary-units/${unit.data.id}/entries`,"POST",{ englishTerm: "missing German" })).status,400);
    const entry = await request(`/api/vocabulary-units/${unit.data.id}/entries`,"POST",{
      englishTerm: "reliable",germanTranslation: "zuverlässig",germanExplanation: "jemand, auf den man sich verlassen kann",
    });
    assert.equal(entry.status,201);
    assert.equal(entry.data.unitId,unit.data.id);
    assert.equal((await request("/api/vocabulary-units")).data.find(item => item.id === unit.data.id).entryCount,1);
    assert.equal((await request(`/api/vocabulary-entries/${entry.data.id}`,"DELETE")).status,204);
    const invalidImport = await request(`/api/vocabulary-units/${unit.data.id}/import`,"POST",[
      { english: "valid",german: "gültig",meaning: "korrekt" },
      { english: "missing German",german: "" },
    ]);
    assert.equal(invalidImport.status,400);
    assert.deepEqual((await request(`/api/vocabulary-units/${unit.data.id}/entries`)).data,[]);
    const imported = await request(`/api/vocabulary-units/${unit.data.id}/import`,"POST",[
      ["to achieve","erreichen","ein Ziel verwirklichen"],
      ["reliable","zuverlässig","verlässlich"],
    ]);
    assert.equal(imported.status,201);
    assert.equal(imported.data.imported,2);
    assert.equal((await request(`/api/vocabulary-units/${unit.data.id}/entries`)).data.length,2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

after(() => { db.close(); rmSync(directory,{ recursive: true,force: true }); });
