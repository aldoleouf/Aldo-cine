export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "La clé TMDB n'est pas configurée pour cet environnement." });

  let items;
  try {
    const raw = String(req.query?.items || "[]");
    if (raw.length > 12000) throw new Error();
    items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error();
  } catch {
    return res.status(400).json({ error: "La bibliothèque transmise est invalide." });
  }
  const excluded = new Set(String(req.query?.exclude || "").split(",").filter(Boolean).slice(0, 1500));
  const library = items.filter(item => item && /^\d+$/.test(String(item.id || "")) && (item.type === "movie" || item.type === "tv")).slice(0, 18);
  if (!library.length) return res.status(200).json({ movie: [], tv: [] });

  try {
    const responses = await Promise.all(library.map(async item => {
      const url = new URL(`https://api.themoviedb.org/3/${item.type}/${encodeURIComponent(item.id)}/recommendations`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("language", "fr-FR");
      url.searchParams.set("page", "1");
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) return [];
      const data = await response.json().catch(() => null);
      return (Array.isArray(data?.results) ? data.results : []).map(result => ({ type: item.type, result }));
    }));
    const output = { movie: [], tv: [] };
    const seen = { movie: new Set(), tv: new Set() };
    for (const group of responses) for (const entry of group) {
      const type = entry.type, item = entry.result, id = String(item?.id || "");
      if (!/^\d+$/.test(id) || excluded.has(type + ":" + id) || seen[type].has(id)) continue;
      const title = type === "tv" ? item.name : item.title;
      if (!title) continue;
      seen[type].add(id);
      const releaseDate = type === "tv" ? item.first_air_date : item.release_date;
      output[type].push({
        title: String(title), type,
        year: releaseDate ? String(releaseDate).slice(0, 4) : "",
        releaseDate: releaseDate || "", poster: item.poster_path || "",
        tmdbId: id, overview: item.overview || ""
      });
    }
    return res.status(200).json({ movie: output.movie.slice(0, 30), tv: output.tv.slice(0, 30) });
  } catch {
    return res.status(502).json({ error: "Impossible de récupérer les suggestions TMDB pour le moment." });
  }
}