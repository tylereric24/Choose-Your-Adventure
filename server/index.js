// HTTP server: static PWA, story API with premium gating, Stripe Checkout, and choice stats.
// Zero dependencies; runs on Node 20+.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadStories, storySummary } from './stories.js';
import { issueToken, verifyToken, grantsFrom, entitled } from './tokens.js';
import { createCheckoutSession, retrieveCheckoutSession } from './stripe.js';
import { Stats } from './stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function loadConfig(env = process.env) {
  const dataDir = env.DATA_DIR ?? join(ROOT, '.data');
  let tokenSecret = env.TOKEN_SECRET;
  if (!tokenSecret) {
    // Persist a generated secret so purchases survive restarts. Set TOKEN_SECRET in production.
    const file = join(dataDir, 'token-secret');
    if (!existsSync(file)) {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
    }
    tokenSecret = readFileSync(file, 'utf8').trim();
  }
  const stripeKey = env.STRIPE_SECRET_KEY || null;
  return {
    port: Number(env.PORT ?? 3000),
    publicUrl: env.PUBLIC_URL?.replace(/\/$/, '') ?? null,
    stripeKey,
    tokenSecret,
    dataDir,
    // Free unlocks for local testing. Hard-disabled when a live Stripe key is present.
    devUnlock: env.DEV_UNLOCK === '1' && !stripeKey?.startsWith('sk_live_'),
    trustProxy: env.TRUST_PROXY === '1',
    currency: env.CURRENCY ?? 'usd',
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-store',
  });
}

async function readJson(req, limit = 8192) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid JSON');
  }
}

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  const timer = setInterval(() => hits.clear(), windowMs);
  timer.unref();
  return (key) => {
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return n <= limit;
  };
}

