/**
 * VenDigitalStore
 * src/utils.js
 *
 * Utility umum untuk Cloudflare Workers.
 * Tidak membutuhkan dependency eksternal.
 */

/* =========================================================
   RESPONSE
========================================================= */

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...extra
    },
    status
  );
}

export function successResponse(data = {}, status = 200) {
  return jsonResponse(
    {
      success: true,
      ...data
    },
    status
  );
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}


/* =========================================================
   REQUEST / BODY
========================================================= */

export async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Request body harus menggunakan JSON.");
  }

  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Format JSON tidak valid.");
    }

    return body;
  } catch {
    throw new Error("JSON request tidak valid.");
  }
}

export function getUrl(request) {
  return new URL(request.url);
}

export function getPath(request) {
  return new URL(request.url).pathname;
}

export function getMethod(request) {
  return request.method.toUpperCase();
}


/* =========================================================
   STRING / VALIDATION
========================================================= */

export function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function cleanUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 32);
}

export function cleanFirstName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function isValidUsername(username) {
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username);
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

export function isValidInteger(value) {
  return Number.isInteger(value);
}

export function parsePositiveInteger(value, fallback = null) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    return fallback;
  }

  return number;
}

export function parseNonNegativeInteger(value, fallback = null) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    return fallback;
  }

  return number;
}


/* =========================================================
   RANDOM / ID
========================================================= */

const RANDOM_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomId(length = 4) {
  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  let result = "";

  for (let i = 0; i < length; i++) {
    result += RANDOM_CHARS[bytes[i] % RANDOM_CHARS.length];
  }

  return result;
}

export function randomToken(bytesLength = 32) {
  const bytes = new Uint8Array(bytesLength);

  crypto.getRandomValues(bytes);

  return bytesToHex(bytes);
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}


/* =========================================================
   CRYPTO / HASH
========================================================= */

export async function sha256(value) {
  const data = new TextEncoder().encode(String(value));

  const hash = await crypto.subtle.digest("SHA-256", data);

  return bytesToHex(new Uint8Array(hash));
}

export async function sha256Bytes(value) {
  const data = value instanceof Uint8Array
    ? value
    : new TextEncoder().encode(String(value));

  const hash = await crypto.subtle.digest("SHA-256", data);

  return new Uint8Array(hash);
}

export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}


/* =========================================================
   PASSWORD HASHING
   PBKDF2 + SHA-256
========================================================= */

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 256;

export async function hashPassword(password) {
  if (!isValidPassword(password)) {
    throw new Error("Password tidak memenuhi persyaratan.");
  }

  const salt = new Uint8Array(16);

  crypto.getRandomValues(salt);

  const passwordBytes = new TextEncoder().encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    {
      name: "PBKDF2"
    },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    PASSWORD_KEY_LENGTH
  );

  const hash = new Uint8Array(derivedBits);

  return [
    "pbkdf2",
    "sha256",
    PASSWORD_ITERATIONS,
    bytesToHex(salt),
    bytesToHex(hash)
  ].join("$");
}

export async function verifyPassword(password, storedHash) {
  if (
    typeof password !== "string" ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const parts = storedHash.split("$");

  if (parts.length !== 5) {
    return false;
  }

  const [
    algorithm,
    hashAlgorithm,
    iterationsString,
    saltHex,
    expectedHashHex
  ] = parts;

  if (
    algorithm !== "pbkdf2" ||
    hashAlgorithm !== "sha256"
  ) {
    return false;
  }

  const iterations = Number(iterationsString);

  if (
    !Number.isInteger(iterations) ||
    iterations < 10000 ||
    iterations > 1000000
  ) {
    return false;
  }

  try {
    const salt = hexToBytes(saltHex);

    if (salt.length !== 16) {
      return false;
    }

    const passwordBytes = new TextEncoder().encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      {
        name: "PBKDF2"
      },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      PASSWORD_KEY_LENGTH
    );

    const actualHashHex = bytesToHex(
      new Uint8Array(derivedBits)
    );

    return constantTimeEqual(
      actualHashHex,
      expectedHashHex
    );
  } catch {
    return false;
  }
}

