const statusNames = { draft: "Entwurf", ready: "Bereit", learning: "Im Lernen" };
let selectedSpaceId = null;
const spaceDialog = () => document.querySelector("#space-dialog");
const spaceForm = () => document.querySelector("#space-form");
const wordSpaceDialog = () => document.querySelector("#word-space-dialog");
function showEditorError(selector,error) {
  const element = document.querySelector(selector);
  element.textContent = error.message || "Die Änderung konnte nicht gespeichert werden.";
  element.hidden = false;
}
async function loadWords() {
  try {
    [state.words,state.spaces] = await Promise.all([api("/api/words"),api("/api/spaces"),loadTags()]);
    renderWords();
  } catch (error) { notify(error.message); }
}
function matchesWord(word) {
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const space = state.spaces.find(item => item.id === word.meaningSpaceId);
  const haystack = [word.term,word.meaning,word.note,word.exampleSentence,word.englishTranslation,word.englishExampleSentence,...word.tags,space?.label || ""].join(" ").toLocaleLowerCase();
  return !query || haystack.includes(query);
}
function wordCard(word) {
  const space = state.spaces.find(item => item.id === word.meaningSpaceId);
  return '<article class="card word-card inventory-card"><div class="card-main"><div class="word-summary"><h3><button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button></h3><span class="inventory-status status-' + word.status + '">' + statusNames[word.status] + '</span></div>' +
    (word.meaning ? '<p class="word-meaning">' + escapeHtml(word.meaning) + "</p>" : "") +
    (word.englishTranslation ? '<p class="word-translation">Englisch: ' + escapeHtml(word.englishTranslation) + "</p>" : "") +
    (word.tags.length ? '<div class="tags">' + word.tags.map(tag => '<span>' + escapeHtml(tag) + '</span>').join("") + '</div>' : '') +
    '<p class="word-memberships">' + (space ? '<button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + "</button>" : "Ohne Bedeutungsraum") + '</p></div><button class="icon-button danger" data-delete-word="' + word.id + '" aria-label="' + escapeHtml(word.term) + ' endgültig löschen">' + icons.trash + "</button></article>";
}
function renderWords() {
  const words = state.words.filter(matchesWord);
  const drafts = words.filter(w => w.status === "draft");
  document.querySelector("#draft-count").textContent = "(" + drafts.length + ")";
  document.querySelector("#draft-list").innerHTML = drafts.map(wordCard).join("") || empty("Keine Entwürfe für diese Auswahl.");
  document.querySelector("#word-list").innerHTML = words.filter(w => w.status !== "draft").map(wordCard).join("") || empty("Keine weiteren Wörter für diese Auswahl.");
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const filtered = Boolean(query);
  const spaces = state.spaces.filter(s => !filtered || s.wordIds.some(id => words.some(w => w.id === id)) || (!s.wordIds.length && query && s.label.toLocaleLowerCase().includes(query)));
  document.querySelector("#space-list").innerHTML = spaces.map(space => {
    const visibleWords = space.wordIds.map(id => words.find(w => w.id === id)).filter(Boolean);
    return '<article class="card meaning-space-card"><div class="card-main"><div class="word-summary"><h3><button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + '</button></h3><div class="space-summary-words">' +
      visibleWords.map(w => '<button class="word-link" data-edit-word="' + w.id + '">' + escapeHtml(w.term) + "</button>").join('<span aria-hidden="true"> · </span>') + '</div></div>' +
      (space.note ? '<p class="word-meaning">' + escapeHtml(space.note) + "</p>" : "") +
      (space.exampleSentences.length ? '<details><summary>Gemeinsame Beispiele</summary><ul>' + space.exampleSentences.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ul></details>" : "") +
      '</div><div class="space-card-actions"><button data-edit-space="' + space.id + '">Bearbeiten</button><button class="icon-button danger" data-delete-space="' + space.id + '" aria-label="Bedeutungsraum löschen">' + icons.trash + "</button></div></article>";
  }).join("") || empty("Keine Bedeutungsräume für diese Auswahl.");
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
function openWordSpacePicker() {
  document.querySelector("#word-space-search").value = "";
  renderSpaceOptions();
  wordSpaceDialog().showModal();
  document.querySelector("#word-space-search").focus();
}
function openWordForm(word) {
  document.querySelector("#word-dialog-title").textContent = word ? "Wort bearbeiten" : "Wort hinzufügen";
  for (const key of ["id","term","status","meaning","exampleSentence","englishTranslation","englishExampleSentence","note"])
    wordForm.elements[key].value = word?.[key] ?? (key === "status" ? "draft" : "");
  selectedSpaceId = word?.meaningSpaceId ?? null;
  updateWordSpaceAction();
  renderTagOptions("#word-tags",word?.tags || []);
  document.querySelector("#word-error").hidden = true;
  if (!wordDialog.open) wordDialog.showModal();
  wordForm.elements.term.focus();
}
function closeWordForm() {
  if (wordSpaceDialog().open) wordSpaceDialog().close();
  wordDialog.close(); wordForm.reset(); selectedSpaceId = null;
}
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
  form.elements.id.value = space?.id || "";
  form.elements.label.value = space?.label || "";
  form.elements.note.value = space?.note || "";
  form.elements.examples.value = (space?.exampleSentences || []).join("\n");
  document.querySelector("#space-error").hidden = true;
  spaceDialog().showModal();
  form.elements.label.focus();
}
function initWordArea() {
  document.querySelector("#word-search").addEventListener("input",renderWords);
  document.querySelector("#word-space-search").addEventListener("input",renderSpaceOptions);
  wordForm.addEventListener("submit",async event => {
    event.preventDefault();
    const button = wordForm.querySelector('button:not([type="button"])');
    button.disabled = true;
    try { await saveWordEditor(); } catch (error) { showEditorError("#word-error",error); } finally { button.disabled = false; }
  });
  spaceForm().addEventListener("submit",async event => {
    event.preventDefault();
    const form = spaceForm();
    const id = Number(form.elements.id.value) || null;
    const button = form.querySelector('button:not([type="button"])');
    button.disabled = true;
    try {
      const data = { label: form.elements.label.value,note: form.elements.note.value,exampleSentences: form.elements.examples.value.split("\n").filter(Boolean) };
      await api(id ? "/api/spaces/" + id : "/api/spaces",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
      spaceDialog().close(); await loadWords(); notify("Bedeutungsraum gespeichert.");
    } catch (error) { showEditorError("#space-error",error); } finally { button.disabled = false; }
  });
  spaceDialog().addEventListener("click",event => { if (event.target === spaceDialog()) spaceDialog().close(); });
  wordSpaceDialog().addEventListener("click",event => { if (event.target === wordSpaceDialog()) wordSpaceDialog().close(); });
  document.addEventListener("click",async event => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.action === "new-space") openSpaceForm();
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
        await api("/api/spaces/" + button.dataset.deleteSpace,{ method: "DELETE" }); await loadWords();
      }
    } catch (error) {
      if (wordDialog.open) showEditorError("#word-error",error);
      else if (spaceDialog().open) showEditorError("#space-error",error);
      else notify(error.message);
    }
  });
}
