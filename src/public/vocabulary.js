const vocabularyState = { units: [],entries: [],selectedUnitId: null,trainingEntry: null,trainingPromptKey: null };
const vocabularyStatusNames = { learning: "Lernen",consolidating: "Festigen",secure: "Sicher",out: "Aus Übung" };

const vocabularyUnitDialog = document.querySelector("#vocabulary-unit-dialog");
const vocabularyUnitForm = document.querySelector("#vocabulary-unit-form");
const vocabularyEntryDialog = document.querySelector("#vocabulary-entry-dialog");
const vocabularyEntryForm = document.querySelector("#vocabulary-entry-form");
const vocabularyImportForm = document.querySelector("#vocabulary-import-form");
const vocabularyTrainingDialog = document.querySelector("#vocabulary-training-dialog");

function selectedVocabularyUnit() {
  return vocabularyState.units.find(unit => unit.id === vocabularyState.selectedUnitId) || null;
}

async function loadVocabularyUnits() {
  try {
    vocabularyState.units = await api("/api/vocabulary-units");
    if (vocabularyState.selectedUnitId && !selectedVocabularyUnit()) vocabularyState.selectedUnitId = null;
    renderVocabularyUnits();
    if (vocabularyState.selectedUnitId) await loadVocabularyEntries();
  } catch { notify("Units konnten nicht geladen werden."); }
}

function renderVocabularyUnits() {
  const list = document.querySelector("#vocabulary-unit-list");
  list.innerHTML = vocabularyState.units.length ? vocabularyState.units.map(unit => `
    <button class="vocabulary-unit-card" data-open-vocabulary-unit="${unit.id}">
      <strong>${escapeHtml(unit.label)}</strong>
      <span>${unit.entryCount} ${unit.entryCount === 1 ? "Vokabel" : "Vokabeln"}</span>
    </button>
  `).join("") : empty("Noch keine Units angelegt.");
  const selected = selectedVocabularyUnit();
  document.querySelector("#vocabulary-unit-overview").hidden = Boolean(selected);
  document.querySelector("#vocabulary-entry-overview").hidden = !selected;
  if (selected) document.querySelector("#vocabulary-unit-heading").textContent = selected.label;
}

async function openVocabularyUnit(id) {
  vocabularyState.selectedUnitId = id;
  renderVocabularyUnits();
  await loadVocabularyEntries();
}

function closeVocabularyUnit() {
  vocabularyState.selectedUnitId = null;
  vocabularyState.entries = [];
  renderVocabularyUnits();
}

async function loadVocabularyEntries() {
  try {
    vocabularyState.entries = await api(`/api/vocabulary-units/${vocabularyState.selectedUnitId}/entries`);
    renderVocabularyEntries();
  } catch { notify("Vokabeln konnten nicht geladen werden."); }
}

function renderVocabularySummary() {
  const counts = { learning: 0,consolidating: 0,secure: 0,out: 0 };
  vocabularyState.entries.forEach(entry => { counts[entry.status] += 1; });
  const content = `<span><strong>${vocabularyState.entries.length}</strong> Gesamt</span>` + Object.entries(counts).map(([status,count]) =>
    `<span class="vocabulary-summary-${status}"><strong>${count}</strong> ${vocabularyStatusNames[status]}</span>`).join("");
  document.querySelector("#vocabulary-status-summary").innerHTML = content;
  document.querySelector("#vocabulary-training-summary").innerHTML = content;
}

function renderVocabularyEntries() {
  document.querySelector("#vocabulary-entry-list").innerHTML = vocabularyState.entries.length ? vocabularyState.entries.map(entry => `
      <article class="card vocabulary-entry-card">
        <button class="vocabulary-entry-content" data-edit-vocabulary-entry="${entry.id}">
          <strong>${escapeHtml(entry.englishTerm)}</strong>
          <span>${escapeHtml(entry.germanTranslation)}</span>
          ${entry.germanExplanation ? `<small>${escapeHtml(entry.germanExplanation)}</small>` : ""}
          <em class="vocabulary-status vocabulary-status-${entry.status}">${vocabularyStatusNames[entry.status]}</em>
        </button>
      </article>
    `).join("") : empty("Diese Unit enthält noch keine Vokabeln.");
  renderVocabularySummary();
}

function openVocabularyUnitForm(unit) {
  vocabularyUnitForm.elements.id.value = unit?.id || "";
  vocabularyUnitForm.elements.label.value = unit?.label || "";
  document.querySelector("#vocabulary-unit-dialog-title").textContent = unit ? "Unit bearbeiten" : "Unit hinzufügen";
  const deleteButton = document.querySelector("[data-delete-vocabulary-unit]");
  deleteButton.hidden = !unit;
  deleteButton.dataset.deleteVocabularyUnit = unit?.id || "";
  vocabularyUnitDialog.showModal();
  vocabularyUnitForm.elements.label.focus();
}

function closeVocabularyUnitForm() { vocabularyUnitDialog.close(); vocabularyUnitForm.reset(); }

