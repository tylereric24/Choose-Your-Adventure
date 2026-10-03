# Bad Choices

Tiny branching text adventures with collectible endings and paid story packs.
Installable web app (PWA), zero runtime dependencies, Node 20+.

- **Free story:** *Treasure Island* (37 nodes, 14 endings), the original Python game rebuilt and expanded.
- **Paid story:** *Curse of the Ghost Galleon* (22 nodes, 9 endings), the sequel, upsold from every Treasure Island ending.
- **Retention loop:** endings gallery (undiscovered endings show only their type), undo, saved runs, "X% of players chose this" stats, share button.
- **Monetization:** one-time Stripe Checkout purchases per story, plus an all-access pass. No accounts, no ads.

## Run it

```sh
npm run dev      # http://localhost:3000, purchases unlock for free (DEV_UNLOCK=1)
npm test         # validates every story + engine/server tests
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

- `if`: all flags must hold (`"!flag"` = must not be set). `set`: on a choice or a node, adds flags (`"!flag"` clears).
- `kind`: `death`, `victory`, or `strange`.
- To sell it, set `"premium": true` and add a product to `content/products.json`.

`npm run validate` walks every reachable (node, flags) state and fails on broken links, unreachable nodes or endings, flag dead-ends, and loops with no route to any ending. CI should run `npm test`.

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
