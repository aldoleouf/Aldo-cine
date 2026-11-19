/* Aldo Ciné — application principale.
   Les données restent dans le navigateur (localStorage), sous les mêmes clés qu'avant. */
"use strict";

/* ---------- Constantes et utilitaires ---------- */
const STORE_KEY = "aldoCineEntriesV2";
const SUGGESTIONS_KEY = "aldoCineDailySuggestionsV1";
const STATUS_LABELS = { watched: "Découverte", rewatch: "Revisionnage", episodes: "Nouveaux épisodes", todo: "À voir" };
const STATUS_PLURAL = { watched: "Découvertes", rewatch: "Revisionnages", episodes: "Nouveaux épisodes", todo: "À voir" };
const STATUS_ORDER = ["watched", "rewatch", "episodes", "todo"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/* Genres TMDB (identifiants → noms en français). Les genres composés des séries sont éclatés. */
const TMDB_GENRES = {
  28: ["Action"], 12: ["Aventure"], 16: ["Animation"], 35: ["Comédie"], 80: ["Crime"], 99: ["Documentaire"],
  18: ["Drame"], 10751: ["Familial"], 14: ["Fantastique"], 36: ["Histoire"], 27: ["Horreur"], 10402: ["Musique"],
  9648: ["Mystère"], 10749: ["Romance"], 878: ["Science-Fiction"], 10770: ["Téléfilm"], 53: ["Thriller"],
  10752: ["Guerre"], 37: ["Western"], 10759: ["Action", "Aventure"], 10762: ["Enfants"], 10763: ["Actualités"],
  10764: ["Téléréalité"], 10765: ["Science-Fiction", "Fantastique"], 10766: ["Feuilleton"], 10767: ["Talk-show"],
  10768: ["Guerre", "Politique"]
};
const GENRE_ALIASES = {
  "action & adventure": ["Action", "Aventure"], "sci-fi & fantasy": ["Science-Fiction", "Fantastique"],
  "science-fiction & fantastique": ["Science-Fiction", "Fantastique"], "war & politics": ["Guerre", "Politique"],
  kids: ["Enfants"], news: ["Actualités"], reality: ["Téléréalité"], soap: ["Feuilleton"], talk: ["Talk-show"]
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normalize = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : "aldo-" + Date.now() + "-" + Math.random().toString(36).slice(2));
/* Date du jour en heure locale (toISOString donnerait la date UTC, fausse après minuit en France). */
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const frDate = iso => iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "";
const yearOf = e => (e.watchedAt ? e.watchedAt.slice(0, 4) : "");
const typeLabel = e => (e.type === "tv" ? "Série" : "Film");
const posterSrc = (p, size = "w342") => (/^https?:\/\//i.test(p || "") ? p : p ? "https://image.tmdb.org/t/p/" + size + p : "");
const tmdbUrl = e => /^\d+$/.test(String(e.tmdbId || "").trim())
  ? "https://www.themoviedb.org/" + (e.type === "tv" ? "tv/" : "movie/") + e.tmdbId
  : "https://www.themoviedb.org/search?query=" + encodeURIComponent(e.title || "");
const plural = (n, one, many) => n + " " + (n > 1 ? many : one);
const formatHours = minutes => { const h = Math.floor(minutes / 60), m = minutes % 60; return h ? h + " h" + (m ? " " + String(m).padStart(2, "0") : "") : m + " min"; };
const statusOptions = () => STATUS_ORDER.map(s => '<option value="' + s + '">' + STATUS_LABELS[s] + "</option>").join("");

function genresFromIds(ids) {
  const out = [];
  (ids || []).forEach(id => (TMDB_GENRES[id] || []).forEach(g => { if (!out.includes(g)) out.push(g); }));
  return out;
}
function normalizeGenres(names) {
  const out = [];
  (names || []).forEach(name => {
    const clean = String(name || "").trim();
    if (!clean) return;
    (GENRE_ALIASES[clean.toLowerCase()] || [clean]).forEach(g => { if (!out.includes(g)) out.push(g); });
  });
  return out;
}

/* ---------- Données ---------- */
let entries = [];
try { entries = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); if (!Array.isArray(entries)) entries = []; } catch { entries = []; }
const findEntry = id => entries.find(e => String(e.id) === String(id));

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(entries)); }
  catch { notify("Impossible d’enregistrer : stockage du navigateur plein ou bloqué"); }
}
function save() { persist(); render(); }

/* ---------- Notifications et infobulle ---------- */
let toastTimer;
function notify(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}
function showTooltip(html, x, y) {
  const t = $("tooltip");
  t.innerHTML = html;
  t.classList.remove("hidden");
  const r = t.getBoundingClientRect();
  t.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + "px";
  t.style.top = Math.max(8, y - r.height - 12) + "px";
}
const hideTooltip = () => $("tooltip").classList.add("hidden");

