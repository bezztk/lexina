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

test("training prioritizes unfinished cards, avoids immediate repeats, and persists reviews",() => {
  const unit = repo.saveVocabularyUnit(null,"Training");
  const makeEntry = englishTerm => repo.createVocabularyEntry({ unitId: unit.id,englishTerm,germanTranslation: englishTerm,germanExplanation: "" });
  const learning = makeEntry("learning");
  const consolidating = makeEntry("consolidating");
  const secure = makeEntry("secure");
  const out = makeEntry("out");
  db.prepare("UPDATE vocabulary_units SET review_step=200 WHERE id=?").run(unit.id);
  db.prepare("UPDATE vocabulary_entries SET status='learning',last_seen_step=200,seen_count=1 WHERE id=?").run(learning.id);
  db.prepare("UPDATE vocabulary_entries SET status='consolidating',last_seen_step=160,seen_count=1 WHERE id=?").run(consolidating.id);
  db.prepare("UPDATE vocabulary_entries SET status='secure',last_seen_step=100,seen_count=1 WHERE id=?").run(secure.id);
  db.prepare("UPDATE vocabulary_entries SET status='out',last_seen_step=1,seen_count=1 WHERE id=?").run(out.id);
  const addReview = db.prepare("INSERT INTO vocabulary_reviews(entry_id,prompt_key,result,review_step) VALUES (?,'englishTerm','known',?)");
  addReview.run(learning.id,180); addReview.run(consolidating.id,160); addReview.run(secure.id,100); addReview.run(out.id,1);
  const selected = repo.selectNextVocabularyEntry(unit.id);
  assert.equal(selected.id,consolidating.id);
  assert.equal(selected.lastSeenStep,201);
  assert.equal(selected.seenCount,2);
  assert.equal(selected.lastPromptIndex,1);
  assert.equal(repo.reviewVocabularyEntry(consolidating.id,"known").status,"consolidating");
  assert.deepEqual(repo.getVocabularyEntry(consolidating.id).reviewStats.directions.germanTranslation,{
    attempts: 1,correct: 1,correctStreak: 1,missedStreak: 0,lastResult: "known",lastReviewedStep: 201,
  });
  assert.equal(repo.selectNextVocabularyEntry(unit.id).id,learning.id);
  db.prepare("UPDATE vocabulary_entries SET status='secure' WHERE id IN (?,?)").run(learning.id,consolidating.id);
  assert.equal(repo.selectNextVocabularyEntry(unit.id).id,secure.id);
  const counts = repo.getVocabularyUnit(unit.id);
  assert.deepEqual([counts.learningCount,counts.consolidatingCount,counts.secureCount,counts.outCount],[0,0,3,1]);
});

test("training learns both core directions, derives counts, and reacts to repeated misses",() => {
  const unit = repo.saveVocabularyUnit(null,"Prompt rotation");
  const entry = repo.createVocabularyEntry({
    unitId: unit.id,englishTerm: "reliable",germanTranslation: "zuverlässig",germanExplanation: "verlässlich",
  });
  const review = result => {
    const selected = repo.selectNextVocabularyEntry(unit.id);
    return { prompt: selected.lastPromptIndex,entry: repo.reviewVocabularyEntry(entry.id,result) };
  };
  const first = review("known");
  assert.equal(first.prompt,0);
  assert.equal(first.entry.status,"learning");
  const introduced = review("known");
  assert.equal(introduced.prompt,1);
  assert.equal(introduced.entry.status,"consolidating");
  assert.equal(review("known").prompt,2);
  assert.equal(review("known").prompt,0);
  const secure = review("known");
  assert.equal(secure.prompt,1);
  assert.equal(secure.entry.status,"secure");
  const firstMiss = review("missed");
  assert.equal(firstMiss.entry.status,"secure");
  const secondMiss = review("missed");
  assert.equal(secondMiss.prompt,firstMiss.prompt);
  assert.equal(secondMiss.entry.status,"consolidating");
  assert.equal(secondMiss.entry.reviewStats.total,7);
  assert.equal(secondMiss.entry.reviewStats.correct,5);
  assert.equal(secondMiss.entry.reviewStats.directions.englishTerm.attempts
    + secondMiss.entry.reviewStats.directions.germanTranslation.attempts
    + secondMiss.entry.reviewStats.directions.germanExplanation.attempts,7);
  assert.equal(repo.takeVocabularyEntryOut(entry.id).status,"out");
  assert.equal(repo.selectNextVocabularyEntry(unit.id),null);
});

