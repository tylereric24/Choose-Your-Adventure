# Bad Choices

Tiny branching text adventures with collectible endings and paid story packs.
Installable web app (PWA), zero runtime dependencies, Node 20+.

- **Free story:** *Treasure Island*, 5 chapters, 93 scenes, 22 endings, ~4,300 words. The original Python game rebuilt and expanded.
- **Paid story:** *Curse of the Ghost Galleon*, 6 chapters, 83 scenes, 19 endings, ~5,200 words. The sequel, upsold from every Treasure Island ending.
- **Retention loop:** items that change later scenes, chapter checkpoints, endings gallery (undiscovered endings show only their type), undo, saved runs, "X% of players chose this" stats, share button.
- **Monetization:** one-time Stripe Checkout purchases per story, plus an all-access pass. No accounts, no ads.

| | Treasure Island | Ghost Galleon |
|---|---|---|
| Decisions per run (median / p90) | 12 / 33 | 8 / 21 |
| Minutes per run | ~5 | ~4 |
| Shortest winning run | 23 decisions | 22 decisions |
| Hardest ending | 37 decisions | 26 decisions |

Run lengths come from 20,000 simulated random-choice players (`npm run stats`), a pessimistic floor; real players who follow the hints go deeper.

## Run it

```sh
npm run dev      # http://localhost:3000, purchases unlock for free (DEV_UNLOCK=1)
npm test         # validates every story, enforces length floors, engine/server tests
npm run stats    # play-length metrics per story
npm start        # production mode, see .env.example
python3 main.py  # terminal version of the free stories
```

## Deploy

Any host that runs a Node process or a container (Fly.io, Railway, Render, a VPS):

```sh
docker build -t bad-choices .
docker run -p 3000:3000 -v bc-data:/data \
  -e PUBLIC_URL=https://your.domain -e TOKEN_SECRET=$(openssl rand -hex 32) \
  -e STRIPE_SECRET_KEY=sk_live_... bad-choices
```

`/data` holds the stats file. Back up `TOKEN_SECRET`: losing or changing it invalidates every unlock code ever issued.

## How payments work

1. Player clicks Unlock. `POST /api/checkout` creates a Stripe Checkout Session (price comes from `content/products.json`, no Stripe dashboard setup needed).
2. Stripe redirects back with `session_id`. `POST /api/unlock` retrieves the session from Stripe server-side, confirms `payment_status === "paid"`, and returns an HMAC-signed unlock code.
3. The browser stores the code and sends it on every premium fetch. Premium story JSON is never served without a valid code, so it isn't sitting in the static bundle.
4. Players can copy the code from Settings and redeem it on another device.

**Known gaps** (fine for launch, fix before scaling):
- If the player closes the tab before the redirect lands, they've paid but hold no code. Fix: Stripe webhook + a purchases table keyed by email, plus email magic-link restore.
- Codes are bearer tokens and never expire, so they can be shared. Same fix: accounts make codes revocable.
- Stats and rate limits are in-process; run a single instance until they move to SQLite/Redis.

## Writing stories

Drop a JSON file in `content/stories/`. Each node is either a passage with choices or an ending:

```json
{
  "id": "my-story", "title": "My Story", "tagline": "...", "description": "...",
  "premium": false, "order": 3, "accent": "#e0a93b", "start": "intro",
  "nodes": {
    "intro": {
      "text": "Paragraphs separated by blank lines.",
      "choices": [
        { "label": "Grab the rope", "to": "intro", "if": ["!rope"], "set": ["rope"] },
        { "label": "Climb down", "to": "win", "if": ["rope"] },
        { "label": "Jump", "to": "dead" }
      ]
    },
    "win":  { "text": "...", "ending": { "id": "win",  "title": "Made It",   "kind": "victory" } },
    "dead": { "text": "...", "ending": { "id": "dead", "title": "Splat",     "kind": "death" } }
  }
}
```

- `items` (top level) maps flags to display names; those flags show as the player's inventory. Other flags stay hidden.
- `chapter` on a node starts a chapter: shown as a heading, and used as the "Restart chapter" checkpoint.
- `if`: all flags must hold (`"!flag"` = must not be set). `set`: on a choice or a node, adds flags (`"!flag"` clears).
- `kind`: `death`, `victory`, or `strange`.
- To sell it, set `"premium": true` and add a product to `content/products.json`.

`npm run validate` walks every reachable (node, flags) state and fails on broken links, unreachable nodes or endings, flag dead-ends, and loops with no route to any ending. `test/length.test.js` enforces content floors (60+ scenes, 15+ endings, 4,000+ words, median run of 6+ decisions, no victory in under 15 decisions, under 8% of runs dying in the first 3 decisions, paid stories longer than free ones). CI should run `npm test`.

## Layout

```
content/stories/*.json   story graphs
content/products.json    what's for sale
public/                  PWA (no build step)
  js/engine.js           pure story engine, shared with server + tests
  js/app.js              UI
server/                  HTTP server, Stripe client, unlock tokens, stats
main.py                  terminal client
```
