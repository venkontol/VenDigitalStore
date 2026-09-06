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

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getUrl(request) {
  return new URL(request.url);
}

export function getPath(request) {
  return getUrl(request).pathname;
}

export function getMethod(request) {
  return request.method.toUpperCase();
}

export function cleanString(value, maxLength = 255) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export function cleanUsername(value) {
  return cleanString(value, 32).toLowerCase();
}

export function cleanFirstName(value) {
  return cleanString(value, 80);
}

export function isValidUsername(username) {
  return /^[a-z0-9_]{3,32}$/.test(username);
}

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128
  );
}

export function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

export function parseNonNegativeInteger(value) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return number;
}

export function randomId(length = 16) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export function randomToken(bytesLength = 32) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(value) {
  const data = new TextEncoder().encode(String(value));

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password, salt = null) {
  const actualSalt =
    salt ||
    randomToken(16);

  const iterations = 120000;

  const keyMaterial =
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
        salt: new TextEncoder().encode(actualSalt),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

  const hash =
    Array.from(new Uint8Array(bits))
      .map(byte =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");

  return [
    "pbkdf2",
    "sha256",
    iterations,
    actualSalt,
    hash
  ].join("$");
}

export async function verifyPassword(password, stored) {
  if (
    typeof stored !== "string" ||
    !stored.startsWith("pbkdf2$")
  ) {
    return false;
  }

  const parts = stored.split("$");

  if (parts.length !== 5) {
    return false;
  }

  const iterations = Number(parts[2]);
  const salt = parts[3];
  const expected = parts[4];

  if (
    !Number.isSafeInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const keyMaterial =
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
        salt: new TextEncoder().encode(salt),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

  const actual =
    Array.from(new Uint8Array(bits))
      .map(byte =>
        byte.toString(16).padStart(2, "0")
      )
      .join("");

  return timingSafeEqual(
    actual,
    expected
  );
}

export function timingSafeEqual(a, b) {
  const left = String(a);
  const right = String(b);

  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for(let i = 0; i < left.length; i++){
    result |=
      left.charCodeAt(i) ^
      right.charCodeAt(i);
  }

  return result === 0;
}

export function setCookie(
  name,
  value,
  options = {}
) {
  const parts = [
    `${name}=${value}`
  ];

  if(options.maxAge !== undefined){
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if(options.expires){
    parts.push(
      `Expires=${new Date(options.expires).toUTCString()}`
    );
  }

  parts.push(
    `Path=${options.path || "/"}`
  );

  if(options.httpOnly !== false){
    parts.push("HttpOnly");
  }

  if(options.secure !== false){
    parts.push("Secure");
  }

  parts.push(
    `SameSite=${options.sameSite || "Lax"}`
  );

  return parts.join("; ");
}

export function clearCookie(name) {
  return setCookie(
    name,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    }
  );
}

export function getCookie(request, name) {
  const header =
    request.headers.get("Cookie");

  if(!header){
    return null;
  }

  const cookies =
    header.split(";");

  for(const cookie of cookies){
    const index = cookie.indexOf("=");

    if(index === -1){
      continue;
    }

    const key =
      cookie.slice(0, index).trim();

    if(key !== name){
      continue;
    }

    return cookie
      .slice(index + 1)
      .trim();
  }

  return null;
}

export function nowUnix() {
  return Math.floor(
    Date.now() / 1000
  );
}

export function formatRupiah(value) {
  return new Intl.NumberFormat(
    "id-ID",
    {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }
  ).format(
    Number(value || 0)
  );
}

export async function getSetting(
  db,
  key,
  fallback = null
) {
  const row =
    await db.prepare(
      `
      SELECT value
      FROM settings
      WHERE key = ?
      LIMIT 1
      `
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
  const value =
    await getSetting(
      db,
      key,
      null
    );

  const number =
    Number(value);

  return Number.isSafeInteger(number)
    ? number
    : fallback;
}

export function getPagination(
  url,
  defaultLimit = 20,
  maxLimit = 100
) {
  const page =
    Math.max(
      1,
      Number(
        url.searchParams.get("page") || 1
      )
    );

  const requestedLimit =
    Number(
      url.searchParams.get("limit") ||
      defaultLimit
    );

  const limit =
    Math.min(
      maxLimit,
      Math.max(
        1,
        Number.isSafeInteger(requestedLimit)
          ? requestedLimit
          : defaultLimit
      )
    );

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

export function normalizeDepositCode(value) {
  return cleanString(
    value,
    64
  ).toUpperCase();
}

export function isValidDepositCode(value) {
  return /^[A-Z0-9_-]{6,64}$/.test(
    normalizeDepositCode(value)
  );
}

export function generateOrderNumber() {
  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  return `VDS-${timestamp}-${randomId(6).toUpperCase()}`;
}

export function parseJson(value, fallback = null) {
  if(value === null || value === undefined){
    return fallback;
  }

  try{
    return JSON.parse(value);
  }catch{
    return fallback;
  }
}

export function jsonText(value) {
  try{
    return JSON.stringify(
      value ?? {}
    );
  }catch{
    return "{}";
  }
}
