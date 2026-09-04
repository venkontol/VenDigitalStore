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
  const n = number(value);
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export function esc(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

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
  return Array.isArray(args)
    ? args.slice(start).join(" ").trim()
    : "";
}

export function randomId(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);

  crypto.getRandomValues(bytes);

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

export function randomReference(prefix = "REF", length = 12) {
  return `${prefix}-${randomId(length)}`;
}

export function randomOrderCode() {
  return `VDS-${Date.now().toString(36).toUpperCase()}-${randomId(8)}`;
}

export function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTarget(value) {
  return String(value || "")
    .trim();
}

export function validUsername(value) {
  const username = normalizeUsername(value);

  return (
    username.length >= 3 &&
    username.length <= 32 &&
    /^[a-z0-9._-]+$/.test(username)
  );
}

export function validPassword(value) {
  const password = String(value || "");

  return password.length >= 8 && password.length <= 128;
}

export function calculateProfit(basePrice, sellPrice) {
  return number(sellPrice) - number(basePrice);
}

export function calculateMarkup(basePrice, percent = 100) {
  const base = number(basePrice);
  const rate = number(percent);

  if (base <= 0) {
    return 0;
  }

  return Math.ceil(base + (base * rate / 100));
}

export function calculateBuzzerSellRate(providerRate) {
  return calculateMarkup(providerRate, 100);
}

export function calculateSmmPrice(ratePerThousand, quantity) {
  const rate = number(ratePerThousand);
  const qty = integer(quantity);

  if (rate <= 0 || qty <= 0) {
    return 0;
  }

  return Math.ceil((rate * qty) / 1000);
}

export function calculateSmmProfit(
  providerRate,
  sellRate,
  quantity
) {
  const cost = calculateSmmPrice(
    providerRate,
    quantity
  );

  const sell = calculateSmmPrice(
    sellRate,
    quantity
  );

  return sell - cost;
}

export function isWithinRange(value, min, max) {
  const n = number(value);

  return (
    n >= number(min) &&
    n <= number(max)
  );
}

export function clamp(value, min, max) {
  return Math.min(
    Math.max(
      number(value),
      number(min)
    ),
    number(max)
  );
}

export function requireDb(env) {
  if (!env?.DB) {
    throw new Error("Binding DB belum tersedia.");
  }

  return env.DB;
}

export async function dbFirst(
  env,
  sql,
  ...params
) {
  return requireDb(env)
    .prepare(sql)
    .bind(...params)
    .first();
}

export async function dbAll(
  env,
  sql,
  ...params
) {
  const result = await requireDb(env)
    .prepare(sql)
    .bind(...params)
    .all();

  return result?.results || [];
}

export async function dbRun(
  env,
  sql,
  ...params
) {
  return requireDb(env)
    .prepare(sql)
    .bind(...params)
    .run();
}

export async function getUserById(env, userId) {
  return dbFirst(
    env,
    `
      SELECT
        id,
        username,
        first_name,
        balance,
        status,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    Number(userId)
  );
}

export async function getUserByUsername(
  env,
  username
) {
  return dbFirst(
    env,
    `
      SELECT *
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    normalizeUsername(username)
  );
}

export async function getActiveUserById(
  env,
  userId
) {
  return dbFirst(
    env,
    `
      SELECT
        id,
        username,
        first_name,
        balance,
        status,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE id = ?
        AND status = 'ACTIVE'
      LIMIT 1
    `,
    Number(userId)
  );
}

export async function createUser(
  env,
  {
    username,
    passwordHash,
    firstName = ""
  }
) {
  const db = requireDb(env);
  const timestamp = now();

  const result = await db
    .prepare(
      `
        INSERT INTO users
        (
          username,
          password_hash,
          first_name,
          balance,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?)
      `
    )
    .bind(
      normalizeUsername(username),
      String(passwordHash),
      normalizeName(firstName),
      timestamp,
      timestamp
    )
    .run();

  if (!result?.success) {
    throw new Error("Gagal membuat akun.");
  }

  return getUserByUsername(
    env,
    username
  );
}

