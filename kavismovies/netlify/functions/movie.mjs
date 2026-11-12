// Looks up a movie on OMDb (which serves IMDb ratings, plots and posters).
// The OMDb key lives in Netlify's environment variables as OMDB_API_KEY,
// so it never shows up in the website's public code.

// Titles that OMDb lists under a different official name.
const ALIASES = {
  "star wars|1977": "Star Wars: Episode IV - A New Hope",
  "the empire strikes back|1980": "Star Wars: Episode V - The Empire Strikes Back",
  "return of the jedi|1983": "Star Wars: Episode VI - Return of the Jedi",
  "star wars: the force awakens|2015": "Star Wars: Episode VII - The Force Awakens",
  "rogue one|2016": "Rogue One: A Star Wars Story",
  "say anything|1989": "Say Anything...",
  "e.t. the extra-terrestrial|1982": "E.T. the Extra-Terrestrial",
  "kingsman: the secret service|2014": "Kingsman: The Secret Service",
};

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");

export default async (req) => {
  const url = new URL(req.url);
  const title = url.searchParams.get("t") || "";
  const year = parseInt(url.searchParams.get("y") || "", 10) || null;
  const key = process.env.OMDB_API_KEY;

  if (!key || !title) {
    return Response.json({ error: "missing key or title" }, { status: 400 });
  }

  const omdb = async (params) => {
    try {
      const r = await fetch(`https://www.omdbapi.com/?apikey=${key}&type=movie&${params}`);
      return await r.json();
    } catch {
      return { Response: "False" };
    }
  };
  const ok = (d) => d && d.Response === "True";
  const yearOf = (d) => parseInt(d.Year, 10);
  const closeYear = (d, slack) => !year || Math.abs(yearOf(d) - year) <= slack;

  const official = ALIASES[`${title.toLowerCase()}|${year}`] || title;
  let data = null;

  // 1) Exact title, exact year, then a year either side
  //    (festival vs. theater release years often differ by one)
  for (const y of year ? [year, year + 1, year - 1] : [""]) {
    const d = await omdb(`t=${encodeURIComponent(official)}&y=${y}&plot=short`);
    if (ok(d)) { data = d; break; }
  }

  // 2) Search, and pick the closest title match within a year
  if (!data) {
    for (const params of [`s=${encodeURIComponent(official)}&y=${year || ""}`, `s=${encodeURIComponent(official)}`]) {
      const s = await omdb(params);
      const hits = (s.Search || []).filter((h) => closeYear(h, 1));
      if (!hits.length) continue;
      hits.sort((a, b) => {
        const score = (h) =>
          (norm(h.Title) === norm(official) ? 0 : norm(h.Title).startsWith(norm(official)) ? 1 : 2) +
          (year ? Math.abs(yearOf(h) - year) * 0.1 : 0);
        return score(a) - score(b);
      });
      const d = await omdb(`i=${hits[0].imdbID}&plot=short`);
      if (ok(d)) { data = d; break; }
    }
  }

  if (!data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const clean = (v) => (v && v !== "N/A" ? v : null);

  // 3) If the short plot is missing, try the full one
  let plot = clean(data.Plot);
  if (!plot) {
    const full = await omdb(`i=${data.imdbID}&plot=full`);
    if (ok(full)) plot = clean(full.Plot);
  }

  return Response.json(
    {
      imdbID: data.imdbID,
      title: data.Title,
      year: data.Year,
      rating: clean(data.imdbRating),
      plot,
      poster: clean(data.Poster),
      runtime: clean(data.Runtime),
      genre: clean(data.Genre),
      actors: clean(data.Actors),
      director: clean(data.Director),
    },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
};

export const config = { path: "/api/movie" };
