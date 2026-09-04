export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function now() {
  return new Date().toISOString();
}

export function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function integer(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

export function money(value) {
  return "Rp" + Math.round(number(value)).toLocaleString("id-ID");
}

export function esc(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value, fallback = "{}") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export function commandArgs(args = [], start = 0) {
  return Array.isArray(args) ? args.slice(start).join(" ").trim() : "";
}

export function randomId(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  return result;
}

export function randomReference(prefix = "REF", length = 12) {
  return `${prefix}-${randomId(length)}`;
}

export function randomOrderCode() {
  return `VDS-${Date.now().toString(36).toUpperCase()}-${randomId(8)}`;
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeFirstName(value) {
  return normalizeName(value);
}

export function normalizeTarget(value) {
  return String(value || "").trim();
}

export function validUsername(value) {
  const username = normalizeUsername(value);
  return username.length >= 3 && username.length <= 32 && /^[a-z0-9._-]+$/.test(username);
}

export function validateUsername(value) {
  return validUsername(value);
}

export function validPassword(value) {
  const password = String(value || "");
  return password.length >= 8 && password.length <= 128;
}

export function validatePassword(value) {
  return validPassword(value);
}

export function calculateProfit(basePrice, sellPrice) {
  return number(sellPrice) - number(basePrice);
}

export function calculateMarkup(basePrice, percent = 100) {
  const base = number(basePrice);
  const rate = number(percent);
  if (base <= 0) return 0;
  return Math.ceil(base + (base * rate / 100));
}

export function calculateBuzzerSellRate(providerRate) {
  return calculateMarkup(providerRate, 100);
}

export function calculateSmmPrice(ratePerThousand, quantity) {
  const rate = number(ratePerThousand);
  const qty = integer(quantity);
  if (rate <= 0 || qty <= 0) return 0;
  return Math.ceil((rate * qty) / 1000);
}

export function calculateSmmProfit(providerRate, sellRate, quantity) {
  return calculateSmmPrice(sellRate, quantity) - calculateSmmPrice(providerRate, quantity);
}

export function isWithinRange(value, min, max) {
  const n = number(value);
  return n >= number(min) && n <= number(max);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(number(value), number(min)), number(max));
}

export function roundPrice(value) {
  return Math.max(0, Math.round(number(value)));
}

export function isIndonesia(value) {
  const text = normalizeTarget(value).toLowerCase();
  return text === "id" || text === "indonesia" || text === "+62" || text.startsWith("+62") || text.startsWith("62");
}

export function isWhatsApp(value) {
  const text = normalizeTarget(value).replace(/[\s()-]/g, "");
  return /^\+?62\d{8,15}$/.test(text) || /^08\d{8,13}$/.test(text);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
}

export function getUserAgent(request) {
  return request.headers.get("User-Agent") || "";
}

export function isProduction(env) {
  return String(env?.ENVIRONMENT || env?.ENV || "").toLowerCase() === "production";
}

export function errorMessage(error, fallback = "Terjadi kesalahan.") {
  return error?.message || fallback;
}

export function requireDb(env) {
  if (!env?.DB) throw new Error("Binding DB belum tersedia.");
  return env.DB;
}

export async function dbFirst(env, sql, ...params) {
  return requireDb(env).prepare(sql).bind(...params).first();
}

export async function dbAll(env, sql, ...params) {
  const result = await requireDb(env).prepare(sql).bind(...params).all();
  return result?.results || [];
}

export async function dbRun(env, sql, ...params) {
  return requireDb(env).prepare(sql).bind(...params).run();
}

function assertDbSuccess(result, message = "Operasi database gagal.") {
  if (!result?.success) throw new Error(message);
  return result;
}

export async function getUserById(env, userId) {
  return dbFirst(env, `
    SELECT id, username, first_name, balance, status, created_at, updated_at, last_login_at
    FROM users WHERE id = ? LIMIT 1
  `, Number(userId));
}

export async function getUserByUsername(env, username) {
  return dbFirst(env, `SELECT * FROM users WHERE username = ? LIMIT 1`, normalizeUsername(username));
}

export async function getActiveUserById(env, userId) {
  return dbFirst(env, `
    SELECT id, username, first_name, balance, status, created_at, updated_at, last_login_at
    FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1
  `, Number(userId));
}

export async function createUser(env, input, legacyPassword, legacyFirstName = "") {
  let username;
  let passwordHash;
  let firstName;

  if (input && typeof input === "object" && !Array.isArray(input)) {
    username = input.username;
    passwordHash = input.passwordHash;
    firstName = input.firstName || "";
  } else {
    username = input;
    passwordHash = legacyPassword;
    firstName = legacyFirstName;
  }

  const normalizedUsername = normalizeUsername(username);
  if (!validUsername(normalizedUsername)) throw new Error("Username tidak valid.");

  const rawPassword = String(passwordHash || "");
  const storedHash = rawPassword.startsWith("pbkdf2-sha256$") || /^[0-9a-f]{64}$/i.test(rawPassword)
    ? rawPassword
    : await hashPassword(rawPassword);

  const timestamp = now();
  const result = await requireDb(env).prepare(`
    INSERT INTO users (username, password_hash, first_name, balance, status, created_at, updated_at)
    VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?)
  `).bind(normalizedUsername, storedHash, normalizeName(firstName), timestamp, timestamp).run();
  assertDbSuccess(result, "Gagal membuat akun.");
  return getUserByUsername(env, normalizedUsername);
}

export async function updateLastLogin(env, userId) {
  return dbRun(env, `UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, now(), now(), Number(userId));
}

export const markUserLogin = updateLastLogin;

export async function updateUser(env, userId, { firstName } = {}) {
  const fields = [];
  const values = [];
  if (firstName !== undefined) {
    fields.push("first_name = ?");
    values.push(normalizeName(firstName));
  }
  if (!fields.length) return getUserById(env, userId);
  fields.push("updated_at = ?");
  values.push(now(), Number(userId));
  await dbRun(env, `UPDATE users SET ${fields.join(", ")} WHERE id = ?`, ...values);
  return getUserById(env, userId);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) throw new Error("Hex tidak valid.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function timingSafeEqual(a, b) {
  const first = String(a);
  const second = String(b);
  if (first.length !== second.length) return false;
  let result = 0;
  for (let i = 0; i < first.length; i++) result |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return result === 0;
}

const PASSWORD_ITERATIONS = 100000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 32;

export async function hashPassword(password) {
  const value = String(password || "");
  if (!validPassword(value)) throw new Error("Password tidak valid.");
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, keyMaterial, PASSWORD_KEY_BYTES * 8);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPbkdf2Password(password, encoded) {
  const parts = String(encoded).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) return false;
  let salt;
  let expected;
  try {
    salt = hexToBytes(parts[2]);
    expected = hexToBytes(parts[3]);
  } catch {
    return false;
  }
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password || "")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, expected.length * 8);
  return timingSafeEqual(bytesToHex(new Uint8Array(bits)), bytesToHex(expected));
}

async function legacySha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  const stored = String(passwordHash);
  if (stored.startsWith("pbkdf2-sha256$")) return verifyPbkdf2Password(password, stored);
  const legacy = await legacySha256(password);
  return timingSafeEqual(legacy, stored);
}

export async function hashToken(token) {
  return legacySha256(token);
}

export function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function createSession(env, userId, days = 30) {
  const token = createSessionToken();
  const tokenHash = await hashToken(token);
  const createdAt = now();
  const safeDays = clamp(Math.floor(number(days, 30)), 1, 365);
  const expiresAt = new Date(Date.now() + safeDays * 86400000).toISOString();
  const result = await dbRun(env, `
    INSERT INTO user_sessions (user_id, token_hash, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `, Number(userId), tokenHash, expiresAt, createdAt, createdAt);
  assertDbSuccess(result, "Gagal membuat session.");
  return {
    token,
    expiresAt,
    toString() {
      return token;
    }
  };
}

export function getBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const cookie of header.split(";").map(v => v.trim())) {
    const index = cookie.indexOf("=");
    if (index === -1) continue;
    if (cookie.slice(0, index) !== name) continue;
    try { return decodeURIComponent(cookie.slice(index + 1)); } catch { return null; }
  }
  return null;
}

export function getSessionToken(request) {
  return getBearerToken(request) || getCookie(request, "vds_session");
}

export async function getSession(env, token) {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await dbFirst(env, `
    SELECT s.id, s.user_id, s.expires_at, s.created_at, s.last_seen_at,
           u.username, u.first_name, u.balance, u.status
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
      AND s.expires_at > ? AND u.status = 'ACTIVE'
    LIMIT 1
  `, tokenHash, now());
  if (!session) return null;
  await dbRun(env, `UPDATE user_sessions SET last_seen_at = ? WHERE id = ?`, now(), session.id);
  return session;
}

export async function getSessionFromRequest(env, request) {
  return getSession(env, getSessionToken(request));
}

export const getSessionUser = getSessionFromRequest;

export async function revokeSession(env, token) {
  if (!token) return false;
  await dbRun(env, `UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, now(), await hashToken(token));
  return true;
}

export async function revokeAllUserSessions(env, userId) {
  await dbRun(env, `UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, now(), Number(userId));
  return true;
}

async function walletOperation(env, { userId, amount, referenceId = "", description = "", type, direction }) {
  const value = Math.round(number(amount));
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) throw new Error("User tidak valid.");
  if (value <= 0) throw new Error("Nominal saldo tidak valid.");

  const db = requireDb(env);
  const ref = String(referenceId || "").trim();
  if (!ref) throw new Error("Reference ID wajib untuk transaksi saldo.");

  const existing = await dbFirst(env, `
    SELECT id, amount, balance_after
    FROM balance_transactions
    WHERE user_id = ? AND reference_id = ?
    LIMIT 1
  `, uid, ref);
  if (existing) return integer(existing.balance_after);

  const timestamp = now();
  const delta = direction === "CREDIT" ? value : -value;
  const beforeRow = await dbFirst(env, `
    SELECT balance
    FROM users
    WHERE id = ? AND status = 'ACTIVE'
    LIMIT 1
  `, uid);
  if (!beforeRow) throw new Error("Customer tidak ditemukan atau tidak aktif.");

  const before = integer(beforeRow.balance);
  if (direction === "DEBIT" && before < value) {
    throw new Error(`Saldo tidak cukup. Saldo ${money(before)}, diperlukan ${money(value)}.`);
  }

  const updateSql = direction === "DEBIT"
    ? `UPDATE users
       SET balance = balance - ?, updated_at = ?
       WHERE id = ?
         AND balance >= ?
         AND NOT EXISTS (
           SELECT 1 FROM balance_transactions
           WHERE user_id = ? AND reference_id = ?
         )`
    : `UPDATE users
       SET balance = balance + ?, updated_at = ?
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM balance_transactions
           WHERE user_id = ? AND reference_id = ?
         )`;

  const updateParams = direction === "DEBIT"
    ? [value, timestamp, uid, value, uid, ref]
    : [value, timestamp, uid, uid, ref];

  const insertSql = direction === "DEBIT"
    ? `INSERT INTO balance_transactions
       (user_id, type, amount, reference_id, description, balance_before, balance_after, created_at)
       SELECT ?, ?, ?, ?, ?, balance + ?, balance, ?
       FROM users
       WHERE id = ?
         AND balance >= 0
         AND NOT EXISTS (
           SELECT 1 FROM balance_transactions
           WHERE user_id = ? AND reference_id = ?
         )`
    : `INSERT INTO balance_transactions
       (user_id, type, amount, reference_id, description, balance_before, balance_after, created_at)
       SELECT ?, ?, ?, ?, ?, balance - ?, balance, ?
       FROM users
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM balance_transactions
           WHERE user_id = ? AND reference_id = ?
         )`;

  const insertParams = [
    uid,
    type,
    delta,
    ref,
    String(description || ""),
    value,
    timestamp,
    uid,
    uid,
    ref
  ];

  const batch = await db.batch([
    db.prepare(updateSql).bind(...updateParams),
    db.prepare(insertSql).bind(...insertParams)
  ]);

  if (!Array.isArray(batch) || !batch.every(result => result?.success)) {
    throw new Error("Gagal memperbarui saldo.");
  }

  const changed = integer(batch[0]?.meta?.changes);
  const ledgerInserted = integer(batch[1]?.meta?.changes);

  if (changed === 0) {
    const duplicate = await dbFirst(env, `
      SELECT balance_after
      FROM balance_transactions
      WHERE user_id = ? AND reference_id = ?
      LIMIT 1
    `, uid, ref);
    if (duplicate) return integer(duplicate.balance_after);
    if (direction === "DEBIT") throw new Error("Saldo tidak cukup.");
    throw new Error("Transaksi saldo tidak dapat diproses.");
  }

  if (ledgerInserted !== 1) {
    throw new Error("Ledger saldo gagal dicatat.");
  }

  return getBalance(env, uid);
}

export async function addBalance(env, userId, amount, referenceId = "", description = "Tambah saldo", type = "DEPOSIT") {
  return walletOperation(env, { userId, amount, referenceId, description, type, direction: "CREDIT" });
}

export async function chargeCustomer(env, userId, amount, referenceId = "", description = "Pembelian") {
  return walletOperation(env, { userId, amount, referenceId, description, type: "ORDER", direction: "DEBIT" });
}

export async function refundCustomer(env, userId, amount, referenceId = "", description = "Refund") {
  return walletOperation(env, { userId, amount, referenceId, description, type: "REFUND", direction: "CREDIT" });
}

export async function getBalance(env, userId) {
  const row = await dbFirst(env, `SELECT balance FROM users WHERE id = ? LIMIT 1`, Number(userId));
  return integer(row?.balance);
}

export async function setting(env, key) {
  const row = await dbFirst(env, `SELECT value FROM settings WHERE key = ? LIMIT 1`, String(key));
  return row?.value ?? null;
}

export async function saveSetting(env, key, value) {
  await dbRun(env, `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(key), String(value ?? ""));
  return true;
}