function setVocabularyMode(mode) {
  const importing = mode === "import";
  vocabularyImportForm.hidden = !importing;
  vocabularyEntryForm.hidden = importing;
  document.querySelectorAll("[data-vocabulary-mode]").forEach(button => {
    const active = button.dataset.vocabularyMode === mode;
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",String(active));
  });
  document.querySelector("#vocabulary-entry-dialog-title").textContent = importing ? "Vokabeln hinzufügen" : "Vokabel hinzufügen";
  window.setTimeout(() => (importing ? vocabularyImportForm.elements.json : vocabularyEntryForm.elements.englishTerm).focus());
}

function openVocabularyEntryForm(entry) {
  vocabularyEntryForm.elements.id.value = entry?.id || "";
  vocabularyEntryForm.elements.englishTerm.value = entry?.englishTerm || "";
  vocabularyEntryForm.elements.germanTranslation.value = entry?.germanTranslation || "";
  vocabularyEntryForm.elements.germanExplanation.value = entry?.germanExplanation || "";
  const deleteButton = document.querySelector("[data-delete-vocabulary-entry]");
  deleteButton.hidden = !entry;
  deleteButton.dataset.deleteVocabularyEntry = entry?.id || "";
  document.querySelector("#vocabulary-mode-switch").hidden = Boolean(entry);
  document.querySelector("#vocabulary-import-error").hidden = true;
  setVocabularyMode(entry ? "manual" : "import");
  if (entry) document.querySelector("#vocabulary-entry-dialog-title").textContent = "Vokabel bearbeiten";
  vocabularyEntryDialog.showModal();
}

function closeVocabularyEntryForm() { vocabularyEntryDialog.close(); vocabularyEntryForm.reset(); vocabularyImportForm.reset(); }

function parseVocabularyJson(value) {
  let json = String(value).trim();
  json = json.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  const start = json.indexOf("[");
  const end = json.lastIndexOf("]");
  if (start >= 0 && end > start) json = json.slice(start,end + 1);
  return JSON.parse(json);
}

async function loadNextVocabularyTrainingEntry() {
  try {
    const entry = await api(`/api/vocabulary-units/${vocabularyState.selectedUnitId}/next`,{ method: "POST" });
    vocabularyState.trainingEntry = entry;
    const card = document.querySelector("#vocabulary-training-card");
    const emptyState = document.querySelector("#vocabulary-training-empty");
    const revealButton = document.querySelector("[data-action='reveal-vocabulary']");
    const reviewActions = document.querySelector("[data-training-review-actions]");
    card.hidden = !entry;
    emptyState.hidden = Boolean(entry);
    revealButton.hidden = !entry;
    reviewActions.hidden = true;
    if (!entry) return;
    const prompts = [
      ["englishTerm","Englisch",entry.englishTerm],
      ["germanTranslation","Deutsch",entry.germanTranslation],
      ...(entry.germanExplanation ? [["germanExplanation","Bedeutung",entry.germanExplanation]] : []),
    ];
    const prompt = prompts[entry.lastPromptIndex];
    vocabularyState.trainingPromptKey = prompt[0];
    document.querySelector("#vocabulary-training-prompt-label").textContent = prompt[1];
    document.querySelector("#vocabulary-training-prompt").textContent = prompt[2];
    document.querySelector("#vocabulary-training-answer").hidden = true;
  } catch { notify("Die nächste Vokabel konnte nicht geladen werden."); }
}

async function openVocabularyTraining() {
  const unit = selectedVocabularyUnit();
  document.querySelector("#vocabulary-training-title").textContent = `${unit.label} trainieren`;
  vocabularyTrainingDialog.showModal();
  await loadNextVocabularyTrainingEntry();
}

function closeVocabularyTraining() {
  vocabularyState.trainingEntry = null;
  vocabularyTrainingDialog.close();
}

