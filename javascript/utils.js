const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store"
};

const PASSWORD_SCHEME = "pbkdf2";
const PASSWORD_HASH = "sha256";
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_BITS = 256;

const INTEGER_RULES = Object.freeze({
  positive: Object.freeze({
    min: 1
  }),
  nonNegative: Object.freeze({
    min: 0
  })
});

const DEPOSIT_RULES = Object.freeze({
  codeMaxLength: 64,
  codePattern: /^[A-Z0-9_-]{6,64}$/,
  minAmount: 1000,
  maxAmount: 10000000
});

function integerFromValue(
  value,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  } = {}
) {
  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    return null;
  }

  if (number < min || number > max) {
    return null;
  }

  return number;
}

export function jsonResponse(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...JSON_HEADERS,
        ...headers
      }
    }
  );
}

export function errorResponse(
  message,
  status = 400,
  extra = {}
) {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...extra
    },
    status
  );
}

export function successResponse(
  data = {},
  status = 200
) {
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
    const data = await request.json();

    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return null;
    }

    return data;
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

export function cleanString(
  value,
  maxLength = 255
) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export function cleanUsername(value) {
  return cleanString(
    value,
    32
  ).toLowerCase();
}

export function cleanFirstName(value) {
  return cleanString(
    value,
    80
  );
}

export function isValidUsername(username) {
  return /^[a-z0-9_]{3,32}$/.test(
    username
  );
}

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128
  );
}

export function parseInteger(
  value,
  options = {}
) {
  return integerFromValue(
    value,
    options
  );
}

export function parsePositiveInteger(value) {
  return integerFromValue(
    value,
    INTEGER_RULES.positive
  );
}

export function parseNonNegativeInteger(value) {
  return integerFromValue(
    value,
    INTEGER_RULES.nonNegative
  );
}

export function randomId(length = 16) {
  const normalizedLength =
    integerFromValue(
      length,
      {
        min: 1,
        max: 1024
      }
    ) || 16;

  const bytes =
    new Uint8Array(
      Math.ceil(normalizedLength / 2)
    );

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .slice(0, normalizedLength);
}

export function randomToken(
  bytesLength = 32
) {
  const normalizedLength =
    integerFromValue(
      bytesLength,
      {
        min: 1,
        max: 1024
      }
    ) || 32;

  const bytes =
    new Uint8Array(
      normalizedLength
    );

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

export async function sha256(value) {
  const data =
    new TextEncoder().encode(
      String(value)
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

export async function hashPassword(
  password,
  salt = null
) {
  const actualSalt =
    salt ||
    randomToken(16);

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        password
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(
          actualSalt
        ),
        iterations:
          PASSWORD_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      PASSWORD_BITS
    );

  const hash =
    bytesToHex(
      new Uint8Array(bits)
    );

  return [
    PASSWORD_SCHEME,
    PASSWORD_HASH,
    PASSWORD_ITERATIONS,
    actualSalt,
    hash
  ].join("$");
}

export async function verifyPassword(
  password,
  stored
) {
  if (
    typeof stored !== "string" ||
    !stored.startsWith(
      `${PASSWORD_SCHEME}$`
    )
  ) {
    return false;
  }

  const parts =
    stored.split("$");

  if (parts.length !== 5) {
    return false;
  }

  const [
    scheme,
    hashAlgorithm,
    iterationText,
    salt,
    expected
  ] = parts;

  if (
    scheme !== PASSWORD_SCHEME ||
    hashAlgorithm !== PASSWORD_HASH ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const iterations =
    integerFromValue(
      iterationText,
      {
        min: 1
      }
    );

  if (!iterations) {
    return false;
  }

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        password
      ),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(
          salt
        ),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      PASSWORD_BITS
    );

  const actual =
    bytesToHex(
      new Uint8Array(bits)
    );

  return timingSafeEqual(
    actual,
    expected
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

export function timingSafeEqual(
  a,
  b
) {
  const left = String(a);
  const right = String(b);

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let index = 0;
    index < left.length;
    index++
  ) {
    result |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
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

  if (
    options.maxAge !== undefined
  ) {
    parts.push(
      `Max-Age=${options.maxAge}`
    );
  }

  if (options.expires) {
    parts.push(
      `Expires=${new Date(
        options.expires
      ).toUTCString()}`
    );
  }

  parts.push(
    `Path=${options.path || "/"}`
  );

  if (
    options.domain
  ) {
    parts.push(
      `Domain=${options.domain}`
    );
  }

  if (
    options.httpOnly !== false
  ) {
    parts.push("HttpOnly");
  }

  if (
    options.secure !== false
  ) {
    parts.push("Secure");
  }

  parts.push(
    `SameSite=${
      options.sameSite || "Lax"
    }`
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

export function getCookie(
  request,
  name
) {
  const header =
    request.headers.get(
      "Cookie"
    );

  if (!header) {
    return null;
  }

  const cookies =
    header.split(";");

  for (
    const cookie of cookies
  ) {
    const index =
      cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      cookie
        .slice(0, index)
        .trim();

    if (key !== name) {
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
  const amount =
    Number(value || 0);

  return new Intl.NumberFormat(
    "id-ID",
    {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }
  ).format(
    Number.isFinite(amount)
      ? amount
      : 0
  );
}

export async function getSetting(
  db,
  key,
  fallback = null
) {
  const row =
    await db
      .prepare(`
        SELECT value
        FROM settings
        WHERE key = ?
        LIMIT 1
      `)
      .bind(key)
      .first();

  return row?.value ??
    fallback;
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
    integerFromValue(value);

  return number === null
    ? fallback
    : number;
}

export function getPagination(
  url,
  defaultLimit = 20,
  maxLimit = 100
) {
  const safeDefault =
    integerFromValue(
      defaultLimit,
      {
        min: 1
      }
    ) || 20;

  const safeMax =
    integerFromValue(
      maxLimit,
      {
        min: 1
      }
    ) || 100;

  const page =
    integerFromValue(
      url.searchParams.get(
        "page"
      ),
      {
        min: 1
      }
    ) || 1;

  const requestedLimit =
    integerFromValue(
      url.searchParams.get(
        "limit"
      ),
      {
        min: 1
      }
    ) || safeDefault;

  const limit =
    Math.min(
      safeMax,
      requestedLimit
    );

  return {
    page,
    limit,
    offset:
      (page - 1) * limit
  };
}

export function normalizeDepositCode(
  value
) {
  return cleanString(
    value,
    DEPOSIT_RULES.codeMaxLength
  ).toUpperCase();
}

export function isValidDepositCode(
  value
) {
  return DEPOSIT_RULES
    .codePattern
    .test(
      normalizeDepositCode(value)
    );
}

export function generateOrderNumber(
  prefix = "VDS"
) {
  const safePrefix =
    cleanString(
      prefix,
      20
    )
      .toUpperCase()
      .replace(
        /[^A-Z0-9_-]/g,
        ""
      ) || "VDS";

  const timestamp =
    Date.now()
      .toString(36)
      .toUpperCase();

  return `${safePrefix}-${timestamp}-${randomId(6).toUpperCase()}`;
}

export function parseJson(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function jsonText(
  value
) {
  try {
    return JSON.stringify(
      value ?? {}
    );
  } catch {
    return "{}";
  }
}
