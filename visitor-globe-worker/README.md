# Visitor Globe — backend (Cloudflare Worker)

This is the small backend that records **where** people visit your site from and
feeds those locations to the rotating globe in the sidebar (`nav-globe.js`).

- Geolocation is done **for free** by Cloudflare's edge (`request.cf`) — no
  third‑party IP API.
- **No raw IPs are stored.** Each IP is salted + SHA‑256 hashed only to avoid
  double‑counting, and that hash expires after 12h. Locations are bucketed to a
  coarse grid (~111 km), so the public data is city/region‑level, not precise.
- It's **your** infrastructure on the free tier, so it won't disappear like
  ClustrMaps / RevolverMaps did.

## One‑time deploy (≈5 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and
Node.js installed.

```bash
cd visitor-globe-worker

# 1. Log in (opens a browser)
npx wrangler login

# 2. Create the KV namespace, then paste the printed id into wrangler.toml
npx wrangler kv namespace create GLOBE
#   -> copy the id "..." into the kv_namespaces line of wrangler.toml

# 3. (recommended) set a random salt used to hash IPs
npx wrangler secret put SALT
#   -> type any random string and press enter

# 4. Deploy
npx wrangler deploy
```

`wrangler deploy` prints your endpoint, e.g.:

```
https://visitor-globe.<your-subdomain>.workers.dev
```

## Wire it to the globe

Open `../nav-globe.js`, find the line near the top:

```js
var ENDPOINT = ""; // <- paste your Worker URL here
```

and paste your URL:

```js
var ENDPOINT = "https://visitor-globe.your-subdomain.workers.dev";
```

That's it. Reload the site — every visit is recorded, and accumulated visitor
locations light up on the globe in amber. Until `ENDPOINT` is set, the globe just
shows the decorative sphere (nothing breaks).

## Notes / limits

- Free KV tier is ~1,000 writes/day. Thanks to per‑IP dedup (12h), that's ~500
  new unique visitors/day. Over quota, extra visits simply aren't recorded; the
  map and site keep working.
- To restrict who can read the data, change `ALLOW_ORIGIN` in `worker.js` from
  `"*"` to your site origin (e.g. `"https://rphilipzhang.github.io"`).
- Want bigger limits or precise counts? This can be moved to Cloudflare D1
  (SQLite, 100k writes/day free) later — ask and I'll provide that version.
