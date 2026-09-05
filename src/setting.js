import {
  cleanString,
  getSetting,
  getSettingInt,
  successResponse,
  errorResponse,
  readJson
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

const BOOLEAN_KEYS = new Set([
  "qris_enabled",
  "maintenance_mode",
  "telegram_enabled"
]);

const INTEGER_KEYS = new Set([
  "deposit_min",
  "deposit_max",
  "deposit_expiry_minutes",
  "deposit_check_cooldown"
]);

function normalizeValue(key, value) {
  if (
    value === null ||
    value === undefined
  ) {
    return DEFAULTS[key] ?? "";
  }

  if (BOOLEAN_KEYS.has(key)) {
    return Number(value) === 1
      ? "1"
      : "0";
  }

  if (INTEGER_KEYS.has(key)) {
    const number = Number(value);

    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      return DEFAULTS[key];
    }

    return String(
      Math.floor(number)
    );
  }

  return cleanString(
    value,
    1000
  );
}

async function getAllSettings(
  db,
  keys
) {
  if (!keys.length) {
    return {};
  }

  const placeholders =
    keys.map(() => "?").join(",");

  const result =
    await db
      .prepare(
        `SELECT key, value
         FROM settings
         WHERE key IN (${placeholders})`
      )
      .bind(...keys)
      .all();

  const output = {};

  for (const key of keys) {
    output[key] =
      DEFAULTS[key] ?? "";
  }

  for (
    const row of
      result.results || []
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        DEFAULTS,
        row.key
      )
    ) {
      output[row.key] =
        normalizeValue(
          row.key,
          row.value
        );
    }
  }

  return output;
}

function publicSettings(
  settings
) {
  const output = {};

  for (
    const key of PUBLIC_KEYS
  ) {
    output[key] =
      settings[key];
  }

  return output;
}

function adminSettings(
  settings
) {
  const output = {};

  for (
    const key of ADMIN_KEYS
  ) {
    output[key] =
      settings[key];
  }

  return output;
}

async function getPublicSettings(
  request,
  env
) {
  const settings =
    await getAllSettings(
      env.DB,
      PUBLIC_KEYS
    );

  return successResponse(
    publicSettings(settings)
  );
}

async function getAdminSettings(
  request,
  env
) {
  const settings =
    await getAllSettings(
      env.DB,
      ADMIN_KEYS
    );

  return successResponse(
    adminSettings(settings)
  );
}

async function updateSettings(
  request,
  env
) {
  let body;

  try {
    body =
      await readJson(request);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Data pengaturan tidak valid.",
      400
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return errorResponse(
      "Data pengaturan tidak valid.",
      400
    );
  }

  const entries =
    Object.entries(body)
      .filter(
        ([key]) =>
          ADMIN_KEYS.includes(key)
      );

  if (!entries.length) {
    return errorResponse(
      "Tidak ada pengaturan yang diubah.",
      400
    );
  }

  const normalizedEntries =
    entries.map(
      ([key, value]) => [
        key,
        normalizeValue(
          key,
          value
        )
      ]
    );

  const current =
    await getAllSettings(
      env.DB,
      ADMIN_KEYS
    );

  const merged = {
    ...current
  };

  for (
    const [key, value] of
      normalizedEntries
  ) {
    merged[key] = value;
  }

  const depositMin =
    Number(
      merged.deposit_min
    );

  const depositMax =
    Number(
      merged.deposit_max
    );

  const expiry =
    Number(
      merged.deposit_expiry_minutes
    );

  const cooldown =
    Number(
      merged.deposit_check_cooldown
    );

  if (
    !Number.isSafeInteger(
      depositMin
    ) ||
    depositMin < 1000
  ) {
    return errorResponse(
      "deposit_min minimal Rp1.000.",
      400
    );
  }

  if (
    !Number.isSafeInteger(
      depositMax
    ) ||
    depositMax < depositMin ||
    depositMax > 1000000000
  ) {
    return errorResponse(
      "deposit_max tidak valid.",
      400
    );
  }

  if (
    !Number.isSafeInteger(
      expiry
    ) ||
    expiry < 5 ||
    expiry > 1440
  ) {
    return errorResponse(
      "Masa berlaku deposit harus 5 sampai 1440 menit.",
      400
    );
  }

  if (
    !Number.isSafeInteger(
      cooldown
    ) ||
    cooldown < 5 ||
    cooldown > 3600
  ) {
    return errorResponse(
      "Cooldown pengecekan harus 5 sampai 3600 detik.",
      400
    );
  }

  const timestamp =
    Math.floor(
      Date.now() / 1000
    );

  const statements =
    normalizedEntries.map(
      ([key, value]) =>
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
            value,
            timestamp
          )
    );

  await env.DB.batch(
    statements
  );

  const settings =
    await getAllSettings(
      env.DB,
      ADMIN_KEYS
    );

  return successResponse(
    adminSettings(settings)
  );
}

async function getDepositConfig(
  request,
  env
) {
  const settings =
    await getAllSettings(
      env.DB,
      [
        "qris_enabled",
        "deposit_min",
        "deposit_max",
        "deposit_expiry_minutes",
        "deposit_check_cooldown"
      ]
    );

  const min =
    Number(
      settings.deposit_min
    );

  const max =
    Number(
      settings.deposit_max
    );

  const expiry =
    Number(
      settings.deposit_expiry_minutes
    );

  const cooldown =
    Number(
      settings.deposit_check_cooldown
    );

  return successResponse({
    qris_enabled:
      settings.qris_enabled === "1",
    deposit_min:
      Number.isSafeInteger(min)
        ? min
        : 1000,
    deposit_max:
      Number.isSafeInteger(max)
        ? max
        : 10000000,
    deposit_expiry_minutes:
      Number.isSafeInteger(expiry)
        ? expiry
        : 60,
    deposit_check_cooldown:
      Number.isSafeInteger(cooldown)
        ? cooldown
        : 30
  });
}

async function getStoreConfig(
  request,
  env
) {
  const settings =
    await getAllSettings(
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
    store_name:
      settings.store_name,
    store_description:
      settings.store_description,
    store_logo_url:
      settings.store_logo_url,
    store_banner_url:
      settings.store_banner_url,
    store_contact:
      settings.store_contact,
    store_whatsapp:
      settings.store_whatsapp,
    store_telegram:
      settings.store_telegram,
    maintenance_mode:
      settings.maintenance_mode === "1"
  });
}

async function getSettingValue(
  env,
  key,
  fallback = ""
) {
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
