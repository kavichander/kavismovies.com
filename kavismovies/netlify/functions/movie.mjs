// Looks up a movie on OMDb (which serves IMDb ratings, plots and posters).
// The OMDb key lives in Netlify's environment variables as OMDB_API_KEY,
// so it never shows up in the website's public code.

export default async (req) => {
  const url = new URL(req.url);
  const title = url.searchParams.get("t") || "";
  const year = url.searchParams.get("y") || "";
  const key = process.env.OMDB_API_KEY;

  if (!key || !title) {
    return Response.json({ error: "missing key or title" }, { status: 400 });
  }

  const omdb = (params) =>
    fetch(`https://www.omdbapi.com/?apikey=${key}&${params}`).then((r) => r.json());

  // 1) Exact title + year
  let data = await omdb(`t=${encodeURIComponent(title)}&y=${year}&type=movie&plot=short`);

  // 2) Fall back to a search (handles titles like "Star Wars" vs "Episode IV")
  if (data.Response !== "True") {
    const search = await omdb(`s=${encodeURIComponent(title)}&y=${year}&type=movie`);
    const hit = search.Search && search.Search[0];
    if (hit) data = await omdb(`i=${hit.imdbID}&plot=short`);
  }

  if (data.Response !== "True") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const clean = (v) => (v && v !== "N/A" ? v : null);
  return Response.json(
    {
      imdbID: data.imdbID,
      rating: clean(data.imdbRating),
      plot: clean(data.Plot),
      poster: clean(data.Poster),
      runtime: clean(data.Runtime),
      genre: clean(data.Genre),
      actors: clean(data.Actors),
      director: clean(data.Director),
    },
    { headers: { "Cache-Control": "public, max-age=604800" } }
  );
};

export const config = { path: "/api/movie" };