function revealVocabularyTrainingEntry() {
  const entry = vocabularyState.trainingEntry;
  if (!entry) return;
  const values = [
    ["englishTerm","Englisch",entry.englishTerm],
    ["germanTranslation","Deutsch",entry.germanTranslation],
    ["germanExplanation","Bedeutung",entry.germanExplanation],
  ].filter(([key,,value]) => key !== vocabularyState.trainingPromptKey && value);
  const answer = document.querySelector("#vocabulary-training-answer");
  answer.innerHTML = values.map(([,label,value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  answer.hidden = false;
  document.querySelector("[data-action='reveal-vocabulary']").hidden = true;
  const reviewActions = document.querySelector("[data-training-review-actions]");
  reviewActions.hidden = false;
  reviewActions.querySelectorAll("[data-review-status]").forEach(button => {
    const active = button.dataset.reviewStatus === entry.status;
    button.classList.toggle("current",active);
    button.setAttribute("aria-pressed",String(active));
  });
}

async function reviewCurrentVocabulary(status) {
  const entry = vocabularyState.trainingEntry;
  if (!entry) return;
  try {
    const updated = await api(`/api/vocabulary-entries/${entry.id}/review`,{ method: "POST",body: JSON.stringify({ status }) });
    vocabularyState.entries = vocabularyState.entries.map(item => item.id === updated.id ? updated : item);
    renderVocabularyEntries();
    await loadNextVocabularyTrainingEntry();
  } catch { notify("Der Lernstatus konnte nicht gespeichert werden."); }
}

function initVocabularyArea() {
  vocabularyUnitForm.addEventListener("submit",async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(vocabularyUnitForm));
    const id = data.id;
    try {
      const unit = await api(id ? `/api/vocabulary-units/${id}` : "/api/vocabulary-units",{ method: id ? "PUT" : "POST",body: JSON.stringify({ label: data.label }) });
      if (id) vocabularyState.selectedUnitId = unit.id;
      closeVocabularyUnitForm(); await loadVocabularyUnits(); notify("Unit gespeichert.");
    } catch { notify("Unit konnte nicht gespeichert werden."); }
  });

  vocabularyEntryForm.addEventListener("submit",async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(vocabularyEntryForm));
    const id = data.id;
    const payload = { ...data,unitId: vocabularyState.selectedUnitId };
    try {
      await api(id ? `/api/vocabulary-entries/${id}` : `/api/vocabulary-units/${vocabularyState.selectedUnitId}/entries`,{ method: id ? "PUT" : "POST",body: JSON.stringify(payload) });
      closeVocabularyEntryForm(); await loadVocabularyUnits(); notify("Vokabel gespeichert.");
    } catch { notify("Vokabel konnte nicht gespeichert werden."); }
  });

  vocabularyImportForm.addEventListener("submit",async event => {
    event.preventDefault();
    const error = document.querySelector("#vocabulary-import-error");
    error.hidden = true;
    try {
      const entries = parseVocabularyJson(vocabularyImportForm.elements.json.value);
      const result = await api(`/api/vocabulary-units/${vocabularyState.selectedUnitId}/import`,{ method: "POST",body: JSON.stringify(entries) });
      closeVocabularyEntryForm(); await loadVocabularyUnits();
      notify(`${result.imported} ${result.imported === 1 ? "Vokabel wurde" : "Vokabeln wurden"} importiert.`);
    } catch (importError) {
      error.textContent = importError instanceof SyntaxError ? "Das eingefügte JSON ist nicht gültig." : importError.message;
      error.hidden = false;
    }
  });

  document.addEventListener("click",async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "new-vocabulary-unit") openVocabularyUnitForm();
    if (button.dataset.action === "edit-vocabulary-unit") openVocabularyUnitForm(selectedVocabularyUnit());
    if (button.dataset.action === "close-vocabulary-unit") closeVocabularyUnit();
    if (button.dataset.action === "close-vocabulary-unit-dialog") closeVocabularyUnitForm();
    if (button.dataset.action === "new-vocabulary-entry") openVocabularyEntryForm();
    if (button.dataset.action === "close-vocabulary-entry") closeVocabularyEntryForm();
    if (button.dataset.action === "start-vocabulary-training") await openVocabularyTraining();
    if (button.dataset.action === "close-vocabulary-training") closeVocabularyTraining();
    if (button.dataset.action === "reveal-vocabulary") revealVocabularyTrainingEntry();
    if (button.dataset.reviewStatus) await reviewCurrentVocabulary(button.dataset.reviewStatus);
    if (button.dataset.vocabularyMode) setVocabularyMode(button.dataset.vocabularyMode);
    if (button.dataset.action === "copy-vocabulary-prompt") {
      const prompt = document.querySelector("#vocabulary-import-prompt");
      try { await navigator.clipboard.writeText(prompt.value); }
      catch { prompt.select(); document.execCommand("copy"); }
      notify("Prompt kopiert.");
    }
    if (button.dataset.openVocabularyUnit) await openVocabularyUnit(Number(button.dataset.openVocabularyUnit));
    const entry = vocabularyState.entries.find(item => item.id === Number(button.dataset.editVocabularyEntry));
    if (entry) openVocabularyEntryForm(entry);
    if (button.dataset.deleteVocabularyUnit && window.confirm("Diese Unit und alle enthaltenen Vokabeln endgültig löschen?")) {
      try { await api(`/api/vocabulary-units/${button.dataset.deleteVocabularyUnit}`,{ method: "DELETE" }); closeVocabularyUnitForm(); closeVocabularyUnit(); await loadVocabularyUnits(); notify("Unit gelöscht."); }
      catch { notify("Unit konnte nicht gelöscht werden."); }
    }
    if (button.dataset.deleteVocabularyEntry && window.confirm("Diese Vokabel endgültig löschen?")) {
      try { await api(`/api/vocabulary-entries/${button.dataset.deleteVocabularyEntry}`,{ method: "DELETE" }); closeVocabularyEntryForm(); await loadVocabularyUnits(); notify("Vokabel gelöscht."); }
      catch { notify("Vokabel konnte nicht gelöscht werden."); }
    }
  });

  vocabularyUnitDialog.addEventListener("click",event => { if (event.target === vocabularyUnitDialog) closeVocabularyUnitForm(); });
  vocabularyEntryDialog.addEventListener("click",event => { if (event.target === vocabularyEntryDialog) closeVocabularyEntryForm(); });
  vocabularyTrainingDialog.addEventListener("click",event => { if (event.target === vocabularyTrainingDialog) closeVocabularyTraining(); });
}