export async function deleteSetting(env, key) {
  await dbRun(env, `DELETE FROM settings WHERE key = ?`, String(key));
  return true;
}

export async function createOrder(env, {
  orderCode,
  userId,
  productId = null,
  categoryId = null,
  orderType,
  quantity = 1,
  provider = null,
  providerCost = 0,
  sellPrice = 0,
  target = null,
  idempotencyKey
}) {
  if (!idempotencyKey) throw new Error("Idempotency key wajib.");
  const timestamp = now();
  const result = await dbRun(env, `
    INSERT INTO orders (
      order_code, user_id, product_id, category_id, order_type, quantity,
      provider, provider_cost, sell_price, profit, status, payment_status,
      target, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PAID', ?, ?, ?, ?)
  `,
    String(orderCode), Number(userId), productId === null ? null : Number(productId),
    categoryId === null ? null : Number(categoryId), String(orderType), integer(quantity, 1),
    provider ? String(provider) : null, Math.round(number(providerCost)), Math.round(number(sellPrice)),
    Math.round(calculateProfit(providerCost, sellPrice)), target === null ? null : String(target),
    String(idempotencyKey), timestamp, timestamp
  );
  assertDbSuccess(result, "Gagal membuat order.");
  return getOrderByCode(env, orderCode);
}

