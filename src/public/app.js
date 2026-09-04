const state = { words: [], quotes: [], journal: [] };
const partOfSpeechLabels = { noun: "Nomen", verb: "Verb", adjective: "Adjektiv" };
const icons = {
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-12 3 3"/></svg>',
};

const message = document.querySelector("#message");
const wordForm = document.querySelector("#word-form");
const wordDialog = document.querySelector("#word-dialog");
const quoteForm = document.querySelector("#quote-form");
const journalForm = document.querySelector("#journal-form");
const journalDate = document.querySelector("#journal-date");

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function api(url, options) {
  const response = await fetch(url, options && {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error();
  return response.status === 204 ? null : response.json();
}

function notify(text) {
  message.textContent = text;
  message.hidden = false;
  window.setTimeout(() => { message.hidden = true; }, 2200);
}

function showView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "words") loadWords();
  if (name === "quotes") loadQuotes();
  if (name === "journal") loadJournal();
}

function empty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

async function loadWords() {
  try {
    state.words = await api("/api/words");
    document.querySelector("#word-list").innerHTML = state.words.length ? state.words.map((word) => `
      <article class="card word-card ${word.status === "familiar" ? "muted" : ""}">
        <div class="card-main">
          <p class="type">${partOfSpeechLabels[word.partOfSpeech]}</p><h2>${escapeHtml(word.term)}</h2>
          ${word.similarWords.length ? `<p><strong>Ähnlich:</strong> ${word.similarWords.map(escapeHtml).join(", ")}</p>` : ""}
          ${word.exampleSentences.length ? `<ul class="examples">${word.exampleSentences.map((sentence) => `<li>${escapeHtml(sentence)}</li>`).join("")}</ul>` : ""}
        </div>
        <div class="word-actions">
          <button class="icon-button danger" data-delete-word="${word.id}" aria-label="${escapeHtml(word.term)} entfernen">${icons.trash}</button>
          <button class="icon-button" data-edit-word="${word.id}" aria-label="${escapeHtml(word.term)} bearbeiten">${icons.pencil}</button>
        </div>
      </article>`).join("") : empty("Noch keine Wörter gespeichert.");
  } catch { notify("Wörter konnten nicht geladen werden."); }
}

