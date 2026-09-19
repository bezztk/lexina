const vocabularyState = { units: [],entries: [],selectedUnitId: null };

const vocabularyUnitDialog = document.querySelector("#vocabulary-unit-dialog");
const vocabularyUnitForm = document.querySelector("#vocabulary-unit-form");
const vocabularyEntryDialog = document.querySelector("#vocabulary-entry-dialog");
const vocabularyEntryForm = document.querySelector("#vocabulary-entry-form");

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
    document.querySelector("#vocabulary-entry-list").innerHTML = vocabularyState.entries.length ? vocabularyState.entries.map(entry => `
      <article class="card vocabulary-entry-card">
        <button class="vocabulary-entry-content" data-edit-vocabulary-entry="${entry.id}">
          <strong>${escapeHtml(entry.englishTerm)}</strong>
          <span>${escapeHtml(entry.germanTranslation)}</span>
          ${entry.germanExplanation ? `<small>${escapeHtml(entry.germanExplanation)}</small>` : ""}
        </button>
      </article>
    `).join("") : empty("Diese Unit enthält noch keine Vokabeln.");
  } catch { notify("Vokabeln konnten nicht geladen werden."); }
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

function openVocabularyEntryForm(entry) {
  vocabularyEntryForm.elements.id.value = entry?.id || "";
  vocabularyEntryForm.elements.englishTerm.value = entry?.englishTerm || "";
  vocabularyEntryForm.elements.germanTranslation.value = entry?.germanTranslation || "";
  vocabularyEntryForm.elements.germanExplanation.value = entry?.germanExplanation || "";
  document.querySelector("#vocabulary-entry-dialog-title").textContent = entry ? "Vokabel bearbeiten" : "Vokabel hinzufügen";
  const deleteButton = document.querySelector("[data-delete-vocabulary-entry]");
  deleteButton.hidden = !entry;
  deleteButton.dataset.deleteVocabularyEntry = entry?.id || "";
  vocabularyEntryDialog.showModal();
  vocabularyEntryForm.elements.englishTerm.focus();
}

function closeVocabularyEntryForm() { vocabularyEntryDialog.close(); vocabularyEntryForm.reset(); }

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

  document.addEventListener("click",async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "new-vocabulary-unit") openVocabularyUnitForm();
    if (button.dataset.action === "edit-vocabulary-unit") openVocabularyUnitForm(selectedVocabularyUnit());
    if (button.dataset.action === "close-vocabulary-unit") closeVocabularyUnit();
    if (button.dataset.action === "close-vocabulary-unit-dialog") closeVocabularyUnitForm();
    if (button.dataset.action === "new-vocabulary-entry") openVocabularyEntryForm();
    if (button.dataset.action === "close-vocabulary-entry") closeVocabularyEntryForm();
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
}
