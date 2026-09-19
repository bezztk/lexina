const state = { words: [], quotes: [], journal: [], tags: [] };
const icons = {
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-12 3 3"/></svg>',
};

const message = document.querySelector("#message");
const wordForm = document.querySelector("#word-form");
const wordDialog = document.querySelector("#word-dialog");
const quoteForm = document.querySelector("#quote-form");
const quoteDialog = document.querySelector("#quote-dialog");
const journalForm = document.querySelector("#journal-form");
const journalDialog = document.querySelector("#journal-dialog");
const journalDate = document.querySelector("#journal-date");
const tagForm = document.querySelector("#tag-form");
const tagDialog = document.querySelector("#tag-dialog");

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
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Die Anfrage ist fehlgeschlagen.");
  }
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
  if (name === "settings") loadTags();
}

function empty(text) {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

async function loadQuotes() {
  try {
    [state.quotes] = await Promise.all([api("/api/quotes"), loadTags()]);
    document.querySelector("#quote-list").innerHTML = state.quotes.length ? state.quotes.map((entry) => `
      <article class="card text-card hover-card quote-card" tabindex="0">
        <div class="card-main"><div class="quote-card-header"><p class="type">${entry.type === "quote" ? "Zitat" : "Gedicht"}</p><div class="quote-card-meta">
          ${entry.tags.length ? `<div class="tags">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          <div class="card-hover-actions"><button class="icon-button" data-edit-quote="${entry.id}" aria-label="Eintrag bearbeiten">${icons.pencil}</button><button class="icon-button danger" data-delete-quote="${entry.id}" aria-label="Eintrag löschen">${icons.trash}</button></div>
        </div></div><blockquote>${escapeHtml(entry.content)}</blockquote>
          ${entry.note ? `<p class="note">${escapeHtml(entry.note)}</p>` : ""}
        </div>
      </article>`).join("") : empty("Noch keine Zitate oder Gedichte gespeichert.");
  } catch { notify("Einträge konnten nicht geladen werden."); }
}

async function loadTags() {
  state.tags = await api("/api/tags");
  const tagList = document.querySelector("#tag-list");
  tagList.innerHTML = state.tags.length ? state.tags.map((tag) => `
    <div class="managed-tag"><span>${escapeHtml(tag.name)}</span><button class="icon-button danger" data-delete-tag="${tag.id}" aria-label="${escapeHtml(tag.name)} löschen">${icons.trash}</button></div>
  `).join("") : empty("Noch keine Tags angelegt.");
}

function renderTagOptions(selector,selected = []) {
  document.querySelector(selector).innerHTML = state.tags.length ? state.tags.map((tag) => `
    <label class="tag-choice"><input type="checkbox" value="${escapeHtml(tag.name)}" ${selected.includes(tag.name) ? "checked" : ""} /><span>${escapeHtml(tag.name)}</span></label>
  `).join("") : '<p class="empty compact-empty">Lege zuerst Tags in der Verwaltung an.</p>';
}

function selectedTags(selector) {
  return [...document.querySelectorAll(`${selector} input:checked`)].map((input) => input.value);
}

function openQuoteForm(entry) {
  document.querySelector("#quote-dialog-title").textContent = entry ? "Eintrag bearbeiten" : "Eintrag hinzufügen";
  quoteForm.elements.id.value = entry?.id ?? "";
  quoteForm.elements.type.value = entry?.type ?? "quote";
  quoteForm.elements.content.value = entry?.content ?? "";
  quoteForm.elements.note.value = entry?.note ?? "";
  renderTagOptions("#quote-tags",entry?.tags || []);
  quoteDialog.showModal();
  quoteForm.elements.content.focus();
}

function closeQuoteForm() { quoteDialog.close(); quoteForm.reset(); }

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(quoteForm));
  const id = data.id;
  data.tags = selectedTags("#quote-tags");
  try {
    await api(id ? `/api/quotes/${id}` : "/api/quotes", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    closeQuoteForm(); await loadQuotes(); notify("Eintrag gespeichert.");
  } catch { notify("Eintrag konnte nicht gespeichert werden."); }
});

async function loadJournal() {
  try {
    [state.journal] = await Promise.all([api(`/api/journal?date=${journalDate.value}`),loadTags()]);
    document.querySelector("#journal-list").innerHTML = state.journal.length ? state.journal.map((entry) => `
      <article class="card journal-card hover-card" tabindex="0">
        <time datetime="${entry.entryAt}">${escapeHtml(entry.entryAt.slice(11, 16))}</time>
        <div class="card-main"><p>${escapeHtml(entry.content)}</p>${entry.tags.length ? `<div class="tags">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}</div>
        <div class="card-hover-actions"><button class="icon-button" data-edit-journal="${entry.id}" aria-label="Journaleintrag bearbeiten">${icons.pencil}</button><button class="icon-button danger" data-delete-journal="${entry.id}" aria-label="Journaleintrag löschen">${icons.trash}</button></div>
      </article>`).join("") : empty("Für diesen Tag gibt es noch keinen Eintrag.");
  } catch { notify("Journal konnte nicht geladen werden."); }
}

function resetJournalForm() {
  journalForm.reset();
  journalForm.elements.id.value = "";
  journalForm.elements.entryAt.value = `${journalDate.value}T${localDateTime().slice(11)}`;
}

function openJournalForm(entry) {
  resetJournalForm();
  document.querySelector("#journal-dialog-title").textContent = entry ? "Journaleintrag bearbeiten" : "Journaleintrag hinzufügen";
  if (entry) {
    journalForm.elements.id.value = entry.id;
    journalForm.elements.entryAt.value = entry.entryAt.slice(0, 16);
    journalForm.elements.content.value = entry.content;
  }
  renderTagOptions("#journal-tags",entry?.tags || []);
  journalDialog.showModal();
  journalForm.elements.content.focus();
}

function closeJournalForm() { journalDialog.close(); resetJournalForm(); }

journalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(journalForm));
  const id = data.id;
  data.tags = selectedTags("#journal-tags");
  try {
    await api(id ? `/api/journal/${id}` : "/api/journal", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
    journalDate.value = String(data.entryAt).slice(0, 10); closeJournalForm(); await loadJournal(); notify("Journaleintrag gespeichert.");
  } catch { notify("Journaleintrag konnte nicht gespeichert werden."); }
});

tagForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(tagForm));
  try {
    await api("/api/tags", { method: "POST", body: JSON.stringify(data) });
    tagDialog.close(); tagForm.reset(); await loadTags(); notify("Tag gespeichert.");
  } catch { notify("Tag konnte nicht gespeichert werden."); }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.action === "new-word") openWordForm();
  if (button.dataset.action === "close-word") closeWordForm();
  if (button.dataset.action === "new-quote") openQuoteForm();
  if (button.dataset.action === "close-quote") closeQuoteForm();
  if (button.dataset.action === "new-journal") openJournalForm();
  if (button.dataset.action === "close-journal") closeJournalForm();
  if (button.dataset.action === "new-tag") { tagDialog.showModal(); tagForm.elements.name.focus(); }
  if (button.dataset.action === "close-tag") { tagDialog.close(); tagForm.reset(); }
  if (button.dataset.action === "seed-data") {
    button.disabled = true;
    try {
      const result = await api("/api/seed",{ method: "POST",body: JSON.stringify({ date: localDateTime().slice(0,10) }) });
      await loadTags();
      const created = result.tags + result.spaces + result.words + result.quotes + result.journalEntries;
      notify(created ? "Beispieldaten wurden angelegt." : "Die Beispieldaten sind bereits vorhanden.");
    } catch { notify("Beispieldaten konnten nicht angelegt werden."); }
    finally { button.disabled = false; }
  }
  const word = state.words.find((item) => item.id === Number(button.dataset.editWord));
  if (word) openWordForm(word);
  const quote = state.quotes.find((item) => item.id === Number(button.dataset.editQuote));
  if (quote) openQuoteForm(quote);
  const journal = state.journal.find((item) => item.id === Number(button.dataset.editJournal));
  if (journal) openJournalForm(journal);

  for (const [key, endpoint, reload] of [
    ["deleteWord", "words", loadWords], ["deleteQuote", "quotes", loadQuotes], ["deleteJournal", "journal", loadJournal], ["deleteTag", "tags", loadTags],
  ]) {
    const id = button.dataset[key];
    if (id && window.confirm(key === "deleteWord" ? "Dieses Wort endgültig löschen?" : "Eintrag wirklich löschen?")) {
      try {
        await api(`/api/${endpoint}/${id}`, { method: "DELETE" });
        if (key === "deleteWord" && wordDialog.open) closeWordForm();
        await reload(); notify("Eintrag gelöscht.");
      }
      catch { notify("Eintrag konnte nicht gelöscht werden."); }
    }
  }
});

wordDialog.addEventListener("click", (event) => {
  if (event.target === wordDialog) closeWordForm();
});
quoteDialog.addEventListener("click", (event) => { if (event.target === quoteDialog) closeQuoteForm(); });
journalDialog.addEventListener("click", (event) => { if (event.target === journalDialog) closeJournalForm(); });
tagDialog.addEventListener("click", (event) => { if (event.target === tagDialog) { tagDialog.close(); tagForm.reset(); } });

document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.view; }));
window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "words"));
journalDate.value = localDateTime().slice(0, 10);
journalDate.addEventListener("change", () => { resetJournalForm(); loadJournal(); });
resetJournalForm();
initWordArea();
showView(location.hash.slice(1) || "words");
