import {
  errorResponse,
  normalizeDepositCode,
  parsePositiveInteger,
  readJson,
  cleanString,
  nowUnix,
  randomId,
  successResponse
} from "./utils.js";

import { requireAuth, requireAdmin } from "./auth.js";
import { creditBalance } from "./wallet.js";
import { getSettingInteger, getSettingValue } from "./setting.js";

const DEFAULT_MIN_DEPOSIT = 1000;
const DEFAULT_MAX_DEPOSIT = 10000000;
const DEFAULT_EXPIRY_MINUTES = 15;
const DEFAULT_QRIS_IMAGE = "/images/qris.jpg";
const MAX_IDEMPOTENCY_LENGTH = 120;

async function getDepositSettings(env) {
  const configuredMin = Number(await getSettingInteger(
    env.DB,
    "deposit_min",
    DEFAULT_MIN_DEPOSIT
  ));

  const configuredMax = Number(await getSettingInteger(
    env.DB,
    "deposit_max",
    DEFAULT_MAX_DEPOSIT
  ));

  const configuredExpiry = Number(await getSettingInteger(
    env.DB,
    "deposit_expiry_minutes",
    DEFAULT_EXPIRY_MINUTES
  ));

  const qrisImage = await getSettingValue(
    env.DB,
    "qris_image",
    DEFAULT_QRIS_IMAGE
  );

  const min = Number.isInteger(configuredMin) && configuredMin >= 1000 && configuredMin <= DEFAULT_MAX_DEPOSIT
    ? configuredMin
    : DEFAULT_MIN_DEPOSIT;

  const max = Number.isInteger(configuredMax) && configuredMax >= min && configuredMax <= DEFAULT_MAX_DEPOSIT
    ? configuredMax
    : DEFAULT_MAX_DEPOSIT;

  const expiryMinutes = Number.isInteger(configuredExpiry) && configuredExpiry >= 5 && configuredExpiry <= 1440
    ? configuredExpiry
    : DEFAULT_EXPIRY_MINUTES;

  return {
    min,
    max,
    expiryMinutes,
    qrisImage: cleanString(qrisImage || DEFAULT_QRIS_IMAGE, 500) || DEFAULT_QRIS_IMAGE
  };
}

function generateDepositCode() {
  return `DEP-${Date.now().toString(36).toUpperCase()}-${randomId(8).toUpperCase()}`;
}

function serializeDeposit(row, qrisImage, includeUser = false) {
  if (!row) {
    return null;
  }

  const result = {
    id: row.id ?? null,
    code: row.code,
    amount: Number(row.amount || 0),
    status: row.status,
    payment_method: row.payment_method || "QRIS",
    qr_url: qrisImage,
    created_at: Number(row.created_at || 0),
    expires_at: Number(row.expires_at || 0),
    checked_at: row.checked_at == null ? null : Number(row.checked_at),
    paid_at: row.paid_at == null ? null : Number(row.paid_at),
    cancelled_at: row.cancelled_at == null ? null : Number(row.cancelled_at),
    check_count: Number(row.check_count || 0),
    wallet_transaction_id: row.wallet_transaction_id == null ? null : Number(row.wallet_transaction_id)
  };

  if (includeUser) {
    result.user_id = row.user_id ?? null;
    result.username = row.username ?? null;
  }

  return result;
}

