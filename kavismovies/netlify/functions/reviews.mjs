// Visitor reviews for each movie: a name, a 1-5 star rating, and a short review.
// Stored with Netlify Blobs, so everyone sees the same reviews.
import { getStore } from "@netlify/blobs";

const MAX_NAME = 40;
const MAX_TEXT = 800;
const MAX_PER_MOVIE = 200;

const keyFor = (movie) => Buffer.from(movie, "utf8").toString("base64url");
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (req) => {
  const store = getStore({ name: "reviews", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const movie = (url.searchParams.get("m") || "").slice(0, 200);
    if (!movie) return json({ error: "Missing movie" }, 400);
    const list = (await store.get(keyFor(movie), { type: "json" })) || [];
    return json({ reviews: list });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

    // Bots tend to fill in every field, including this hidden one
    if (body.website) return json({ ok: true });

    const movie = String(body.movie || "").slice(0, 200);
    const name = String(body.name || "").trim();
    const text = String(body.text || "").trim();
    const stars = Number(body.stars);

    if (!movie) return json({ error: "Missing movie" }, 400);
    if (!name) return json({ error: "Please add your name." }, 400);
    if (name.length > MAX_NAME) return json({ error: `Names can be up to ${MAX_NAME} characters.` }, 400);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return json({ error: "Pick 1 to 5 stars." }, 400);
    if (!text) return json({ error: "Please write a short review." }, 400);
    if (text.length > MAX_TEXT) return json({ error: `Reviews can be up to ${MAX_TEXT} characters.` }, 400);

    const key = keyFor(movie);
    const list = (await store.get(key, { type: "json" })) || [];
    const review = {
      id: crypto.randomUUID(),
      name,
      stars,
      text,
      date: new Date().toISOString(),
    };
    list.unshift(review);
    await store.setJSON(key, list.slice(0, MAX_PER_MOVIE));
    return json({ ok: true, review });
  }

  // Remove a review: only works if REVIEWS_ADMIN_KEY is set in Netlify and matches
  if (req.method === "DELETE") {
    const admin = process.env.REVIEWS_ADMIN_KEY;
    if (!admin || url.searchParams.get("key") !== admin) return json({ error: "Not allowed" }, 403);
    const movie = url.searchParams.get("m") || "";
    const id = url.searchParams.get("id") || "";
    const key = keyFor(movie);
    const list = (await store.get(key, { type: "json" })) || [];
    await store.setJSON(key, list.filter((r) => r.id !== id));
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/reviews" };