export async function updateLastLogin(
  env,
  userId
) {
  return dbRun(
    env,
    `
      UPDATE users
      SET
        last_login_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    now(),
    now(),
    Number(userId)
  );
}

export async function updateUser(
  env,
  userId,
  {
    firstName
  } = {}
) {
  const fields = [];
  const values = [];

  if (firstName !== undefined) {
    fields.push("first_name = ?");
    values.push(normalizeName(firstName));
  }

  if (!fields.length) {
    return getUserById(
      env,
      userId
    );
  }

  fields.push("updated_at = ?");
  values.push(now());
  values.push(Number(userId));

  await dbRun(
    env,
    `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = ?
    `,
    ...values
  );

  return getUserById(
    env,
    userId
  );
}

export async function hashPassword(
  password
) {
  const value = String(password || "");

  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(value);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(new Uint8Array(hash))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

export async function verifyPassword(
  password,
  passwordHash
) {
  if (!passwordHash) {
    return false;
  }

  const hash =
    await hashPassword(password);

  return timingSafeEqual(
    hash,
    String(passwordHash)
  );
}

export function timingSafeEqual(
  a,
  b
) {
  const first = String(a);
  const second = String(b);

  if (first.length !== second.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < first.length; i++) {
    result |=
      first.charCodeAt(i) ^
      second.charCodeAt(i);
  }

  return result === 0;
}

export async function hashToken(token) {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(
      String(token || "")
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(new Uint8Array(hash))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

export function createSessionToken() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createSession(
  env,
  userId,
  days = 30
) {
  const token =
    createSessionToken();

  const tokenHash =
    await hashToken(token);

  const createdAt =
    now();

  const expiresAt =
    new Date(
      Date.now() +
      days * 86400000
    ).toISOString();

  await dbRun(
    env,
    `
      INSERT INTO user_sessions
      (
        user_id,
        token_hash,
        expires_at,
        created_at,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    Number(userId),
    tokenHash,
    expiresAt,
    createdAt,
    createdAt
  );

  return {
    token,
    expiresAt
  };
}

export function getBearerToken(
  request
) {
  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  if (!authorization) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : null;
}

export function getCookie(
  request,
  name
) {
  const cookieHeader =
    request.headers.get("Cookie") || "";

  const cookies =
    cookieHeader
      .split(";")
      .map(value => value.trim());

  for (const cookie of cookies) {
    const index =
      cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      cookie.slice(0, index);

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(
      cookie.slice(index + 1)
    );
  }

  return null;
}

export function getSessionToken(
  request
) {
  return (
    getBearerToken(request) ||
    getCookie(
      request,
      "vds_session"
    )
  );
}

export async function getSession(
  env,
  token
) {
  if (!token) {
    return null;
  }

  const tokenHash =
    await hashToken(token);

  const session =
    await dbFirst(
      env,
      `
        SELECT
          s.id,
          s.user_id,
          s.expires_at,
          s.created_at,
          s.last_seen_at,
          u.username,
          u.first_name,
          u.balance,
          u.status
        FROM user_sessions s
        INNER JOIN users u
          ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
          AND u.status = 'ACTIVE'
        LIMIT 1
      `,
      tokenHash,
      now()
    );

  if (!session) {
    return null;
  }

  await dbRun(
    env,
    `
      UPDATE user_sessions
      SET last_seen_at = ?
      WHERE id = ?
    `,
    now(),
    session.id
  );

  return session;
}

export async function getSessionFromRequest(
  env,
  request
) {
  const token =
    getSessionToken(request);

  if (!token) {
    return null;
  }

  return getSession(
    env,
    token
  );
}

export async function revokeSession(
  env,
  token
) {
  if (!token) {
    return false;
  }

  const tokenHash =
    await hashToken(token);

  await dbRun(
    env,
    `
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `,
    now(),
    tokenHash
  );

  return true;
}

export async function revokeAllUserSessions(
  env,
  userId
) {
  await dbRun(
    env,
    `
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE user_id = ?
        AND revoked_at IS NULL
    `,
    now(),
    Number(userId)
  );

  return true;
}

export async function addBalance(
  env,
  userId,
  amount,
  referenceId = "",
  description = "Tambah saldo",
  type = "DEPOSIT"
) {
  const value =
    Math.round(number(amount));

  if (value <= 0) {
    throw new Error(
      "Nominal saldo tidak valid."
    );
  }

  const user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const before =
    integer(user.balance);

  const after =
    before + value;

  const timestamp =
    now();

  const db =
    requireDb(env);

  const batch =
    await db.batch([
      db.prepare(
        `
          UPDATE users
          SET
            balance = ?,
            updated_at = ?
          WHERE id = ?
        `
      ).bind(
        after,
        timestamp,
        Number(userId)
      ),
      db.prepare(
        `
          INSERT INTO balance_transactions
          (
            user_id,
            type,
            amount,
            reference_id,
            description,
            balance_before,
            balance_after,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        Number(userId),
        type,
        value,
        String(referenceId || ""),
        String(description || ""),
        before,
        after,
        timestamp
      )
    ]);

  if (
    !batch?.every(
      result => result?.success
    )
  ) {
    throw new Error(
      "Gagal memperbarui saldo."
    );
  }

  return after;
}

export async function chargeCustomer(
  env,
  userId,
  amount,
  referenceId = "",
  description = "Pembelian"
) {
  const value =
    Math.round(number(amount));

  if (value <= 0) {
    throw new Error(
      "Nominal pembayaran tidak valid."
    );
  }

  const user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const balance =
    integer(user.balance);

  if (balance < value) {
    throw new Error(
      `Saldo tidak cukup. Saldo ${money(balance)}, diperlukan ${money(value)}.`
    );
  }

  const after =
    balance - value;

  const timestamp =
    now();

  const db =
    requireDb(env);

  const batch =
    await db.batch([
      db.prepare(
        `
          UPDATE users
          SET
            balance = ?,
            updated_at = ?
          WHERE id = ?
            AND balance >= ?
        `
      ).bind(
        after,
        timestamp,
        Number(userId),
        value
      ),
      db.prepare(
        `
          INSERT INTO balance_transactions
          (
            user_id,
            type,
            amount,
            reference_id,
            description,
            balance_before,
            balance_after,
            created_at
          )
          VALUES (?, 'ORDER', ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        Number(userId),
        -value,
        String(referenceId || ""),
        String(description || ""),
        balance,
        after,
        timestamp
      )
    ]);

  if (
    !batch?.every(
      result => result?.success
    )
  ) {
    throw new Error(
      "Gagal memproses pembayaran."
    );
  }

  return after;
}

export async function refundCustomer(
  env,
  userId,
  amount,
  referenceId = "",
  description = "Refund"
) {
  const value =
    Math.round(number(amount));

  if (value <= 0) {
    return getBalance(
      env,
      userId
    );
  }

  const user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const before =
    integer(user.balance);

  const after =
    before + value;

  const timestamp =
    now();

  const db =
    requireDb(env);

  const batch =
    await db.batch([
      db.prepare(
        `
          UPDATE users
          SET
            balance = ?,
            updated_at = ?
          WHERE id = ?
        `
      ).bind(
        after,
        timestamp,
        Number(userId)
      ),
      db.prepare(
        `
          INSERT INTO balance_transactions
          (
            user_id,
            type,
            amount,
            reference_id,
            description,
            balance_before,
            balance_after,
            created_at
          )
          VALUES (?, 'REFUND', ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        Number(userId),
        value,
        String(referenceId || ""),
        String(description || ""),
        before,
        after,
        timestamp
      )
    ]);

  if (
    !batch?.every(
      result => result?.success
    )
  ) {
    throw new Error(
      "Gagal melakukan refund."
    );
  }

  return after;
}

export async function getBalance(
  env,
  userId
) {
  const user =
    await dbFirst(
      env,
      `
        SELECT balance
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      Number(userId)
    );

  return integer(
    user?.balance
  );
}

export async function setting(
  env,
  key
) {
  const row =
    await dbFirst(
      env,
      `
        SELECT value
        FROM settings
        WHERE key = ?
        LIMIT 1
      `,
      String(key)
    );

  return row?.value ?? null;
}

export async function saveSetting(
  env,
  key,
  value
) {
  await dbRun(
    env,
    `
      INSERT INTO settings
      (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET
        value = excluded.value
    `,
    String(key),
    String(value ?? "")
  );

  return true;
}

export async function deleteSetting(
  env,
  key
) {
  await dbRun(
    env,
    `
      DELETE FROM settings
      WHERE key = ?
    `,
    String(key)
  );

  return true;
}

export async function createOrder(
  env,
  {
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
  }
) {
  if (!idempotencyKey) {
    throw new Error(
      "Idempotency key wajib."
    );
  }

  const profit =
    calculateProfit(
      providerCost,
      sellPrice
    );

  const timestamp =
    now();

  const result =
    await dbRun(
      env,
      `
        INSERT INTO orders
        (
          order_code,
          user_id,
          product_id,
          category_id,
          order_type,
          quantity,
          provider,
          provider_cost,
          sell_price,
          profit,
          status,
          payment_status,
          target,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PAID', ?, ?, ?, ?)
      `,
      String(orderCode),
      Number(userId),
      productId === null
        ? null
        : Number(productId),
      categoryId === null
        ? null
        : Number(categoryId),
      String(orderType),
      integer(quantity, 1),
      provider
        ? String(provider)
        : null,
      Math.round(number(providerCost)),
      Math.round(number(sellPrice)),
      Math.round(profit),
      target === null
        ? null
        : String(target),
      String(idempotencyKey),
      timestamp,
      timestamp
    );

  if (!result?.success) {
    throw new Error(
      "Gagal membuat order."
    );
  }

  return getOrderByCode(
    env,
    orderCode
  );
}

export async function getOrderByCode(
  env,
  orderCode
) {
  return dbFirst(
    env,
    `
      SELECT *
      FROM orders
      WHERE order_code = ?
      LIMIT 1
    `,
    String(orderCode)
  );
}

export async function getOrderById(
  env,
  orderId
) {
  return dbFirst(
    env,
    `
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `,
    Number(orderId)
  );
}

export async function getOrdersByUser(
  env,
  userId,
  limit = 50,
  offset = 0
) {
  const safeLimit =
    clamp(
      Math.floor(number(limit, 50)),
      1,
      100
    );

  const safeOffset =
    Math.max(
      0,
      Math.floor(number(offset))
    );

  return dbAll(
    env,
    `
      SELECT *
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    Number(userId),
    safeLimit,
    safeOffset
  );
}

export async function addOrderEvent(
  env,
  orderId,
  eventType,
  status,
  message = "",
  data = {}
) {
  await dbRun(
    env,
    `
      INSERT INTO order_events
      (
        order_id,
        event_type,
        status,
        message,
        data,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    Number(orderId),
    String(eventType),
    String(status),
    String(message || ""),
    safeJsonStringify(data),
    now()
  );

  return true;
}

export function calculateDuitkuSignature(
  merchantCode,
  amount,
  merchantOrderId,
  apiKey
) {
  return {
    input:
      `${merchantCode}${amount}${merchantOrderId}`,
    algorithm:
      "HMAC-SHA256",
    apiKey: String(apiKey || "")
  };
}

export async function hmacSha256(
  secret,
  message
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(
        String(secret || "")
      ),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        String(message || "")
      )
    );

  return Array
    .from(new Uint8Array(signature))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

export function getClientIp(
  request
) {
  return (
    request.headers.get(
      "CF-Connecting-IP"
    ) ||
    request.headers.get(
      "X-Forwarded-For"
    )?.split(",")[0]?.trim() ||
    ""
  );
}

export function getUserAgent(
  request
) {
  return (
    request.headers.get(
      "User-Agent"
    ) || ""
  );
}

export function isProduction(env) {
  return (
    String(
      env?.ENVIRONMENT ||
      env?.ENV ||
      ""
    ).toLowerCase() ===
    "production"
  );
}

export function errorMessage(
  error,
  fallback = "Terjadi kesalahan."
) {
  return (
    error?.message ||
    fallback
  );
}