function setPartOfSpeech(value) {
  wordForm.elements.partOfSpeech.value = value;
  wordForm.querySelectorAll("[data-part-of-speech]").forEach((button) => {
    const selected = button.dataset.partOfSpeech === value;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function addRepeaterRow(containerId, value = "") {
  const container = document.querySelector(`#${containerId}`);
  const row = document.createElement("div");
  row.className = "repeat-row";
  const field = document.createElement(containerId === "example-sentences" ? "textarea" : "input");
  field.value = value;
  field.placeholder = containerId === "example-sentences" ? "Beispielsatz eingeben" : "Ähnliches Wort eingeben";
  field.setAttribute("aria-label", field.placeholder);
  if (field instanceof HTMLTextAreaElement) field.rows = 2;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-row";
  remove.dataset.removeRow = containerId;
  remove.setAttribute("aria-label", "Feld entfernen");
  remove.innerHTML = icons.trash;
  row.append(field, remove);
  container.append(row);
  updateRepeaterButtons(container);
}

function updateRepeaterButtons(container) {
  container.querySelectorAll(".remove-row").forEach((button, index) => {
    button.hidden = index === 0;
  });
}

function fillRepeater(containerId, values) {
  document.querySelector(`#${containerId}`).replaceChildren();
  (values.length ? values : [""]).forEach((value) => addRepeaterRow(containerId, value));
}

function openWordForm(word) {
  document.querySelector("#word-dialog-title").textContent = word ? "Wort bearbeiten" : "Wort hinzufügen";
  wordForm.elements.id.value = word?.id ?? "";
  wordForm.elements.term.value = word?.term ?? "";
  wordForm.elements.status.value = word?.status ?? "unknown";
  setPartOfSpeech(word?.partOfSpeech ?? "noun");
  fillRepeater("similar-words", word?.similarWords ?? []);
  fillRepeater("example-sentences", word?.exampleSentences ?? []);
  wordDialog.showModal();
  wordForm.elements.term.focus();
}

function closeWordForm() {
  wordDialog.close();
  wordForm.reset();
}

wordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(wordForm));
  const id = data.id;
  data.similarWords = [...document.querySelectorAll("#similar-words input")].map((field) => field.value);
  data.exampleSentences = [...document.querySelectorAll("#example-sentences textarea")].map((field) => field.value);
  try {
    await api(id ? `/api/words/${id}` : "/api/words", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    closeWordForm(); await loadWords(); notify("Wort gespeichert.");
  } catch { notify("Wort konnte nicht gespeichert werden."); }
});

async function loadQuotes() {
  try {
    [state.quotes] = await Promise.all([api("/api/quotes"), loadTags()]);
    document.querySelector("#quote-list").innerHTML = state.quotes.length ? state.quotes.map((entry) => `
      <article class="card text-card">
        <div class="card-main"><p class="type">${entry.type === "quote" ? "Zitat" : "Gedicht"}</p><blockquote>${escapeHtml(entry.content)}</blockquote>
          ${entry.tags.length ? `<div class="tags">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          ${entry.note ? `<p class="note">${escapeHtml(entry.note)}</p>` : ""}
        </div>
        <div class="card-actions"><button data-edit-quote="${entry.id}">Bearbeiten</button><button class="danger" data-delete-quote="${entry.id}">Löschen</button></div>
      </article>`).join("") : empty("Noch keine Zitate oder Gedichte gespeichert.");
  } catch { notify("Einträge konnten nicht geladen werden."); }
}

async function loadTags() {
  const tags = await api("/api/tags");
  document.querySelector("#known-tags").innerHTML = tags.map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("");
}

function openQuoteForm(entry) {
  quoteForm.hidden = false;
  quoteForm.elements.id.value = entry?.id ?? "";
  quoteForm.elements.type.value = entry?.type ?? "quote";
  quoteForm.elements.content.value = entry?.content ?? "";
  quoteForm.elements.tags.value = entry?.tags.join(", ") ?? "";
  quoteForm.elements.note.value = entry?.note ?? "";
  quoteForm.elements.content.focus();
}

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(quoteForm));
  const id = data.id;
  data.tags = String(data.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
  try {
    await api(id ? `/api/quotes/${id}` : "/api/quotes", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    quoteForm.hidden = true; quoteForm.reset(); await loadQuotes(); notify("Eintrag gespeichert.");
  } catch { notify("Eintrag konnte nicht gespeichert werden."); }
});

async function loadJournal() {
  try {
    state.journal = await api(`/api/journal?date=${journalDate.value}`);
    document.querySelector("#journal-list").innerHTML = state.journal.length ? state.journal.map((entry) => `
      <article class="card journal-card">
        <time datetime="${entry.entryAt}">${escapeHtml(entry.entryAt.slice(11, 16))}</time>
        <div class="card-main"><p>${escapeHtml(entry.content)}</p></div>
        <div class="card-actions"><button data-edit-journal="${entry.id}">Bearbeiten</button><button class="danger" data-delete-journal="${entry.id}">Löschen</button></div>
      </article>`).join("") : empty("Für diesen Tag gibt es noch keinen Eintrag.");
  } catch { notify("Journal konnte nicht geladen werden."); }
}

function resetJournalForm() {
  journalForm.reset();
  journalForm.elements.id.value = "";
  journalForm.elements.entryAt.value = `${journalDate.value}T${localDateTime().slice(11)}`;
  journalForm.querySelector('[data-action="cancel-journal"]').hidden = true;
}

journalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(journalForm));
  const id = data.id;
  try {
    await api(id ? `/api/journal/${id}` : "/api/journal", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    journalDate.value = String(data.entryAt).slice(0, 10); resetJournalForm(); await loadJournal(); notify("Journaleintrag gespeichert.");
  } catch { notify("Journaleintrag konnte nicht gespeichert werden."); }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.action === "new-word") openWordForm();
  if (button.dataset.action === "close-word") closeWordForm();
  if (button.dataset.action === "new-quote") openQuoteForm();
  if (button.dataset.action === "cancel-quote") { quoteForm.hidden = true; quoteForm.reset(); }
  if (button.dataset.action === "cancel-journal") resetJournalForm();
  if (button.dataset.partOfSpeech) setPartOfSpeech(button.dataset.partOfSpeech);
  if (button.dataset.addRow) addRepeaterRow(button.dataset.addRow);
  if (button.dataset.removeRow) {
    const containerId = button.dataset.removeRow;
    const container = document.querySelector(`#${containerId}`);
    button.closest(".repeat-row").remove();
    updateRepeaterButtons(container);
  }

  const word = state.words.find((item) => item.id === Number(button.dataset.editWord));
  if (word) openWordForm(word);
  const quote = state.quotes.find((item) => item.id === Number(button.dataset.editQuote));
  if (quote) openQuoteForm(quote);
  const journal = state.journal.find((item) => item.id === Number(button.dataset.editJournal));
  if (journal) {
    journalForm.elements.id.value = journal.id;
    journalForm.elements.entryAt.value = journal.entryAt.slice(0, 16);
    journalForm.elements.content.value = journal.content;
    journalForm.querySelector('[data-action="cancel-journal"]').hidden = false;
    journalForm.elements.content.focus();
  }

  for (const [key, endpoint, reload] of [
    ["deleteWord", "words", loadWords], ["deleteQuote", "quotes", loadQuotes], ["deleteJournal", "journal", loadJournal],
  ]) {
    const id = button.dataset[key];
    if (id && window.confirm("Eintrag wirklich löschen?")) {
      try { await api(`/api/${endpoint}/${id}`, { method: "DELETE" }); await reload(); notify("Eintrag gelöscht."); }
      catch { notify("Eintrag konnte nicht gelöscht werden."); }
    }
  }
});

wordDialog.addEventListener("click", (event) => {
  if (event.target === wordDialog) closeWordForm();
});

document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.view; }));
window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "words"));
journalDate.value = localDateTime().slice(0, 10);
journalDate.addEventListener("change", () => { resetJournalForm(); loadJournal(); });
resetJournalForm();
showView(location.hash.slice(1) || "words");
