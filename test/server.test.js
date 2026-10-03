import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadConfig } from '../server/index.js';
import { issueToken, verifyToken } from '../server/tokens.js';

let server;
let base;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'cya-'));
  const config = loadConfig({ DATA_DIR: dataDir, TOKEN_SECRET: 'test-secret', DEV_UNLOCK: '1' });
  server = createApp(config);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('tokens verify and reject forgeries', () => {
  const t = issueToken('s', ['ghost-galleon'], 'ref');
  assert.deepEqual(verifyToken('s', t), ['ghost-galleon']);
  assert.equal(verifyToken('other', t), null);
  const [p, , sig] = t.split('.');
  const forged = `${p}.${Buffer.from(JSON.stringify({ g: ['*'] })).toString('base64url')}.${sig}`;
  assert.equal(verifyToken('s', forged), null);
  assert.equal(verifyToken('s', 'garbage'), null);
});

test('catalog lists stories without node content', async () => {
  const res = await fetch(`${base}/api/catalog`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.ok(data.stories.length >= 2);
  for (const s of data.stories) assert.equal(s.nodes, undefined);
  assert.equal(data.payments, true);
});

test('free story is public, premium story is gated', async () => {
  assert.equal((await fetch(`${base}/api/stories/treasure-island`)).status, 200);
  assert.equal((await fetch(`${base}/api/stories/ghost-galleon`)).status, 402);
  assert.equal((await fetch(`${base}/api/stories/nope`)).status, 404);
});

test('dev checkout -> unlock -> premium access', async () => {
  const { url } = await (await post('/api/checkout', { product: 'ghost-galleon' })).json();
  const sessionId = new URL(url, base).searchParams.get('session_id');
  const { token, grants } = await (await post('/api/unlock', { session_id: sessionId })).json();
  assert.deepEqual(grants, ['ghost-galleon']);
  const res = await fetch(`${base}/api/stories/ghost-galleon`, { headers: { 'x-unlock': token } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 'ghost-galleon');
});

test('token signed with another secret does not unlock', async () => {
  const bad = issueToken('wrong', ['*'], 'x');
  const res = await fetch(`${base}/api/stories/ghost-galleon`, { headers: { 'x-unlock': bad } });
  assert.equal(res.status, 402);
});

test('redeem validates codes', async () => {
  const good = issueToken('test-secret', ['*'], 'x');
  assert.equal((await post('/api/redeem', { token: good })).status, 200);
  assert.equal((await post('/api/redeem', { token: 'cya1.nope.nope' })).status, 400);
});

test('unlock rejects unknown session ids and products', async () => {
  assert.equal((await post('/api/unlock', { session_id: 'cs_live_abc' })).status, 400);
  assert.equal((await post('/api/unlock', { session_id: 'dev_nope' })).status, 400);
  assert.equal((await post('/api/checkout', { product: 'nope' })).status, 400);
});

test('stats only accept real choices and endings', async () => {
  const ok = await post('/api/stats/choice', { story: 'treasure-island', node: 'fork', index: 1 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).counts[1], 1);
  assert.equal((await post('/api/stats/choice', { story: 'treasure-island', node: 'fork', index: 7 })).status, 400);
  assert.equal((await post('/api/stats/choice', { story: 'treasure-island', node: 'junk', index: 0 })).status, 400);
  const end = await post('/api/stats/ending', { story: 'treasure-island', ending: 'civic' });
  assert.deepEqual(await end.json(), { count: 1, total: 1 });
  assert.equal((await post('/api/stats/ending', { story: 'treasure-island', ending: 'fake' })).status, 400);
});

test('static files served with security headers, traversal blocked', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/js/engine.js`)).status, 200);
  assert.equal((await fetch(`${base}/..%2fserver%2ftokens.js`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
});

test('dev unlock is refused when a live Stripe key is configured', () => {
  const c = loadConfig({ DATA_DIR: dataDir, TOKEN_SECRET: 'x', DEV_UNLOCK: '1', STRIPE_SECRET_KEY: 'sk_live_123' });
  assert.equal(c.devUnlock, false);
});
