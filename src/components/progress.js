export function progressCard(entry, escapeHtml) {
  const date = new Date(entry.createdAt);
  const skill = entry.skill || "General";
  const band = entry.band ?? entry.score ?? "Entry";
  return `<button class="progress-card group text-left" data-action="progress-info" data-id="${entry.id}"><div class="progress-image-wrap">${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)} screenshot">` : `<div class="progress-image-placeholder">No screenshot</div>`}<span class="progress-date">${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span></div><div class="p-5"><div class="mb-3 flex items-start justify-between gap-3"><div><h3 class="text-lg font-bold text-white">${escapeHtml(entry.title)}</h3><span class="progress-skill">${escapeHtml(skill)}</span></div><span class="progress-score">${escapeHtml(band)}</span></div><p class="line-clamp-2 text-sm leading-6 text-slate-400">${escapeHtml(entry.note || "No note added.")}</p><p class="mt-4 text-xs font-medium text-slate-500">${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Click to open</p></div></button>`;
}

export function progressEmptyState() {
  return `<section class="progress-empty"><div class="progress-empty-icon">↗</div><h2 class="text-xl font-bold text-white">Your first entry is waiting</h2><p class="mt-2 max-w-sm text-sm leading-6 text-slate-400">Add a screenshot of today's result, give it a title, and leave yourself a useful note.</p><button class="mt-6 rounded-lg border border-cyan-300/50 px-4 py-2.5 text-sm font-bold text-cyan-300 transition hover:bg-cyan-300/10" data-action="open-progress-add">Create first entry</button></section>`;
}

export function progressFilter(selectedSkill) {
  const skills = ["all", "Reading", "Writing", "Speaking", "Listening"];
  return `<label class="progress-filter"> <span>Filter by skill</span><select id="progress-skill-filter" aria-label="Filter progress by skill">${skills.map((skill) => `<option value="${skill}" ${selectedSkill === skill ? "selected" : ""}>${skill === "all" ? "All skills" : skill}</option>`).join("")}</select></label>`;
}

export function filteredProgressEmptyState(skill) {
  return `<section class="progress-empty progress-filter-empty"><div class="progress-empty-icon">⌕</div><h2 class="text-xl font-bold text-white">No ${skill} entries yet</h2><p class="mt-2 max-w-sm text-sm leading-6 text-slate-400">Add a ${skill} result or switch the filter to see other skills.</p></section>`;
}

export function progressDialog() {
  return `<dialog id="progress-dialog" class="progress-dialog"><form id="progress-form" class="p-6 sm:p-8"><div class="mb-7 flex items-start justify-between"><div><p class="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-600">IELTS PROGRESS</p><h2 class="text-2xl font-bold text-slate-900" id="progress-dialog-title">Save today's progress</h2></div><button class="rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100" type="button" data-action="close-progress-dialog" aria-label="Close">×</button></div><label class="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Title<input class="progress-input mt-2" id="progress-title" required placeholder="e.g. Reading practice"></label><div class="mb-4 grid gap-4 sm:grid-cols-2"><label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Skill<select class="progress-input mt-2" id="progress-skill"><option>Reading</option><option>Writing</option><option>Speaking</option><option>Listening</option></select></label><label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Band score<select class="progress-input mt-2" id="progress-band">${Array.from(
    { length: 18 },
    (_, index) => {
      const band = (index + 1) / 2;
      return `<option value="${band}">${band.toFixed(1)}</option>`;
    },
  ).join(
    "",
  )}</select></label></div><label class="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-500">Screenshot<input class="progress-input mt-2 p-2" id="progress-image" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="mb-6 block text-xs font-bold uppercase tracking-wider text-slate-500">Note<textarea class="progress-input mt-2 min-h-28 resize-y" id="progress-note" placeholder="What did you learn or improve today?"></textarea></label><div class="mb-6 hidden overflow-hidden rounded-lg border border-slate-200 bg-slate-50" id="progress-preview-wrap"><img class="max-h-52 w-full object-contain" id="progress-preview" alt="Screenshot preview"></div><button class="flex w-full items-center justify-between rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-700" type="submit"><span id="progress-submit-label">Save progress</span><span class="text-lg">→</span></button></form></dialog>`;
}

export function progressDetailDialog() {
  return `<dialog id="progress-detail-dialog" class="progress-detail-dialog"><div id="progress-detail-content"></div></dialog>`;
}
