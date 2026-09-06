import {
  requireAdmin
} from "./auth.js";

import {
  errorResponse,
  getSetting,
  getSettingInt,
  jsonResponse,
  nowUnix,
  readJson,
  successResponse
} from "./utils.js";

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

function normalizeSettingValue(
  key,
  value
) {
  const definition =
    SETTING_DEFINITIONS[key];

  if (!definition) {
    return null;
  }

  if (
    definition.type ===
    "integer"
  ) {
    const parsed =
      Number(value);

    if (
      !Number.isInteger(
        parsed
      )
    ) {
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

  const normalized =
    String(
      value ?? ""
    ).trim();

  if (
    normalized.length <
      definition.min ||
    normalized.length >
      definition.max
  ) {
    return null;
  }

  if (
    definition.type ===
    "path"
  ) {
    if (
      !normalized.startsWith("/")
    ) {
      return null;
    }

    if (
      normalized.includes(
        "\n"
      ) ||
      normalized.includes(
        "\r"
      )
    ) {
      return null;
    }
  }

  return normalized;
}

async function getAllSettings(
  db,
  keys = PUBLIC_SETTINGS
) {
  if (!keys.length) {
    return {};
  }

  const placeholders =
    keys
      .map(
        () => "?"
      )
      .join(",");

  const result =
    await db
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
      .bind(
        ...keys
      )
      .all();

  const settings = {};

  for (
    const row of
      result?.results || []
  ) {
    settings[row.key] =
      row.value;
  }

  return settings;
}

async function upsertSetting(
  db,
  key,
  value
) {
  const timestamp =
    nowUnix();

  const result =
    await db
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
            updated_at =
              excluded.updated_at
        `
      )
      .bind(
        key,
        value,
        timestamp
      )
      .run();

  return (
    result?.meta?.changes >= 1
  );
}

async function getSettingRow(
  db,
  key
) {
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
    .bind(
      key
    )
    .first();
}

export async function getPublicSettings(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const settings =
    await getAllSettings(
      env.DB
    );

  return jsonResponse({
    success: true,
    settings
  });
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

  const url =
    new URL(
      request.url
    );

  const key =
    String(
      url.searchParams.get(
        "key"
      ) || ""
    ).trim();

  if (
    !PUBLIC_SETTINGS.includes(
      key
    )
  ) {
    return errorResponse(
      "Setting tidak tersedia.",
      404
    );
  }

  const row =
    await getSettingRow(
      env.DB,
      key
    );

  if (!row) {
    return errorResponse(
      "Setting tidak ditemukan.",
      404
    );
  }

  return successResponse({
    key:
      row.key,
    value:
      row.value,
    updated_at:
      row.updated_at
  });
}

export async function adminGetSettings(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const rows =
    await env.DB
      .prepare(
        `
          SELECT
            key,
            value,
            updated_at
          FROM settings
          ORDER BY key ASC
        `
      )
      .all();

  return successResponse({
    settings:
      Array.isArray(
        rows?.results
      )
        ? rows.results
        : []
  });
}

export async function adminGetSetting(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const url =
    new URL(
      request.url
    );

  const key =
    String(
      url.searchParams.get(
        "key"
      ) || ""
    ).trim();

  if (
    !SETTING_DEFINITIONS[key]
  ) {
    return errorResponse(
      "Setting tidak dikenal.",
      400
    );
  }

  const row =
    await getSettingRow(
      env.DB,
      key
    );

  if (!row) {
    return errorResponse(
      "Setting tidak ditemukan.",
      404
    );
  }

  return successResponse({
    setting:
      row
  });
}

export async function adminUpdateSetting(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const data =
    await readJson(
      request
    );

  if (!data) {
    return errorResponse(
      "Data setting tidak valid.",
      400
    );
  }

  const key =
    String(
      data.key || ""
    ).trim();

  if (
    !SETTING_DEFINITIONS[key]
  ) {
    return errorResponse(
      "Setting tidak dikenal.",
      400
    );
  }

  if (
    data.value ===
      undefined ||
    data.value ===
      null
  ) {
    return errorResponse(
      "Nilai setting wajib diisi.",
      400
    );
  }

  const value =
    normalizeSettingValue(
      key,
      data.value
    );

  if (
    value === null
  ) {
    return errorResponse(
      "Nilai setting tidak valid.",
      400
    );
  }

  if (
    key ===
      "deposit_min" ||
    key ===
      "deposit_max"
  ) {
    const oppositeKey =
      key ===
      "deposit_min"
        ? "deposit_max"
        : "deposit_min";

    const oppositeValue =
      await getSettingInt(
        env.DB,
        oppositeKey,
        key ===
          "deposit_min"
          ? 10000000
          : 1000
      );

    const numericValue =
      Number(value);

    if (
      key ===
        "deposit_min" &&
      numericValue >
        oppositeValue
    ) {
      return errorResponse(
        "Minimum deposit tidak boleh lebih besar dari maksimum deposit.",
        400
      );
    }

    if (
      key ===
        "deposit_max" &&
      numericValue <
        oppositeValue
    ) {
      return errorResponse(
        "Maksimum deposit tidak boleh lebih kecil dari minimum deposit.",
        400
      );
    }
  }

  try {
    await upsertSetting(
      env.DB,
      key,
      value
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyimpan setting.",
      500
    );
  }

  const updated =
    await getSettingRow(
      env.DB,
      key
    );

  return successResponse({
    setting:
      updated
  });
}

export async function adminUpdateSettings(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const data =
    await readJson(
      request
    );

  if (!data) {
    return errorResponse(
      "Data settings tidak valid.",
      400
    );
  }

  const input =
    Array.isArray(
      data.settings
    )
      ? data.settings
      : [];

  if (!input.length) {
    return errorResponse(
      "Tidak ada setting yang dikirim.",
      400
    );
  }

  const values = new Map();

  for (
    const item of input
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      return errorResponse(
        "Format setting tidak valid.",
        400
      );
    }

    const key =
      String(
        item.key || ""
      ).trim();

    if (
      !SETTING_DEFINITIONS[key]
    ) {
      return errorResponse(
        `Setting tidak dikenal: ${key}`,
        400
      );
    }

    const value =
      normalizeSettingValue(
        key,
        item.value
      );

    if (
      value === null
    ) {
      return errorResponse(
        `Nilai setting tidak valid: ${key}`,
        400
      );
    }

    values.set(
      key,
      value
    );
  }

  const currentMin =
    values.has(
      "deposit_min"
    )
      ? Number(
          values.get(
            "deposit_min"
          )
        )
      : await getSettingInt(
          env.DB,
          "deposit_min",
          1000
        );

  const currentMax =
    values.has(
      "deposit_max"
    )
      ? Number(
          values.get(
            "deposit_max"
          )
        )
      : await getSettingInt(
          env.DB,
          "deposit_max",
          10000000
        );

  if (
    currentMin >
    currentMax
  ) {
    return errorResponse(
      "Minimum deposit tidak boleh lebih besar dari maksimum deposit.",
      400
    );
  }

  try {
    const statements =
      Array.from(
        values.entries()
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
                  value =
                    excluded.value,
                  updated_at =
                    excluded.updated_at
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

  const settings =
    await getAllSettings(
      env.DB,
      Array.from(
        values.keys()
      )
    );

  return successResponse({
    settings
  });
}

export async function adminResetSettings(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const defaults = {
    site_name:
      "VenDigitalStore",
    deposit_min:
      "1000",
    deposit_max:
      "10000000",
    deposit_expiry_minutes:
      "30",
    qris_image:
      "/images/qris.jpg"
  };

  try {
    const statements =
      Object.entries(
        defaults
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
                  value =
                    excluded.value,
                  updated_at =
                    excluded.updated_at
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
        "Gagal mereset settings.",
      500
    );
  }

  return successResponse({
    settings:
      await getAllSettings(
        env.DB,
        Object.keys(
          defaults
        )
      )
  });
}

export function getSettingDefinitions() {
  return SETTING_DEFINITIONS;
}

export function getPublicSettingKeys() {
  return PUBLIC_SETTINGS;
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

  return getSetting(
    db,
    key,
    fallback
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

  return getSettingInt(
    db,
    key,
    fallback
  );
}