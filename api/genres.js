export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aldo-wrapped.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const type = String(req.query.type || "");
  const id = String(req.query.id || "");
  const title = String(req.query.title || "").trim();
  const year = String(req.query.year || "").trim();
  if (!["movie", "tv"].includes(type) || (!/^\\d+$/.test(id) && !title)) {
    return res.status(400).json({ error: "A valid TMDB id or title and type are required" });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "TMDB is not configured" });

  try {
    let tmdbId = id;
    if (!/^\\d+$/.test(tmdbId)) {
      const search = new URL(`https://api.themoviedb.org/3/search/${type}`);
      search.searchParams.set("api_key", apiKey);
      search.searchParams.set("language", "fr-FR");
      search.searchParams.set("query", title);
      if (/^\\d{4}$/.test(year)) {
        search.searchParams.set(type === "movie" ? "year" : "first_air_date_year", year);
      }
      const searchResponse = await fetch(search);
      if (!searchResponse.ok) return res.status(502).json({ error: "TMDB search failed" });
      const searchData = await searchResponse.json();
      const results = Array.isArray(searchData.results) ? searchData.results : [];
      const normalize = value => String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const exact = results.find(item => normalize(item.title || item.name) === normalize(title));
      const candidate = exact || results[0];
      if (!candidate || !candidate.id) return res.status(200).json({ genres: [], matched: false });
      tmdbId = String(candidate.id);
    }

    const details = new URL(`https://api.themoviedb.org/3/${type}/${tmdbId}`);
    details.searchParams.set("api_key", apiKey);
    details.searchParams.set("language", "fr-FR");
    const response = await fetch(details);
    if (!response.ok) return res.status(response.status === 404 ? 404 : 502).json({ error: "TMDB lookup failed" });
    const data = await response.json();
    return res.status(200).json({
      genres: Array.isArray(data.genres) ? data.genres.map(g => g.name).filter(Boolean) : [],
      matched: true,
      resolvedId: tmdbId
    });
  } catch {
    return res.status(502).json({ error: "Unable to contact TMDB" });
  }
}