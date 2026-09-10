import "./style.css";

const storageKey = "lexicon-words";
const starterWords = [
  {
    id: 1,
    word: "Mellifluous",
    synonyms: "Euphonious, dulcet",
    definition: "Pleasantly smooth and musical to hear.",
  },
  {
    id: 2,
    word: "Ephemeral",
    synonyms: "Fleeting, transient",
    definition: "Lasting for a very short time.",
  },
  {
    id: 3,
    word: "Serendipity",
    synonyms: "Chance, fortune",
    definition: "A fortunate discovery made by chance.",
  },
];

let words = JSON.parse(localStorage.getItem(storageKey)) || starterWords;
let databaseConnected = false;
let searchTerm = "";
let searchDraft = "";
let quizWord = null;
let isFlipped = false;
let quizMode = "flashcard";
let synonymFeedback = null;
let nextWordTimer = null;
let nextWordCountdown = 0;
let editingId = null;
let currentPage = 1;
const pageSize = 8;

const app = document.querySelector("#app");
const normalizeSynonyms = (synonyms) =>
  Array.isArray(synonyms)
    ? synonyms.map((synonym) => String(synonym).trim()).filter(Boolean)
    : String(synonyms || "")
        .split(",")
        .map((synonym) => synonym.trim())
        .filter(Boolean);