export function hexToBytes(hex) {
  if (
    typeof hex !== "string" ||
    hex.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(hex)
  ) {
    throw new Error("Hex tidak valid.");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return bytes;
}


/* =========================================================
   COOKIE
========================================================= */

export function parseCookies(request) {
  const header = request.headers.get("Cookie");

  if (!header) {
    return {};
  }

  const cookies = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!name) {
      continue;
    }

    cookies[name] = decodeCookieValue(value);
  }

  return cookies;
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function serializeCookie(
  name,
  value,
  options = {}
) {
  let cookie = `${name}=${encodeURIComponent(value)}`;

  if (options.maxAge !== undefined) {
    cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
  }

  if (options.expires instanceof Date) {
    cookie += `; Expires=${options.expires.toUTCString()}`;
  }

  if (options.path) {
    cookie += `; Path=${options.path}`;
  } else {
    cookie += "; Path=/";
  }

  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }

  if (options.httpOnly !== false) {
    cookie += "; HttpOnly";
  }

  if (options.secure !== false) {
    cookie += "; Secure";
  }

  if (options.sameSite) {
    cookie += `; SameSite=${options.sameSite}`;
  } else {
    cookie += "; SameSite=Lax";
  }

  return cookie;
}

export function sessionCookie(token, maxAge) {
  return serializeCookie(
    "vds_session",
    token,
    {
      maxAge,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

export function clearSessionCookie() {
  return serializeCookie(
    "vds_session",
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}


/* =========================================================
   HTTP HEADERS
========================================================= */

export function appendSetCookie(response, cookie) {
  const headers = new Headers(response.headers);

  headers.append("Set-Cookie", cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    ""
  );
}

export function getUserAgent(request) {
  return (
    request.headers.get("User-Agent") ||
    ""
  ).slice(0, 1000);
}


/* =========================================================
   DATE / TIME
========================================================= */

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

export function addSeconds(seconds) {
  return nowUnix() + Number(seconds);
}

export function unixToIso(unix) {
  if (!unix) {
    return null;
  }

  return new Date(Number(unix) * 1000).toISOString();
}

export function formatRupiah(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Rp0";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(number);
}


/* =========================================================
   DATABASE HELPERS
========================================================= */

export async function getSetting(
  db,
  key,
  fallback = null
) {
  const row = await db
    .prepare(
      "SELECT value FROM settings WHERE key = ? LIMIT 1"
    )
    .bind(key)
    .first();

  return row?.value ?? fallback;
}

export async function getSettingInt(
  db,
  key,
  fallback = 0
) {
  const value = await getSetting(
    db,
    key,
    null
  );

  const number = Number(value);

  return Number.isSafeInteger(number)
    ? number
    : fallback;
}


/* =========================================================
   SQL / PAGINATION
========================================================= */

export function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

export function getPagination(
  url,
  defaultLimit = 20,
  maxLimit = 100
) {
  const requestedPage = Number(
    url.searchParams.get("page")
  );

  const requestedLimit = Number(
    url.searchParams.get("limit")
  );

  const page = Number.isInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  const limit = Number.isInteger(requestedLimit) &&
    requestedLimit > 0
      ? clamp(requestedLimit, 1, maxLimit)
      : defaultLimit;

  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset
  };
}


/* =========================================================
   ORDER / DEPOSIT HELPERS
========================================================= */

export function normalizeDepositCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

export function isValidDepositCode(code) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(code);
}

export function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();

  return `VDS-${timestamp}-${randomId(4)}`;
}


/* =========================================================
   SECURITY
========================================================= */

export function isSecureRequest(request) {
  const url = new URL(request.url);

  // localhost/dev masih boleh digunakan untuk development.
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return true;
  }

  return url.protocol === "https:";
}

export function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache"
  };
    }
