export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aldo-wrapped.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query.id || "");
  const type = String(req.query.type || "");
  if (!/^\d+$/.test(id) || !["movie", "tv"].includes(type)) {
    return res.status(400).json({ error: "Invalid TMDB id or type" });
  }
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "TMDB is not configured" });
  try {
    const url = new URL(`https://api.themoviedb.org/3/${type}/${id}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", "fr-FR");
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status === 404 ? 404 : 502).json({ error: "TMDB lookup failed" });
    const data = await response.json();
    return res.status(200).json({ genres: Array.isArray(data.genres) ? data.genres.map(g => g.name).filter(Boolean) : [] });
  } catch {
    return res.status(502).json({ error: "Unable to contact TMDB" });
  }
}