words = words.map((word) => ({
  ...word,
  synonyms: normalizeSynonyms(word.synonyms),
}));
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
const saveWords = () => localStorage.setItem(storageKey, JSON.stringify(words));
const apiRequest = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `API request failed: ${response.status}`,
    );
  }
  return response.status === 204 ? null : response.json();
};
async function loadWordsFromDatabase() {
  try {
    words = await apiRequest("/words");
    databaseConnected = true;
    saveWords();
    pickQuizWord();
    render();
  } catch (error) {
    databaseConnected = false;
    render();
  }
}
const matchingWords = () =>
  words.filter(({ word, definition, synonyms }) =>
    `${word} ${definition} ${synonyms.join(" ")}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase()),
  );
const pickQuizWord = () => {
  if (nextWordTimer) {
    clearInterval(nextWordTimer);
    nextWordTimer = null;
  }
  nextWordCountdown = 0;
  const candidates =
    words.length > 1 && quizWord
      ? words.filter((word) => word.id !== quizWord.id)
      : words;
  quizWord = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : null;
  isFlipped = false;
  synonymFeedback = null;
};

function render() {
  const filtered = matchingWords();
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  const visibleWords = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  app.innerHTML = `
    <header class="border-b border-slate-200 bg-white/85">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <a class="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900" href="#"><img class="h-8 w-8" src="/logo.svg" alt="Lexicon logo">Lexicon</a>
        <span class="hidden text-xs font-medium text-slate-500 sm:block">${databaseConnected ? "MongoDB connected" : "Local cache mode"}</span>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
      <section class="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p class="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">PERSONAL VOCABULARY</p><h1 class="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Learn words,<br><span class="text-indigo-600">one card at a time.</span></h1><p class="mt-4 max-w-md text-sm leading-6 text-slate-500">Build your own dictionary and turn it into a simple, focused study session.</p></div>
        <div class="flex gap-8"><div><strong class="block text-3xl font-bold text-slate-900">${words.length}</strong><span class="text-xs font-medium uppercase tracking-wider text-slate-400">Words saved</span></div><div><strong class="block text-3xl font-bold text-slate-900">${quizWord ? "1" : "0"}</strong><span class="text-xs font-medium uppercase tracking-wider text-slate-400">Card active</span></div></div>
      </section>
      <section class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div class="library-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">YOUR LIBRARY</p><h2 class="text-2xl font-bold tracking-tight text-slate-900">Saved words <span class="ml-1 text-sm font-medium text-slate-400">${words.length}</span></h2></div><button class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700" data-action="open-add"><span class="text-lg leading-none">+</span> Add new word</button></div>
          <label class="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-400 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"><span>⌕</span><input class="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" id="search" type="search" value="${escapeHtml(searchDraft)}" placeholder="Search words, definitions, or synonyms..."><kbd class="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]">Enter</kbd></label>
          <div class="space-y-3" id="word-list">${filtered.length ? visibleWords.map(wordCard).join("") : emptySearchState()}</div>
          ${filtered.length > pageSize ? pagination(pageCount) : ""}
        </div>
        <aside class="rounded-2xl bg-indigo-600 p-5 text-white shadow-lg shadow-indigo-100 sm:p-7">
          <div class="mb-7 flex items-center justify-between"><div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-100"><span class="h-2 w-2 rounded-full bg-emerald-300"></span> Flashcard quiz</div><span class="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-100">${words.length ? "Ready" : "Empty"}</span></div>
          ${quizModeTabs()}${quizWord ? (quizMode === "flashcard" ? flashcard() : synonymQuiz()) : emptyQuiz()}
        </aside>
      </section>
    </main>
    <footer class="mx-auto flex max-w-7xl justify-between px-5 pb-7 text-xs text-slate-400 lg:px-8"><span>Saved automatically</span><span>Personal study space</span></footer>
    ${wordDialog()}${wordDetailDialog()}${deleteDialog()}`;
  bindEvents();
}

function wordCard({ id, word, definition, synonyms }) {
  return `<article class="word-card group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:shadow-sm"><div class="flex items-start justify-between gap-4"><div class="min-w-0"><h3 class="truncate text-lg font-bold text-slate-900">${escapeHtml(word)}</h3><p class="mt-1 text-xs font-semibold text-indigo-600">${escapeHtml(synonyms.join(", "))}</p></div><div class="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100"><button class="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" data-action="info" data-id="${id}" aria-label="View details for ${escapeHtml(word)}" title="View details">ⓘ</button><button class="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" data-action="edit" data-id="${id}" aria-label="Edit ${escapeHtml(word)}" title="Edit">✎</button><button class="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-500" data-action="delete" data-id="${id}" aria-label="Delete ${escapeHtml(word)}" title="Delete">×</button></div></div><p class="mt-3 text-sm leading-6 text-slate-500">${escapeHtml(definition)}</p></article>`;
}
function pagination(pageCount) {
  return `<nav class="mt-5 flex items-center justify-between border-t border-slate-200/20 pt-4" aria-label="Word pages"><button class="rounded-md border border-slate-200/30 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" data-action="previous-page" ${currentPage === 1 ? "disabled" : ""}>Previous</button><span class="text-xs font-semibold text-slate-400">Page ${currentPage} of ${pageCount}</span><button class="rounded-md border border-slate-200/30 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" data-action="next-page" ${currentPage === pageCount ? "disabled" : ""}>Next</button></nav>`;
}
function emptySearchState() {
  return '<div class="py-12 text-center"><p class="text-sm font-semibold text-slate-700">No words found</p><p class="mt-1 text-sm text-slate-400">Try another search or add a new word.</p></div>';
}
function emptyQuiz() {
  return `<div class="flex min-h-[330px] flex-col items-center justify-center text-center"><div class="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-2xl">✦</div><h2 class="text-2xl font-bold">Ready to study?</h2><p class="mt-2 max-w-xs text-sm leading-6 text-indigo-100">Start a flashcard quiz from the words in your library.</p><button class="mt-7 rounded-lg bg-white px-5 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50" data-action="start-quiz">Start quiz <span class="ml-2">→</span></button></div>`;
}
function quizModeTabs() {
  return `<div class="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-indigo-700/60 p-1"><button class="rounded-md px-3 py-2 text-xs font-bold transition ${quizMode === "flashcard" ? "bg-white text-indigo-700" : "text-indigo-100 hover:bg-white/10"}" data-action="set-flashcard">Flashcards</button><button class="rounded-md px-3 py-2 text-xs font-bold transition ${quizMode === "synonyms" ? "bg-white text-indigo-700" : "text-indigo-100 hover:bg-white/10"}" data-action="set-synonyms">Synonym practice</button></div>`;
}
function flashcard() {
  return `<div><p class="mb-3 text-center text-xs font-bold uppercase tracking-widest text-indigo-100">Click the card to flip</p><button class="flashcard-scene block h-[280px] w-full text-left" data-action="flip" aria-label="Flip flashcard"><span class="flashcard-inner ${isFlipped ? "is-flipped" : ""}"><span class="flashcard-face flashcard-front"><span class="text-xs font-bold uppercase tracking-widest text-slate-400">Word</span><strong class="mt-5 text-4xl font-bold tracking-tight text-slate-900">${escapeHtml(quizWord.word)}</strong><span class="mt-auto text-xs font-medium text-slate-400">Click to reveal</span></span><span class="flashcard-face flashcard-back"><span class="text-xs font-bold uppercase tracking-widest text-indigo-500">Definition</span><strong class="mt-4 text-lg font-bold leading-7 text-slate-900">${escapeHtml(quizWord.definition)}</strong><span class="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-500"><b class="text-slate-700">Synonyms:</b> ${escapeHtml(quizWord.synonyms.join(", "))}</span></span></span></button><button class="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20" data-action="next-word">Next word <span class="text-lg">→</span></button></div>`;
}
function synonymQuiz() {
  const countdownDegrees = Math.round((nextWordCountdown / 2) * 360);
  const feedbackMessage = synonymFeedback?.correct
    ? `You found every synonym. Next word in ${nextWordCountdown} second${nextWordCountdown === 1 ? "" : "s"}.`
    : synonymFeedback?.partial
      ? `You entered ${synonymFeedback.enteredCount} of ${synonymFeedback.expectedCount}. Add the rest and try again.`
      : "One or more answers do not match. Try again.";
  return `<div class="pt-4"><p class="text-center text-xs font-bold uppercase tracking-widest text-indigo-100">Name all synonyms for</p><h2 class="mt-4 text-center text-4xl font-bold tracking-tight">${escapeHtml(quizWord.word)}</h2><form class="mt-9" id="synonym-form"><label class="sr-only" for="synonym-answer">Your synonyms</label><input class="w-full rounded-lg border-2 border-white/20 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-indigo-100 focus:border-white" id="synonym-answer" placeholder="Type all synonyms, separated by commas..." autocomplete="off" required><button class="mt-3 flex w-full items-center justify-between rounded-lg bg-white px-4 py-3 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50" type="submit">Check answer <span class="text-lg">→</span></button></form>${synonymFeedback ? `<div class="mt-5 rounded-lg ${synonymFeedback.correct ? "bg-emerald-400/20 text-emerald-100" : "bg-red-400/20 text-red-100"} p-4 text-sm"><strong class="block">${synonymFeedback.correct ? "Correct!" : synonymFeedback.partial ? "Not enough synonyms." : "Not quite."}</strong><span>${feedbackMessage}</span>${synonymFeedback.correct ? `<span class="countdown-circle" style="--countdown-degrees: ${countdownDegrees}deg"><b>${nextWordCountdown}</b></span>` : ""}</div>` : ""}<button class="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20" data-action="next-word">Next word <span class="text-lg">→</span></button></div>`;
}
function wordDialog() {
  return `<dialog id="word-dialog" class="w-[min(440px,calc(100%-2rem))] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40"><form id="word-form" class="p-6 sm:p-8"><div class="mb-7 flex items-start justify-between"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">WORD ENTRY</p><h2 class="text-2xl font-bold text-slate-900" id="dialog-title">Add new word</h2></div><button class="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" type="button" data-action="close-dialog" aria-label="Close">×</button></div><input id="word-id" type="hidden"><label class="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Word<input class="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" id="word-input" required placeholder="e.g. Serendipity"></label><label class="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Definition<textarea class="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" id="definition-input" required placeholder="What does it mean?"></textarea></label><fieldset class="mb-6"><legend class="text-xs font-bold uppercase tracking-wider text-slate-500">Synonyms <span class="font-normal normal-case tracking-normal text-slate-400">Press Tab for another</span></legend><div class="mt-2 space-y-2" id="synonym-fields"></div></fieldset><button class="flex w-full items-center justify-between rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700" type="submit">Save word <span class="text-lg">→</span></button></form></dialog>`;
}
function wordDetailDialog() {
  return `<dialog id="word-detail-dialog" class="w-[min(440px,calc(100%-2rem))] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40"><div class="p-6 sm:p-8"><div class="mb-7 flex items-start justify-between"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">WORD DETAILS</p><h2 class="text-2xl font-bold text-slate-900" id="detail-word"></h2></div><button class="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" type="button" data-action="close-detail" aria-label="Close">×</button></div><p class="text-sm leading-7 text-slate-600" id="detail-definition"></p><div class="mt-6"><p class="text-xs font-bold uppercase tracking-wider text-slate-500">Synonyms</p><p class="mt-2 text-sm font-semibold text-indigo-600" id="detail-synonyms"></p></div></div></dialog>`;
}
function deleteDialog() {
  return `<dialog id="delete-dialog" class="w-[min(400px,calc(100%-2rem))] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40"><div class="p-6 sm:p-8"><div class="mb-6 flex items-start justify-between"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-red-500">DELETE WORD</p><h2 class="text-2xl font-bold text-slate-900">Are you sure?</h2></div><button class="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" type="button" data-action="close-delete" aria-label="Close">×</button></div><p class="text-sm leading-6 text-slate-500">This word will be removed from your library.</p><div class="mt-7 flex justify-end gap-3"><button class="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50" type="button" data-action="close-delete">Cancel</button><button class="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600" type="button" data-action="confirm-delete">Delete</button></div></div></dialog>`;
}

