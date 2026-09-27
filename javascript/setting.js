import {
  errorResponse,
  getSetting,
  getSettingInt,
  jsonResponse,
  nowUnix,
  readJson,
  successResponse
} from "./utils.js";

const DEFAULT_SETTINGS = Object.freeze({
  site_name: "NexusBase",
  deposit_min: "1000",
  deposit_max: "10000000",
  deposit_expiry_minutes: "15",
  qris_image: "/images/qris.jpg"
});

const SETTING_DEFINITIONS = Object.freeze({
  site_name: {
    type: "string",
    min: 1,
    max: 120
  },
  deposit_min: {
    type: "integer",
    min: 1000,
    max: 10000000
  },
  deposit_max: {
    type: "integer",
    min: 1000,
    max: 10000000
  },
  deposit_expiry_minutes: {
    type: "integer",
    min: 5,
    max: 1440
  },
  qris_image: {
    type: "path",
    min: 1,
    max: 500
  }
});

const PUBLIC_SETTINGS = Object.freeze([
  "site_name",
  "deposit_min",
  "deposit_max",
  "deposit_expiry_minutes",
  "qris_image"
]);

function normalizeSettingValue(key, value) {
  const definition = SETTING_DEFINITIONS[key];

  if (!definition) {
    return null;
  }

  if (definition.type === "integer") {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      return null;
    }

    if (
      parsed < definition.min ||
      parsed > definition.max
    ) {
      return null;
    }

    return String(parsed);
  }

  const normalized = String(value ?? "").trim();

  if (
    normalized.length < definition.min ||
    normalized.length > definition.max
  ) {
    return null;
  }

  if (definition.type === "path") {
    if (!normalized.startsWith("/")) {
      return null;
    }

    if (
      normalized.includes("\n") ||
      normalized.includes("\r") ||
      normalized.includes("..")
    ) {
      return null;
    }
  }

  return normalized;
}

function validateDepositRange(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);

  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return false;
  }

  return min <= max;
}

async function getSettingRow(db, key) {
  return db
    .prepare(
      `
        SELECT
          key,
          value,
          updated_at
        FROM settings
        WHERE key = ?
        LIMIT 1
      `
    )
    .bind(key)
    .first();
}

async function getAllSettings(
  db,
  keys = Object.keys(DEFAULT_SETTINGS)
) {
  if (!keys.length) {
    return {};
  }

  const placeholders = keys
    .map(() => "?")
    .join(",");

  const result = await db
    .prepare(
      `
        SELECT
          key,
          value,
          updated_at
        FROM settings
        WHERE key IN (${placeholders})
      `
    )
    .bind(...keys)
    .all();

  const rows = Array.isArray(result?.results)
    ? result.results
    : [];

  const settings = {};

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(
        DEFAULT_SETTINGS,
        key
      )
    ) {
      settings[key] = DEFAULT_SETTINGS[key];
    }
  }

  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return settings;
}

async function upsertSetting(db, key, value) {
  const timestamp = nowUnix();

  const result = await db
    .prepare(
      `
        INSERT INTO settings (
          key,
          value,
          updated_at
        )
        VALUES (?, ?, ?)
        ON CONFLICT(key)
        DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `
    )
    .bind(
      key,
      value,
      timestamp
    )
    .run();

  return result?.meta?.changes >= 1;
}

async function validateSettingsInput(db, input) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      error: "Data settings tidak valid."
    };
  }

  const values = new Map();

  for (const item of input) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      return {
        ok: false,
        error: "Format setting tidak valid."
      };
    }

    const key = String(
      item.key || ""
    ).trim();

    if (!SETTING_DEFINITIONS[key]) {
      return {
        ok: false,
        error: `Setting tidak dikenal: ${key}`
      };
    }

    if (
      item.value === undefined ||
      item.value === null
    ) {
      return {
        ok: false,
        error: `Nilai setting wajib diisi: ${key}`
      };
    }

    const value = normalizeSettingValue(
      key,
      item.value
    );

    if (value === null) {
      return {
        ok: false,
        error: `Nilai setting tidak valid: ${key}`
      };
    }

    values.set(key, value);
  }

  const currentSettings = await getAllSettings(
    db,
    [
      "deposit_min",
      "deposit_max"
    ]
  );

  const depositMin = values.has("deposit_min")
    ? values.get("deposit_min")
    : currentSettings.deposit_min;

  const depositMax = values.has("deposit_max")
    ? values.get("deposit_max")
    : currentSettings.deposit_max;

  if (
    !validateDepositRange(
      depositMin,
      depositMax
    )
  ) {
    return {
      ok: false,
      error:
        "Minimum deposit tidak boleh lebih besar dari maksimum deposit."
    };
  }

  return {
    ok: true,
    values
  };
}

export function getDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS
  };
}

export function getSettingDefinitions() {
  return SETTING_DEFINITIONS;
}

export function getPublicSettingKeys() {
  return PUBLIC_SETTINGS;
}

