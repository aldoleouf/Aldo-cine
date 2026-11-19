// Recherche d'une fiche BetaSeries (film ou série) à partir d'un titre.
// Nécessite la variable d'environnement BETASERIES_API_KEY (clé gratuite sur betaseries.com/api).
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  const title = String(req.query?.title || "").trim().slice(0, 120);
  const type = String(req.query?.type || "movie") === "show" ? "show" : "movie";
  if (!title) return res.status(400).json({ error: "Titre manquant." });

  const apiKey = process.env.BETASERIES_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "La clé BetaSeries n'est pas configurée." });

  try {
    const endpoint = type === "show" ? "shows/search" : "movies/search";
    const url = new URL(`https://api.betaseries.com/${endpoint}`);
    url.searchParams.set("title", title);
    url.searchParams.set("nbpp", "10");
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", "X-BetaSeries-Version": "3.0", "X-BetaSeries-Key": apiKey }
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) return res.status(502).json({ error: "BetaSeries est momentanément indisponible." });

    const list = type === "show" ? payload?.shows : payload?.movies;
    const results = (Array.isArray(list) ? list : []).map(item => {
      const slug = item.resource_url ? null : item.slug || item.url;
      const url = item.resource_url
        || (slug ? `https://www.betaseries.com/${type === "show" ? "serie" : "film"}/${slug}` : "");
      return {
        title: String(item.title || item.original_title || ""),
        year: String(item.creation || item.production_year || item.release_date || "").slice(0, 4),
        url
      };
    }).filter(item => item.title && /^https:\/\/www\.betaseries\.com\//.test(item.url));

    return res.status(200).json({ results });
  } catch {
    return res.status(502).json({ error: "Impossible de contacter BetaSeries." });
  }
}
