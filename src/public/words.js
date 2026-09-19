const statusNames = { draft: "Entwurf", ready: "Bereit", learning: "Im Lernen" };
let selectedSpaceIds = new Set();
let spaceEditorIds = [];
const spaceDialog = () => document.querySelector("#space-dialog");
const spaceForm = () => document.querySelector("#space-form");
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
  const spaces = state.spaces.filter(s => word.spaceIds.includes(s.id)).map(s => s.label);
  const haystack = [word.term,word.meaning,word.note,word.exampleSentence,word.englishTranslation,word.englishExampleSentence,...word.tags,...spaces].join(" ").toLocaleLowerCase();
  return !query || haystack.includes(query);
}
function wordCard(word) {
  const spaces = state.spaces.filter(s => word.spaceIds.includes(s.id));
  return '<article class="card word-card inventory-card"><div class="card-main"><div class="word-summary"><h3><button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button></h3><span class="inventory-status status-' + word.status + '">' + statusNames[word.status] + '</span></div>' +
    (word.meaning ? '<p class="word-meaning">' + escapeHtml(word.meaning) + "</p>" : "") +
    (word.englishTranslation ? '<p class="word-translation">Englisch: ' + escapeHtml(word.englishTranslation) + "</p>" : "") +
    (word.tags.length ? '<div class="tags">' + word.tags.map(tag => '<span>' + escapeHtml(tag) + '</span>').join("") + '</div>' : '') +
    '<p class="word-memberships">' + (spaces.length ? spaces.map(s => '<button class="space-link" data-edit-space="' + s.id + '">' + escapeHtml(s.label) + "</button>").join(" · ") : "Ohne Bedeutungsraum") + '</p></div><button class="icon-button danger" data-delete-word="' + word.id + '" aria-label="' + escapeHtml(word.term) + ' endgültig löschen">' + icons.trash + "</button></article>";
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
      '</div><div class="space-card-actions"><button data-edit-space="' + space.id + '">Bearbeiten / Sortieren</button><button class="icon-button danger" data-delete-space="' + space.id + '" aria-label="Bedeutungsraum löschen">' + icons.trash + "</button></div></article>";
  }).join("") || empty("Keine Bedeutungsräume für diese Auswahl.");
}
function renderSpaceOptions() {
  const query = document.querySelector("#space-search").value.toLocaleLowerCase();
  document.querySelector("#word-space-options").innerHTML = state.spaces.filter(s => s.label.toLocaleLowerCase().includes(query) || selectedSpaceIds.has(s.id)).map(s =>
    '<label class="space-choice"><input type="checkbox" value="' + s.id + '"' + (selectedSpaceIds.has(s.id) ? " checked" : "") + ' /><span>' + escapeHtml(s.label) + "</span></label>").join("") || empty("Noch kein passender Raum.");
}
function openWordForm(word) {
  document.querySelector("#word-dialog-title").textContent = word ? "Wort bearbeiten" : "Wort hinzufügen";
  for (const key of ["id","term","status","meaning","exampleSentence","englishTranslation","englishExampleSentence","note"])
    wordForm.elements[key].value = word?.[key] ?? (key === "status" ? "draft" : "");
  selectedSpaceIds = new Set(word?.spaceIds || []);
  document.querySelector("#space-search").value = "";
  document.querySelector("#inline-space-label").value = "";
  renderSpaceOptions();
  renderTagOptions("#word-tags",word?.tags || []);
  document.querySelector("#word-error").hidden = true;
  if (!wordDialog.open) wordDialog.showModal();
  wordForm.elements.term.focus();
}
function closeWordForm() { wordDialog.close(); wordForm.reset(); }
async function saveWordEditor() {
  if (!wordForm.reportValidity()) return null;
  const data = Object.fromEntries(new FormData(wordForm));
  const id = data.id;
  data.spaceIds = [...selectedSpaceIds];
  data.tags = selectedTags("#word-tags");
  await api(id ? "/api/words/" + id : "/api/words",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
  await loadWords();
  closeWordForm(); notify("Wort gespeichert.");
}
function renderSpaceWordEditor() {
  document.querySelector("#space-word-editor").innerHTML = spaceEditorIds.map((id,index) => {
    const word = state.words.find(w => w.id === id);
    return '<div class="space-order-row"><span>' + escapeHtml(word?.term || "") + '</span><div><button type="button" data-space-move="' + index + '" data-direction="-1"' + (index === 0 ? " disabled" : "") + ' aria-label="Wort nach oben verschieben">↑</button><button type="button" data-space-move="' + index + '" data-direction="1"' + (index === spaceEditorIds.length - 1 ? " disabled" : "") + ' aria-label="Wort nach unten verschieben">↓</button><button type="button" data-space-remove="' + index + '">Zuordnung entfernen</button></div></div>';
  }).join("") || empty("Noch keine Wörter zugeordnet.");
}
function openSpaceForm(space) {
  const form = spaceForm();
  form.elements.id.value = space?.id || "";
  form.elements.label.value = space?.label || "";
  form.elements.note.value = space?.note || "";
  form.elements.examples.value = (space?.exampleSentences || []).join("\n");
  spaceEditorIds = [...(space?.wordIds || [])];
  renderSpaceWordEditor();
  document.querySelector("#space-error").hidden = true;
  spaceDialog().showModal();
  form.elements.label.focus();
}
function initWordArea() {
  document.querySelector("#word-search").addEventListener("input",renderWords);
  document.querySelector("#space-search").addEventListener("input",renderSpaceOptions);
  document.querySelector("#word-space-options").addEventListener("change",event => {
    const input = event.target;
    if (input.matches('input[type="checkbox"]')) {
      if (input.checked) selectedSpaceIds.add(Number(input.value)); else selectedSpaceIds.delete(Number(input.value));
    }
  });
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
      const data = { label: form.elements.label.value,note: form.elements.note.value,exampleSentences: form.elements.examples.value.split("\n").filter(Boolean), ...(id ? { wordIds: spaceEditorIds } : {}) };
      await api(id ? "/api/spaces/" + id : "/api/spaces",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
      spaceDialog().close(); await loadWords(); notify("Bedeutungsraum gespeichert.");
    } catch (error) { showEditorError("#space-error",error); } finally { button.disabled = false; }
  });
  spaceDialog().addEventListener("click",event => { if (event.target === spaceDialog()) spaceDialog().close(); });
  document.addEventListener("click",async event => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.dataset.action === "new-space") openSpaceForm();
      if (button.dataset.action === "close-space") spaceDialog().close();
      if (button.dataset.editSpace) openSpaceForm(state.spaces.find(s => s.id === Number(button.dataset.editSpace)));
      if (button.dataset.deleteSpace && window.confirm("Bedeutungsraum löschen? Seine Wörter bleiben erhalten.")) {
        await api("/api/spaces/" + button.dataset.deleteSpace,{ method: "DELETE" }); await loadWords();
      }
      if (button.dataset.action === "inline-space") {
        const input = document.querySelector("#inline-space-label");
        if (!input.value.trim()) throw new Error("Bitte eine Bezeichnung eingeben.");
        const space = await api("/api/spaces",{ method: "POST",body: JSON.stringify({ label: input.value }) });
        state.spaces.push(space); selectedSpaceIds.add(space.id); input.value = ""; renderSpaceOptions();
      }
      if (button.dataset.spaceMove !== undefined) {
        const from = Number(button.dataset.spaceMove), to = from + Number(button.dataset.direction);
        [spaceEditorIds[from],spaceEditorIds[to]] = [spaceEditorIds[to],spaceEditorIds[from]];
        renderSpaceWordEditor();
        document.querySelector('[data-space-move="' + to + '"][data-direction="' + button.dataset.direction + '"]')?.focus();
      }
      if (button.dataset.spaceRemove !== undefined) { spaceEditorIds.splice(Number(button.dataset.spaceRemove),1); renderSpaceWordEditor(); }
    } catch (error) {
      if (wordDialog.open) showEditorError("#word-error",error);
      else if (spaceDialog().open) showEditorError("#space-error",error);
      else notify(error.message);
    }
  });
}