/* ---------- Fenêtres modales : pile, Échap, piège du focus ---------- */
const modalStack = [];
function openModal(el, { onClose } = {}) {
  if (modalStack.some(m => m.el === el)) return;
  modalStack.push({ el, onClose, returnFocus: document.activeElement });
  el.classList.remove("hidden");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    const target = el.querySelector("[autofocus]") || el.querySelector("input:not([type=hidden]):not([disabled]),select,textarea,button:not([data-close])") || el.querySelector("button");
    if (target) target.focus({ preventScroll: true });
  });
}
function closeModal(el) {
  const i = modalStack.findIndex(m => m.el === el);
  if (i < 0) return;
  const [m] = modalStack.splice(i, 1);
  el.classList.add("hidden");
  if (!modalStack.length) document.body.classList.remove("modal-open");
  if (m.onClose) m.onClose();
  const wasTop = i === modalStack.length;
  if (wasTop && m.returnFocus && document.contains(m.returnFocus)) m.returnFocus.focus({ preventScroll: true });
}
document.addEventListener("keydown", ev => {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  if (ev.key === "Escape") { ev.preventDefault(); closeModal(top.el); return; }
  if (ev.key !== "Tab") return;
  const focusables = [...top.el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
});
document.addEventListener("click", ev => {
  const closer = ev.target.closest("[data-close]");
  if (closer) { const m = closer.closest(".modal,#aldoWrappedPage"); if (m) closeModal(m); return; }
  // Clic sur le fond : seulement pour les fenêtres sans saisie, pour ne rien perdre par accident.
  if (ev.target.id === "detailDialog" || ev.target.id === "searchPanel") closeModal(ev.target);
});

/* Boîte de confirmation maison. `onConfirm` s'exécute pendant le clic (utile pour ouvrir un onglet sans blocage). */
function ask({ title = "Confirmer", message = "", ok = "Confirmer", cancel = "Annuler", danger = false, onConfirm } = {}) {
  return new Promise(resolve => {
    const dlg = $("confirmDialog"), okBtn = $("confirmOk"), cancelBtn = $("confirmCancel");
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    okBtn.textContent = ok;
    cancelBtn.textContent = cancel;
    okBtn.className = danger ? "danger" : "";
    let answered = false;
    const finish = value => { if (answered) return; answered = true; okBtn.onclick = cancelBtn.onclick = null; closeModal(dlg); resolve(value); };
    okBtn.onclick = () => { if (onConfirm) onConfirm(); finish(true); };
    cancelBtn.onclick = () => finish(false);
    openModal(dlg, { onClose: () => finish(false) });
    requestAnimationFrame(() => okBtn.focus());
  });
}

/* ---------- Navigation ---------- */
let currentPage = "home";
function go(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach(x => x.classList.toggle("hidden", x.id !== page));
  document.querySelectorAll("#nav button").forEach(b => { const on = b.dataset.page === page; b.classList.toggle("active", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (page === "library") drawLibrary();
  if (page === "todo") drawTodo();
  if (page === "stats") drawStats();
  if (page === "suggestions") drawSuggestions();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
document.addEventListener("click", ev => { const b = ev.target.closest("[data-goto]"); if (b) go(b.dataset.goto); });

/* Applique un filtre à la bibliothèque. Les cartes portent `data-filter` (JSON) : plus de dépendance au texte affiché. */
function applyFilter(filter) {
  const set = (id, value) => { const el = $(id); if (el) el.value = value; };
  set("filterType", filter.type || "all");
  set("filterStatus", filter.status || "all");
  set("filterCompany", filter.company || "all");
  set("filterCinema", filter.cinema || "all");
  set("filterYear", filter.year || "all");
  set("filterSearch", "");
  drawLibrary(); // reconstruit la liste des genres avant de la sélectionner
  set("filterGenre", filter.genre || "all");
  go("library");
}
document.addEventListener("click", ev => {
  const el = ev.target.closest("[data-filter]");
  if (!el) return;
  try { applyFilter(JSON.parse(el.dataset.filter)); } catch { /* filtre invalide ignoré */ }
});

/* ---------- Cartes d'œuvres (version allégée) ---------- */
function posterImg(e, cls = "poster", size = "w342") {
  const src = posterSrc(e.poster, size);
  return src
    ? '<img class="' + cls + '" src="' + esc(src) + '" alt="" loading="lazy" decoding="async" data-fallback="' + esc(e.title || "") + '">'
    : '<div class="poster-fallback" aria-hidden="true">' + esc(e.title || "") + "</div>";
}
function releaseInfo(e) {
  const release = e.releaseDate || "";
  if (e.status !== "todo" || !release) return "";
  const now = today();
  if (release <= now) return '<div class="release-info">Sortie : ' + esc(frDate(release)) + " · déjà sorti</div>";
  const days = Math.round((new Date(release + "T12:00:00") - new Date(now + "T12:00:00")) / 86400000);
  return '<div class="release-info">Sortie : ' + esc(frDate(release)) + " · <b>dans " + plural(days, "jour", "jours") + "</b></div>";
}
function card(e) {
  return '<article class="item" role="button" tabindex="0" data-open="' + esc(e.id) + '" aria-label="Ouvrir la fiche de ' + esc(e.title) + '">'
    + '<div class="poster-wrap">' + posterImg(e) + (e.cinema && e.status !== "todo" ? '<span class="badge">🎬 Ciné</span>' : "") + "</div>"
    + '<div class="itembody"><h3>' + esc(e.title) + '</h3><div class="muted">' + typeLabel(e) + (e.year ? " · " + esc(e.year) : "") + "</div>"
    + '<span class="pill ' + esc(e.status) + '">' + (STATUS_LABELS[e.status] || "") + "</span>"
    + (e.watchedAt && e.status !== "todo" ? '<div class="muted">Vu le ' + esc(frDate(e.watchedAt)) + "</div>" : "")
    + releaseInfo(e)
    + (e.status === "todo" ? '<button class="small quick" type="button" data-quick-watched="' + esc(e.id) + '">✓ Marquer vu</button>' : "")
    + "</div></article>";
}
/* Affiche introuvable : on la remplace par un encart avec le titre. */
document.addEventListener("error", ev => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-fallback")) return;
  const box = document.createElement("div");
  box.className = "poster-fallback";
  box.textContent = img.dataset.fallback;
  img.replaceWith(box);
}, true);
const cardRow = list => '<div class="cards">' + list.map(card).join("") + "</div>";

document.addEventListener("click", ev => {
  const quick = ev.target.closest("[data-quick-watched]");
  if (quick) { ev.stopPropagation(); const e = findEntry(quick.dataset.quickWatched); if (e) openViewing(e, "watched", e.id); return; }
  const c = ev.target.closest("[data-open]");
  if (c) { const e = findEntry(c.dataset.open); if (e) openDetail(e); }
});
document.addEventListener("keydown", ev => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const c = ev.target.closest && ev.target.closest("[data-open]");
  if (c && ev.target === c) { ev.preventDefault(); const e = findEntry(c.dataset.open); if (e) openDetail(e); }
});

/* ---------- Fiche détaillée ---------- */
let detailId = null;
function openDetail(e) {
  detailId = e.id;
  renderDetail();
  openModal($("detailDialog"), { onClose: () => { detailId = null; } });
}
function renderDetail() {
  const e = findEntry(detailId);
  const box = $("detailContent");
  if (!e) { closeModal($("detailDialog")); return; }
  const seen = e.status !== "todo";
  const genres = (e.genres || []).map(g => '<span class="pill genre">' + esc(g) + "</span>").join("");
  const duration = e.type === "tv"
    ? (e.episodes ? plural(e.episodes, "épisode", "épisodes") + (e.episodeRuntime ? " · ~" + e.episodeRuntime + " min" : "") : "")
    : (e.runtime ? formatHours(e.runtime) : "");
  const facts = [];
  if (seen && e.watchedAt) facts.push(["Vu le", frDate(e.watchedAt)]);
  if (seen && e.company) facts.push(["Avec qui", e.company === "duo" ? "👥 À deux" : "👤 En solo"]);
  if (e.releaseDate) facts.push(["Sortie", frDate(e.releaseDate)]);
  if (duration) facts.push([e.type === "tv" ? "Série" : "Durée", duration]);
  const bg = posterSrc(e.poster, "w500");
  box.innerHTML =
    '<button class="secondary modal-close" type="button" data-close aria-label="Fermer">×</button>'
    + '<div class="detail-hero" style="--detail-bg:' + (bg ? 'url(&quot;' + esc(bg) + '&quot;)' : "#26262c") + '">'
    + (bg ? '<img class="detail-poster" src="' + esc(bg) + '" alt="">' : '<div class="detail-poster poster-fallback">' + esc(e.title) + "</div>")
    + '<div class="detail-head"><h2 id="detailTitle">' + esc(e.title) + '</h2><div class="muted">' + typeLabel(e) + (e.year ? " · " + esc(e.year) : "") + "</div>"
    + '<div><span class="pill ' + esc(e.status) + '">' + STATUS_LABELS[e.status] + "</span>" + (e.cinema && seen ? '<span class="pill">🎬 Vu au cinéma</span>' : "") + "</div>"
    + (genres ? "<div>" + genres + "</div>" : "") + "</div></div>"
    + '<div class="detail-body">'
    + releaseInfo(e)
    + (e.overview ? '<p class="overview">' + esc(e.overview) + "</p>" : '<p class="muted">Pas encore de synopsis. Tu peux en ajouter un avec « Modifier ».</p>')
    + (facts.length ? '<div class="detail-facts">' + facts.map(([k, v]) => '<div class="fact"><small>' + k + "</small><span>" + esc(v) + "</span></div>").join("") + "</div>" : "")
    + '<div class="field"><label for="detailStatus">Catégorie</label><select id="detailStatus">' + STATUS_ORDER.map(s => '<option value="' + s + '"' + (s === e.status ? " selected" : "") + ">" + STATUS_LABELS[s] + "</option>").join("") + "</select></div>"
    + (seen ? '<label class="check"><input type="checkbox" id="detailCinema"' + (e.cinema ? " checked" : "") + "> Vu au cinéma</label>" : "")
    + '<div class="detail-links">'
    + (e.status === "todo" ? '<button type="button" id="detailWatched" style="background:var(--accent);color:#111">✓ Marquer comme vu</button>' : "")
    + '<button type="button" id="detailEdit">✏️ Modifier</button>'
    + '<a href="' + esc(tmdbUrl(e)) + '" target="_blank" rel="noopener noreferrer">TMDB ↗</a>'
    + '<button type="button" id="detailBetaSeries">BetaSeries ↗</button>'
    + "</div>"
    + '<div class="danger-zone"><button class="danger small" type="button" id="detailDelete">Supprimer de ma bibliothèque</button></div>'
    + "</div>";

  $("detailStatus").onchange = ev => changeStatus(e, ev.target.value);
  if ($("detailCinema")) $("detailCinema").onchange = ev => { e.cinema = ev.target.checked; save(); renderDetail(); notify(e.cinema ? "Marqué comme vu au cinéma" : "Mention cinéma retirée"); };
  if ($("detailWatched")) $("detailWatched").onclick = () => openViewing(e, "watched", e.id);
  $("detailEdit").onclick = () => openEdit(e);
  $("detailBetaSeries").onclick = () => { copyTitle(e.title); openBetaSeries(e); };
  $("detailDelete").onclick = async () => {
    const yes = await ask({ title: "Supprimer ce titre ?", message: "« " + e.title + " » sera retiré de ta bibliothèque. Cette action est définitive (sauf si tu as un export).", ok: "Supprimer", danger: true });
    if (!yes) return;
    entries = entries.filter(x => x.id !== e.id);
    closeModal($("detailDialog"));
    save();
    notify("Titre supprimé");
  };
}
/* Changement de catégorie explicite (remplace l'ancien bouton ambigu « Découverte / Revisionnage »). */
function changeStatus(e, status) {
  if (status === e.status) return;
  if (status !== "todo" && e.status === "todo") { renderDetail(); openViewing(e, status, e.id); return; }
  e.status = status;
  if (status === "todo") { e.watchedAt = ""; e.cinema = false; e.company = ""; }
  save();
  renderDetail();
  notify("Catégorie : " + STATUS_LABELS[status]);
}

/* ---------- BetaSeries ---------- */
function copyTitle(value) {
  const title = String(value || "").trim();
  if (!title) return;
  const fallback = () => {
    const field = document.createElement("textarea");
    field.value = title; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field); field.select();
    try { document.execCommand("copy"); } catch { /* sans importance */ }
    field.remove();
  };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(title).then(() => notify("Titre copié dans le presse-papiers"), fallback); return; } } catch { /* repli */ }
  fallback();
}
async function openBetaSeries(entry) {
  const title = String(entry.title || "").trim();
  const tab = window.open("about:blank", "_blank");
  if (!tab) { notify("Autorise les fenêtres pop-up pour ouvrir la fiche BetaSeries."); return; }
  const fallback = "https://www.betaseries.com/";
  try {
    const response = await fetch("/api/betaseries-search?title=" + encodeURIComponent(title) + "&type=" + (entry.type === "tv" ? "show" : "movie"));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const target = normalize(title), year = String(entry.year || "");
    const score = x => {
      const t = normalize(x.title);
      let n = !t ? 0 : t === target ? 100 : (t.includes(target) || target.includes(t)) ? 80 : 0;
      if (n && /^\d{4}$/.test(year) && /^\d{4}$/.test(String(x.year || ""))) n += Math.max(0, 100 - Math.abs(Number(x.year) - Number(year)) * 6);
      return n;
    };
    const match = (data.results || []).map((x, i) => ({ x, i, n: score(x) })).filter(m => m.n > 0).sort((a, b) => b.n - a.n || a.i - b.i)[0];
    tab.location.replace(match ? match.x.url : fallback);
  } catch { tab.location.replace(fallback); }
}
function offerBetaSeries(entry) {
  ask({
    title: "Fiche enregistrée ✓",
    message: "Veux-tu ouvrir « " + entry.title + " » sur BetaSeries ? Le titre sera copié dans le presse-papiers.",
    ok: "Ouvrir BetaSeries", cancel: "Plus tard",
    onConfirm: () => { copyTitle(entry.title); openBetaSeries(entry); }
  });
}

