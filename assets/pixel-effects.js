/* Aldo Ciné — effets pixel art (pixelfx, voir assets/pixelfx.js) :
   - rideau à lamelles qui s'ouvre au lancement de l'application ;
   - rayons de lumière sur l'affiche à la une, teintés par sa couleur d'ambiance ;
   - extinction façon vieille télé quand on ferme la fiche d'une série.
   Rien ne s'anime si l'appareil demande de réduire les animations. */
"use strict";
(() => {
  const PX = window.PixelFX;
  if (!PX) return;
  const W = 320, H = 180;
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Une scène : un canvas 320×180 agrandi en pixels nets, animé à 30 images/s tant que visible() le permet. */
  function scene(mod, opts, className, visible) {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.className = "pfx " + className;
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    const frame = PX.createFrame(W, H), img = ctx.createImageData(W, H);
    const fx = PX.createFx(mod, opts);
    let raf = 0, last = 0, acc = 0;
    function paint() {
      PX.clearFrame(frame);
      fx.draw(frame);
      PX.composite(frame, img.data, null);
      ctx.putImageData(img, 0, 0);
    }
    function tick(now) {
      raf = 0;
      if (!visible() || reduced()) { last = 0; return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now; acc += dt;
      if (acc >= 1 / 31 || !dt) { fx.update(acc); acc = 0; paint(); }
      raf = requestAnimationFrame(tick);
    }
    return {
      canvas, fx,
      start() { if (!raf && !reduced()) raf = requestAnimationFrame(tick); },
      stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; },
    };
  }

  /* ---------- Rideau à lamelles au lancement ---------- */
  // une fois par session : à l'ouverture de l'application, pas à chaque changement de page
  function curtain() {
    try { if (sessionStorage.getItem("aldo-curtain")) return; sessionStorage.setItem("aldo-curtain", "1"); } catch { /* stockage bloqué */ }
    if (reduced()) return;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.className = "pfx pfx-curtain";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d"), frame = PX.createFrame(W, H), img = ctx.createImageData(W, H);
    // velours rouge, lumière dorée qui passe entre les lamelles
    const fx = PX.createFx(PX.blinds, { color: "#050506", palette: ["#12040a", "#2a0812", "#4a0f1c", "#7a1a2a", "#b0303c", "#f0a060", "#ffe0a0", "#ffffff"] });
    fx.update(0.95); // les lamelles sont déjà fermées : l'appli est cachée dès la première image
    const HOLD = 0.35;
    let held = 0, last = 0, done = false;
    function end() {
      if (done) return;
      done = true;
      canvas.remove();
    }
    canvas.addEventListener("pointerdown", end);
    function tick(now) {
      if (done) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (held < HOLD) held += dt; else fx.update(dt);
      PX.clearFrame(frame);
      fx.draw(frame);
      PX.composite(frame, img.data, null);
      ctx.putImageData(img, 0, 0);
      if (fx.done()) end(); else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(end, 4000); // filet de sécurité si l'onglet est en arrière-plan
  }

  /* ---------- Rayons de lumière sur l'affiche à la une ---------- */
  const hex = (r, g, b) => "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
    return [f(0), f(8), f(4)];
  }
  const GOLD = [[26, 18, 8], [58, 40, 16], [122, 90, 36], [200, 154, 68], [242, 210, 122], [255, 242, 196], [255, 255, 255]];
  // une rampe du sombre au blanc dans la teinte de l'affiche (dorée si l'affiche n'a pas de couleur lisible)
  function rampFor(color) {
    const m = /hsl\((\d+)\s+(\d+)%/.exec(color || "");
    if (!m) return GOLD;
    const h = +m[1], s = Math.min(85, +m[2] + 20);
    return [6, 14, 28, 48, 68, 86].map(l => hsl(h, s, l)).concat([[255, 255, 255]]);
  }
  let rays = null, rampFrom = GOLD, rampTo = GOLD, rampT = 1;
  const home = document.getElementById("home"), hero = document.getElementById("appleHero");
  let heroOnScreen = true;
  function raysVisible() {
    if (!rays || !rays.canvas.isConnected || document.hidden || home.classList.contains("hidden") || !heroOnScreen) return false;
    // la teinte glisse vers la nouvelle affiche au rythme du fond de la page (1,6 s)
    if (rampT < 1) {
      rampT = Math.min(1, rampT + 1 / 48);
      rays.fx.options.palette = rampTo.map((c, i) => hex(...c.map((v, j) => rampFrom[i][j] + (v - rampFrom[i][j]) * rampT)));
    }
    return true;
  }
  function attachRays() {
    const main = hero && hero.querySelector(".ac-hero-main");
    if (!main || reduced()) return;
    if (!rays) rays = scene(PX.godRays, { x: 160, y: 170, palette: GOLD.map(c => hex(...c)) }, "pfx-rays", raysVisible);
    if (rays.canvas.parentNode !== main) main.insertBefore(rays.canvas, main.querySelector(".ac-hero-copy"));
    rays.start();
  }
  document.addEventListener("aldo:ambient", ev => {
    const next = rampFor(ev.detail);
    if (rays) {
      const cur = rays.fx.options.palette;
      rampFrom = cur.map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
    }
    rampTo = next; rampT = rays ? 0 : 1;
    if (!rays) rampFrom = next;
    attachRays();
    if (rays && rampT === 1) rays.fx.options.palette = next.map(c => hex(...c));
  });
  if (hero) {
    new MutationObserver(attachRays).observe(hero, { childList: true });
    new IntersectionObserver(([e]) => { heroOnScreen = e.isIntersecting; if (heroOnScreen && rays) rays.start(); }).observe(hero);
  }
  if (home) new MutationObserver(() => { if (rays && !home.classList.contains("hidden")) rays.start(); }).observe(home, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (rays) rays.start(); } });

  /* ---------- Extinction façon vieille télé à la fermeture d'une fiche ---------- */
  // l'image s'écrase en une ligne blanche, puis en un point qui s'éteint ; done() ferme vraiment la fenêtre
  const SQ0 = 0.06, SQ1 = 0.34, DOT1 = 0.86;
  function crtOff(card, done) {
    if (!card || reduced() || !card.isConnected) { done(); return; }
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) { done(); return; }
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    canvas.className = "pfx pfx-crt";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: getComputedStyle(card).borderRadius });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d"), frame = PX.createFrame(W, H), img = ctx.createImageData(W, H);
    const fx = PX.createFx(PX.crtOff, { color: "#050506" });
    card.style.animation = "none"; // l'animation d'ouverture (remplissage « both ») bloquerait la transformation
    card.style.transformOrigin = "50% 50%";
    let last = 0, finished = false;
    function restore() { card.style.transform = card.style.filter = card.style.transformOrigin = card.style.animation = ""; }
    function finish() {
      if (finished) return;
      finished = true;
      done();
      restore();
      canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out" }).finished.finally(() => canvas.remove());
    }
    function tick(now) {
      if (finished) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      fx.update(dt);
      const t = fx.t;
      // la fiche elle-même s'écrase et s'illumine au même rythme que l'écran pixel
      const u = Math.min(1, Math.max(0, (t - SQ0) / (SQ1 - SQ0))), k = t < SQ0 ? 1 : Math.max(0, 1 - u * u * u);
      card.style.transform = "scaleY(" + k.toFixed(4) + ")";
      card.style.filter = "brightness(" + (1 + (1 - k) * 1.8).toFixed(2) + ")";
      PX.clearFrame(frame);
      fx.draw(frame);
      PX.composite(frame, img.data, null);
      ctx.putImageData(img, 0, 0);
      if (t >= DOT1) finish(); else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setTimeout(finish, 2000); // filet de sécurité si l'onglet passe en arrière-plan
  }
  if (window.AldoCine) window.AldoCine.pixel = { crtOff };

  curtain();
  attachRays();
})();