function openDialog(word = null) {
  editingId = word?.id || null;
  const dialog = document.querySelector("#word-dialog");
  document.querySelector("#dialog-title").textContent = word
    ? "Edit word"
    : "Add new word";
  document.querySelector("#word-id").value = word?.id || "";
  document.querySelector("#word-input").value = word?.word || "";
  document.querySelector("#definition-input").value = word?.definition || "";
  renderSynonymInputs(word ? normalizeSynonyms(word.synonyms) : [""]);
  dialog.showModal();
  document.querySelector("#word-input").focus();
}
function renderSynonymInputs(synonyms = [""]) {
  document.querySelector("#synonym-fields").innerHTML = synonyms
    .map(
      (synonym, index) =>
        `<input class="synonym-input mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal normal-case tracking-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" value="${escapeHtml(synonym)}" placeholder="${index ? "Another synonym" : "e.g. Chance"}" autocomplete="off">`,
    )
    .join("");
  bindSynonymTabs();
}
function bindSynonymTabs() {
  document.querySelectorAll(".synonym-input").forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (
        event.key !== "Tab" ||
        input !==
          document.querySelectorAll(".synonym-input")[
            document.querySelectorAll(".synonym-input").length - 1
          ]
      )
        return;
      event.preventDefault();
      const fields = [...document.querySelectorAll(".synonym-input")];
      const next = document.createElement("input");
      next.className = input.className;
      next.placeholder = "Another synonym";
      next.autocomplete = "off";
      document.querySelector("#synonym-fields").append(next);
      bindSynonymTabs();
      next.focus();
    }),
  );
}
// Compare complete synonym sets, regardless of order or letter case.
function checkSynonymAnswer(event) {
  event.preventDefault();
  const answers = normalizeSynonyms(
    document.querySelector("#synonym-answer").value,
  );
  const accepted = normalizeSynonyms(quizWord.synonyms).map((synonym) =>
    synonym.toLowerCase(),
  );
  const entered = new Set(answers.map((answer) => answer.toLowerCase()));
  const correct =
    accepted.every((synonym) => entered.has(synonym)) &&
    entered.size === accepted.length;
  synonymFeedback = {
    correct,
    partial:
      !correct &&
      accepted.every((synonym) => entered.has(synonym)) === false &&
      entered.size < accepted.length,
    enteredCount: answers.filter((answer) =>
      accepted.includes(answer.toLowerCase()),
    ).length,
    expectedCount: accepted.length,
  };
  if (synonymFeedback.correct) startNextWordCountdown();
  else render();
  document.querySelector("#synonym-answer")?.focus();
}
function startNextWordCountdown() {
  nextWordCountdown = 2;
  render();
  nextWordTimer = setInterval(() => {
    nextWordCountdown -= 1;
    if (nextWordCountdown <= 0) {
      clearInterval(nextWordTimer);
      nextWordTimer = null;
      pickQuizWord();
      render();
      return;
    }
    render();
  }, 1000);
}
function bindEvents() {
  document.querySelector("#search").addEventListener("input", (event) => {
    searchDraft = event.target.value;
  });
  document.querySelector("#search").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchTerm = searchDraft.trim();
    currentPage = 1;
    render();
  });
  document
    .querySelector('[data-action="open-add"]')
    .addEventListener("click", () => openDialog());
  document
    .querySelector('[data-action="close-dialog"]')
    .addEventListener("click", () =>
      document.querySelector("#word-dialog").close(),
    );
  bindWordActions();
  document
    .querySelector('[data-action="previous-page"]')
    ?.addEventListener("click", () => {
      currentPage -= 1;
      render();
    });
  document
    .querySelector('[data-action="next-page"]')
    ?.addEventListener("click", () => {
      currentPage += 1;
      render();
    });
  document
    .querySelector('[data-action="start-quiz"]')
    ?.addEventListener("click", () => {
      pickQuizWord();
      render();
    });
  document
    .querySelector('[data-action="set-flashcard"]')
    ?.addEventListener("click", () => {
      if (nextWordTimer) clearInterval(nextWordTimer);
      nextWordTimer = null;
      nextWordCountdown = 0;
      quizMode = "flashcard";
      synonymFeedback = null;
      render();
    });
  document
    .querySelector('[data-action="set-synonyms"]')
    ?.addEventListener("click", () => {
      if (nextWordTimer) clearInterval(nextWordTimer);
      nextWordTimer = null;
      nextWordCountdown = 0;
      quizMode = "synonyms";
      synonymFeedback = null;
      render();
    });
  document
    .querySelector('[data-action="flip"]')
    ?.addEventListener("click", () => {
      isFlipped = !isFlipped;
      document
        .querySelector(".flashcard-inner")
        .classList.toggle("is-flipped", isFlipped);
    });
  document
    .querySelector('[data-action="next-word"]')
    ?.addEventListener("click", () => {
      pickQuizWord();
      render();
    });
  document
    .querySelector("#synonym-form")
    ?.addEventListener("submit", checkSynonymAnswer);
  document
    .querySelector("#word-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const entry = {
        word: document.querySelector("#word-input").value.trim(),
        definition: document.querySelector("#definition-input").value.trim(),
        synonyms: [...document.querySelectorAll(".synonym-input")]
          .map((input) => input.value.trim())
          .filter(Boolean),
      };
      if (!entry.word || !entry.definition || !entry.synonyms.length) {
        window.alert("Enter a word, definition, and at least one synonym.");
        return;
      }
      try {
        const savedEntry = databaseConnected
          ? await apiRequest(editingId ? `/words/${editingId}` : "/words", {
              method: editingId ? "PUT" : "POST",
              body: JSON.stringify(entry),
            })
          : { ...entry, id: editingId || Date.now() };
        words = editingId
          ? words.map((word) => (word.id === editingId ? savedEntry : word))
          : [savedEntry, ...words];
        saveWords();
        document.querySelector("#word-dialog").close();
        if (!quizWord) pickQuizWord();
        render();
      } catch (error) {
        window.alert(`${error.message} Your word was not saved.`);
      }
    });
}