async function expireDepositIfNeeded(env, deposit) {
  if (
    !deposit ||
    deposit.status !== "PENDING" ||
    Number(deposit.expires_at) > nowUnix()
  ) {
    return deposit?.status || null;
  }

  const result = await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'EXPIRED'
       WHERE id = ?
         AND status = 'PENDING'
         AND expires_at <= ?`
    )
    .bind(deposit.id, nowUnix())
    .run();

  if (Number(result?.meta?.changes || 0) === 1) {
    return "EXPIRED";
  }

  const current = await env.DB
    .prepare(`SELECT status FROM deposits WHERE id = ? LIMIT 1`)
    .bind(deposit.id)
    .first();

  return current?.status || "EXPIRED";
}

async function findDepositByCode(env, code, userId = null) {
  const normalizedCode = normalizeDepositCode(code);

  if (!normalizedCode) {
    return null;
  }

  if (userId === null || userId === undefined) {
    return env.DB
      .prepare(
        `SELECT
           id,
           user_id,
           code,
           amount,
           status,
           payment_method,
           idempotency_key,
           created_at,
           expires_at,
           checked_at,
           paid_at,
           cancelled_at,
           check_count,
           wallet_transaction_id
         FROM deposits
         WHERE code = ?
         LIMIT 1`
      )
      .bind(normalizedCode)
      .first();
  }

  return env.DB
    .prepare(
      `SELECT
         id,
         user_id,
         code,
         amount,
         status,
         payment_method,
         idempotency_key,
         created_at,
         expires_at,
         checked_at,
         paid_at,
         cancelled_at,
         check_count,
         wallet_transaction_id
       FROM deposits
       WHERE code = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(normalizedCode, userId)
    .first();
}

export async function createDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth.response;
  }

  if (!env?.DB) {
    return errorResponse("Database tidak tersedia.", 500);
  }

  try {
    const body = await readJson(request);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse("Data deposit tidak valid.", 400);
    }

    const settings = await getDepositSettings(env);

    if (settings.min > settings.max) {
      return errorResponse("Konfigurasi nominal deposit tidak valid.", 500);
    }

    const amount = parsePositiveInteger(body.amount);

    if (!amount) {
      return errorResponse("Nominal deposit tidak valid.", 400);
    }

    if (amount < settings.min || amount > settings.max) {
      return errorResponse(
        `Nominal deposit harus antara ${settings.min} dan ${settings.max} rupiah.`,
        400
      );
    }

    const idempotencyKey = cleanString(
      body.idempotency_key ?? body.idempotencyKey ?? "",
      MAX_IDEMPOTENCY_LENGTH
    ) || null;

    if (idempotencyKey) {
      const existing = await env.DB
        .prepare(
          `SELECT
             id,
             user_id,
             code,
             amount,
             status,
             payment_method,
             created_at,
             expires_at,
             checked_at,
             paid_at,
             cancelled_at,
             check_count,
             wallet_transaction_id
           FROM deposits
           WHERE user_id = ?
             AND idempotency_key = ?
           LIMIT 1`
        )
        .bind(auth.user.id, idempotencyKey)
        .first();

      if (existing) {
        const status = await expireDepositIfNeeded(env, existing);
        existing.status = status;

        return successResponse({
          idempotent: true,
          message: "Deposit sudah pernah dibuat.",
          deposit: serializeDeposit(existing, settings.qrisImage)
        });
      }
    }

    const now = nowUnix();
    const expiresAt = now + settings.expiryMinutes * 60;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateDepositCode();

      try {
        await env.DB
          .prepare(
            `INSERT INTO deposits (
               user_id,
               code,
               amount,
               status,
               payment_method,
               idempotency_key,
               created_at,
               expires_at
             )
             VALUES (?, ?, ?, 'PENDING', 'QRIS', ?, ?, ?)`
          )
          .bind(
            auth.user.id,
            code,
            amount,
            idempotencyKey,
            now,
            expiresAt
          )
          .run();

        return new Response(
          JSON.stringify({
            success: true,
            message: "Deposit berhasil dibuat.",
            deposit: {
              code,
              amount,
              status: "PENDING",
              payment_method: "QRIS",
              qr_url: settings.qrisImage,
              created_at: now,
              expires_at: expiresAt
            }
          }),
          {
            status: 201,
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              "Cache-Control": "no-store"
            }
          }
        );
      } catch (error) {
        const message = String(error?.message || error || "").toLowerCase();
        const uniqueFailure = message.includes("unique") || message.includes("constraint");

        if (!uniqueFailure || attempt === 4) {
          throw error;
        }
      }
    }

    return errorResponse("Gagal membuat kode deposit.", 500);
  } catch (error) {
    return errorResponse(error?.message || "Gagal membuat deposit.", 500);
  }
}

