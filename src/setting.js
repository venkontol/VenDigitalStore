import {
  cleanString,
  getSetting,
  getSettingInt,
  jsonResponse,
  readJson,
  successResponse,
  errorResponse
} from "./utils.js";

const PUBLIC_KEYS = [
  "store_name",
  "store_description",
  "store_logo_url",
  "store_banner_url",
  "store_contact",
  "store_whatsapp",
  "store_telegram",
  "qris_enabled",
  "deposit_min",
  "deposit_max",
  "deposit_expiry_minutes",
  "deposit_check_cooldown",
  "maintenance_mode"
];

const ADMIN_KEYS = [
  ...PUBLIC_KEYS,
  "telegram_owner_chat_id",
  "telegram_qr_file_id",
  "telegram_webhook_url",
  "telegram_enabled"
];

const DEFAULTS = {
  store_name: "VenDigitalStore",
  store_description: "Digital Marketplace",
  store_logo_url: "",
  store_banner_url: "",
  store_contact: "",
  store_whatsapp: "",
  store_telegram: "",
  qris_enabled: "1",
  deposit_min: "1000",
  deposit_max: "10000000",
  deposit_expiry_minutes: "60",
  deposit_check_cooldown: "30",
  maintenance_mode: "0",
  telegram_owner_chat_id: "",
  telegram_qr_file_id: "",
  telegram_webhook_url: "",
  telegram_enabled: "1"
};

function normalizeValue(key, value) {
  if (value === null || value === undefined) {
    return DEFAULTS[key] ?? "";
  }

  if (
    key === "qris_enabled" ||
    key === "maintenance_mode" ||
    key === "telegram_enabled"
  ) {
    return Number(value) === 1 ? "1" : "0";
  }

  if (
    key === "deposit_min" ||
    key === "deposit_max" ||
    key === "deposit_expiry_minutes" ||
    key === "deposit_check_cooldown"
  ) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return DEFAULTS[key];
    }

    return String(Math.floor(number));
  }

  return cleanString(value, 1000);
}

async function getAllSettings(db, keys) {
  if (!keys.length) {
    return {};
  }

  const placeholders = keys.map(() => "?").join(",");

  const result = await db
    .prepare(
      `SELECT key, value
       FROM settings
       WHERE key IN (${placeholders})`
    )
    .bind(...keys)
    .all();

  const output = {};

  for (const key of keys) {
    output[key] = DEFAULTS[key] ?? "";
  }

  for (const row of result.results || []) {
    output[row.key] = normalizeValue(
      row.key,
      row.value
    );
  }

  return output;
}

function publicSettings(settings) {
  const output = {};

  for (const key of PUBLIC_KEYS) {
    output[key] = settings[key];
  }

  return output;
}

function adminSettings(settings) {
  const output = {};

  for (const key of ADMIN_KEYS) {
    output[key] = settings[key];
  }

  return output;
}

async function getPublicSettings(request, env) {
  const settings = await getAllSettings(
    env.DB,
    PUBLIC_KEYS
  );

  return successResponse(
    publicSettings(settings)
  );
}

async function getAdminSettings(request, env) {
  const settings = await getAllSettings(
    env.DB,
    ADMIN_KEYS
  );

  return successResponse(
    adminSettings(settings)
  );
}

async function updateSettings(request, env) {
  const body = await readJson(request);

  if (!body || typeof body !== "object") {
    return errorResponse(
      "Data pengaturan tidak valid.",
      400
    );
  }

  const entries = Object.entries(body)
    .filter(([key]) => ADMIN_KEYS.includes(key));

  if (!entries.length) {
    return errorResponse(
      "Tidak ada pengaturan yang diubah.",
      400
    );
  }

  const statements = [];
  const timestamp = Math.floor(Date.now() / 1000);

  for (const [key, value] of entries) {
    const normalized =
      normalizeValue(key, value);

    statements.push(
      env.DB
        .prepare(
          `INSERT INTO settings (
             key,
             value,
             updated_at
           )
           VALUES (?, ?, ?)
           ON CONFLICT(key)
           DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`
        )
        .bind(
          key,
          normalized,
          timestamp
        )
    );
  }

  await env.DB.batch(statements);

  const settings = await getAllSettings(
    env.DB,
    ADMIN_KEYS
  );

  return successResponse(
    adminSettings(settings)
  );
}

async function getDepositConfig(request, env) {
  const min =
    await getSettingInt(
      env.DB,
      "deposit_min",
      1000
    );

  const max =
    await getSettingInt(
      env.DB,
      "deposit_max",
      10000000
    );

  const expiry =
    await getSettingInt(
      env.DB,
      "deposit_expiry_minutes",
      60
    );

  const cooldown =
    await getSettingInt(
      env.DB,
      "deposit_check_cooldown",
      30
    );

  const qrisEnabled =
    await getSettingInt(
      env.DB,
      "qris_enabled",
      1
    );

  return successResponse({
    qris_enabled: qrisEnabled === 1,
    deposit_min: min,
    deposit_max: max,
    deposit_expiry_minutes: expiry,
    deposit_check_cooldown: cooldown
  });
}

async function getStoreConfig(request, env) {
  const settings = await getAllSettings(
    env.DB,
    [
      "store_name",
      "store_description",
      "store_logo_url",
      "store_banner_url",
      "store_contact",
      "store_whatsapp",
      "store_telegram",
      "maintenance_mode"
    ]
  );

  return successResponse({
    ...settings,
    maintenance_mode:
      settings.maintenance_mode === "1"
  });
}

async function getSettingValue(env, key, fallback = "") {
  return getSetting(
    env.DB,
    key,
    fallback
  );
}

export {
  getPublicSettings,
  getAdminSettings,
  updateSettings,
  getDepositConfig,
  getStoreConfig,
  getSettingValue,
  PUBLIC_KEYS,
  ADMIN_KEYS,
  DEFAULTS
};