/* ---------- Accueil ---------- */
function fillYears() {
  const years = [...new Set([...entries.map(yearOf).filter(Boolean), String(new Date().getFullYear())])].sort((a, b) => b - a);
  for (const id of ["homeYear", "filterYear", "statsYear"]) {
    const el = $(id), old = el.value;
    el.innerHTML = '<option value="all">Toutes les années</option>' + years.map(y => '<option value="' + y + '">' + y + "</option>").join("");
    if ([...el.options].some(o => o.value === old) && old) el.value = old;
    else el.value = id === "homeYear" ? String(new Date().getFullYear()) : "all";
  }
}
function counter(label, num, filter) {
  return '<button class="counter" type="button"' + (filter ? " data-filter='" + esc(JSON.stringify(filter)) + "'" : "") + "><small>" + label + "</small><strong>" + num + "</strong></button>";
}
function renderHome() {
  const yr = $("homeYear").value;
  const seen = entries.filter(e => e.status !== "todo" && (yr === "all" || yearOf(e) === yr));
  const year = yr === "all" ? undefined : yr;
  $("counters").innerHTML = counter("Films vus", seen.filter(e => e.type === "movie").length, { type: "movie", year })
    + counter("Séries vues", seen.filter(e => e.type === "tv").length, { type: "tv", year });
  const recent = seen.filter(e => e.watchedAt).sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
  for (const [type, target, label] of [["movie", "recentMovies", "film"], ["tv", "recentSeries", "série"]]) {
    const list = recent.filter(e => e.type === type).slice(0, 8);
    $(target).innerHTML = list.length ? cardRow(list) : '<div class="empty">Aucun' + (type === "tv" ? "e" : "") + " " + label + " visionné" + (type === "tv" ? "e" : "") + " pour cette période.</div>";
  }
  renderHero();
}
$("homeYear").onchange = renderHome;

