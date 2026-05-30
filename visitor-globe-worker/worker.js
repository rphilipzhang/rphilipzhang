/**
 * Cloudflare Worker — aggregates visitor locations for the sidebar globe.
 *
 * On each request it:
 *   1. geolocates the visitor via Cloudflare's edge data (request.cf) — free,
 *      no external geo API, city-level (already coarse / privacy-friendly);
 *   2. buckets the location to a coarse grid and dedupes by a *hashed* IP
 *      (raw IPs are never stored — only a salted SHA-256 with a short TTL);
 *   3. stores an aggregate visit count per location bucket in Workers KV;
 *   4. returns { you, points, total } as JSON for the globe to plot.
 *
 * Setup: see README.md. Bind a KV namespace as `GLOBE`.
 */

const ALLOW_ORIGIN = "*";           // tighten to your site origin if you prefer
const BUCKET_DEG = 1;               // location rounding (~111 km). Bigger = coarser / more private.
const DEDUP_TTL = 60 * 60 * 12;     // count each IP at most once per 12h

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    let you = null;
    const cf = request.cf || {};
    const lat = parseFloat(cf.latitude);
    const lng = parseFloat(cf.longitude);

    // Record this visit (deduped by hashed IP).
    if (env.GLOBE && isFinite(lat) && isFinite(lng)) {
      const qlat = Math.round(lat / BUCKET_DEG) * BUCKET_DEG;
      const qlng = Math.round(lng / BUCKET_DEG) * BUCKET_DEG;
      you = { city: cf.city || null, country: cf.country || null, lat: qlat, lng: qlng };

      try {
        const ip = request.headers.get("CF-Connecting-IP") || "";
        const seenKey = "seen:" + (await sha256(ip + "|" + (env.SALT || "globe-salt")));
        if (!(await env.GLOBE.get(seenKey))) {
          const key = "loc:" + qlat + "," + qlng;
          const cur = await env.GLOBE.getWithMetadata(key, { type: "text" });
          const c = ((cur && cur.metadata && cur.metadata.c) || 0) + 1;
          await env.GLOBE.put(key, "", {
            metadata: { c: c, lat: qlat, lng: qlng, country: you.country },
          });
          await env.GLOBE.put(seenKey, "1", { expirationTtl: DEDUP_TTL });
        }
      } catch (e) {
        /* over free-tier write quota or transient error: still serve the map */
      }
    }

    // Gather all location buckets.
    const points = [];
    if (env.GLOBE) {
      let cursor;
      do {
        const list = await env.GLOBE.list({ prefix: "loc:", cursor });
        for (const k of list.keys) {
          const m = k.metadata || {};
          if (typeof m.lat === "number" && typeof m.lng === "number") {
            points.push({ lat: m.lat, lng: m.lng, c: m.c || 1 });
          }
        }
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);
    }

    return new Response(JSON.stringify({ you, points, total: points.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
