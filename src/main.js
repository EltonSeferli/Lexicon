import "./style.css";
import {
  deleteDialog as renderDeleteDialog,
  wordCard as renderWordCard,
  wordDetailDialog as renderWordDetailDialog,
  wordDialog as renderWordDialog,
} from "./components/words.js";
import {
  progressCard as renderProgressCard,
  progressDetailDialog as renderProgressDetailDialog,
  progressDialog as renderProgressDialog,
  progressEmptyState as renderProgressEmptyState,
  progressFilter as renderProgressFilter,
  filteredProgressEmptyState as renderFilteredProgressEmptyState,
} from "./components/progress.js";
import { authPage as renderAuthPage } from "./components/auth.js";
import { getRoute, navigate, subscribeToRoute } from "./router.js";

const storageKey = "lexicon-words";
const progressStorageKey = "lexicon-progress";
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
let progressEntries =
  JSON.parse(localStorage.getItem(progressStorageKey)) || [];
let databaseConnected = false;
let progressDatabaseConnected = false;
let currentUser = null;
let authMode = "login";
let currentView = getRoute();
let progressSkillFilter = "all";
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
const saveProgress = () =>
  localStorage.setItem(progressStorageKey, JSON.stringify(progressEntries));
const ieltsSkills = ["Reading", "Writing", "Speaking", "Listening"];
const calculateOverallBand = (bands) => {
  const validBands = bands.filter((band) => Number.isFinite(Number(band)));
  if (validBands.length !== ieltsSkills.length) return null;
  return (
    Math.round(
      (validBands.reduce((sum, band) => sum + Number(band), 0) /
        validBands.length) *
        2,
    ) / 2
  );
};
const latestSkillBands = (entries) => {
  const latest = {};
  [...entries]
    .sort(
      (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
    )
    .forEach((entry) => {
      if (
        ieltsSkills.includes(entry.skill) &&
        latest[entry.skill] === undefined
      ) {
        latest[entry.skill] = Number(entry.band ?? entry.score);
      }
    });
  return latest;
};
const apiRequest = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const refreshResponse = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (refreshResponse.ok)
      return apiRequest(path, {
        ...options,
        headers: { "Content-Type": "application/json" },
      });
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `API request failed: ${response.status}`,
    );
  }
  return response.status === 204 ? null : response.json();
};
function renderAuth(errorMessage = "") {
  app.innerHTML = renderAuthPage(authMode);
  const error = document.querySelector("#auth-error");
  if (error) error.textContent = errorMessage;
  document
    .querySelectorAll('[data-action="toggle-password"]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.parentElement.querySelector("input");
        const isVisible = input.type === "text";
        input.type = isVisible ? "password" : "text";
        button.textContent = isVisible ? "◉" : "◌";
        button.setAttribute(
          "aria-label",
          `${isVisible ? "Show" : "Hide"} password`,
        );
        button.setAttribute("title", `${isVisible ? "Show" : "Hide"} password`);
      });
    });
  document
    .querySelector("#auth-form")
    ?.addEventListener("submit", handleAuthSubmit);
  document
    .querySelector('[data-action="auth-switch"]')
    ?.addEventListener("click", () => {
      authMode = document.querySelector('[data-action="auth-switch"]').dataset
        .mode;
      renderAuth();
    });
}
async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = document
    .querySelector("#auth-email")
    .value.trim()
    .toLowerCase();
  try {
    const password = document.querySelector("#auth-password").value;
    const payload = { email, password };
    if (authMode === "register") {
      const confirmPassword = document.querySelector(
        "#auth-confirm-password",
      ).value;
      if (password !== confirmPassword)
        throw new Error("Passwords do not match");
      payload.fullName = document.querySelector("#auth-full-name").value.trim();
    }
    await apiRequest(
      authMode === "register" ? "/auth/register" : "/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    currentUser = await apiRequest("/auth/me");
    render();
    loadWordsFromDatabase();
    loadProgressFromDatabase();
  } catch (error) {
    renderAuth(error.message);
  }
}
async function loadCurrentUser() {
  try {
    currentUser = await apiRequest("/auth/me");
    render();
    loadWordsFromDatabase();
    loadProgressFromDatabase();
  } catch (error) {
    currentUser = null;
    renderAuth();
  }
}
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
async function loadProgressFromDatabase() {
  try {
    const remoteEntries = await apiRequest("/progress");
    progressDatabaseConnected = true;
    if (!remoteEntries.length && progressEntries.length) {
      const migratedEntries = await Promise.all(
        progressEntries.map((entry) =>
          apiRequest("/progress", {
            method: "POST",
            body: JSON.stringify({
              title: entry.title,
              skill: entry.skill,
              band: entry.band ?? entry.score,
              note: entry.note,
              image: entry.image,
            }),
          }),
        ),
      );
      progressEntries = migratedEntries;
    } else {
      progressEntries = remoteEntries;
    }
    saveProgress();
    if (currentView === "progress") render();
  } catch (error) {
    progressDatabaseConnected = false;
    if (currentView === "progress") render();
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
  if (!currentUser) {
    renderAuth();
    return;
  }
  if (currentView === "progress") {
    renderProgress();
    return;
  }
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
        <div class="flex items-center gap-6"><a class="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900" href="#"><img class="h-8 w-8" src="/logo.svg" alt="Lexicon logo">Lexicon</a><nav class="flex items-center gap-1 rounded-lg bg-slate-800/80 p-1" aria-label="Main navigation"><button class="rounded-md px-3 py-1.5 text-xs font-bold ${currentView === "library" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}" data-action="show-library">Library</button><button class="rounded-md px-3 py-1.5 text-xs font-bold ${currentView === "progress" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}" data-action="show-progress">Progress</button></nav></div>
        <div class="flex items-center gap-3"><span class="hidden text-xs font-medium text-slate-500 sm:block">${databaseConnected ? "MongoDB connected" : "Local cache mode"}</span><button class="text-xs font-bold text-slate-400 hover:text-white" data-action="logout">Log out</button></div>
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
          <div class="space-y-3" id="word-list">${filtered.length ? visibleWords.map((word) => renderWordCard(word, escapeHtml)).join("") : emptySearchState()}</div>
          ${filtered.length > pageSize ? pagination(pageCount) : ""}
        </div>
        <aside class="rounded-2xl bg-indigo-600 p-5 text-white shadow-lg shadow-indigo-100 sm:p-7">
          <div class="mb-7 flex items-center justify-between"><div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-100"><span class="h-2 w-2 rounded-full bg-emerald-300"></span> Flashcard quiz</div><span class="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-100">${words.length ? "Ready" : "Empty"}</span></div>
          ${quizModeTabs()}${quizWord ? (quizMode === "flashcard" ? flashcard() : synonymQuiz()) : emptyQuiz()}
        </aside>
      </section>
    </main>
    <footer class="mx-auto flex max-w-7xl justify-between px-5 pb-7 text-xs text-slate-400 lg:px-8"><span>Saved automatically</span><span>Personal study space</span></footer>
    ${renderWordDialog()}${renderWordDetailDialog()}${renderDeleteDialog()}`;
  bindEvents();
}

function renderProgress() {
  const entries = [...progressEntries].sort(
    (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
  );
  const visibleEntries =
    progressSkillFilter === "all"
      ? entries
      : entries.filter((entry) => entry.skill === progressSkillFilter);
  const skillBands = latestSkillBands(entries);
  const overallBand = calculateOverallBand(
    ieltsSkills.map((skill) => skillBands[skill]),
  );
  app.innerHTML = `
    <header class="border-b border-slate-200 bg-white/85">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <div class="flex items-center gap-6"><a class="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900" href="#"><img class="h-8 w-8" src="/logo.svg" alt="Lexicon logo">Lexicon</a><nav class="flex items-center gap-1 rounded-lg bg-slate-800/80 p-1" aria-label="Main navigation"><button class="rounded-md px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white" data-action="show-library">Library</button><button class="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white" data-action="show-progress">Progress</button></nav></div>
        <div class="flex items-center gap-3"><span class="hidden text-xs font-medium text-slate-500 sm:block">${entries.length} ${entries.length === 1 ? "entry" : "entries"}</span><button class="text-xs font-bold text-slate-400 hover:text-white" data-action="logout">Log out</button></div>
      </div>
    </header>
    <main class="progress-page mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
      <section class="progress-hero mb-8 flex flex-col justify-between gap-6 rounded-2xl p-6 sm:flex-row sm:items-end sm:p-8"><div><p class="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">DAILY PROGRESS</p><h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl">Small wins,<br><span class="text-cyan-300">clearly remembered.</span></h1><p class="mt-4 max-w-md text-sm leading-6 text-slate-300">Save a screenshot and a note for every study session. Your progress stays in this browser.</p></div><div class="progress-hero-actions"><div class="overall-band"><span>IELTS overall</span><strong>${overallBand ?? "--"}</strong><small>${overallBand ? `${Object.keys(skillBands).length}/4 skills tracked` : "Add all four skills"}</small></div><button class="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-200" data-action="open-progress-add"><span class="text-xl leading-none">+</span> Add progress</button></div></section>
      <section class="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">YOUR JOURNEY</p><h2 class="text-2xl font-bold tracking-tight text-white">Study entries <span class="ml-1 text-sm font-medium text-slate-500">${visibleEntries.length}${progressSkillFilter !== "all" ? ` / ${entries.length}` : ""}</span></h2></div>${renderProgressFilter(progressSkillFilter)}</section>
      ${visibleEntries.length ? `<section class="progress-grid">${visibleEntries.map((entry) => renderProgressCard(entry, escapeHtml)).join("")}</section>` : entries.length ? renderFilteredProgressEmptyState(progressSkillFilter) : renderProgressEmptyState()}
    </main>
    <footer class="mx-auto flex max-w-7xl justify-between px-5 pb-7 text-xs text-slate-500 lg:px-8"><span>Saved automatically</span><span>Keep showing up</span></footer>
    ${renderProgressDialog()}${renderProgressDetailDialog()}`;
  bindProgressEvents();
}

function bindNavigation() {
  document
    .querySelector('[data-action="show-library"]')
    ?.addEventListener("click", () => {
      navigate("library");
    });
  document
    .querySelector('[data-action="show-progress"]')
    ?.addEventListener("click", () => {
      navigate("progress");
    });
  document
    .querySelector('[data-action="logout"]')
    ?.addEventListener("click", async () => {
      await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
      currentUser = null;
      authMode = "login";
      renderAuth();
    });
}

function bindProgressEvents() {
  bindNavigation();
  document
    .querySelector("#progress-skill-filter")
    ?.addEventListener("change", (event) => {
      progressSkillFilter = event.target.value;
      renderProgress();
    });
  const dialog = document.querySelector("#progress-dialog");
  document
    .querySelectorAll('[data-action="open-progress-add"]')
    .forEach((button) =>
      button.addEventListener("click", () => {
        document.querySelector("#progress-form").reset();
        document
          .querySelector("#progress-preview-wrap")
          .classList.add("hidden");
        document.querySelector("#progress-dialog-title").textContent =
          "Save today's progress";
        document.querySelector("#progress-submit-label").textContent =
          "Save progress";
        dialog.dataset.editingId = "";
        dialog.showModal();
        document.querySelector("#progress-title").focus();
      }),
    );
  document
    .querySelector('[data-action="close-progress-dialog"]')
    ?.addEventListener("click", () => dialog.close());
  document
    .querySelector("#progress-image")
    ?.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        window.alert("Please choose an image smaller than 8 MB.");
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        document.querySelector("#progress-preview").src = reader.result;
        document
          .querySelector("#progress-preview-wrap")
          .classList.remove("hidden");
      });
      reader.readAsDataURL(file);
    });
  document
    .querySelector("#progress-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const image = document.querySelector("#progress-preview").src;
      const editingId = dialog.dataset.editingId;
      const existingEntry = progressEntries.find(
        (entry) => String(entry.id) === editingId,
      );
      const entry = {
        id: existingEntry?.id || Date.now(),
        title: document.querySelector("#progress-title").value.trim(),
        skill: document.querySelector("#progress-skill").value,
        band: Number(document.querySelector("#progress-band").value),
        note: document.querySelector("#progress-note").value.trim(),
        image: image || existingEntry?.image || "",
        createdAt: existingEntry?.createdAt || new Date().toISOString(),
      };
      try {
        if (progressDatabaseConnected) {
          const savedEntry = await apiRequest(
            existingEntry ? `/progress/${existingEntry.id}` : "/progress",
            {
              method: existingEntry ? "PUT" : "POST",
              body: JSON.stringify(entry),
            },
          );
          progressEntries = existingEntry
            ? progressEntries.map((item) =>
                item.id === existingEntry.id ? savedEntry : item,
              )
            : [savedEntry, ...progressEntries];
        } else {
          progressEntries = existingEntry
            ? progressEntries.map((item) =>
                item.id === existingEntry.id ? entry : item,
              )
            : [entry, ...progressEntries];
        }
      } catch (error) {
        window.alert(`${error.message} Your progress was not saved.`);
        return;
      }
      saveProgress();
      dialog.close();
      render();
    });
  document
    .querySelectorAll('[data-action="progress-info"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        openProgressDetails(button.dataset.id),
      ),
    );
  document
    .querySelector('[data-action="close-progress-detail"]')
    ?.addEventListener("click", () =>
      document.querySelector("#progress-detail-dialog").close(),
    );
  document
    .querySelector('[data-action="delete-progress"]')
    ?.addEventListener("click", async () => {
      const id = document.querySelector("#progress-detail-dialog").dataset.id;
      try {
        if (progressDatabaseConnected)
          await apiRequest(`/progress/${id}`, { method: "DELETE" });
        progressEntries = progressEntries.filter(
          (entry) => String(entry.id) !== id,
        );
      } catch (error) {
        window.alert(`${error.message} The progress was not deleted.`);
        return;
      }
      saveProgress();
      document.querySelector("#progress-detail-dialog").close();
      render();
    });
  document.querySelectorAll("dialog").forEach((currentDialog) =>
    currentDialog.addEventListener("click", (event) => {
      if (event.target === currentDialog) currentDialog.close();
    }),
  );
}

function openProgressDetails(id) {
  const entry = progressEntries.find((item) => String(item.id) === id);
  if (!entry) return;
  const date = new Date(entry.createdAt);
  const dialog = document.querySelector("#progress-detail-dialog");
  dialog.dataset.id = id;
  document.querySelector("#progress-detail-content").innerHTML =
    `<div class="p-6 sm:p-8"><div class="mb-6 flex items-start justify-between gap-4"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-600">PROGRESS DETAIL</p><h2 class="text-2xl font-bold text-slate-900">${escapeHtml(entry.title)}</h2><p class="mt-2 text-xs font-medium text-slate-500">${date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} at ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p></div><button class="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" type="button" data-action="close-progress-detail" aria-label="Close">×</button></div>${entry.image ? `<img class="mb-6 max-h-[55vh] w-full rounded-lg bg-slate-100 object-contain" src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)} screenshot">` : ""}<div class="rounded-lg bg-slate-50 p-4"><div class="flex items-end justify-between"><div><p class="text-xs font-bold uppercase tracking-wider text-slate-500">${escapeHtml(entry.skill || "General")}</p><p class="mt-1 text-xl font-bold text-cyan-700">Band ${escapeHtml(entry.band ?? entry.score ?? "Not specified")}</p></div></div><p class="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Note</p><p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">${escapeHtml(entry.note || "No note added.")}</p></div><div class="mt-6 flex items-center justify-between"><button class="text-sm font-bold text-cyan-700 hover:text-cyan-900" type="button" data-action="edit-progress">Edit entry</button><button class="text-sm font-bold text-red-500 hover:text-red-700" type="button" data-action="delete-progress">Delete entry</button></div></div>`;
  dialog.showModal();
  document
    .querySelector('[data-action="close-progress-detail"]')
    .addEventListener("click", () => dialog.close());
  document
    .querySelector('[data-action="delete-progress"]')
    .addEventListener("click", async () => {
      try {
        if (progressDatabaseConnected)
          await apiRequest(`/progress/${id}`, { method: "DELETE" });
        progressEntries = progressEntries.filter(
          (item) => String(item.id) !== id,
        );
      } catch (error) {
        window.alert(`${error.message} The progress was not deleted.`);
        return;
      }
      saveProgress();
      dialog.close();
      render();
    });
  document
    .querySelector('[data-action="edit-progress"]')
    .addEventListener("click", () => {
      dialog.close();
      openProgressEditor(entry);
    });
}

function openProgressEditor(entry) {
  const dialog = document.querySelector("#progress-dialog");
  document.querySelector("#progress-form").reset();
  document.querySelector("#progress-dialog-title").textContent =
    "Edit progress entry";
  document.querySelector("#progress-submit-label").textContent =
    "Update progress";
  document.querySelector("#progress-title").value = entry.title || "";
  document.querySelector("#progress-skill").value = entry.skill || "Reading";
  document.querySelector("#progress-band").value = String(
    entry.band ?? entry.score ?? "0.5",
  );
  document.querySelector("#progress-note").value = entry.note || "";
  const preview = document.querySelector("#progress-preview");
  if (entry.image) {
    preview.src = entry.image;
    document.querySelector("#progress-preview-wrap").classList.remove("hidden");
  } else {
    document.querySelector("#progress-preview-wrap").classList.add("hidden");
  }
  dialog.dataset.editingId = entry.id;
  dialog.showModal();
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
  bindNavigation();
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
subscribeToRoute((route) => {
  currentView = route;
  if (currentUser) render();
});
loadCurrentUser();
