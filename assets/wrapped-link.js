/* Lien vers Aldo Wrapped : transmet la bibliothèque vue sans passer par un fichier JSON.
   Les données voyagent dans le fragment de l'URL (#import=…), qui n'est jamais envoyé au serveur. */
"use strict";
(() => {
  const app = window.AldoCine;
  if (!app) return;
  const WRAPPED_URL = "https://aldo-wrapped.vercel.app/";
  const FIELDS = ["id", "title", "type", "status", "watchedAt", "company", "cinema", "poster", "tmdbId", "year", "genres"];

  const toBase64Url = bytes => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  async function packLibrary() {
    const seen = app.entries.filter(e => ["watched", "rewatch", "episodes"].includes(e.status));
    const slim = seen.map(e => Object.fromEntries(FIELDS.filter(k => e[k] !== undefined && e[k] !== "").map(k => [k, e[k]])));
    const json = JSON.stringify(slim);
    if ("CompressionStream" in window) {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      return "g." + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    return "j." + toBase64Url(new TextEncoder().encode(json));
  }

  async function sendTo(target) {
    try {
      const url = WRAPPED_URL + "#import=" + await packLibrary();
      if (target) target.location.href = url; else location.href = url;
    } catch {
      if (target) target.close();
      app.notify("Impossible d’ouvrir Aldo Wrapped");
    }
  }

  const button = document.getElementById("sendAldoWrapped");
  if (button) button.onclick = () => {
    // La fenêtre s'ouvre tout de suite, sinon le navigateur la bloque après la compression.
    const win = window.open("", "_blank");
    sendTo(win || null);
  };

  // Aldo Wrapped demande la bibliothèque : ?wrapped=send
  const params = new URLSearchParams(location.search);
  if (params.get("wrapped") === "send") {
    history.replaceState(null, "", location.pathname);
    app.notify("Envoi de ta bibliothèque vers Aldo Wrapped…");
    sendTo(null);
  }
})();