export async function getDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth.response;
  }

  if (!env?.DB) {
    return errorResponse("Database tidak tersedia.", 500);
  }

  try {
    const url = new URL(request.url);
    const code = normalizeDepositCode(url.searchParams.get("code"));

    if (!code) {
      return errorResponse("Kode deposit wajib diisi.", 400);
    }

    const settings = await getDepositSettings(env);
    const deposit = await findDepositByCode(env, code, auth.user.id);

    if (!deposit) {
      return errorResponse("Deposit tidak ditemukan.", 404);
    }

    deposit.status = await expireDepositIfNeeded(env, deposit);

    return successResponse({
      deposit: serializeDeposit(deposit, settings.qrisImage)
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil deposit.", 500);
  }
}

export async function checkDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth.response;
  }

  if (!env?.DB) {
    return errorResponse("Database tidak tersedia.", 500);
  }

  try {
    const body = await readJson(request);
    const code = normalizeDepositCode(body?.code);

    if (!code) {
      return errorResponse("Kode deposit wajib diisi.", 400);
    }

    const deposit = await findDepositByCode(env, code, auth.user.id);

    if (!deposit) {
      return errorResponse("Deposit tidak ditemukan.", 404);
    }

    const status = await expireDepositIfNeeded(env, deposit);

    if (status !== "PENDING") {
      return successResponse({
        status,
        message: status === "PAID"
          ? "Pembayaran sudah dikonfirmasi."
          : status === "EXPIRED"
            ? "Deposit sudah expired."
            : "Deposit tidak lagi menunggu pembayaran."
      });
    }

    const now = nowUnix();

    await env.DB
      .prepare(
        `UPDATE deposits
         SET checked_at = ?,
             check_count = check_count + 1
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(now, deposit.id)
      .run();

    return successResponse({
      status: "PENDING",
      message: "Deposit masih menunggu konfirmasi pembayaran."
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengecek deposit.", 500);
  }
}

export async function confirmDepositByCode(env, code) {
  if (!env?.DB) {
    throw new Error("Database tidak tersedia.");
  }

  const deposit = await findDepositByCode(env, code);

  if (!deposit) {
    throw new Error("Deposit tidak ditemukan.");
  }

  const currentStatus = await expireDepositIfNeeded(env, deposit);
  deposit.status = currentStatus;

  if (deposit.status === "PAID") {
    const userBalance = await env.DB
      .prepare(`SELECT balance FROM users WHERE id = ? LIMIT 1`)
      .bind(deposit.user_id)
      .first();

    return {
      success: true,
      already_paid: true,
      deposit: serializeDeposit(deposit, null),
      balance: Number(userBalance?.balance || 0)
    };
  }

  if (deposit.status !== "PENDING") {
    throw new Error(`Deposit berstatus ${deposit.status} dan tidak dapat dikonfirmasi.`);
  }

  const now = nowUnix();
  const reference = `DEPOSIT:${deposit.id}`;

  const creditResult = await creditBalance(env, {
    userId: deposit.user_id,
    amount: Number(deposit.amount),
    type: "DEPOSIT",
    reference,
    description: "Deposit QRIS",
    depositId: deposit.id
  });

  await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'PAID',
           paid_at = ?,
           wallet_transaction_id = ?
       WHERE id = ?
         AND status = 'PENDING'`
    )
    .bind(now, creditResult.id || null, deposit.id)
    .run();

  const updated = await findDepositByCode(env, deposit.code);

  return {
    success: true,
    already_paid: false,
    deposit: serializeDeposit(updated, null),
    balance: Number(creditResult.balance || 0)
  };
}

