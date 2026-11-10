export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  const query = String(req.query?.q || "").trim().slice(0, 120);
  const requestedType = String(req.query?.type || "multi").toLowerCase();
  const endpointByType = { multi: "multi", movie: "movie", tv: "tv" };

  if (!query) return res.status(400).json({ error: "Saisis un titre à rechercher." });
  if (!endpointByType[requestedType]) {
    return res.status(400).json({ error: "Type de recherche invalide." });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "La clé TMDB n'est pas configurée pour cet environnement." });
  }

  try {
    const url = new URL(`https://api.themoviedb.org/3/search/${endpointByType[requestedType]}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("language", "fr-FR");
    url.searchParams.set("region", "FR");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", "1");

    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const message = payload?.status_message || "Le service TMDB est momentanément indisponible.";
      return res.status(502).json({ error: message });
    }

    const results = (Array.isArray(payload?.results) ? payload.results : [])
      .filter(item => item && item.media_type !== "person")
      .map(item => {
        const type = requestedType === "multi"
          ? (item.media_type === "tv" ? "tv" : item.media_type === "movie" ? "movie" : null)
          : requestedType;
        if (!type) return null;
        const releaseDate = type === "tv" ? item.first_air_date : item.release_date;
        return {
          title: String(type === "tv" ? item.name || "" : item.title || ""),
          type,
          year: releaseDate ? String(releaseDate).slice(0, 4) : "",
          releaseDate: releaseDate || "",
          poster: item.poster_path || "",
          tmdbId: String(item.id || "")
        };
      })
      .filter(item => item && item.title)
      .slice(0, 20);

    return res.status(200).json({ results });
  } catch {
    return res.status(502).json({ error: "Impossible de contacter TMDB pour le moment." });
  }
}
