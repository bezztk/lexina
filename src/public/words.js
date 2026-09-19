const statusNames = { draft: "Entwurf", learning: "Lernen", ready: "Abgeschlossen" };
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
  const haystack = [word.term,word.meaning,word.exampleSentence,word.englishTranslation,word.englishExampleSentence,...word.tags,space?.label || "",space?.explanation || ""].join(" ").toLocaleLowerCase();
  return !query || haystack.includes(query);
}
function statusBadge(word) {
  return word.status === "ready" ? "" : '<span class="inventory-status status-' + word.status + '">' + statusNames[word.status] + '</span>';
}
function wordCard(word,grouped = false) {
  const englishContent = [word.englishTranslation,word.englishExampleSentence].filter(Boolean).map(escapeHtml).join(' <span class="word-separator">·</span> ');
  return '<article class="' + (grouped ? 'grouped-word-row' : 'card word-card inventory-card') + '"><div class="card-main"><div class="word-summary"><div class="word-title-line"><h3><button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button></h3>' +
    (word.meaning ? '<span class="word-separator">—</span><span class="inline-word-meaning">' + escapeHtml(word.meaning) + '</span>' : '') + '</div>' + statusBadge(word) + '</div>' +
    '<p class="word-detail-line"><span class="detail-label">Beispiel:</span><span>' + escapeHtml(word.exampleSentence) + '</span></p>' +
    '<p class="word-detail-line"><span class="detail-label">Englisch:</span><span>' + englishContent + '</span></p>' +
    (word.tags.length ? '<div class="tags word-card-tags">' + word.tags.map(tag => '<span>' + escapeHtml(tag) + '</span>').join("") + '</div>' : '') +
    "</div></article>";
}
function renderWords() {
  const words = state.words.filter(matchesWord);
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const wordGroups = state.spaces.map(space => ({ space,words: words.filter(word => word.meaningSpaceId === space.id) })).filter(group => group.words.length);
  const unassigned = words.filter(word => word.meaningSpaceId === null);
  document.querySelector("#word-list").innerHTML = wordGroups.map(({ space,words: groupWords }) =>
    '<article class="meaning-word-group"><header class="meaning-group-header"><button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + '</button><p>' + escapeHtml(space.explanation) + '</p></header><div class="meaning-group-words">' + groupWords.map(word => wordCard(word,true)).join("") + "</div></article>"
  ).join("") + unassigned.map(word => wordCard(word)).join("") || empty("Keine Wörter für diese Suche.");
  const spaces = state.spaces.filter(space => !query || [space.label,space.explanation].join(" ").toLocaleLowerCase().includes(query) || space.wordIds.some(id => words.some(word => word.id === id)));
  document.querySelector("#space-list").innerHTML = spaces.map(space => {
    const assignedWords = space.wordIds.map(id => words.find(word => word.id === id)).filter(Boolean);
    return '<article class="card meaning-space-card"><div class="card-main"><div class="meaning-card-summary"><div class="meaning-card-links"><h3><button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + '</button></h3><div class="meaning-assigned-words">' + assignedWords.map(word => '<button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button>').join('<span aria-hidden="true">·</span>') + '</div></div><p title="' + escapeHtml(space.explanation) + '">' + escapeHtml(space.explanation) + '</p></div></div></article>';
  }).join("") || empty("Keine Bedeutungen für diese Suche.");
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
  for (const key of ["id","term","status","meaning","exampleSentence","englishTranslation","englishExampleSentence"])
    wordForm.elements[key].value = word?.[key] ?? (key === "status" ? "draft" : "");
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
  form.elements.explanation.value = space?.explanation || "";
  const deleteButton = document.querySelector("#space-dialog [data-delete-space]");
  deleteButton.hidden = !space;
  deleteButton.dataset.deleteSpace = space?.id || "";
  document.querySelector("#space-error").hidden = true;
  spaceDialog().showModal();
  form.elements.label.focus();
}
function initWordArea() {
  document.querySelector("#word-search").addEventListener("input",renderWords);
  document.querySelectorAll("[data-word-section]").forEach(button => button.addEventListener("click",() => {
    const section = button.dataset.wordSection;
    document.querySelectorAll("[data-word-section]").forEach(item => {
      item.classList.toggle("active",item === button); item.setAttribute("aria-selected",String(item === button));
    });
    document.querySelector("#word-overview").hidden = section !== "inventory";
    document.querySelector("#meaning-overview").hidden = section !== "meanings";
  }));
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
      const data = { label: form.elements.label.value,explanation: form.elements.explanation.value };
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
