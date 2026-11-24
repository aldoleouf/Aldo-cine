/* Aldo Ciné — effets visuels :
   - couleur d'ambiance tirée de l'affiche à la une ;
   - effet de profondeur (souris sur ordinateur, gyroscope sur téléphone) ;
   - ticket de cinéma imprimé puis déchiré.
   Tout est désactivé si l'appareil demande de réduire les animations. */
"use strict";
(() => {
  const app = window.AldoCine;
  if (!app) return;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  /* ---------- Couleur d'ambiance ---------- */
  const colorCache = new Map();
  let ambientToken = 0;
  function dominantColor(src) {
    if (colorCache.has(src)) return Promise.resolve(colorCache.get(src));
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        try {
          const size = 24, c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          const px = ctx.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, w = 0;
          for (let i = 0; i < px.length; i += 4) {
            const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2]);
            const weight = 1 + (max - min) / 32; // les pixels colorés comptent davantage que les gris
            r += px[i] * weight; g += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
          }
          const color = moody(r / w, g / w, b / w);
          colorCache.set(src, color);
          resolve(color);
        } catch { resolve(null); } // image non lisible (CORS)
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  /* Assombrit et sature la couleur pour qu'elle reste une lueur discrète derrière le texte. */
  function moody(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return "hsl(" + Math.round(h) + " " + Math.round(Math.min(0.62, s * 1.25) * 100) + "% " + Math.round(Math.max(0.2, Math.min(0.3, l * 0.6)) * 100) + "%)";
  }
  async function ambient(poster) {
    const token = ++ambientToken;
    const src = poster ? app.posterSrc(poster, "w92") : "";
    const color = src ? await dominantColor(src) : null;
    if (token !== ambientToken) return;
    root.style.setProperty("--ambient", color || "#303039");
    document.dispatchEvent(new CustomEvent("aldo:ambient", { detail: color }));
  }

  /* ---------- Effet de profondeur à la souris ---------- */
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let tilted = null;
  function setTilt(el, x, y, strength) {
    // x et y entre -1 et 1
    el.style.setProperty("--rx", (-y * strength).toFixed(2) + "deg");
    el.style.setProperty("--ry", (x * strength).toFixed(2) + "deg");
    el.style.setProperty("--gx", ((x + 1) * 50).toFixed(1) + "%");
    el.style.setProperty("--gy", ((y + 1) * 50).toFixed(1) + "%");
    el.style.setProperty("--glare", "1");
  }
  function resetTilt(el) {
    if (!el) return;
    el.classList.remove("tilting");
    ["--rx", "--ry", "--glare"].forEach(p => el.style.removeProperty(p));
  }
  document.addEventListener("pointermove", ev => {
    if (!fine.matches || reduced() || ev.pointerType !== "mouse") return;
    const el = ev.target.closest && ev.target.closest("[data-tilt]");
    if (el !== tilted) { resetTilt(tilted); tilted = el; }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1, y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    el.classList.add("tilting");
    setTilt(el, Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)), el.dataset.tilt === "soft" ? 2.5 : 9);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { resetTilt(tilted); tilted = null; });

  /* ---------- Effet de profondeur au gyroscope (téléphone) ---------- */
  let gyroOn = false, gyroFrame = 0, lastOrientation = null, baseline = null;
  function onOrientation(ev) {
    if (ev.beta == null || ev.gamma == null) return;
    if (!baseline) baseline = { beta: ev.beta, gamma: ev.gamma };
    // la position de départ sert de référence ; elle suit lentement la façon dont on tient le téléphone
    baseline.beta += (ev.beta - baseline.beta) * 0.01;
    baseline.gamma += (ev.gamma - baseline.gamma) * 0.01;
    lastOrientation = ev;
    if (gyroFrame) return;
    gyroFrame = requestAnimationFrame(() => {
      gyroFrame = 0;
      if (reduced()) return;
      const x = Math.max(-1, Math.min(1, (lastOrientation.gamma - baseline.gamma) / 20));
      const y = Math.max(-1, Math.min(1, (lastOrientation.beta - baseline.beta) / 20));
      document.querySelectorAll("[data-gyro]").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        el.classList.add("tilting");
        setTilt(el, x, y, el.dataset.tilt === "soft" ? 3 : 10);
      });
    });
  }
  function startGyro() {
    if (gyroOn || fine.matches || reduced() || !("DeviceOrientationEvent" in window)) return;
    const begin = () => { gyroOn = true; window.addEventListener("deviceorientation", onOrientation, { passive: true }); };
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // iPhone : l'autorisation doit être demandée pendant un geste ; on ne la redemande pas si elle a été refusée.
      let refused = false;
      try { refused = localStorage.getItem("aldoCineGyro") === "denied"; } catch { /* sans importance */ }
      if (refused) return;
      DeviceOrientationEvent.requestPermission().then(state => {
        if (state === "granted") begin();
        else try { localStorage.setItem("aldoCineGyro", "denied"); } catch { /* sans importance */ }
      }).catch(() => {});
    } else begin();
  }
  document.addEventListener("touchend", startGyro, { once: true, passive: true });

  /* ---------- Ticket de cinéma ---------- */
  let ticketBusy = Promise.resolve();
  function ticket(entry) {
    ticketBusy = ticketBusy.then(() => printTicket(entry));
    return ticketBusy;
  }
  async function printTicket(entry) {
    if (reduced() || !Element.prototype.animate) { app.notify("🎟️ Ticket ajouté à ta collection"); return; }
    const fx = document.createElement("div");
    fx.className = "ticket-fx";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML = '<div class="ticket-slot"></div><div class="ticket-clip">' + app.ticketHtml(entry) + "</div>";
    document.body.appendChild(fx);
    const slot = fx.querySelector(".ticket-slot"), clip = fx.querySelector(".ticket-clip");
    const t = fx.querySelector(".ticket"), main = fx.querySelector(".ticket-main"), stub = fx.querySelector(".ticket-stub");
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
      slot.animate([{ opacity: 0, transform: "translateX(-50%) scaleX(.6)" }, { opacity: 1, transform: "translateX(-50%) scaleX(1)" }], { duration: 220, easing: "ease-out", fill: "forwards" });
      // impression : le ticket sort de la fente par à-coups
      await t.animate([
        { transform: "translateY(-105%)" }, { transform: "translateY(-80%)", offset: .18 }, { transform: "translateY(-78%)", offset: .26 },
        { transform: "translateY(-52%)", offset: .45 }, { transform: "translateY(-50%)", offset: .53 }, { transform: "translateY(-22%)", offset: .74 },
        { transform: "translateY(-20%)", offset: .82 }, { transform: "translateY(0)" }
      ], { duration: 1100, easing: "linear", fill: "forwards" }).finished;
      clip.style.overflow = "visible";
      await wait(450);
      // déchirure : la partie principale tombe, le talon se détache
      stub.style.borderLeftColor = "transparent";
      const fall = main.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: "translate(-6px,4px) rotate(-3deg)", opacity: 1, offset: .2 },
        { transform: "translate(-40px,60vh) rotate(-24deg)", opacity: 0 }
      ], { duration: 900, easing: "cubic-bezier(.5,0,.8,.6)", fill: "forwards" });
      await stub.animate([
        { transform: "translate(0,0) rotate(0)" }, { transform: "translate(10px,-6px) rotate(7deg)" }
      ], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)", fill: "forwards" }).finished;
      slot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      await wait(250);
      // le talon s'envole vers « Statistiques », où vit la collection de tickets
      const target = document.querySelector('#nav [data-page="stats"]');
      const from = stub.getBoundingClientRect();
      const to = target ? target.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight, width: 0, height: 0 };
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      await stub.animate([
        { transform: "translate(10px,-6px) rotate(7deg) scale(1)", opacity: 1 },
        { transform: "translate(" + (dx * 0.35 + 30) + "px," + (dy * 0.15 - 40) + "px) rotate(-10deg) scale(.8)", opacity: 1, offset: .4 },
        { transform: "translate(" + dx + "px," + dy + "px) rotate(15deg) scale(.15)", opacity: .2 }
      ], { duration: 850, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" }).finished;
      fall.cancel();
      if (target) { target.classList.remove("nav-bump"); void target.offsetWidth; target.classList.add("nav-bump"); }
      app.notify("🎟️ Ticket ajouté à ta collection (Statistiques)");
    } finally {
      fx.remove();
    }
  }

  /* ---------- Fiche : petit effet de profondeur à l'ouverture ---------- */
  function onDetailOpen() {
    if (reduced()) return;
    const wrap = document.querySelector("#detailContent .detail-poster-wrap");
    if (!wrap) return;
    wrap.animate([{ transform: "perspective(700px) rotateY(-14deg) rotateX(6deg)" }, { transform: "perspective(700px) rotateY(0) rotateX(0)" }], { duration: 900, delay: 250, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visiblePage = () => document.querySelector(".page:not(.hidden)");
  const cardOf = id => { const page = visiblePage(); return page ? page.querySelector('.item[data-open="' + CSS.escape(String(id)) + '"]') : null; };

  /* ---------- Mise en rayon : l'affiche vole jusqu'à sa place, les autres se poussent ---------- */
  function snapshot() {
    const page = visiblePage(), map = new Map();
    if (!page) return map;
    page.querySelectorAll(".item[data-open]").forEach(el => {
      const row = el.closest(".cards");
      map.set(el.dataset.open + "|" + (row ? [...page.querySelectorAll(".cards")].indexOf(row) : -1), el.getBoundingClientRect());
    });
    return map;
  }
  function pushOthers(before, newId) {
    const page = visiblePage();
    if (!page || !before) return;
    const rows = [...page.querySelectorAll(".cards")];
    page.querySelectorAll(".item[data-open]").forEach(el => {
      if (el.dataset.open === String(newId)) return;
      const old = before.get(el.dataset.open + "|" + rows.indexOf(el.closest(".cards")));
      if (!old) return;
      el.style.animation = "none"; // pas d'apparition en fondu pour les cartes déjà là
      const now = el.getBoundingClientRect(), dx = old.left - now.left, dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "translate(0,0)" }], { duration: 520, delay: 120, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    });
  }
  async function shelve(entry, source, before) {
    if (reduced() || !Element.prototype.animate || !entry) return;
    let card = cardOf(entry.id);
    pushOthers(before, entry.id);
    let target;
    if (card) {
      const r0 = card.getBoundingClientRect();
      if (r0.top < 0 || r0.bottom > window.innerHeight) { card.scrollIntoView({ block: "center", behavior: "smooth" }); await sleep(380); }
      card.style.opacity = "0";
      target = (card.querySelector(".poster-wrap") || card).getBoundingClientRect();
    } else {
      const tab = document.querySelector('#nav [data-page="' + (entry.status === "todo" ? "todo" : "library") + '"]');
      if (!tab) return;
      const t = tab.getBoundingClientRect();
      target = { left: t.left + t.width / 2 - 14, top: t.top + 4, width: 28, height: 42 };
    }
    const start = source ? source.rect : { left: window.innerWidth / 2 - 60, top: window.innerHeight / 2 - 90, width: 120, height: 180 };
    const src = (source && source.src) || app.posterSrc(entry.poster, "w342");
    const ghost = document.createElement(src ? "img" : "div");
    if (src) ghost.src = src; else { ghost.textContent = entry.title; ghost.className = "poster-fallback"; }
    ghost.className += " shelve-ghost";
    Object.assign(ghost.style, { left: start.left + "px", top: start.top + "px", width: start.width + "px", height: start.height + "px" });
    document.body.appendChild(ghost);
    const sx = target.width / start.width, sy = target.height / start.height;
    const dx = target.left - start.left, dy = target.top - start.top;
    const lift = Math.min(160, Math.abs(dy) * 0.35 + 60);
    try {
      await ghost.animate([
        { transform: "translate(0,0) scale(1) rotate(0)", boxShadow: "0 10px 30px #0008" },
        { transform: "translate(" + dx * 0.45 + "px," + (dy * 0.45 - lift) + "px) scale(" + (1 + sx) / 1.6 + "," + (1 + sy) / 1.6 + ") rotate(-6deg)", boxShadow: "0 40px 60px #000c", offset: 0.5 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ") rotate(0)", boxShadow: "0 6px 14px #0006" }
      ], { duration: 820, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" }).finished;
    } finally { ghost.remove(); }
    card = cardOf(entry.id) || card;
    if (card && document.contains(card)) {
      card.style.opacity = "";
      card.style.animation = "none";
      card.animate([{ transform: "scale(.94)" }, { transform: "scale(1.03)", offset: 0.55 }, { transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
    } else {
      const tab = document.querySelector('#nav [data-page="' + (entry.status === "todo" ? "todo" : "library") + '"]');
      if (tab) { tab.classList.remove("nav-bump"); void tab.offsetWidth; tab.classList.add("nav-bump"); }
    }
  }

  /* ---------- Tampon « VU » quand un titre de la liste À voir est marqué comme vu ---------- */
  async function stamp(id, inDetail) {
    if (reduced() || !Element.prototype.animate) return;
    const card = inDetail ? null : cardOf(id);
    const target = inDetail ? document.querySelector("#detailContent .detail-poster-wrap") : card && card.querySelector(".poster-wrap");
    if (!target) return;
    const r = target.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const el = document.createElement("div");
    el.className = "stamp-fx";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    const d = new Date();
    el.innerHTML = '<div class="stamp"><b>VU</b><small>' + String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + "</small></div>";
    document.body.appendChild(el);
    const mark = el.firstChild;
    await mark.animate([
      { transform: "scale(2.8) rotate(-2deg)", opacity: 0, filter: "blur(4px)" },
      { transform: "scale(.9) rotate(-14deg)", opacity: 1, filter: "blur(0)", offset: 0.7 },
      { transform: "scale(1) rotate(-12deg)", opacity: 1, filter: "blur(0)" }
    ], { duration: 340, easing: "cubic-bezier(.6,0,.9,.6)", fill: "forwards" }).finished;
    // impact : la carte tremble, l'encre s'étale
    (card || target).animate([{ transform: "translate(0,0)" }, { transform: "translate(-3px,2px)" }, { transform: "translate(3px,-1px)" }, { transform: "translate(-1px,1px)" }, { transform: "translate(0,0)" }], { duration: 240, easing: "linear" });
    el.animate([{ boxShadow: "inset 0 0 0 0 #ff2d5500" }, { boxShadow: "inset 0 0 60px 10px #ff2d5533" }, { boxShadow: "inset 0 0 0 0 #ff2d5500" }], { duration: 600 });
    await sleep(750);
    if (card) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      await card.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.82) translateY(10px)", opacity: 0 }], { duration: 320, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }).finished;
      el.remove();
    } else {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 250, fill: "forwards" }).finished.then(() => el.remove());
    }
  }

  /* ---------- Machine à sous des suggestions du jour ---------- */
  async function spin(grid) {
    const cards = [...grid.querySelectorAll(".suggestion-card.spinning")];
    await Promise.all(cards.map(async (card, i) => {
      const reel = card.querySelector(".reel"), strip = reel && reel.querySelector(".reel-strip");
      if (!strip) { card.classList.remove("spinning"); return; }
      const h = reel.clientHeight, n = strip.children.length, end = -(n - 1) * h;
      await sleep(i * 120);
      await strip.animate([
        { transform: "translateY(0)", filter: "blur(0)" },
        { transform: "translateY(" + (-h * 1.2) + "px)", filter: "blur(3px)", offset: 0.12 },
        { transform: "translateY(" + (end - h * 0.14) + "px)", filter: "blur(.6px)", offset: 0.88 },
        { transform: "translateY(" + end + "px)", filter: "blur(0)" }
      ], { duration: 2100 + i * 750, easing: "cubic-bezier(.3,.1,.2,1)", fill: "forwards" }).finished;
      card.classList.remove("spinning");
      card.classList.add("jackpot");
      card.animate([{ transform: "scale(1)" }, { transform: "scale(1.025)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    }));
  }

  app.fx = { ambient, ticket, onDetailOpen, snapshot, shelve, stamp, spin };
  // l'affiche à la une a déjà été affichée avant le chargement de ce fichier
  const firstHero = app.entries.length ? document.querySelector("#appleHero .ac-hero-main") : null;
  if (firstHero) { const cur = document.querySelector("#appleHero [data-open]"); const e = cur && app.entries.find(x => String(x.id) === cur.dataset.open); if (e) ambient(e.poster); }
})();
