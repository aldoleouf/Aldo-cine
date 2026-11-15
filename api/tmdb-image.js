module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const path = typeof req.query.path === "string" ? req.query.path : "";
  if (!/^\/t\/p\/(?:w\d+|original)\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(path)) {
    return res.status(400).send("Invalid poster path");
  }

  try {
    const upstream = await fetch("https://image.tmdb.org" + path);
    if (!upstream.ok) return res.status(upstream.status).send("Poster unavailable");
    const type = upstream.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return res.status(415).send("Invalid image type");
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", String(bytes.length));
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("TMDB poster proxy", error);
    return res.status(502).send("Poster proxy error");
  }
};