test("learning excludes the meaning prompt and uses fixed milestones when no meaning exists",() => {
  const unit = repo.saveVocabularyUnit(null,"Core directions");
  const entry = repo.createVocabularyEntry({
    unitId: unit.id,englishTerm: "careful",germanTranslation: "vorsichtig",germanExplanation: "",
  });
  const review = () => {
    const selected = repo.selectNextVocabularyEntry(unit.id);
    assert.notEqual(selected.lastPromptIndex,2);
    return repo.reviewVocabularyEntry(entry.id,"known");
  };
  assert.equal(review().status,"learning");
  assert.equal(review().status,"consolidating");
  assert.equal(review().status,"consolidating");
  assert.equal(review().status,"secure");
  assert.deepEqual([
    repo.getVocabularyEntry(entry.id).reviewStats.directions.englishTerm.correct,
    repo.getVocabularyEntry(entry.id).reviewStats.directions.germanTranslation.correct,
    repo.getVocabularyEntry(entry.id).reviewStats.directions.germanExplanation.attempts,
  ],[2,2,0]);
});

test("consolidating only asks directions whose learning target is still open",() => {
  const unit = repo.saveVocabularyUnit(null,"Open directions");
  const entry = repo.createVocabularyEntry({
    unitId: unit.id,englishTerm: "thoughtful",germanTranslation: "aufmerksam",germanExplanation: "rücksichtsvoll",
  });
  db.prepare("UPDATE vocabulary_units SET review_step=4 WHERE id=?").run(unit.id);
  db.prepare("UPDATE vocabulary_entries SET status='consolidating',last_seen_step=4,seen_count=4 WHERE id=?").run(entry.id);
  const addReview = db.prepare("INSERT INTO vocabulary_reviews(entry_id,prompt_key,result,review_step) VALUES (?,?,?,?)");
  addReview.run(entry.id,"englishTerm","known",1);
  addReview.run(entry.id,"germanTranslation","known",2);
  addReview.run(entry.id,"germanTranslation","known",3);
  const meaning = repo.selectNextVocabularyEntry(unit.id);
  assert.equal(meaning.lastPromptIndex,2);
  assert.equal(repo.reviewVocabularyEntry(entry.id,"known").status,"consolidating");
  const english = repo.selectNextVocabularyEntry(unit.id);
  assert.equal(english.lastPromptIndex,0);
  assert.equal(repo.reviewVocabularyEntry(entry.id,"known").status,"secure");
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
    const entries = (await request(`/api/vocabulary-units/${unit.data.id}/entries`)).data;
    assert.equal(entries.length,2);
    assert.deepEqual(entries[0].reviewStats,{ total: 0,correct: 0,lastResult: null,directions: {
      englishTerm: { attempts: 0,correct: 0,correctStreak: 0,missedStreak: 0,lastResult: null,lastReviewedStep: null },
      germanTranslation: { attempts: 0,correct: 0,correctStreak: 0,missedStreak: 0,lastResult: null,lastReviewedStep: null },
      germanExplanation: { attempts: 0,correct: 0,correctStreak: 0,missedStreak: 0,lastResult: null,lastReviewedStep: null },
    } });
    const next = await request(`/api/vocabulary-units/${unit.data.id}/next`,"POST");
    assert.equal(next.status,200);
    assert.equal((await request(`/api/vocabulary-entries/${next.data.id}/review`,"POST",{ result: "wrong" })).status,400);
    const reviewed = await request(`/api/vocabulary-entries/${next.data.id}/review`,"POST",{ result: "known" });
    assert.equal(reviewed.status,200);
    assert.equal(reviewed.data.status,"learning");
    assert.equal(reviewed.data.reviewStats.total,1);
    const takenOut = await request(`/api/vocabulary-entries/${next.data.id}/out`,"POST");
    assert.equal(takenOut.status,200);
    assert.equal(takenOut.data.status,"out");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

after(() => { db.close(); rmSync(directory,{ recursive: true,force: true }); });