export function createApp(config, { stories = loadStories() } = {}) {
  const products = JSON.parse(readFileSync(join(ROOT, 'content', 'products.json'), 'utf8'));
  const productById = new Map(products.map((p) => [p.id, p]));
  const stats = new Stats(join(config.dataDir, 'stats.json'), stories);
  const allowEvent = rateLimiter(300, 60_000);
  const allowCheckout = rateLimiter(20, 60_000);
  const paymentsEnabled = !!config.stripeKey || config.devUnlock;

  const clientIp = (req) =>
    (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

  const requestGrants = (req) => {
    const header = req.headers['x-unlock'];
    const tokens = typeof header === 'string' ? header.split(',').slice(0, 20) : [];
    return grantsFrom(config.tokenSecret, tokens);
  };

  const baseUrl = (req) => config.publicUrl ?? `http://${req.headers.host}`;

  const catalog = {
    stories: [...stories.values()].map(storySummary).sort((a, b) => a.order - b.order),
    products: products.map(({ id, name, description, price, grants }) => ({ id, name, description, price, grants })),
    currency: config.currency,
    payments: paymentsEnabled,
  };

  const routes = {
    'GET /api/catalog': (req, res) => json(res, 200, catalog),

    'GET /api/stories/:id': (req, res, id) => {
      const story = stories.get(id);
      if (!story) throw new HttpError(404, 'no such story');
      if (story.premium && !entitled(requestGrants(req), id)) throw new HttpError(402, 'locked');
      json(res, 200, story);
    },

    'POST /api/checkout': async (req, res) => {
      if (!allowCheckout(clientIp(req))) throw new HttpError(429, 'slow down');
      const { product: productId } = await readJson(req);
      const product = productById.get(productId);
      if (!product) throw new HttpError(400, 'unknown product');
      if (config.stripeKey) {
        const session = await createCheckoutSession(config.stripeKey, {
          product,
          baseUrl: baseUrl(req),
          currency: config.currency,
        });
        return json(res, 200, { url: session.url });
      }
      if (config.devUnlock) {
        return json(res, 200, { url: `/?checkout=success&session_id=dev_${encodeURIComponent(product.id)}` });
      }
      throw new HttpError(503, 'payments are not configured');
    },

    // Exchanges a completed Checkout Session for an unlock token.
    'POST /api/unlock': async (req, res) => {
      if (!allowCheckout(clientIp(req))) throw new HttpError(429, 'slow down');
      const { session_id: sessionId } = await readJson(req);
      if (typeof sessionId !== 'string') throw new HttpError(400, 'missing session_id');

      let product;
      if (config.devUnlock && sessionId.startsWith('dev_')) {
        product = productById.get(sessionId.slice(4));
      } else if (config.stripeKey && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
        const session = await retrieveCheckoutSession(config.stripeKey, sessionId);
        if (session.payment_status !== 'paid') throw new HttpError(402, 'payment not completed');
        product = productById.get(session.metadata?.product);
      } else {
        throw new HttpError(400, 'invalid session_id');
      }
      if (!product) throw new HttpError(400, 'unknown product');
      json(res, 200, {
        token: issueToken(config.tokenSecret, product.grants, sessionId),
        grants: product.grants,
        product: product.name,
      });
    },

    // Checks an unlock code typed in by the player (restore on a new device).
    'POST /api/redeem': async (req, res) => {
      if (!allowCheckout(clientIp(req))) throw new HttpError(429, 'slow down');
      const { token } = await readJson(req);
      const grants = verifyToken(config.tokenSecret, token);
      if (!grants) throw new HttpError(400, 'invalid unlock code');
      json(res, 200, { token: token.trim(), grants });
    },

    'POST /api/stats/choice': async (req, res) => {
      if (!allowEvent(clientIp(req))) throw new HttpError(429, 'slow down');
      const { story, node, index } = await readJson(req, 1024);
      const counts = stats.recordChoice(story, node, index);
      if (!counts) throw new HttpError(400, 'invalid choice');
      json(res, 200, { counts });
    },

    'POST /api/stats/ending': async (req, res) => {
      if (!allowEvent(clientIp(req))) throw new HttpError(429, 'slow down');
      const { story, ending } = await readJson(req, 1024);
      const result = stats.recordEnding(story, ending);
      if (!result) throw new HttpError(400, 'invalid ending');
      json(res, 200, result);
    },

    'GET /healthz': (req, res) => json(res, 200, { ok: true }),
  };

  function route(method, pathname) {
    const exact = routes[`${method} ${pathname}`];
    if (exact) return [exact];
    const m = pathname.match(/^\/api\/stories\/([a-z0-9-]+)$/);
    if (m && method === 'GET') return [routes['GET /api/stories/:id'], m[1]];
    return null;
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method not allowed');
    let rel;
    try {
      rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    } catch {
      throw new HttpError(400, 'bad path');
    }
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + sep)) throw new HttpError(404, 'not found');
    let st;
    try {
      st = statSync(file);
    } catch {
      throw new HttpError(404, 'not found');
    }
    if (!st.isFile()) throw new HttpError(404, 'not found');
    const ext = extname(file);
    const noCache = ext === '.html' || file.endsWith(`${sep}sw.js`);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=300',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      const match = route(req.method, pathname);
      if (match) await match[0](req, res, ...match.slice(1));
      else if (pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
      else serveStatic(req, res, pathname);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      if (res.headersSent) return res.destroy();
      json(res, e.status ?? 500, { error: e instanceof HttpError ? e.message : 'internal error' });
    }
  });
  server.on('close', () => stats.flush());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const config = loadConfig();
  if (config.stripeKey && !config.publicUrl) {
    // Otherwise Stripe redirect URLs would be built from the client-supplied Host header.
    console.error('PUBLIC_URL is required when STRIPE_SECRET_KEY is set.');
    process.exit(1);
  }
  const server = createApp(config);
  server.listen(config.port, () => {
    const mode = config.stripeKey ? 'stripe' : config.devUnlock ? 'DEV UNLOCK (free purchases)' : 'disabled';
    console.log(`Listening on http://localhost:${config.port}  payments: ${mode}`);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
