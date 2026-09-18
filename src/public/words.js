const languageNames = { de: "Deutsch", en: "Englisch", tr: "Türkisch" };
const statusNames = { draft: "Entwurf", ready: "Bereit", learning: "Im Lernen" };
let selectedSpaceIds = new Set();
let spaceEditorIds = [];
const spaceDialog = () => document.querySelector("#space-dialog");
const spaceForm = () => document.querySelector("#space-form");
const languageOptions = (selected) => Object.entries(languageNames).map(([value,label]) => '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + label + "</option>").join("");
function showEditorError(selector,error) {
  const element = document.querySelector(selector);
  element.textContent = error.message || "Die Änderung konnte nicht gespeichert werden.";
  element.hidden = false;
}
function showLegacy(selector,data) {
  const element = document.querySelector(selector);
  element.hidden = !data;
  element.querySelector("pre").textContent = data ? JSON.stringify(data,null,2) : "";
}
async function loadWords() {
  try {
    [state.words,state.spaces] = await Promise.all([api("/api/words"),api("/api/spaces")]);
    renderWords();
  } catch (error) { notify(error.message); }
}
function matchesWord(word) {
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const status = document.querySelector("#word-status-filter").value;
  const language = document.querySelector("#word-language-filter").value;
  const unassigned = document.querySelector("#word-assignment-filter").value === "none";
  const spaces = state.spaces.filter(s => word.spaceIds.includes(s.id)).map(s => s.label);
  const haystack = [word.term,word.meaning,word.note,...word.exampleSentences,...spaces,...word.translations.flatMap(t => [t.text,t.note])].join(" ").toLocaleLowerCase();
  return (!query || haystack.includes(query)) && (!status || word.status === status) && (!language || word.language === language) && (!unassigned || !word.spaceIds.length);
}
function wordCard(word) {
  const spaces = state.spaces.filter(s => word.spaceIds.includes(s.id));
  return '<article class="card word-card inventory-card"><div class="card-main"><div class="word-summary"><h3><button class="word-link" data-edit-word="' + word.id + '">' + escapeHtml(word.term) + '</button></h3><span class="language-label">' + languageNames[word.language] + '</span><span class="inventory-status status-' + word.status + '">' + statusNames[word.status] + '</span></div>' +
    (word.meaning ? '<p class="word-meaning">' + escapeHtml(word.meaning) + "</p>" : "") +
    '<p class="word-memberships">' + (spaces.length ? spaces.map(s => '<button class="space-link" data-edit-space="' + s.id + '">' + escapeHtml(s.label) + "</button>").join(" · ") : "Ohne Bedeutungsraum") + '</p></div><button class="icon-button danger" data-delete-word="' + word.id + '" aria-label="' + escapeHtml(word.term) + ' endgültig löschen">' + icons.trash + "</button></article>";
}
function renderWords() {
  const words = state.words.filter(matchesWord);
  const drafts = words.filter(w => w.status === "draft");
  document.querySelector("#draft-count").textContent = "(" + drafts.length + ")";
  document.querySelector("#draft-list").innerHTML = drafts.map(wordCard).join("") || empty("Keine Entwürfe für diese Auswahl.");
  document.querySelector("#word-list").innerHTML = words.filter(w => w.status !== "draft").map(wordCard).join("") || empty("Keine weiteren Wörter für diese Auswahl.");
  const query = document.querySelector("#word-search").value.trim().toLocaleLowerCase();
  const filtered = Boolean(query || document.querySelector("#word-status-filter").value || document.querySelector("#word-language-filter").value || document.querySelector("#word-assignment-filter").value);
  const spaces = state.spaces.filter(s => !filtered || s.wordIds.some(id => words.some(w => w.id === id)) || (!s.wordIds.length && query && s.label.toLocaleLowerCase().includes(query)));
  document.querySelector("#space-list").innerHTML = spaces.map(space => {
    const visibleWords = space.wordIds.map(id => words.find(w => w.id === id)).filter(Boolean);
    return '<article class="card meaning-space-card"><div class="card-main"><div class="word-summary"><h3><button class="space-link" data-edit-space="' + space.id + '">' + escapeHtml(space.label) + '</button></h3><div class="space-summary-words">' +
      visibleWords.map(w => '<button class="word-link" data-edit-word="' + w.id + '">' + escapeHtml(w.term) + ' <small>' + languageNames[w.language] + "</small></button>").join('<span aria-hidden="true"> · </span>') + '</div></div>' +
      (space.note ? '<p class="word-meaning">' + escapeHtml(space.note) + "</p>" : "") +
      (space.exampleSentences.length ? '<details><summary>Gemeinsame Beispiele</summary><ul>' + space.exampleSentences.map(s => "<li>" + escapeHtml(s) + "</li>").join("") + "</ul></details>" : "") +
      '</div><div class="space-card-actions"><button data-edit-space="' + space.id + '">Bearbeiten / Sortieren</button><button class="icon-button danger" data-delete-space="' + space.id + '" aria-label="Bedeutungsraum löschen">' + icons.trash + "</button></div></article>";
  }).join("") || empty("Keine Bedeutungsräume für diese Auswahl.");
}
function addRepeaterRow(containerId,value = "") {
  const row = document.createElement("div");
  row.className = "repeat-row";
  row.innerHTML = '<textarea rows="2" placeholder="Beispielsatz eingeben" aria-label="Beispielsatz"></textarea><button type="button" class="remove-row" data-remove-row="' + containerId + '" aria-label="Feld entfernen">' + icons.trash + "</button>";
  row.querySelector("textarea").value = value;
  document.querySelector("#" + containerId).append(row);
  updateRepeaterButtons(document.querySelector("#" + containerId));
}
function updateRepeaterButtons(container) {
  container.querySelectorAll(".remove-row").forEach((button,index) => { button.hidden = index === 0; });
}
function fillRepeater(containerId,values) {
  document.querySelector("#" + containerId).replaceChildren();
  (values.length ? values : [""]).forEach(value => addRepeaterRow(containerId,value));
}
function renderSpaceOptions() {
  const query = document.querySelector("#space-search").value.toLocaleLowerCase();
  document.querySelector("#word-space-options").innerHTML = state.spaces.filter(s => s.label.toLocaleLowerCase().includes(query) || selectedSpaceIds.has(s.id)).map(s =>
    '<label class="space-choice"><input type="checkbox" value="' + s.id + '"' + (selectedSpaceIds.has(s.id) ? " checked" : "") + ' /><span>' + escapeHtml(s.label) + "</span></label>").join("") || empty("Noch kein passender Raum.");
}
function addTranslationRow(translation = { language: "en",text: "",note: "",linkedWordId: null }) {
  const row = document.createElement("div");
  row.className = "translation-row";
  row.innerHTML = '<div class="field-pair"><label>Zielsprache<select class="translation-language">' + languageOptions(translation.language) + '</select></label><label>Übersetzung<input class="translation-text" required /></label></div><label>Kontext / Bedeutungsnuance<input class="translation-note" /></label><label>Passende eigene Worteinheit<select class="translation-target"></select></label><div class="translation-actions"><button type="button" data-adopt-translation>Als eigenes Wort übernehmen / verknüpfen</button><button type="button" data-remove-translation>Übersetzung entfernen</button></div>';
  row.querySelector(".translation-text").value = translation.text;
  row.querySelector(".translation-note").value = translation.note;
  document.querySelector("#translation-list").append(row);
  refreshTranslationTargets(row,translation.linkedWordId);
  row.querySelector(".translation-language").addEventListener("change",() => refreshTranslationTargets(row,null));
}
function refreshTranslationTargets(row,linkedId) {
  const language = row.querySelector(".translation-language").value;
  const candidates = state.words.filter(w => w.language === language && w.id !== Number(wordForm.elements.id.value));
  row.querySelector(".translation-target").innerHTML = '<option value="">Nicht verknüpft (bei Übernahme neuer Entwurf)</option>' +
    candidates.map(w => '<option value="' + w.id + '"' + (w.id === linkedId ? " selected" : "") + ">" + escapeHtml(w.term + (w.meaning ? " — " + w.meaning : "") + " · #" + w.id + " · " + statusNames[w.status]) + "</option>").join("");
}
function openWordForm(word) {
  document.querySelector("#word-dialog-title").textContent = "Wort bearbeiten";
  for (const key of ["id","term","language","status","meaning","note"]) wordForm.elements[key].value = word?.[key] ?? ({ language: "de",status: "draft" }[key] || "");
  fillRepeater("example-sentences",word?.exampleSentences || []);
  selectedSpaceIds = new Set(word?.spaceIds || []);
  document.querySelector("#space-search").value = "";
  document.querySelector("#inline-space-label").value = "";
  renderSpaceOptions();
  document.querySelector("#translation-list").replaceChildren();
  (word?.translations || []).forEach(addTranslationRow);
  showLegacy("#word-legacy",word?.legacyData);
  document.querySelector("#word-error").hidden = true;
  if (!wordDialog.open) wordDialog.showModal();
  wordForm.elements.term.focus();
}
function closeWordForm() { wordDialog.close(); wordForm.reset(); }
async function saveWordEditor(close = true) {
  if (!wordForm.reportValidity()) return null;
  const data = Object.fromEntries(new FormData(wordForm));
  const id = data.id;
  data.spaceIds = [...selectedSpaceIds];
  data.exampleSentences = [...document.querySelectorAll("#example-sentences textarea")].map(f => f.value);
  data.translations = [...document.querySelectorAll(".translation-row")].map(row => ({
    language: row.querySelector(".translation-language").value,text: row.querySelector(".translation-text").value,
    note: row.querySelector(".translation-note").value,linkedWordId: Number(row.querySelector(".translation-target").value) || null,
  }));
  const saved = await api(id ? "/api/words/" + id : "/api/words",{ method: id ? "PUT" : "POST",body: JSON.stringify(data) });
  await loadWords();
  if (close) { closeWordForm(); notify("Wort gespeichert."); }
  else wordForm.elements.id.value = saved.id;
  return saved;
}
function renderSpaceWordEditor() {
  document.querySelector("#space-word-editor").innerHTML = spaceEditorIds.map((id,index) => {
    const word = state.words.find(w => w.id === id);
    return '<div class="space-order-row"><span>' + escapeHtml(word?.term || "") + ' <small>' + (languageNames[word?.language] || "") + '</small></span><div><button type="button" data-space-move="' + index + '" data-direction="-1"' + (index === 0 ? " disabled" : "") + ' aria-label="Wort nach oben verschieben">↑</button><button type="button" data-space-move="' + index + '" data-direction="1"' + (index === spaceEditorIds.length - 1 ? " disabled" : "") + ' aria-label="Wort nach unten verschieben">↓</button><button type="button" data-space-remove="' + index + '">Zuordnung entfernen</button></div></div>';
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
  showLegacy("#space-legacy",space?.legacyData);
  document.querySelector("#space-error").hidden = true;
  spaceDialog().showModal();
  form.elements.label.focus();
}
function initWordArea() {
  ["#word-search","#word-status-filter","#word-language-filter","#word-assignment-filter"].forEach(selector => document.querySelector(selector).addEventListener("input",renderWords));
  document.querySelector("#space-search").addEventListener("input",renderSpaceOptions);
  document.querySelector("#word-space-options").addEventListener("change",event => {
    const input = event.target;
    if (input.matches('input[type="checkbox"]')) {
      if (input.checked) selectedSpaceIds.add(Number(input.value)); else selectedSpaceIds.delete(Number(input.value));
    }
  });
  document.querySelector("#quick-word-form").addEventListener("submit",async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await api("/api/words",{ method: "POST",body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      form.elements.term.value = "";
      // Newly captured drafts must remain visible even after a filtered search.
      ["#word-search","#word-status-filter","#word-language-filter","#word-assignment-filter"].forEach(selector => { document.querySelector(selector).value = ""; });
      await loadWords();
      form.elements.term.focus();
    } catch (error) { notify(error.message); } finally { button.disabled = false; }
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
      if (button.dataset.action === "add-translation") addTranslationRow();
      if (button.hasAttribute("data-remove-translation")) button.closest(".translation-row").remove();
      if (button.hasAttribute("data-adopt-translation")) {
        button.disabled = true;
        try {
          const row = button.closest(".translation-row");
          const index = [...document.querySelectorAll(".translation-row")].indexOf(row);
          const targetId = Number(row.querySelector(".translation-target").value) || null;
          const saved = await saveWordEditor(false);
          if (!saved) return;
          const target = await api("/api/words/" + saved.id + "/translations/" + saved.translationIds[index] + "/adopt",{ method: "POST",body: JSON.stringify({ targetId }) });
          await loadWords();
          openWordForm(state.words.find(w => w.id === saved.id));
          notify("Übersetzung mit „" + target.term + "“ verknüpft. Status: " + statusNames[target.status] + ".");
        } finally { button.disabled = false; }
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
