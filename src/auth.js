import { now } from "./utils.js";

const SESSION_DAYS = 30;
const SESSION_COOKIE = "ven_session";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function validateUsername(username) {
  if (!username) {
    fail("Username wajib diisi.");
  }

  if (username.length < 3) {
    fail("Username minimal 3 karakter.");
  }

  if (username.length > 32) {
    fail("Username maksimal 32 karakter.");
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    fail("Username hanya boleh menggunakan huruf, angka, titik, garis bawah, dan tanda minus.");
  }

  return username;
}

function validatePassword(password) {
  const value = String(password ?? "");

  if (!value) {
    fail("Password wajib diisi.");
  }

  if (value.length < 8) {
    fail("Password minimal 8 karakter.");
  }

  if (value.length > 128) {
    fail("Password terlalu panjang.");
  }

  return value;
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized +
    "=".repeat(
      (4 - (normalized.length % 4)) % 4
    );

  const binary = atob(padded);

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function sha256(value) {
  const data = new TextEncoder().encode(
    String(value)
  );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToBase64Url(
    new Uint8Array(digest)
  );
}

async function derivePasswordKey(
  password,
  salt
) {
  const material =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 120000,
        hash: "SHA-256"
      },
      material,
      256
    );

  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const derived =
    await derivePasswordKey(
      password,
      salt
    );

  return (
    "pbkdf2$120000$" +
    bytesToBase64Url(salt) +
    "$" +
    bytesToBase64Url(derived)
  );
}

async function verifyPassword(
  password,
  storedHash
) {
  const value =
    String(storedHash ?? "");

  const parts =
    value.split("$");

  if (
    parts.length !== 4 ||
    parts[0] !== "pbkdf2"
  ) {
    return false;
  }

  const iterations =
    Number(parts[1]);

  if (
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    iterations > 500000
  ) {
    return false;
  }

  try {
    const salt =
      base64UrlToBytes(parts[2]);

    const expected =
      base64UrlToBytes(parts[3]);

    const material =
      await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );

    const bits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256"
        },
        material,
        256
      );

    const actual =
      new Uint8Array(bits);

    if (
      actual.length !==
      expected.length
    ) {
      return false;
    }

    let difference = 0;

    for (
      let i = 0;
      i < actual.length;
      i++
    ) {
      difference |=
        actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

function randomToken() {
  return bytesToBase64Url(
    crypto.getRandomValues(
      new Uint8Array(32)
    )
  );
}

function addDays(
  date,
  days
) {
  const result =
    new Date(date);

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return result.toISOString();
}

function parseCookies(request) {
  const header =
    request.headers.get("Cookie") || "";

  const cookies = {};

  for (
    const part of header.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      part
        .slice(0, index)
        .trim();

    const value =
      part
        .slice(index + 1)
        .trim();

    if (key) {
      cookies[key] = value;
    }
  }

  return cookies;
}

function cookieHeader(
  token,
  maxAge
) {
  return (
    SESSION_COOKIE +
    "=" +
    token +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
    maxAge
  );
}

function clearCookieHeader() {
  return (
    SESSION_COOKIE +
    "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}

export async function register(
  env,
  data = {}
) {
  if (!env?.DB) {
    fail(
      "Binding DB belum tersedia.",
      500
    );
  }

  const username =
    validateUsername(
      normalizeUsername(
        data.username
      )
    );

  const password =
    validatePassword(
      data.password
    );

  const firstName =
    String(
      data.first_name ??
      data.firstName ??
      username
    )
      .trim()
      .slice(0, 80);

  const existing =
    await env.DB
      .prepare(
        "SELECT id FROM users WHERE username = ? LIMIT 1"
      )
      .bind(username)
      .first();

  if (existing) {
    fail(
      "Username sudah digunakan."
    );
  }

  const passwordHash =
    await hashPassword(
      password
    );

  const timestamp =
    now();

  const result =
    await env.DB
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
          updated_at,
          last_login_at
        )
        VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?, NULL)
        `
      )
      .bind(
        username,
        passwordHash,
        firstName,
        timestamp,
        timestamp
      )
      .run();

  const userId =
    result?.meta?.last_row_id;

  if (!userId) {
    fail(
      "Akun gagal dibuat.",
      500
    );
  }

  return getUserById(
    env,
    userId
  );
}

export async function login(
  env,
  data = {}
) {
  if (!env?.DB) {
    fail(
      "Binding DB belum tersedia.",
      500
    );
  }

  const username =
    validateUsername(
      normalizeUsername(
        data.username
      )
    );

  const password =
    validatePassword(
      data.password
    );

  const user =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          username,
          password_hash,
          first_name,
          balance,
          status,
          created_at,
          updated_at,
          last_login_at
        FROM users
        WHERE username = ?
        LIMIT 1
        `
      )
      .bind(username)
      .first();

  if (!user) {
    fail(
      "Username atau password salah.",
      401
    );
  }

  if (
    String(user.status)
      .toUpperCase() !==
    "ACTIVE"
  ) {
    fail(
      "Akun tidak dapat digunakan.",
      403
    );
  }

  const valid =
    await verifyPassword(
      password,
      user.password_hash
    );

  if (!valid) {
    fail(
      "Username atau password salah.",
      401
    );
  }

  const timestamp =
    now();

  await env.DB
    .prepare(
      `
      UPDATE users
      SET last_login_at = ?,
          updated_at = ?
      WHERE id = ?
      `
    )
    .bind(
      timestamp,
      timestamp,
      user.id
    )
    .run();

  const session =
    await createSession(
      env,
      user.id
    );

  return {
    user:
      await getUserById(
        env,
        user.id
      ),
    session
  };
}