export async function getOrderByCode(env, orderCode) {
  return dbFirst(env, `SELECT * FROM orders WHERE order_code = ? LIMIT 1`, String(orderCode));
}

export async function getOrderById(env, orderId) {
  return dbFirst(env, `SELECT * FROM orders WHERE id = ? LIMIT 1`, Number(orderId));
}

export async function getOrdersByUser(env, userId, limit = 50, offset = 0) {
  const safeLimit = clamp(Math.floor(number(limit, 50)), 1, 100);
  const safeOffset = Math.max(0, Math.floor(number(offset)));
  return dbAll(env, `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`, Number(userId), safeLimit, safeOffset);
}

export async function addOrderEvent(env, orderId, eventType, status, message = "", data = {}) {
  await dbRun(env, `
    INSERT INTO order_events (order_id, event_type, status, message, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, Number(orderId), String(eventType), String(status), String(message || ""), safeJsonStringify(data), now());
  return true;
}

export async function hmacSha256(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(message || "")));
  return bytesToHex(new Uint8Array(signature));
}

export async function hmacSha256Base64(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(String(message || ""))));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function calculateDuitkuSignature(merchantCode, amount, merchantOrderId, apiKey) {
  return hmacSha256(apiKey, `${merchantCode}${amount}${merchantOrderId}`);
}

export function parseDuitkuSignatureInput(merchantCode, amount, merchantOrderId) {
  return `${merchantCode}${amount}${merchantOrderId}`;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, number(ms))));
}

export async function retry(fn, attempts = 3, delayMs = 500) {
  let lastError;
  const total = clamp(Math.floor(number(attempts, 3)), 1, 10);
  for (let attempt = 1; attempt <= total; attempt++) {
    try { return await fn(attempt); } catch (error) {
      lastError = error;
      if (attempt < total) await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

export function parseJsonBody(request) {
  return request.json().catch(() => null);
}

export function withCors(response, origin = "*") {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function noContent(headers = {}) {
  return new Response(null, { status: 204, headers });
}
