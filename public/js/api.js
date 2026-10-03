import { store } from './store.js';

async function request(method, path, body) {
  const headers = {};
  const tokens = store.tokens();
  if (tokens.length) headers['x-unlock'] = tokens.join(',');
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  catalog: () => request('GET', '/api/catalog'),
  story: (id) => request('GET', `/api/stories/${encodeURIComponent(id)}`),
  checkout: (product) => request('POST', '/api/checkout', { product }),
  unlock: (sessionId) => request('POST', '/api/unlock', { session_id: sessionId }),
  redeem: (token) => request('POST', '/api/redeem', { token }),
  // Stats are best-effort: never let them break play.
  choiceStat: (story, node, index) => request('POST', '/api/stats/choice', { story, node, index }).catch(() => null),
  endingStat: (story, ending) => request('POST', '/api/stats/ending', { story, ending }).catch(() => null),
};
