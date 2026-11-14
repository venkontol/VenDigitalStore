// Adapter tunggal untuk SMSCode API (/v1).
// Acuan: docs/openapi/openapi.yaml dari sdks-main.zip. Tidak ada endpoint yang ditebak.
// File ini hanya komunikasi API: TIDAK mengatur saldo pengguna dan TIDAK mengirim pesan Telegram.

const DEFAULT_BASE_URL = 'https://api.smscode.gg';
const REQUEST_TIMEOUT_MS = 20_000;

// Kode error yang dijamin provider TIDAK membuat order (sehingga aman untuk gagal tanpa potong saldo).
const DEFINITIVE_CODES = new Set([
  'VALIDATION_ERROR',
  'NO_OFFER_AVAILABLE',
  'PROVIDER_ERROR',
  'INSUFFICIENT_BALANCE',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);

// Kode yang menandakan masalah konfigurasi/akun di sisi kita: owner perlu diberi tahu.
const ALERT_OWNER_CODES = new Set(['INSUFFICIENT_BALANCE', 'UNAUTHORIZED', 'FORBIDDEN']);

export class ProviderError extends Error {
  constructor({ code, httpStatus = null, definitive = false, alertOwner = false, message }) {
    super(message ?? `Provider error: ${code}`);
    this.name = 'ProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.definitive = definitive;
    this.alertOwner = alertOwner;
  }
}

function resolveBaseUrl(env) {
  const url = (env.SMSCODE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (!url.startsWith('https://')) throw new Error('SMSCODE_BASE_URL harus memakai https');
  return url;
}

async function request(env, method, path, { query, body, idempotencyKey } = {}) {
  if (!env.SMSCODE_API_KEY) throw new Error('SMSCODE_API_KEY belum dikonfigurasi');

  const url = new URL(resolveBaseUrl(env) + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const headers = {
    Authorization: `Bearer ${env.SMSCODE_API_KEY}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Jaringan/timeout: request mungkin sudah sampai ke provider, jadi statusnya belum pasti.
    throw new ProviderError({ code: 'NETWORK', definitive: false, message: 'Provider tidak dapat dihubungi' });
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (response.ok && json?.success === true) return json.data;

  const code = json?.error?.code ?? (response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN');
  const definitive = response.status >= 400 && response.status < 500 && DEFINITIVE_CODES.has(code);
  throw new ProviderError({
    code,
    httpStatus: response.status,
    definitive,
    alertOwner: ALERT_OWNER_CODES.has(code),
  });
}

export function listCountries(env) {
  return request(env, 'GET', '/v1/catalog/countries');
}

export function listServices(env, countryId) {
  return request(env, 'GET', '/v1/catalog/services', { query: { country_id: countryId } });
}

export async function listProducts(env, { countryId, platformId, limit = 20, sort = 'price_asc' }) {
  const data = await request(env, 'GET', '/v1/catalog/products', {
    query: { country_id: countryId, platform_id: platformId, limit, sort, page: 1 },
  });
  return Array.isArray(data) ? data : [];
}

// Order satu nomor. Idempotency key wajib dikirim agar retry tidak membuat order ganda.
export function createOrder(env, { productId, idempotencyKey }) {
  return request(env, 'POST', '/v1/orders/create', {
    body: { product_id: productId, quantity: 1 },
    idempotencyKey,
  });
}

export function getOrder(env, orderId) {
  return request(env, 'GET', `/v1/orders/${orderId}`);
}

export function cancelOrder(env, orderId) {
  return request(env, 'POST', '/v1/orders/cancel', { body: { id: orderId } });
}

export function finishOrder(env, orderId) {
  return request(env, 'POST', '/v1/orders/finish', { body: { id: orderId } });
}