export async function createSession(
  env,
  userId
) {
  if (!env?.DB) {
    fail(
      "Binding DB belum tersedia.",
      500
    );
  }

  const token =
    randomToken();

  const tokenHash =
    await sha256(token);

  const createdAt =
    now();

  const expiresAt =
    addDays(
      createdAt,
      SESSION_DAYS
    );

  await env.DB
    .prepare(
      `
      INSERT INTO user_sessions
      (
        user_id,
        token_hash,
        expires_at,
        created_at,
        last_seen_at,
        revoked_at
      )
      VALUES (?, ?, ?, ?, ?, NULL)
      `
    )
    .bind(
      userId,
      tokenHash,
      expiresAt,
      createdAt,
      createdAt
    )
    .run();

  return {
    token,
    expires_at: expiresAt,
    cookie: cookieHeader(
      token,
      SESSION_DAYS * 86400
    )
  };
}

export async function getSession(
  env,
  request
) {
  if (!env?.DB) {
    return null;
  }

  const cookies =
    parseCookies(request);

  const token =
    cookies[
      SESSION_COOKIE
    ];

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(token);

  const session =
    await env.DB
      .prepare(
        `
        SELECT
          us.id,
          us.user_id,
          us.expires_at,
          us.created_at,
          us.last_seen_at,
          u.username,
          u.first_name,
          u.balance,
          u.status
        FROM user_sessions us
        INNER JOIN users u
          ON u.id = us.user_id
        WHERE us.token_hash = ?
          AND us.revoked_at IS NULL
          AND us.expires_at > ?
        LIMIT 1
        `
      )
      .bind(
        tokenHash,
        now()
      )
      .first();

  if (!session) {
    return null;
  }

  if (
    String(session.status)
      .toUpperCase() !==
    "ACTIVE"
  ) {
    return null;
  }

  await env.DB
    .prepare(
      `
      UPDATE user_sessions
      SET last_seen_at = ?
      WHERE id = ?
      `
    )
    .bind(
      now(),
      session.id
    )
    .run();

  return {
    id: session.user_id,
    username: session.username,
    first_name: session.first_name,
    balance: Number(
      session.balance || 0
    ),
    status: session.status,
    session_id: session.id,
    expires_at: session.expires_at
  };
}

export async function requireAuth(
  env,
  request
) {
  const user =
    await getSession(
      env,
      request
    );

  if (!user) {
    fail(
      "Silakan login terlebih dahulu.",
      401
    );
  }

  return user;
}

export async function logout(
  env,
  request
) {
  if (!env?.DB) {
    return {
      ok: false,
      cookie: clearCookieHeader()
    };
  }

  const cookies =
    parseCookies(request);

  const token =
    cookies[
      SESSION_COOKIE
    ];

  if (token) {
    const tokenHash =
      await sha256(token);

    await env.DB
      .prepare(
        `
        UPDATE user_sessions
        SET revoked_at = ?
        WHERE token_hash = ?
          AND revoked_at IS NULL
        `
      )
      .bind(
        now(),
        tokenHash
      )
      .run();
  }

  return {
    ok: true,
    cookie: clearCookieHeader()
  };
}

export async function revokeAllSessions(
  env,
  userId
) {
  if (!env?.DB) {
    fail(
      "Binding DB belum tersedia.",
      500
    );
  }

  await env.DB
    .prepare(
      `
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE user_id = ?
        AND revoked_at IS NULL
      `
    )
    .bind(
      now(),
      userId
    )
    .run();

  return true;
}

export async function getUserById(
  env,
  userId
) {
  if (!env?.DB) {
    fail(
      "Binding DB belum tersedia.",
      500
    );
  }

  const user =
    await env.DB
      .prepare(
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
        `
      )
      .bind(
        userId
      )
      .first();

  return user || null;
}

export async function cleanupSessions(
  env
) {
  if (!env?.DB) {
    return false;
  }

  await env.DB
    .prepare(
      `
      DELETE FROM user_sessions
      WHERE expires_at <= ?
         OR revoked_at IS NOT NULL
      `
    )
    .bind(
      now()
    )
    .run();

  return true;
}

export function authCookieName() {
  return SESSION_COOKIE;
}

export function authCookieOptions(
  token
) {
  return cookieHeader(
    token,
    SESSION_DAYS * 86400
  );
}

export function clearAuthCookie() {
  return clearCookieHeader();
}