function bindWordActions() {
  const showWordDetails = (id) => {
    const word = words.find((entry) => String(entry.id) === id);
    if (!word) return;
    document.querySelector("#detail-word").textContent = word.word;
    document.querySelector("#detail-definition").textContent = word.definition;
    document.querySelector("#detail-synonyms").textContent =
      word.synonyms.join(", ");
    document.querySelector("#word-detail-dialog").showModal();
  };
  document
    .querySelectorAll('[data-action="info"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        showWordDetails(button.dataset.id),
      ),
    );
  document
    .querySelectorAll('[data-action="edit"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        openDialog(words.find((word) => String(word.id) === button.dataset.id)),
      ),
    );
  document.querySelectorAll('[data-action="delete"]').forEach((button) =>
    button.addEventListener("click", () => {
      const dialog = document.querySelector("#delete-dialog");
      dialog.dataset.id = button.dataset.id;
      dialog.showModal();
    }),
  );
  document
    .querySelector('[data-action="confirm-delete"]')
    ?.addEventListener("click", async () => {
      const dialog = document.querySelector("#delete-dialog");
      const id = dialog.dataset.id;
      try {
        if (databaseConnected)
          await apiRequest(`/words/${id}`, { method: "DELETE" });
        words = words.filter((word) => String(word.id) !== id);
        saveWords();
        if (quizWord && String(quizWord.id) === id) pickQuizWord();
        dialog.close();
        render();
      } catch (error) {
        window.alert("The database is unavailable. The word was not deleted.");
      }
    });
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    }),
  );
  document
    .querySelectorAll('[data-action="close-detail"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        document.querySelector("#word-detail-dialog").close(),
      ),
    );
  document
    .querySelectorAll('[data-action="close-delete"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        document.querySelector("#delete-dialog").close(),
      ),
    );
}

if (!quizWord && words.length) pickQuizWord();
render();
loadWordsFromDatabase();