/* Carrousel « À la une » : 8 œuvres de la bibliothèque. */
let heroItems = [], heroIndex = 0, heroTimer = null;
function renderHero() {
  const hero = $("appleHero");
  const yr = $("homeYear").value;
  heroItems = entries.filter(e => e.title && (yr === "all" || yearOf(e) === yr)).sort((a, b) => {
    if ((a.status === "todo") !== (b.status === "todo")) return a.status === "todo" ? 1 : -1;
    return (b.watchedAt || b.releaseDate || "").localeCompare(a.watchedAt || a.releaseDate || "");
  }).slice(0, 8);
  if (!heroItems.length) {
    hero.innerHTML = '<div class="ac-hero-empty"><p class="ac-hero-kicker">Aldo Ciné · À la une</p><h2>Ton prochain coup de cœur commence ici.</h2><p>Ajoute des films et des séries à ta bibliothèque pour composer ta sélection.</p><button type="button" id="heroAdd">＋ Ajouter un titre</button></div>';
    $("heroAdd").onclick = openSearch;
    return;
  }
  const n = heroItems.length;
  heroIndex = ((heroIndex % n) + n) % n;
  const cur = heroItems[heroIndex], prev = heroItems[(heroIndex - 1 + n) % n], next = heroItems[(heroIndex + 1) % n];
  const bg = (item, shade) => { const p = posterSrc(item.poster, "w780"); return p ? "background-image:" + shade + ',url(&quot;' + esc(p) + '&quot;)' : ""; };
  const side = (item, dir) => '<button class="ac-hero-side" type="button" data-hero-step="' + (dir === "prev" ? -1 : 1) + '" aria-label="' + (dir === "prev" ? "Œuvre précédente" : "Œuvre suivante") + '" style="' + bg(item, "linear-gradient(0deg,#08090de8,transparent 70%)") + '"></button>';
  const status = { todo: "À découvrir", rewatch: "À revoir", episodes: "Nouveaux épisodes" }[cur.status] || "Dans ta collection";
  hero.innerHTML = '<div class="ac-hero-stage">' + side(prev, "prev")
    + '<article class="ac-hero-main" style="' + bg(cur, "linear-gradient(0deg,#08090df5 0%,#08090d8c 38%,#08090d08 78%)") + '"><div class="ac-hero-shade"></div><div class="ac-hero-copy">'
    + '<p class="ac-hero-kicker">✦ Ta sélection · ' + (heroIndex + 1) + " / " + n + "</p><h2>" + esc(cur.title) + "</h2>"
    + '<p class="ac-hero-meta">' + typeLabel(cur) + (cur.year ? " · " + esc(cur.year) : "") + " · " + status + ((cur.genres || []).length ? " · " + esc(cur.genres.slice(0, 2).join(", ")) : "") + "</p>"
    + (cur.overview ? '<p class="ac-hero-description">' + esc(cur.overview) + "</p>" : "")
    + '<div class="ac-hero-actions"><button type="button" data-open="' + esc(cur.id) + '">Voir la fiche</button><button type="button" class="secondary" data-goto="library">Explorer ma bibliothèque</button></div>'
    + "</div></article>" + side(next, "next") + "</div>"
    + '<div class="ac-hero-controls"><button type="button" data-hero-step="-1" aria-label="Œuvre précédente">‹</button><div class="ac-hero-dots">'
    + heroItems.map((item, i) => '<button type="button" data-hero-index="' + i + '" class="' + (i === heroIndex ? "active" : "") + '" aria-label="Afficher ' + esc(item.title) + '"></button>').join("")
    + '</div><button type="button" data-hero-step="1" aria-label="Œuvre suivante">›</button></div>';
  hero.querySelectorAll("[data-hero-step]").forEach(b => b.onclick = () => { heroIndex += Number(b.dataset.heroStep); renderHero(); });
  hero.querySelectorAll("[data-hero-index]").forEach(b => b.onclick = () => { heroIndex = Number(b.dataset.heroIndex); renderHero(); });
  if (!heroTimer) heroTimer = setInterval(() => {
    if (document.hidden || currentPage !== "home" || modalStack.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if ($("appleHero").contains(document.activeElement)) return;
    heroIndex++; renderHero();
  }, 6500);
}

/* ---------- Bibliothèque ---------- */
const libraryFilters = ["filterType", "filterStatus", "filterGenre", "filterYear", "filterCinema", "filterCompany", "filterSort", "filterSearch"];
function sortEntries(list, mode) {
  const order = new Map(entries.map((e, i) => [e.id, i]));
  const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), "fr", { sensitivity: "base" });
  const sorters = {
    recent: (a, b) => (b.watchedAt || "").localeCompare(a.watchedAt || "") || byTitle(a, b),
    oldest: (a, b) => (a.watchedAt || "9999").localeCompare(b.watchedAt || "9999") || byTitle(a, b),
    added: (a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || order.get(a.id) - order.get(b.id),
    title: byTitle,
    release: (a, b) => (b.releaseDate || b.year || "").localeCompare(a.releaseDate || a.year || "") || byTitle(a, b)
  };
  return list.slice().sort(sorters[mode] || sorters.recent);
}
function drawLibrary() {
  const v = id => $(id).value;
  const type = v("filterType") || "all", status = v("filterStatus") || "all", genre = v("filterGenre") || "all", yr = v("filterYear") || "all";
  const cinema = v("filterCinema"), company = v("filterCompany"), q = normalize(v("filterSearch"));
  const base = e => (yr === "all" || yearOf(e) === yr) && (cinema === "all" || (cinema === "yes" ? !!e.cinema : !e.cinema)) && (company === "all" || e.company === company) && (!q || normalize(e.title).includes(q));
  const matchType = e => type === "all" || e.type === type;
  const matchStatus = e => status === "all" || e.status === status;
  const matchGenre = e => genre === "all" || (e.genres || []).includes(genre);

  // Les compteurs de chaque liste tiennent compte des autres filtres.
  const fill = (id, items, value, test) => {
    $(id).innerHTML = items.map(([val, label]) => '<option value="' + esc(val) + '">' + esc(label) + " (" + entries.filter(e => base(e) && test(e, val)).length + ")</option>").join("");
    $(id).value = items.some(([val]) => val === value) ? value : "all";
  };
  fill("filterType", [["all", "Films et séries"], ["movie", "Films"], ["tv", "Séries"]], type, (e, val) => (val === "all" || e.type === val) && matchStatus(e) && matchGenre(e));
  fill("filterStatus", [["all", "Toutes les catégories"], ...STATUS_ORDER.map(s => [s, STATUS_PLURAL[s]])], status, (e, val) => (val === "all" || e.status === val) && matchType(e) && matchGenre(e));
  const allGenres = [...new Set(entries.flatMap(e => e.genres || []))].sort((a, b) => a.localeCompare(b, "fr"));
  fill("filterGenre", [["all", "Tous les genres"], ...allGenres.map(g => [g, g])], genre, (e, val) => (val === "all" || (e.genres || []).includes(val)) && matchType(e) && matchStatus(e));

  const list = sortEntries(entries.filter(e => base(e) && matchType(e) && matchStatus(e) && matchGenre(e)), v("filterSort"));
  $("resultCount").textContent = plural(list.length, "résultat", "résultats");
  $("filterSummary").textContent = list.length === entries.length ? "Tous les éléments" : plural(list.length, "titre correspond", "titres correspondent") + " aux filtres";
  if (!list.length) { $("libraryList").innerHTML = '<div class="panel empty">Aucun titre ne correspond à ces filtres.</div>'; return; }
  $("libraryList").innerHTML = [["movie", "🎬 Films"], ["tv", "📺 Séries"]].map(([tp, tn]) => {
    const arr = list.filter(e => e.type === tp);
    if (!arr.length) return "";
    return '<div class="section"><div class="sectionhead"><span class="dot"></span><h2>' + tn + " (" + arr.length + ")</h2></div>"
      + STATUS_ORDER.map(st => { const g = arr.filter(e => e.status === st); return g.length ? '<div class="section"><div class="sectionhead"><span class="pill ' + st + '">' + STATUS_PLURAL[st] + "</span><span class=\"muted\">" + g.length + "</span></div>" + cardRow(g) + "</div>" : ""; }).join("")
      + "</div>";
  }).join("");
}
libraryFilters.forEach(id => $(id).addEventListener("input", drawLibrary));
$("resetFilters").onclick = () => { libraryFilters.forEach(id => { $(id).value = id === "filterSort" ? "recent" : id === "filterSearch" ? "" : "all"; }); drawLibrary(); };

