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
    assert.equal((await request("/api/vocabulary-units")).data[0].entryCount,1);
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
