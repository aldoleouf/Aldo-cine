/* Aldo Ciné Wrapped — rétrospective d'une année ou d'une période. */
"use strict";
(() => {
  const app = window.AldoCine;
  const $ = id => document.getElementById(id);
  const page = $("aldoWrappedPage");
  if (!app || !page) return;

  let slides = [], index = 0;
  const key = e => String(e.tmdbId || e.title || "").toLowerCase().trim();
  const unique = arr => { const seen = new Set(); return arr.filter(e => { const k = key(e); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
  const dateOf = e => String(e.watchedAt || "").slice(0, 10);
  const years = () => [...new Set(app.entries.map(e => dateOf(e).slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort((a, b) => b.localeCompare(a));
  const posterUrl = e => app.posterSrc(e.poster, "w342");

  function period() {
    if ($("awMode").value === "year") { const y = $("awYear").value; return [y + "-01-01", y + "-12-31", y]; }
    return [$("awStart").value, $("awEnd").value, "Période personnalisée"];
  }
  function note(text) { $("awNote").textContent = text; $("awNote").classList.toggle("hidden", !text); }

  function topGenre(items) {
    const counts = {};
    items.forEach(e => (e.genres || []).forEach(g => { counts[g] = (counts[g] || 0) + 1; }));
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best : null;
  }

  function makeSlides() {
    const [start, end, label] = period();
    if (!start || !end || start > end) { note("Choisis une période valide."); return; }
    const all = unique(app.entries.filter(e => e.status !== "todo" && dateOf(e) && dateOf(e) >= start && dateOf(e) <= end));
    note(all.length ? "" : "Aucun visionnage enregistré sur cette période.");
    const series = all.filter(e => e.type === "tv"), movies = all.filter(e => e.type !== "tv");
    const by = (arr, f) => arr.filter(f);
    const periodText = $("awMode").value === "year" ? "en " + label : "sur la période";
    const minutes = movies.reduce((s, e) => s + (Number(e.runtime) || 0), 0);
    const genre = topGenre(all);
    const defs = [
      ["Séries", series, [[series.length, "séries vues " + periodText], [by(series, e => e.company === "solo").length, "en solo"], [by(series, e => e.company === "duo").length, "avec Emma"]], "#9ee7ff", "À ce rythme-là, le canapé va finir par demander une carte de fidélité."],
      ["Séries", series, [[by(series, e => e.status !== "rewatch" && e.status !== "watched").length, "séries continuées"], [by(series, e => e.status === "watched").length, "découvertes"], [by(series, e => e.status === "rewatch").length, "recommencées"]], "#d9b4ff", "Entre les découvertes et les retours, tu connais mieux les génériques que les prénoms de tes voisins."],
      ["Films", movies, [[movies.length, "films vus " + periodText], [by(movies, e => e.company === "duo").length, "avec Emma"], [by(movies, e => e.company === "solo").length, "tout seul"]], "#ffd18a", "Le pop-corn n’a pas demandé autant de congés, mais il a bien suivi."],
      ["Films", movies, [[by(movies, e => e.status === "rewatch").length, "revisionnages"], [by(movies, e => e.status === "watched").length, "découvertes"], [by(movies, e => !!e.cinema).length, "vus au cinéma"]], "#ff9fbd", "Tu explores, tu revois, tu vas au cinéma : les plateformes commencent à prendre des notes."]
    ];
    if (minutes || genre) {
      const stats = [];
      if (minutes) stats.push([Math.round(minutes / 60), "heures de films"]);
      if (genre) stats.push([genre[1], "titres « " + genre[0] + " », ton genre n°1"]);
      defs.push(["Ton profil", all.filter(e => !genre || (e.genres || []).includes(genre[0])), stats, "#a8f0c6", minutes > 6000 ? "Plus de cent heures : à ce stade, ce n’est plus un loisir, c’est une filmographie." : "Chaque minute comptait, surtout celles du générique de fin."]);
    }
    slides = defs.map(([group, items, stats, color, desc]) => ({ group, items: unique(items), stats, color, desc }));
    index = 0;
    render();
  }

  function render() {
    const x = slides[index];
    if (!x) return;
    $("awGroup").textContent = x.group;
    $("awDesc").style.color = x.color;
    $("awStats").style.setProperty("--aw-text-color", x.color);
    $("awStats").innerHTML = x.stats.map(([n, label], i) => '<div class="aw-stat' + (i === 0 ? " primary" : "") + '"><strong>' + Number(n).toLocaleString("fr-FR") + "</strong>" + label.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + "</div>").join("");
    $("awDesc").textContent = x.desc;
    [$("awGalleryInside"), $("awGallery")].forEach(gallery => {
      gallery.innerHTML = "";
      x.items.filter(posterUrl).forEach(e => {
        const img = document.createElement("img");
        img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.src = posterUrl(e);
        img.onerror = () => img.remove();
        gallery.appendChild(img);
      });
    });
    $("awDots").innerHTML = slides.map((_, i) => '<span class="' + (i === index ? "active" : "") + '"></span>').join("");
    $("awPrev").disabled = index === 0;
    $("awNext").disabled = index === slides.length - 1;
  }

  function open() {
    const ys = years(), now = new Date(), current = String(now.getFullYear());
    $("awYear").innerHTML = (ys.length ? ys : [current]).map(y => '<option value="' + y + '">' + y + "</option>").join("");
    $("awYear").value = ys.includes(current) ? current : (ys[0] || current);
    if (!$("awStart").value) $("awStart").value = current + "-01-01";
    if (!$("awEnd").value) $("awEnd").value = app.today();
    app.openModal(page);
    makeSlides();
  }

  $("openAldoWrapped").onclick = open;
  $("awMode").onchange = () => {
    $("awYearField").classList.toggle("hidden", $("awMode").value !== "year");
    $("awRange").classList.toggle("hidden", $("awMode").value !== "range");
    makeSlides();
  };
  ["awYear", "awStart", "awEnd"].forEach(id => { $(id).onchange = makeSlides; });
  $("awPrev").onclick = () => { if (index > 0) { index--; render(); } };
  $("awNext").onclick = () => { if (index < slides.length - 1) { index++; render(); } };
  page.addEventListener("keydown", ev => {
    if (ev.target.matches("select,input")) return;
    if (ev.key === "ArrowRight") $("awNext").click();
    if (ev.key === "ArrowLeft") $("awPrev").click();
  });
})();
