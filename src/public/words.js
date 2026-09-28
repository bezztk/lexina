const statusNames = { draft: "Entwurf", learning: "Lernen", ready: "Abgeschlossen" };
const personalStatusNames = { unclassified: "Nicht eingeordnet",describes_me: "Beschreibt mich",develop: "Möchte ich entwickeln",reduce: "Möchte ich reduzieren",replace: "Möchte ich ersetzen",boundary: "Davon grenze ich mich ab" };
const personalStrengthNames = { partial: "Teilweise",clear: "Deutlich",strong: "Stark" };
let selectedSpaceId = null;
let selectedWordTag = "";
const spaceDialog = () => document.querySelector("#space-dialog");
const spaceForm = () => document.querySelector("#space-form");
const wordAddDialog = () => document.querySelector("#word-add-dialog");
const wordSpaceDialog = () => document.querySelector("#word-space-dialog");
const wordImportDialog = () => document.querySelector("#word-import-dialog");
const wordImportForm = () => document.querySelector("#word-import-form");
function showEditorError(selector,error) {
  const element = document.querySelector(selector);
  element.textContent = error.message || "Die Änderung konnte nicht gespeichert werden.";
  element.hidden = false;
}
function validateLanguageBlocks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => key !== "groups") || !Array.isArray(value.groups))
    throw new Error("Die Datei muss ausschließlich eine Liste „groups“ enthalten.");
  return value.groups.map((group,index) => {
    if (!group || typeof group !== "object" || Array.isArray(group)
      || Object.keys(group).some(key => key !== "title" && key !== "words")
      || typeof group.title !== "string" || !group.title.trim() || !Array.isArray(group.words)
      || group.words.some(word => typeof word !== "string" || !word.trim()))
      throw new Error(`Gruppe ${index + 1} benötigt ausschließlich einen Titel und eine Liste nicht leerer Wörter.`);
    return { title: group.title,words: [...group.words] };
  });
}
async function loadLanguageBlocks() {
  const section = document.querySelector("#language-blocks");
  section.hidden = true;
  document.querySelector("#language-block-list").replaceChildren();
  try {
    const response = await fetch("/data/language-blocks.json",{ cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const groups = validateLanguageBlocks(await response.json());
    if (!groups.length) return;
    document.querySelector("#language-block-list").innerHTML = groups.map(group =>
      '<article class="language-block-group"><h3>' + escapeHtml(group.title) + '</h3><div class="language-block-words">' +
      group.words.map(word => '<span>' + escapeHtml(word) + '</span>').join("") + "</div></article>"
    ).join("");
    section.hidden = false;
  } catch (error) {
    console.error("Sprachbausteine konnten nicht geladen werden.",error);
  }
}
async function loadWords() {
  const languageBlocks = loadLanguageBlocks();
  try {
    [state.words,state.spaces] = await Promise.all([api("/api/words"),api("/api/spaces"),loadTags()]);
    renderWordTagFilter();
    renderWords();
  } catch (error) { notify(error.message); }
  await languageBlocks;
}
function matchesWord(word) {
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const status = document.querySelector("#word-status-filter").value;
  const personalStatus = document.querySelector("#word-personal-status-filter").value;
  const haystack = [word.term,word.meaning,word.replaces,word.englishTranslation].join(" ").toLocaleLowerCase();
  return (!query || haystack.includes(query)) && (!status || word.status === status)
    && (!personalStatus || word.personalStatus === personalStatus) && (!selectedWordTag || word.tags.includes(selectedWordTag));
}
function renderWordTagFilter() {
  if (selectedWordTag && !state.tags.some(tag => tag.name === selectedWordTag)) selectedWordTag = "";
  const select = document.querySelector("#word-tag-filter");
  select.innerHTML = '<option value="">Tag auswählen</option>' + state.tags.map(tag => '<option value="' + escapeHtml(tag.name) + '">' + escapeHtml(tag.name) + '</option>').join("");
  select.value = "";
  document.querySelector("#word-tag-filter-wrap").hidden = Boolean(selectedWordTag);
  const selection = document.querySelector("#word-tag-selection");
  selection.hidden = !selectedWordTag;
  selection.querySelector("span").textContent = selectedWordTag;
  selection.querySelector("button").setAttribute("aria-label",selectedWordTag ? 'Tagfilter „' + selectedWordTag + '“ entfernen' : "Tagfilter entfernen");
}
function statusBadge(word) {
  return word.status === "ready" ? "" : '<span class="inventory-status status-' + word.status + '">' + statusNames[word.status] + '</span>';
}
function personalStatusBadge(word) {
  if (word.personalStatus === "unclassified") return "";
  const strength = word.personalStrength ? '<span class="personal-strength-label">' + personalStrengthNames[word.personalStrength] + '</span>' : "";
  return '<span class="personal-status-badge personal-status-' + word.personalStatus + '"><strong>' + personalStatusNames[word.personalStatus] + '</strong>' + strength + '</span>';
}
function wordCard(word,grouped = false) {
  const englishContent = [
    word.englishTranslation ? '<span class="english-translation">' + escapeHtml(word.englishTranslation) + '</span>' : "",
    word.englishExampleSentence ? '<span>' + escapeHtml(word.englishExampleSentence) + '</span>' : ""
  ].filter(Boolean).join(' <span class="word-separator">·</span> ');
  const tags = word.tags.length ? '<div class="tags word-card-tags">' + word.tags.map(tag => '<span>' + escapeHtml(tag) + '</span>').join("") + '</div>' : "";
  const meta = personalStatusBadge(word) + tags + statusBadge(word);
  return '<article class="' + (grouped ? 'grouped-word-row' : 'card word-card inventory-card') + '"><div class="card-main"><div class="word-summary"><div class="word-title-line"><h3><button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button></h3>' +
    (word.meaning ? '<span class="word-separator">—</span><span class="inline-word-meaning">' + escapeHtml(word.meaning) + '</span>' : '') + '</div>' +
    (meta ? '<div class="word-card-meta">' + meta + '</div>' : '') + '</div>' +
    (word.replaces ? '<p class="word-detail-line"><span class="detail-label">Ersetzt:</span><span>' + escapeHtml(word.replaces) + '</span></p>' : '') +
    (word.exampleSentence ? '<p class="word-detail-line"><span class="detail-label">Beispiel:</span><span>' + escapeHtml(word.exampleSentence) + '</span></p>' : '') +
    (englishContent ? '<p class="word-detail-line"><span class="detail-label">Englisch:</span><span>' + englishContent + '</span></p>' : '') +
    "</div></article>";
}
function renderWords() {
  const words = state.words.filter(matchesWord);
  const wordGroups = state.spaces.map(space => ({ space,words: words.filter(word => word.meaningSpaceId === space.id) })).filter(group => group.words.length);
  const unassigned = words.filter(word => word.meaningSpaceId === null);
  const unassignedGroup = unassigned.length
    ? '<article class="meaning-word-group"><header class="meaning-group-header"><strong>Ohne Bedeutung</strong></header><div class="meaning-group-words">' + unassigned.map(word => wordCard(word,true)).join("") + "</div></article>"
    : "";
  document.querySelector("#word-list").innerHTML = unassignedGroup + wordGroups.map(({ space,words: groupWords }) =>
    '<article class="meaning-word-group"><header class="meaning-group-header"><button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + '</button><p>' + escapeHtml(space.explanation) + '</p></header><div class="meaning-group-words">' + groupWords.map(word => wordCard(word,true)).join("") + "</div></article>"
  ).join("") || empty("Keine Wörter für diese Suche.");
}
function renderSpaceOptions() {
  const query = document.querySelector("#word-space-search").value.trim().toLocaleLowerCase();
  document.querySelector("#word-space-options").innerHTML = state.spaces.filter(space => space.label.toLocaleLowerCase().includes(query)).map(space =>
    '<button type="button" class="space-picker-option' + (space.id === selectedSpaceId ? ' selected' : '') + '" data-select-word-space="' + space.id + '"><span>' + escapeHtml(space.label) + '</span>' + (space.id === selectedSpaceId ? '<span aria-hidden="true">✓</span>' : '') + "</button>").join("") || empty("Kein passender Bedeutungsraum.");
}
function updateWordSpaceAction() {
  document.querySelector('[data-action="choose-word-space"]').textContent = selectedSpaceId === null ? "Bedeutung hinzufügen" : "Bedeutung ändern";
  document.querySelector('[data-action="clear-word-space"]').hidden = selectedSpaceId === null;
}
function updatePersonalStrengthVisibility() {
  const strengthSection = document.querySelector("#word-personal-strength");
  const relevant = wordForm.elements.personalStatus.value === "describes_me";
  const strengthInputs = [...strengthSection.querySelectorAll('input[name="personalStrength"]')];
  strengthSection.hidden = !relevant;
  strengthInputs.forEach(input => {
    input.required = relevant;
    if (!relevant) input.checked = false;
  });
  if (relevant && !strengthInputs.some(input => input.checked))
    strengthInputs.find(input => input.value === "partial").checked = true;
}
function openWordSpacePicker() {
  document.querySelector("#word-space-search").value = "";
  renderSpaceOptions();
  wordSpaceDialog().showModal();
  document.querySelector("#word-space-search").focus();
}
function openWordForm(word) {
  document.querySelector("#word-dialog-title").textContent = word ? "Wort bearbeiten" : "Wort hinzufügen";
  for (const key of ["id","term","status","personalStatus","meaning","exampleSentence","replaces","englishTranslation","englishExampleSentence"])
    wordForm.elements[key].value = word?.[key] ?? (key === "status" ? "draft" : key === "personalStatus" ? "unclassified" : "");
  wordForm.querySelectorAll('input[name="personalStrength"]').forEach(input => { input.checked = input.value === word?.personalStrength; });
  updatePersonalStrengthVisibility();
  selectedSpaceId = word?.meaningSpaceId ?? null;
  updateWordSpaceAction();
  renderTagOptions("#word-tags",word?.tags || []);
  const deleteButton = document.querySelector("#word-dialog [data-delete-word]");
  deleteButton.hidden = !word;
  deleteButton.dataset.deleteWord = word?.id || "";
  document.querySelector("#word-error").hidden = true;
  if (!wordDialog.open) wordDialog.showModal();
  wordForm.elements.term.focus();
}
function closeWordForm() {
  if (wordSpaceDialog().open) wordSpaceDialog().close();
  wordDialog.close(); wordForm.reset(); selectedSpaceId = null;
}
function parseWordImportJson(value) {
  let json = String(value).trim();
  json = json.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (start >= 0 && end > start) json = json.slice(start,end + 1);
  return JSON.parse(json);
}
function openWordImport() {
  wordImportForm().reset();
  document.querySelector("#word-import-error").hidden = true;
  wordImportDialog().showModal();
  wordImportForm().elements.json.focus();
}
function closeWordImport() { wordImportDialog().close(); wordImportForm().reset(); }
async function saveWordEditor() {
  if (!wordForm.reportValidity()) return null;
  const data = Object.fromEntries(new FormData(wordForm));
  const id = data.id;
  data.meaningSpaceId = selectedSpaceId;
  data.tags = selectedTags("#word-tags");
  await api(id ? "/api/words/" + id : "/api/words",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
  await loadWords();
  closeWordForm(); notify("Wort gespeichert.");
}
function openSpaceForm(space) {
  const form = spaceForm();
  document.querySelector("#space-dialog-title").textContent = space ? "Bedeutung bearbeiten" : "Bedeutung hinzufügen";
  form.elements.id.value = space?.id || "";
  form.elements.label.value = space?.label || "";
  form.elements.explanation.value = space?.explanation || "";
  const deleteButton = document.querySelector("#space-dialog [data-delete-space]");
  deleteButton.hidden = !space;
  deleteButton.dataset.deleteSpace = space?.id || "";
  document.querySelector("#space-error").hidden = true;
  spaceDialog().showModal();
  form.elements.label.focus();
}
function initWordArea() {
  wordForm.elements.personalStatus.addEventListener("change",updatePersonalStrengthVisibility);
  document.querySelector("#word-search").addEventListener("input",renderWords);
  document.querySelector("#word-status-filter").addEventListener("change",renderWords);
  document.querySelector("#word-personal-status-filter").addEventListener("change",renderWords);
  document.querySelector("#word-tag-filter").addEventListener("change",event => {
    selectedWordTag = event.target.value;
    renderWordTagFilter(); renderWords();
  });
  document.querySelector("[data-clear-word-tag]").addEventListener("click",() => {
    selectedWordTag = "";
    renderWordTagFilter(); renderWords();
  });
  document.querySelector("#word-space-search").addEventListener("input",renderSpaceOptions);
  wordForm.addEventListener("submit",async event => {
    event.preventDefault();
    const button = wordForm.querySelector('button:not([type="button"])');
    button.disabled = true;
    try { await saveWordEditor(); } catch (error) { showEditorError("#word-error",error); } finally { button.disabled = false; }
  });
  wordImportForm().addEventListener("submit",async event => {
    event.preventDefault();
    const button = wordImportForm().querySelector('button[type="submit"]');
    const error = document.querySelector("#word-import-error");
    button.disabled = true;
    error.hidden = true;
    try {
      const payload = parseWordImportJson(wordImportForm().elements.json.value);
      const result = await api("/api/words/import",{ method: "POST",body: JSON.stringify(payload) });
      closeWordImport(); await loadWords();
      notify(`${result.importedWords} ${result.importedWords === 1 ? "Wort wurde" : "Wörter wurden"} importiert.`);
    } catch (importError) {
      error.textContent = importError instanceof SyntaxError ? "Das eingefügte JSON ist nicht gültig." : importError.message;
      error.hidden = false;
    } finally { button.disabled = false; }
  });
  spaceForm().addEventListener("submit",async event => {
    event.preventDefault();
    const form = spaceForm();
    const id = Number(form.elements.id.value) || null;
    const button = form.querySelector('button:not([type="button"])');
    button.disabled = true;
    try {
      const data = { label: form.elements.label.value,explanation: form.elements.explanation.value };
      await api(id ? "/api/spaces/" + id : "/api/spaces",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
      spaceDialog().close(); await loadWords(); notify("Bedeutungsraum gespeichert.");
    } catch (error) { showEditorError("#space-error",error); } finally { button.disabled = false; }
  });
  spaceDialog().addEventListener("click",event => { if (event.target === spaceDialog()) spaceDialog().close(); });
  wordAddDialog().addEventListener("click",event => { if (event.target === wordAddDialog()) wordAddDialog().close(); });
  wordSpaceDialog().addEventListener("click",event => { if (event.target === wordSpaceDialog()) wordSpaceDialog().close(); });
  wordImportDialog().addEventListener("click",event => { if (event.target === wordImportDialog()) closeWordImport(); });
  document.addEventListener("click",async event => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.action === "open-word-add") wordAddDialog().showModal();
      if (button.dataset.action === "close-word-add") wordAddDialog().close();
      if (button.dataset.action === "choose-new-word") { wordAddDialog().close(); openWordForm(); }
      if (button.dataset.action === "choose-new-space") { wordAddDialog().close(); openSpaceForm(); }
      if (button.dataset.action === "import-words") { if (wordAddDialog().open) wordAddDialog().close(); openWordImport(); }
      if (button.dataset.action === "close-word-import") closeWordImport();
      if (button.dataset.action === "copy-word-prompt") {
        await navigator.clipboard.writeText(document.querySelector("#word-import-prompt").value);
        notify("Prompt kopiert.");
      }
      if (button.dataset.action === "close-space") spaceDialog().close();
      if (button.dataset.action === "choose-word-space") openWordSpacePicker();
      if (button.dataset.action === "close-word-space") wordSpaceDialog().close();
      if (button.dataset.action === "clear-word-space") {
        selectedSpaceId = null; updateWordSpaceAction(); wordSpaceDialog().close();
      }
      if (button.dataset.selectWordSpace) {
        selectedSpaceId = Number(button.dataset.selectWordSpace); updateWordSpaceAction(); wordSpaceDialog().close();
      }
      if (button.dataset.editSpace) openSpaceForm(state.spaces.find(s => s.id === Number(button.dataset.editSpace)));
      if (button.dataset.deleteSpace && window.confirm("Bedeutungsraum löschen? Seine Wörter bleiben erhalten.")) {
        await api("/api/spaces/" + button.dataset.deleteSpace,{ method: "DELETE" });
        if (spaceDialog().open) spaceDialog().close();
        await loadWords(); notify("Bedeutung gelöscht.");
      }
    } catch (error) {
      if (wordDialog.open) showEditorError("#word-error",error);
      else if (spaceDialog().open) showEditorError("#space-error",error);
      else notify(error.message);
    }
  });
}