export async function getSettings(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  try {
    const settings = await getAllSettings(
      env.DB,
      PUBLIC_SETTINGS
    );

    return successResponse({
      settings
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil settings.",
      500
    );
  }
}

export async function getPublicSettings(
  request,
  env
) {
  return getSettings(
    request,
    env
  );
}

export async function getPublicSetting(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const url = new URL(
    request.url
  );

  const key = String(
    url.searchParams.get("key") || ""
  ).trim();

  if (!PUBLIC_SETTINGS.includes(key)) {
    return errorResponse(
      "Setting tidak tersedia.",
      404
    );
  }

  try {
    const row = await getSettingRow(
      env.DB,
      key
    );

    if (!row) {
      return successResponse({
        key,
        value: DEFAULT_SETTINGS[key],
        updated_at: null
      });
    }

    return successResponse({
      key: row.key,
      value: row.value,
      updated_at: row.updated_at
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil setting.",
      500
    );
  }
}

export async function updateSettings(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const data = await readJson(
    request
  );

  if (!data) {
    return errorResponse(
      "Data settings tidak valid.",
      400
    );
  }

  const input = Array.isArray(
    data.settings
  )
    ? data.settings
    : data.key
      ? [
          {
            key: data.key,
            value: data.value
          }
        ]
      : [];

  if (!input.length) {
    return errorResponse(
      "Tidak ada setting yang dikirim.",
      400
    );
  }

  const validation =
    await validateSettingsInput(
      env.DB,
      input
    );

  if (!validation.ok) {
    return errorResponse(
      validation.error,
      400
    );
  }

  try {
    const statements = Array.from(
      validation.values.entries()
    ).map(
      ([key, value]) =>
        env.DB
          .prepare(
            `
              INSERT INTO settings (
                key,
                value,
                updated_at
              )
              VALUES (?, ?, ?)
              ON CONFLICT(key)
              DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            `
          )
          .bind(
            key,
            value,
            nowUnix()
          )
    );

    await env.DB.batch(
      statements
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyimpan settings.",
      500
    );
  }

  const settings = await getAllSettings(
    env.DB,
    Array.from(
      validation.values.keys()
    )
  );

  return successResponse({
    settings
  });
}

export async function updateSetting(
  db,
  key,
  value
) {
  if (!db) {
    throw new Error(
      "Database tidak tersedia."
    );
  }

  const normalizedKey = String(
    key || ""
  ).trim();

  if (!SETTING_DEFINITIONS[normalizedKey]) {
    throw new Error(
      "Setting tidak dikenal."
    );
  }

  const normalizedValue =
    normalizeSettingValue(
      normalizedKey,
      value
    );

  if (normalizedValue === null) {
    throw new Error(
      "Nilai setting tidak valid."
    );
  }

  const currentSettings =
    await getAllSettings(
      db,
      [
        "deposit_min",
        "deposit_max"
      ]
    );

  const depositMin =
    normalizedKey === "deposit_min"
      ? normalizedValue
      : currentSettings.deposit_min;

  const depositMax =
    normalizedKey === "deposit_max"
      ? normalizedValue
      : currentSettings.deposit_max;

  if (
    !validateDepositRange(
      depositMin,
      depositMax
    )
  ) {
    throw new Error(
      "Minimum deposit tidak boleh lebih besar dari maksimum deposit."
    );
  }

  await upsertSetting(
    db,
    normalizedKey,
    normalizedValue
  );

  return getSettingRow(
    db,
    normalizedKey
  );
}

export async function updateSettingsDirect(
  db,
  settings
) {
  if (!db) {
    throw new Error(
      "Database tidak tersedia."
    );
  }

  if (
    !Array.isArray(settings) ||
    !settings.length
  ) {
    throw new Error(
      "Tidak ada setting yang dikirim."
    );
  }

  const validation =
    await validateSettingsInput(
      db,
      settings
    );

  if (!validation.ok) {
    throw new Error(
      validation.error
    );
  }

  const statements = Array.from(
    validation.values.entries()
  ).map(
    ([key, value]) =>
      db
        .prepare(
          `
            INSERT INTO settings (
              key,
              value,
              updated_at
            )
            VALUES (?, ?, ?)
            ON CONFLICT(key)
            DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
          `
        )
        .bind(
          key,
          value,
          nowUnix()
        )
  );

  await db.batch(
    statements
  );

  return getAllSettings(
    db,
    Array.from(
      validation.values.keys()
    )
  );
}

export async function resetSettings(
  db
) {
  if (!db) {
    throw new Error(
      "Database tidak tersedia."
    );
  }

  const statements =
    Object.entries(
      DEFAULT_SETTINGS
    ).map(
      ([key, value]) =>
        db
          .prepare(
            `
              INSERT INTO settings (
                key,
                value,
                updated_at
              )
              VALUES (?, ?, ?)
              ON CONFLICT(key)
              DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            `
          )
          .bind(
            key,
            value,
            nowUnix()
          )
    );

  await db.batch(
    statements
  );

  return getAllSettings(
    db,
    Object.keys(
      DEFAULT_SETTINGS
    )
  );
}

export async function readApplicationSetting(
  db,
  key,
  fallback = null
) {
  if (
    !SETTING_DEFINITIONS[key]
  ) {
    return fallback;
  }

  const defaultValue =
    Object.prototype.hasOwnProperty.call(
      DEFAULT_SETTINGS,
      key
    )
      ? DEFAULT_SETTINGS[key]
      : fallback;

  return getSetting(
    db,
    key,
    defaultValue
  );
}

export async function readApplicationIntegerSetting(
  db,
  key,
  fallback
) {
  if (
    !SETTING_DEFINITIONS[key] ||
    SETTING_DEFINITIONS[key].type !==
      "integer"
  ) {
    return fallback;
  }

  const defaultValue =
    Object.prototype.hasOwnProperty.call(
      DEFAULT_SETTINGS,
      key
    )
      ? Number(
          DEFAULT_SETTINGS[key]
        )
      : fallback;

  return getSettingInt(
    db,
    key,
    defaultValue
  );
}

export async function getSettingValue(
  db,
  key,
  fallback = null
) {
  return readApplicationSetting(
    db,
    key,
    fallback
  );
}

export async function getSettingInteger(
  db,
  key,
  fallback
) {
  return readApplicationIntegerSetting(
    db,
    key,
    fallback
  );
}