export async function confirmDeposit(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) {
    return auth.response;
  }

  const body = await readJson(request);
  const code = normalizeDepositCode(body?.code);

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  try {
    const result = await confirmDepositByCode(env, code);

    return successResponse({
      message: result.already_paid
        ? "Deposit sudah dikonfirmasi sebelumnya."
        : "Deposit berhasil dikonfirmasi.",
      deposit: result.deposit,
      balance: result.balance,
      already_paid: result.already_paid
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengonfirmasi deposit.", 409);
  }
}

export async function cancelDepositByCode(env, code, userId = null) {
  if (!env?.DB) {
    throw new Error("Database tidak tersedia.");
  }

  const deposit = await findDepositByCode(env, code, userId);

  if (!deposit) {
    throw new Error("Deposit tidak ditemukan.");
  }

  const status = await expireDepositIfNeeded(env, deposit);

  if (status !== "PENDING") {
    throw new Error(`Deposit berstatus ${status}.`);
  }

  const now = nowUnix();
  const result = await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'CANCELLED',
           cancelled_at = ?
       WHERE id = ?
         AND status = 'PENDING'`
    )
    .bind(now, deposit.id)
    .run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    throw new Error("Deposit tidak dapat dibatalkan.");
  }

  return {
    success: true,
    code: deposit.code,
    status: "CANCELLED"
  };
}

export async function cancelDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth.response;
  }

  const body = await readJson(request);
  const code = normalizeDepositCode(body?.code);

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  try {
    const result = await cancelDepositByCode(
      env,
      code,
      auth.user.is_admin ? null : auth.user.id
    );

    return successResponse({
      message: "Deposit berhasil dibatalkan.",
      code: result.code,
      status: result.status
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal membatalkan deposit.", 409);
  }
}

export async function expireDeposits(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) {
    return auth.response;
  }

  if (!env?.DB) {
    return errorResponse("Database tidak tersedia.", 500);
  }

  try {
    const now = nowUnix();

    const result = await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED'
         WHERE status = 'PENDING'
           AND expires_at <= ?`
      )
      .bind(now)
      .run();

    return successResponse({
      expired: Number(result?.meta?.changes || 0)
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal memproses deposit expired.", 500);
  }
}

export async function listDeposits(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth.response;
  }

  if (!env?.DB) {
    return errorResponse("Database tidak tersedia.", 500);
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit"));
    const requestedOffset = Number(url.searchParams.get("offset"));
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 20;
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
      ? requestedOffset
      : 0;
    const settings = await getDepositSettings(env);

    const result = await env.DB
      .prepare(
        `SELECT
           d.id,
           d.user_id,
           d.code,
           d.amount,
           d.status,
           d.payment_method,
           d.created_at,
           d.expires_at,
           d.checked_at,
           d.paid_at,
           d.cancelled_at,
           d.check_count,
           d.wallet_transaction_id,
           u.username
         FROM deposits d
         LEFT JOIN users u ON u.id = d.user_id
         WHERE (? = 1 OR d.user_id = ?)
         ORDER BY d.id DESC
         LIMIT ?
         OFFSET ?`
      )
      .bind(auth.user.is_admin ? 1 : 0, auth.user.id, limit, offset)
      .all();

    const deposits = Array.isArray(result?.results)
      ? result.results
      : [];

    for (const deposit of deposits) {
      deposit.status = await expireDepositIfNeeded(env, deposit);
    }

    return successResponse({
      deposits: deposits.map((deposit) => serializeDeposit(deposit, settings.qrisImage, Boolean(auth.user.is_admin))),
      limit,
      offset
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil riwayat deposit.", 500);
  }
}

export default {
  createDeposit,
  getDeposit,
  checkDeposit,
  confirmDeposit,
  confirmDepositByCode,
  cancelDeposit,
  cancelDepositByCode,
  expireDeposits,
  listDeposits
};
