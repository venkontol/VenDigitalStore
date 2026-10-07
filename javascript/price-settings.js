import { nowUnix } from "./utils.js";

const SETTING_KEYS = Object.freeze({
  NOKOS: "markup_nokos",
  SOSMED: "markup_sosmed"
});

function normalizeType(type) {
  const value = String(type || "").trim().toUpperCase();
  if (value === "NOKOS" || value === "SOSMED") return value;
  return null;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000) return null;
  return Math.round(number * 100) / 100;
}

async function getSettingValue(env, key) {
  if (!env?.DB) return null;
  const row = await env.DB.prepare(`
    SELECT value
    FROM settings
    WHERE key = ?
    LIMIT 1
  `).bind(key).first();
  return row?.value ?? null;
}

export async function getMarkupPercent(env, type) {
  const normalizedType = normalizeType(type);
  if (!normalizedType) return 0;

  try {
    const raw = await getSettingValue(env, SETTING_KEYS[normalizedType]);
    const value = normalizePercent(raw);
    return value === null ? 0 : value;
  } catch (error) {
    console.error("[MARKUP GET ERROR]", normalizedType, error);
    return 0;
  }
}

export async function getMarkupSettings(env) {
  const nokos = await getMarkupPercent(env, "NOKOS");
  const sosmed = await getMarkupPercent(env, "SOSMED");
  return { nokos, sosmed };
}

export async function setMarkupPercent(env, type, value) {
  const normalizedType = normalizeType(type);
  const percent = normalizePercent(value);

  if (!normalizedType) {
    throw new Error("Jenis markup tidak valid.");
  }

  if (percent === null) {
    throw new Error("Markup harus berupa angka 0 sampai 1000 persen.");
  }

  if (!env?.DB) {
    throw new Error("Database tidak tersedia.");
  }

  const key = SETTING_KEYS[normalizedType];
  const updatedAt = nowUnix();

  await env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key)
    DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, String(percent), updatedAt).run();

  return percent;
}

export { normalizeType, normalizePercent };