/* ---------- À voir ---------- */
function drawTodo() {
  const arr = entries.filter(e => e.status === "todo");
  const sorted = arr.slice().sort((a, b) => (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999"));
  $("todoList").innerHTML = arr.length
    ? ["movie", "tv"].map(tp => { const g = sorted.filter(e => e.type === tp); return g.length ? '<div class="section"><div class="sectionhead"><span class="dot"></span><h3>' + (tp === "movie" ? "🎬 Films" : "📺 Séries") + " (" + g.length + ")</h3></div>" + cardRow(g) + "</div>" : ""; }).join("")
    : '<div class="empty">Ta liste est vide pour le moment. Ajoute un film ou une série à découvrir.</div>';
}

/* ---------- Statistiques et graphiques ---------- */
function drawStats() {
  const yr = $("statsYear").value, year = yr === "all" ? undefined : yr;
  const list = entries.filter(e => e.status !== "todo" && (yr === "all" || yearOf(e) === yr));
  const movies = list.filter(e => e.type === "movie"), series = list.filter(e => e.type === "tv");
  const count = (arr, f) => arr.filter(f).length;
  $("statsCards").innerHTML = counter("Films vus", movies.length, { type: "movie", year })
    + counter("Séries suivies", series.length, { type: "tv", year })
    + counter("En solo", count(list, e => e.company === "solo"), { company: "solo", year })
    + counter("À deux", count(list, e => e.company === "duo"), { company: "duo", year });

  $("statsCharts").innerHTML = list.length
    ? '<div class="viz">' + chartTimeline(list, yr) + '<div class="viz-grid">' + chartTime(movies, series) + chartGenres(list, year) + chartSplits(movies, list) + "</div></div>"
    : '<div class="panel empty">Pas encore de visionnage sur cette période : les graphiques apparaîtront ici.</div>';
  bindChartTooltips($("statsCharts"));

  const block = (title, items, type) => '<div class="panel"><h3>' + title + " (" + items.length + ')</h3><div class="stats">'
    + counter("✨ Découvertes", count(items, e => e.status === "watched"), { type, status: "watched", year })
    + counter("🔁 Revisionnages", count(items, e => e.status === "rewatch"), { type, status: "rewatch", year })
    + (type === "tv" ? counter("🆕 Nouveaux épisodes", count(items, e => e.status === "episodes"), { type, status: "episodes", year }) : "")
    + counter("👤 En solo", count(items, e => e.company === "solo"), { type, company: "solo", year })
    + counter("👥 À deux", count(items, e => e.company === "duo"), { type, company: "duo", year })
    + (type === "movie" ? counter("🎬 Vu au cinéma", count(items, e => e.cinema), { type, cinema: "yes", year }) : "")
    + "</div></div>";
  $("statsDetails").innerHTML = block("🎬 Films", movies, "movie") + block("📺 Séries", series, "tv")
    + '<div class="panel"><h3>🍿 Liste à voir</h3><div class="stats">'
    + counter("🎬 Films à voir", count(entries, e => e.status === "todo" && e.type === "movie"), { type: "movie", status: "todo" })
    + counter("📺 Séries à voir", count(entries, e => e.status === "todo" && e.type === "tv"), { type: "tv", status: "todo" })
    + "</div></div>";
}
$("statsYear").onchange = drawStats;

/* Barres empilées films / séries, par mois (année choisie) ou par année (toutes les années). */
function chartTimeline(list, yr) {
  let buckets;
  if (yr === "all") {
    const years = [...new Set(list.map(yearOf).filter(Boolean))].sort();
    buckets = years.map(y => ({ key: y, label: "’" + y.slice(2), full: y, test: e => yearOf(e) === y }));
  } else {
    buckets = MONTHS.map((m, i) => { const key = yr + "-" + String(i + 1).padStart(2, "0"); return { key, label: m.replace(".", ""), full: m + " " + yr, test: e => (e.watchedAt || "").startsWith(key) }; });
  }
  const rows = buckets.map(b => ({ ...b, films: list.filter(e => e.type === "movie" && b.test(e)).length, series: list.filter(e => e.type === "tv" && b.test(e)).length }));
  const max = Math.max(1, ...rows.map(r => r.films + r.series));
  const best = rows.reduce((a, r) => (r.films + r.series > a.films + a.series ? r : a), rows[0]);
  return '<div class="panel"><div class="chart-head"><h3>' + (yr === "all" ? "Visionnages par année" : "Visionnages par mois en " + yr) + '</h3><div class="legend"><span><i style="background:var(--films)"></i>Films</span><span><i style="background:var(--series)"></i>Séries</span></div></div>'
    + (best && best.films + best.series ? '<p class="muted" style="margin:0 0 12px">Record : <b style="color:var(--text)">' + esc(best.full) + "</b> avec " + plural(best.films + best.series, "visionnage", "visionnages") + ".</p>" : "")
    + '<div class="bars" role="img" aria-label="Histogramme des visionnages">'
    + rows.map((r, i) => {
      const total = r.films + r.series;
      const h = v => (v / max * 100).toFixed(2) + "%";
      return '<div class="bar" style="animation-delay:' + (i * 0.03).toFixed(2) + 's" data-tip="<b>' + esc(r.full) + "</b>Films : " + r.films + "<br>Séries : " + r.series + '">'
        + (total ? '<span class="val" style="bottom:calc(' + h(total) + ' + 3px)">' + total + "</span>" : "")
        + (r.films ? '<div class="seg films" style="height:' + h(r.films) + '"></div>' : "")
        + (r.series ? '<div class="seg series" style="height:' + h(r.series) + '"></div>' : "")
        + "</div>";
    }).join("") + "</div>"
    + '<div class="bar-labels" aria-hidden="true">' + rows.map(r => "<span>" + esc(r.label) + "</span>").join("") + "</div>"
    + '<details class="viz-table"><summary>Voir le tableau</summary><table><thead><tr><th>Période</th><th>Films</th><th>Séries</th><th>Total</th></tr></thead><tbody>'
    + rows.map(r => "<tr><td>" + esc(r.full) + "</td><td>" + r.films + "</td><td>" + r.series + "</td><td>" + (r.films + r.series) + "</td></tr>").join("") + "</tbody></table></details></div>";
}
function chartTime(movies, series) {
  const known = movies.filter(e => e.runtime > 0);
  const minutes = known.reduce((s, e) => s + Number(e.runtime), 0);
  const seriesKnown = series.filter(e => e.episodes > 0 && e.episodeRuntime > 0);
  const seriesMinutes = seriesKnown.reduce((s, e) => s + e.episodes * e.episodeRuntime, 0);
  const missing = movies.length - known.length;
  return '<div class="panel"><h3>⏱️ Temps devant l’écran</h3>'
    + '<div class="big-number">' + Math.round(minutes / 60) + "<small>h de films</small></div>"
    + '<p class="muted" style="margin:6px 0 14px">' + (known.length ? "Soit environ " + (minutes / 1440).toFixed(1).replace(".", ",") + " jours. Film moyen : " + formatHours(Math.round(minutes / known.length)) + "." : "Les durées arrivent au fil de la synchronisation avec TMDB.") + (missing > 0 ? " (" + plural(missing, "film", "films") + " sans durée connue)" : "") + "</p>"
    + (seriesKnown.length ? '<div class="big-number">' + Math.round(seriesMinutes / 60) + '<small>h de séries</small></div><p class="muted" style="margin:6px 0 0">Estimation si chaque série a été vue en entier (' + plural(seriesKnown.length, "série", "séries") + ").</p>" : "")
    + "</div>";
}
function chartGenres(list, year) {
  const counts = {};
  list.forEach(e => (e.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")).slice(0, 8);
  const max = Math.max(1, ...top.map(t => t[1]));
  const untagged = list.filter(e => !(e.genres || []).length).length;
  return '<div class="panel"><h3>🎭 Genres préférés</h3>'
    + (top.length ? '<div class="hbars">' + top.map(([g, n], i) => "<button type=\"button\" class=\"hbar\" data-filter='" + esc(JSON.stringify({ genre: g, year })) + "' data-tip=\"<b>" + esc(esc(g)) + "</b>" + plural(n, "titre", "titres") + '"><span>' + esc(g) + '</span><span class="track"><span class="fill" style="display:block;width:' + (n / max * 100).toFixed(1) + "%;animation-delay:" + (i * 0.05).toFixed(2) + 's"></span></span><b>' + n + "</b></button>").join("") + "</div>" : '<p class="muted">Les genres arrivent au fil de la synchronisation avec TMDB.</p>')
    + (untagged ? '<p class="muted" style="font-size:12px;margin:10px 0 0">' + plural(untagged, "titre", "titres") + " sans genre pour l’instant.</p>" : "")
    + "</div>";
}
function chartSplits(movies, list) {
  const split = (title, a, b, colorA, colorB, labelA, labelB) => {
    const total = a + b;
    if (!total) return "";
    const pa = Math.round(a / total * 100);
    return '<div style="margin-bottom:18px"><h3 style="font-size:14px">' + title + '</h3><div class="split" data-tip="<b>' + esc(title) + "</b>" + esc(labelA) + " : " + a + "<br>" + esc(labelB) + " : " + b + '"><div style="flex:' + a + ";background:" + colorA + '"></div><div style="flex:' + b + ";background:" + colorB + '"></div></div>'
      + '<div class="split-legend"><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + colorA + '"></i> ' + esc(labelA) + " · " + a + " (" + pa + ' %)</span><span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + colorB + '"></i> ' + esc(labelB) + " · " + b + " (" + (100 - pa) + " %)</span></div></div>";
  };
  const cinema = movies.filter(e => e.cinema).length;
  const duo = list.filter(e => e.company === "duo").length, solo = list.filter(e => e.company === "solo").length;
  const rewatch = list.filter(e => e.status === "rewatch").length;
  return '<div class="panel"><h3>📊 En un coup d’œil</h3>'
    + split("Films : salle ou maison ?", cinema, movies.length - cinema, "var(--films)", "#5b5b66", "Au cinéma", "À la maison")
    + split("Avec qui ?", duo, solo, "var(--series)", "#5b5b66", "À deux", "En solo")
    + split("Nouveautés ou revisionnages ?", list.length - rewatch, rewatch, "#9085e9", "#5b5b66", "Découvertes et épisodes", "Revisionnages")
    + "</div>";
}
function bindChartTooltips(root) {
  root.querySelectorAll("[data-tip]").forEach(el => {
    el.onmousemove = ev => showTooltip(el.dataset.tip, ev.clientX, ev.clientY);
    el.onmouseleave = hideTooltip;
  });
}

/* ---------- Ajout d'un titre ---------- */
let pendingEntry = null, pendingExistingId = null;
function openSearch() { openModal($("searchPanel")); }
$("searchOpen").onclick = openSearch;
$("addTodo").onclick = openSearch;

$("searchForm").onsubmit = async ev => {
  ev.preventDefault();
  const q = $("searchQuery").value.trim();
  if (!q) { notify("Saisis un titre à rechercher"); return; }
  const box = $("searchResults");
  box.innerHTML = '<p class="muted">Recherche en cours…</p>';
  try {
    const r = await fetch("/api/search?q=" + encodeURIComponent(q) + "&type=" + $("searchKind").value);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Recherche impossible");
    const results = (d.results || []).map(x => ({ ...x, genres: genresFromIds(x.genreIds) }));
    if (!results.length) { box.innerHTML = '<div class="empty">Aucun résultat trouvé.</div>'; return; }
    box.innerHTML = '<div class="cards">' + results.map((x, i) => {
      const dup = findDuplicate(x);
      return '<article class="item">' + posterImg(x, "poster", "w185") + '<div class="itembody"><h3>' + esc(x.title) + '</h3><p class="muted" style="margin:0">' + typeLabel(x) + (x.year ? " · " + esc(x.year) : "") + (x.genres.length ? " · " + esc(x.genres.slice(0, 3).join(", ")) : "") + "</p>"
        + (dup ? '<span class="pill">Déjà dans ta bibliothèque</span>' : "")
        + '<div class="itemactions"><button class="small" type="button" data-result="' + i + '" data-status="watched">＋ Découverte</button><button class="secondary small" type="button" data-result="' + i + '" data-status="rewatch">Revisionnage</button><button class="secondary small" type="button" data-result="' + i + '" data-status="todo">À voir</button></div></div></article>';
    }).join("") + "</div>";
    box.querySelectorAll("[data-result]").forEach(b => b.onclick = async () => {
      if (await addEntry(results[Number(b.dataset.result)], b.dataset.status)) closeModal($("searchPanel"));
    });
  } catch (e) {
    box.innerHTML = '<div class="empty">' + esc(e.message || "Erreur de recherche") + "</div>";
  }
};
$("manualAdd").onclick = async () => {
  const title = $("manualTitle").value.trim();
  if (!title) { notify("Saisis un titre"); return; }
  const year = $("manualYear").value.trim();
  if (year && !/^\d{4}$/.test(year)) { notify("L’année doit comporter 4 chiffres"); return; }
  const ok = await addEntry({ title, type: $("manualType").value, year, releaseDate: $("manualRelease").value }, $("manualStatus").value);
  if (!ok) return;
  ["manualTitle", "manualYear", "manualRelease"].forEach(id => { $(id).value = ""; });
  closeModal($("searchPanel"));
};

function findDuplicate(data) {
  const type = data.type || "movie";
  return entries.find(e => {
    if ((e.type || "movie") !== type) return false;
    const a = String(e.tmdbId || "").trim(), b = String(data.tmdbId || "").trim();
    if (a && b) return a === b;
    const sameTitle = normalize(e.title) === normalize(data.title) && normalize(data.title) !== "";
    return sameTitle && (!e.year || !data.year || String(e.year) === String(data.year));
  });
}
async function confirmDuplicate(data) {
  const existing = findDuplicate(data);
  if (!existing) return true;
  return ask({
    title: "Déjà présent",
    message: "« " + (data.title || "Ce titre") + " » est déjà " + (existing.status === "todo" ? "dans ta liste « À voir »" : "dans ta bibliothèque") + ". Veux-tu quand même l’ajouter ?",
    ok: "Ajouter quand même", cancel: "Annuler"
  });
}
async function addEntry(data, status = "todo") {
  if (!(await confirmDuplicate(data))) return false;
  openViewing(data, status, null);
  return true;
}

/* Fenêtre « Enregistrer l'œuvre » (nouvel ajout ou passage d'« À voir » à vu). */
function syncViewingFields() {
  const todo = $("viewingStatus").value === "todo";
  ["viewingDate", "viewingCinema", "viewingCompany"].forEach(id => { $(id).disabled = todo; });
  if (todo) { $("viewingDate").value = ""; $("viewingCinema").checked = false; }
  else if (!$("viewingDate").value) $("viewingDate").value = today();
}
function openViewing(data, status, existingId) {
  pendingEntry = { ...data };
  pendingExistingId = existingId;
  $("viewingWorkTitle").textContent = (data.title || "Nouvelle œuvre") + " · " + typeLabel(data);
  $("viewingStatus").value = status;
  $("viewingDate").value = status === "todo" ? "" : (existingId ? today() : data.watchedAt || today());
  $("viewingRelease").value = data.releaseDate || "";
  $("viewingCinema").checked = !!data.cinema;
  $("viewingCompany").value = data.company === "solo" ? "solo" : "duo";
  syncViewingFields();
  openModal($("viewingDialog"), { onClose: () => { pendingEntry = null; pendingExistingId = null; } });
}
$("viewingStatus").onchange = syncViewingFields;
$("confirmViewing").onclick = () => {
  if (!pendingEntry) return;
  const status = $("viewingStatus").value, watchedAt = status === "todo" ? "" : $("viewingDate").value;
  if (status !== "todo" && !watchedAt) { notify("Choisis la date du visionnage"); return; }
  const data = pendingEntry;
  const record = {
    tmdbId: data.tmdbId || "", type: data.type === "tv" ? "tv" : "movie", title: data.title, year: data.year || "",
    poster: data.poster || "", overview: String(data.overview || ""),
    genres: (data.genres && data.genres.length) ? data.genres : genresFromIds(data.genreIds),
    releaseDate: $("viewingRelease").value || data.releaseDate || "",
    status, watchedAt, cinema: status === "todo" ? false : $("viewingCinema").checked, company: status === "todo" ? "" : $("viewingCompany").value
  };
  const wasEditing = !!pendingExistingId;
  let saved;
  if (wasEditing) { saved = findEntry(pendingExistingId); if (saved) Object.assign(saved, record); }
  else { saved = { id: makeId(), addedAt: new Date().toISOString(), ...record }; entries.unshift(saved); }
  closeModal($("viewingDialog"));
  save();
  if (detailId) renderDetail();
  notify(wasEditing ? "Visionnage enregistré" : "Fiche enregistrée");
  if (saved) offerBetaSeries(saved);
  enrichSoon();
};

/* ---------- Modification ---------- */
let editingId = null, editPoster = "", editTmdbId = "";
function openEdit(e) {
  editingId = e.id; editPoster = e.poster || ""; editTmdbId = e.tmdbId || "";
  $("editTitle").value = e.title || "";
  $("editYear").value = e.year || "";
  $("editOverview").value = e.overview || e.description || "";
  $("editGenres").value = (e.genres || []).join(", ");
  $("editStatus").value = e.status || "todo";
  $("editWatchedAt").value = e.watchedAt || (e.status === "todo" ? "" : today());
  $("editWatchedAt").disabled = e.status === "todo";
  $("editCompany").value = e.company === "duo" ? "duo" : "solo";
  $("editPosterResults").innerHTML = "";
  $("editPosterFallback").classList.add("hidden");
  $("editPosterUrl").value = "";
  $("editPosterMessage").textContent = "";
  $("editPosterPreview").src = editPoster ? posterSrc(editPoster) : "";
  $("editPosterPreview").style.visibility = editPoster ? "visible" : "hidden";
  openModal($("editDialog"), { onClose: () => { editingId = null; } });
}
$("editStatus").onchange = () => {
  const todo = $("editStatus").value === "todo";
  $("editWatchedAt").disabled = todo;
  if (todo) $("editWatchedAt").value = ""; else if (!$("editWatchedAt").value) $("editWatchedAt").value = today();
};
$("editPosterSearch").onclick = async () => {
  const q = $("editTitle").value.trim();
  if (!q) { notify("Saisis un titre avant de rechercher"); return; }
  const e = findEntry(editingId);
  if (!e) return;
  $("editPosterMessage").textContent = "Recherche en cours sur TMDB…";
  try {
    const r = await fetch("/api/search?q=" + encodeURIComponent(q + ($("editYear").value.trim() ? " " + $("editYear").value.trim() : "")) + "&type=" + encodeURIComponent(e.type || "movie"));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Recherche impossible");
    const arr = d.results || [];
    if (!arr.length) { $("editPosterMessage").textContent = "Aucun résultat sur TMDB. Tu peux essayer Google Images ci-dessous."; $("editPosterFallback").classList.remove("hidden"); return; }
    const root = $("editPosterResults");
    root.innerHTML = arr.map((x, i) => '<button type="button" class="edit-poster-option" data-poster-index="' + i + '">' + (x.poster ? '<img src="' + esc(posterSrc(x.poster, "w185")) + '" alt="" loading="lazy">' : "<span>Pas d’affiche</span>") + "<span><b>" + esc(x.title) + "</b>" + (x.year ? " · " + esc(x.year) : "") + "</span></button>").join("");
    $("editPosterMessage").textContent = "Choisis une affiche, puis enregistre pour l’appliquer.";
    $("editPosterFallback").classList.remove("hidden");
    root.querySelectorAll("[data-poster-index]").forEach(b => b.onclick = () => {
      const x = arr[Number(b.dataset.posterIndex)];
      if (!x.poster) { notify("Ce résultat ne possède pas d’affiche"); return; }
      editPoster = x.poster; editTmdbId = x.tmdbId || "";
      root.querySelectorAll("button").forEach(y => y.classList.remove("selected"));
      b.classList.add("selected");
      $("editPosterPreview").src = posterSrc(x.poster); $("editPosterPreview").style.visibility = "visible";
      $("editPosterMessage").textContent = "Affiche sélectionnée : " + x.title;
    });
  } catch (err) { $("editPosterMessage").textContent = err.message || "Erreur TMDB"; }
};
$("editGoogleImages").onclick = () => {
  const q = $("editTitle").value.trim() + ($("editYear").value.trim() ? " " + $("editYear").value.trim() : "") + " affiche film série";
  window.open("https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(q), "_blank", "noopener");
};
$("editUsePosterUrl").onclick = () => {
  const url = $("editPosterUrl").value.trim();
  if (!/^https?:\/\//i.test(url)) { notify("Colle une adresse d’image commençant par https:// ou http://"); return; }
  editPoster = url; editTmdbId = "";
  $("editPosterPreview").src = url; $("editPosterPreview").style.visibility = "visible";
  $("editPosterMessage").textContent = "Lien d’affiche sélectionné. Enregistre pour l’appliquer.";
};
$("editSave").onclick = () => {
  const e = findEntry(editingId);
  if (!e) return;
  const title = $("editTitle").value.trim(), year = $("editYear").value.trim(), status = $("editStatus").value;
  if (!title) { notify("Le titre ne peut pas être vide"); return; }
  if (year && !/^\d{4}$/.test(year)) { notify("L’année doit comporter 4 chiffres"); return; }
  if (status !== "todo" && !$("editWatchedAt").value) { notify("Choisis la date du visionnage"); return; }
  const tmdbChanged = editTmdbId && editTmdbId !== e.tmdbId;
  Object.assign(e, {
    title, year, overview: $("editOverview").value.trim(), status,
    genres: normalizeGenres($("editGenres").value.split(",")),
    watchedAt: status === "todo" ? "" : $("editWatchedAt").value,
    company: status === "todo" ? "" : $("editCompany").value
  });
  if (status === "todo") e.cinema = false;
  if (editPoster) e.poster = editPoster;
  if (editTmdbId) e.tmdbId = editTmdbId;
  if (tmdbChanged) delete e.detailsAt; // nouvelles infos TMDB à récupérer
  closeModal($("editDialog"));
  save();
  if (detailId) renderDetail();
  notify("Fiche mise à jour");
  offerBetaSeries(e);
  if (tmdbChanged) enrichSoon();
};

/* ---------- Enrichissement automatique : genres, durées, synopsis (TMDB) ---------- */
let enriching = false, enrichTimer = null;
const enrichSoon = () => { clearTimeout(enrichTimer); enrichTimer = setTimeout(enrichLibrary, 1500); };
async function enrichLibrary() {
  if (enriching || !navigator.onLine) return;
  enriching = true;
  const queue = entries.filter(e => !e.detailsAt && e.title).slice(0, 30);
  let changed = 0;
  for (const e of queue) {
    const params = new URLSearchParams({ type: e.type === "tv" ? "tv" : "movie" });
    if (/^\d+$/.test(String(e.tmdbId || ""))) params.set("id", e.tmdbId);
    else { params.set("title", e.title); if (/^\d{4}$/.test(String(e.year || ""))) params.set("year", e.year); }
    try {
      const r = await fetch("/api/genres?" + params);
      if (r.status === 503 || r.status === 429 || r.status >= 500) break; // service indisponible : on réessaiera plus tard
      const d = await r.json();
      const target = findEntry(e.id);
      if (!target) continue;
      if (r.ok && d.matched) {
        if (d.genres && d.genres.length) target.genres = normalizeGenres(d.genres);
        if (d.runtime) target.runtime = d.runtime;
        if (d.episodeRuntime) target.episodeRuntime = d.episodeRuntime;
        if (d.episodes) target.episodes = d.episodes;
        if (d.seasons) target.seasons = d.seasons;
        if (!target.overview && d.overview) target.overview = d.overview;
        if (!target.poster && d.poster) target.poster = d.poster;
        if (!target.tmdbId && d.resolvedId) target.tmdbId = d.resolvedId;
      }
      target.detailsAt = today();
      changed++;
      if (changed % 5 === 0) persist();
    } catch { break; }
    await new Promise(res => setTimeout(res, 250));
  }
  enriching = false;
  if (changed) { persist(); render(); if (detailId) renderDetail(); }
}

/* ---------- Import / export ---------- */
$("exportBtn").onclick = () => {
  try {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "aldo-cine-bibliotheque-" + today() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { localStorage.setItem("aldoCineLastExport", today()); } catch { /* sans importance */ }
    notify("Export téléchargé");
  } catch { notify("Impossible de créer l’export"); }
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async ev => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data) || !data.every(x => x && typeof x === "object" && !Array.isArray(x) && typeof x.title === "string")) throw new Error("format");
    const yes = await ask({
      title: "Importer " + plural(data.length, "élément", "éléments") + " ?",
      message: "Les titres déjà présents seront mis à jour avec les informations du fichier, sans créer de doublons. Les nouveaux titres seront ajoutés.",
      ok: "Fusionner", cancel: "Annuler"
    });
    if (!yes) return;
    const validStatuses = STATUS_ORDER, validCompanies = ["solo", "duo"];
    const usedIds = new Set(entries.map(e => String(e.id)));
    let added = 0, updated = 0, skipped = 0;
    for (const item of data) {
      if (!item.title.trim()) { skipped++; continue; }
      const type = item.type === "tv" ? "tv" : "movie";
      const existing = findDuplicate({ ...item, type });
      if (existing) {
        let changed = false;
        const set = (field, value) => { if (JSON.stringify(existing[field]) !== JSON.stringify(value)) { existing[field] = value; changed = true; } };
        for (const field of ["title", "year", "poster", "overview", "releaseDate", "tmdbId"]) if (item[field] !== undefined && item[field] !== null && String(item[field]).trim() !== "") set(field, item[field]);
        for (const field of ["runtime", "episodeRuntime", "episodes", "seasons"]) if (Number(item[field]) > 0) set(field, Number(item[field]));
        if (Array.isArray(item.genres) && item.genres.length) set("genres", normalizeGenres(item.genres));
        if (validStatuses.includes(item.status)) set("status", item.status);
        if (typeof item.watchedAt === "string" && item.watchedAt.trim()) set("watchedAt", item.watchedAt);
        else if (item.status === "todo" && typeof item.watchedAt === "string") set("watchedAt", "");
        if (typeof item.cinema === "boolean") set("cinema", item.cinema);
        if (validCompanies.includes(item.company)) set("company", item.company);
        if (changed) updated++; else skipped++;
      } else {
        let id = String(item.id || "");
        if (!id || usedIds.has(id)) id = makeId();
        usedIds.add(id);
        entries.push({
          ...item, id, type,
          genres: Array.isArray(item.genres) ? normalizeGenres(item.genres) : [],
          status: validStatuses.includes(item.status) ? item.status : "todo",
          watchedAt: typeof item.watchedAt === "string" ? item.watchedAt : "",
          cinema: typeof item.cinema === "boolean" ? item.cinema : false,
          company: validCompanies.includes(item.company) ? item.company : ""
        });
        added++;
      }
    }
    save();
    notify(added + " ajouté(s), " + updated + " mis à jour, " + skipped + " inchangé(s)");
    enrichSoon();
  } catch { notify("Fichier JSON invalide ou incompatible"); }
  finally { ev.target.value = ""; }
};

/* ---------- Suggestions du jour ---------- */
const readSuggestionHistory = () => { try { const x = JSON.parse(localStorage.getItem(SUGGESTIONS_KEY) || "{}"); return x && typeof x === "object" ? x : {}; } catch { return {}; } };
function suggestionHash(value) { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function suggestionCard(item, label, key) {
  const genres = item.genres && item.genres.length ? item.genres : genresFromIds(item.genreIds);
  return '<article class="item suggestion-card">' + posterImg(item, "poster", "w342")
    + '<div class="itembody"><span class="pill">' + label + "</span><h3>" + esc(item.title || "Sans titre") + '</h3><p class="muted">' + (item.year ? esc(item.year) + " · " : "") + typeLabel(item) + (genres.length ? " · " + esc(genres.slice(0, 3).join(", ")) : "") + "</p>"
    + '<p class="muted">' + esc(item.overview || "Une découverte à explorer.") + "</p>"
    + '<div class="itemactions"><button type="button" data-daily-suggestion="' + key + '">＋ Ajouter dans À voir</button><a class="secondary" style="padding:10px 14px;border-radius:999px;border:1px solid #3b3b42;text-decoration:none;font-weight:700;font-size:13px" href="' + esc(tmdbUrl(item)) + '" target="_blank" rel="noopener noreferrer">TMDB ↗</a></div></div></article>';
}
async function addSuggestionToTodo(item) {
  if (!(await confirmDuplicate(item))) return;
  entries.unshift({
    id: makeId(), addedAt: new Date().toISOString(), tmdbId: item.tmdbId || "", type: item.type === "tv" ? "tv" : "movie", title: item.title || "", year: item.year || "",
    poster: item.poster || "", overview: String(item.overview || ""), genres: item.genres && item.genres.length ? item.genres : genresFromIds(item.genreIds),
    releaseDate: item.releaseDate || "", status: "todo", watchedAt: "", cinema: false, company: ""
  });
  save();
  notify("Ajouté dans À voir");
  enrichSoon();
}
function renderDailySuggestions(pair) {
  $("suggestionsStatus").textContent = "Tes deux idées du jour";
  const grid = $("suggestionsGrid");
  grid.innerHTML = suggestionCard(pair.movie, "🎬 Film du jour", "movie") + suggestionCard(pair.tv, "📺 Série du jour", "tv");
  grid.querySelectorAll("[data-daily-suggestion]").forEach(b => b.onclick = () => addSuggestionToTodo(b.dataset.dailySuggestion === "movie" ? pair.movie : pair.tv));
}
async function drawSuggestions() {
  const status = $("suggestionsStatus"), grid = $("suggestionsGrid"), day = today();
  $("suggestionsDate").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  grid.innerHTML = "";
  status.textContent = "Recherche de deux idées à partir de ta bibliothèque…";
  const history = readSuggestionHistory(), cached = history[day];
  if (cached && cached.movie && cached.tv) { renderDailySuggestions(cached); return; }
  const library = entries.filter(e => /^\d+$/.test(String(e.tmdbId || ""))).slice(0, 18).map(e => ({ id: String(e.tmdbId), type: e.type === "tv" ? "tv" : "movie", status: e.status || "todo" }));
  const excluded = entries.filter(e => e.tmdbId).map(e => (e.type === "tv" ? "tv" : "movie") + ":" + e.tmdbId);
  Object.keys(history).sort().slice(-30).forEach(d => { const p = history[d] || {}; ["movie", "tv"].forEach(t => { if (p[t] && p[t].tmdbId) excluded.push(t + ":" + p[t].tmdbId); }); });
  try {
    const response = await fetch("/api/suggestions?items=" + encodeURIComponent(JSON.stringify(library)) + "&exclude=" + encodeURIComponent([...new Set(excluded)].join(",")));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible de préparer les suggestions");
    const pick = (arr, type) => {
      const unique = (Array.isArray(arr) ? arr : []).filter((x, i, a) => x && x.tmdbId && a.findIndex(y => String(y.tmdbId) === String(x.tmdbId)) === i);
      if (!unique.length) return null;
      return unique[suggestionHash(day + ":" + type + ":" + entries.map(e => (e.type || "") + ":" + (e.tmdbId || e.title)).join("|")) % unique.length];
    };
    const pair = { date: day, movie: pick(data.movie, "movie"), tv: pick(data.tv, "tv") };
    if (!pair.movie || !pair.tv) throw new Error("Je n’ai pas trouvé assez de suggestions. Ajoute quelques titres depuis TMDB, puis réessaie.");
    history[day] = pair;
    const keys = Object.keys(history).sort();
    while (keys.length > 45) delete history[keys.shift()];
    try { localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(history)); } catch { /* sans importance */ }
    renderDailySuggestions(pair);
  } catch (error) {
    status.textContent = error.message || "Erreur pendant la recherche.";
    grid.innerHTML = '<button class="secondary" id="retrySuggestions" type="button">Réessayer</button>';
    $("retrySuggestions").onclick = drawSuggestions;
  }
}

/* ---------- Rendu global et démarrage ---------- */
["manualStatus", "viewingStatus", "editStatus"].forEach(id => { $(id).innerHTML = statusOptions(); });
function render() {
  fillYears();
  renderHome();
  drawLibrary();
  drawTodo();
  if (currentPage === "stats") drawStats();
}

/* Interface publique utilisée par wrapped.js */
window.AldoCine = { get entries() { return entries; }, openModal, closeModal, posterSrc, today };

render();
{ // Raccourcis de l'application installée (?page=todo, ?page=stats)
  const start = new URLSearchParams(location.search).get("page");
  if (["library", "todo", "suggestions", "stats"].includes(start)) go(start);
}
setTimeout(enrichLibrary, 2500);
window.addEventListener("online", enrichSoon);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
