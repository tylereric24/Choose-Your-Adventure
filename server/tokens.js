// Stateless unlock tokens: cya1.<payload>.<hmac>. The payload lists the story ids (or "*")
// the holder owns. Tokens never expire; they are the player's proof of purchase.
import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'cya1';

function sign(secret, data) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueToken(secret, grants, ref) {
  const payload = Buffer.from(JSON.stringify({ g: grants, r: ref, t: Date.now() })).toString('base64url');
  const body = `${PREFIX}.${payload}`;
  return `${body}.${sign(secret, body)}`;
}

// Returns the grants array, or null if the token is malformed or forged.
export function verifyToken(secret, token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const expected = Buffer.from(sign(secret, `${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { g } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return Array.isArray(g) && g.every((x) => typeof x === 'string') ? g : null;
  } catch {
    return null;
  }
}

export function grantsFrom(secret, tokens) {
  const grants = new Set();
  for (const t of tokens) for (const g of verifyToken(secret, t) ?? []) grants.add(g);
  return grants;
}

export function entitled(grants, storyId) {
  return grants.has('*') || grants.has(storyId);
}
