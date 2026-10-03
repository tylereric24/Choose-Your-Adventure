// Minimal Stripe Checkout client over the REST API (no SDK dependency).
const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') form(v, key, out);
    else if (v !== undefined) out.append(key, String(v));
  }
  return out;
}

async function call(secretKey, method, path, params) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? form(params) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json.error?.message ?? 'unknown error'}`);
  return json;
}

export function createCheckoutSession(secretKey, { product, baseUrl, currency = 'usd' }) {
  return call(secretKey, 'POST', '/checkout/sessions', {
    mode: 'payment',
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: product.price,
          product_data: { name: product.name, description: product.description },
        },
      },
    },
    metadata: { product: product.id },
    allow_promotion_codes: 'true',
    success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancel`,
  });
}

export function retrieveCheckoutSession(secretKey, id) {
  return call(secretKey, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}
