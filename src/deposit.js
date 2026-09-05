import {
  errorResponse,
  getCurrentUser,
  getSettingInt,
  normalizeDepositCode,
  nowUnix,
  randomId,
  readJson,
  successResponse
} from "./utils.js";

import {
  creditBalance
} from "./wallet.js";

const DEFAULT_MIN_AMOUNT = 1000;
const DEFAULT_MAX_AMOUNT = 10000000;
const DEFAULT_EXPIRY_MINUTES = 60;
const DEFAULT_CHECK_COOLDOWN = 30;

export async function createDeposit(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(error.message, 400);
  }

  const amount = Number(body.amount);

  const minAmount = await getSettingInt(
    env.DB,
    "deposit_min",
    DEFAULT_MIN_AMOUNT
  );

  const maxAmount = await getSettingInt(
    env.DB,
    "deposit_max",
    DEFAULT_MAX_AMOUNT
  );

  const expiryMinutes = await getSettingInt(
    env.DB,
    "deposit_expiry_minutes",
    DEFAULT_EXPIRY_MINUTES
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount < minAmount ||
    amount > maxAmount
  ) {
    return errorResponse(
      `Nominal deposit harus antara Rp${minAmount.toLocaleString("id-ID")} dan Rp${maxAmount.toLocaleString("id-ID")}.`,
      400
    );
  }

  const activeDeposit = await env.DB
    .prepare(
      `SELECT
        id,
        code,
        amount,
        status,
        expires_at,
        created_at
       FROM deposits
       WHERE user_id = ?
         AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(user.id)
    .first();

  const now = nowUnix();

  if (activeDeposit) {
    if (Number(activeDeposit.expires_at) > now) {
      return successResponse({
        deposit: {
          id: Number(activeDeposit.id),
          code: activeDeposit.code,
          amount: Number(activeDeposit.amount),
          status: activeDeposit.status,
          created_at: Number(activeDeposit.created_at),
          expires_at: Number(activeDeposit.expires_at)
        },
        reused: true
      });
    }

    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED',
             cancelled_at = ?,
             checked_at = ?
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(
        now,
        now,
        activeDeposit.id
      )
      .run();
  }

  let code = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomId(4);

    const exists = await env.DB
      .prepare(
        "SELECT id FROM deposits WHERE code = ? LIMIT 1"
      )
      .bind(candidate)
      .first();

    if (!exists) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    return errorResponse(
      "Gagal membuat kode deposit. Silakan coba lagi.",
      500
    );
  }

  const expiresAt =
    now + Math.max(expiryMinutes, 1) * 60;

  const result = await env.DB
    .prepare(
      `INSERT INTO deposits
      (
        user_id,
        code,
        amount,
        status,
        payment_method,
        created_at,
        expires_at,
        check_count
      )
      VALUES (?, ?, ?, 'PENDING', 'QRIS', ?, ?, 0)`
    )
    .bind(
      user.id,
      code,
      amount,
      now,
      expiresAt
    )
    .run();

  const depositId = Number(
    result.meta?.last_row_id || 0
  );

  if (!depositId) {
    return errorResponse(
      "Gagal membuat deposit.",
      500
    );
  }

  return successResponse({
    deposit: {
      id: depositId,
      code,
      amount,
      status: "PENDING",
      payment_method: "QRIS",
      created_at: now,
      expires_at: expiresAt
    }
  }, 201);
}

export async function getDeposit(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isSafeInteger(id) || id <= 0) {
    return errorResponse(
      "ID deposit tidak valid.",
      400
    );
  }

  const deposit = await env.DB
    .prepare(
      `SELECT
        id,
        code,
        amount,
        status,
        payment_method,
        created_at,
        expires_at,
        checked_at,
        paid_at,
        cancelled_at,
        check_count
       FROM deposits
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(
      id,
      user.id
    )
    .first();

  if (!deposit) {
    return errorResponse(
      "Deposit tidak ditemukan.",
      404
    );
  }

  const now = nowUnix();

  if (
    deposit.status === "PENDING" &&
    Number(deposit.expires_at) <= now
  ) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED',
             cancelled_at = ?,
             checked_at = ?
         WHERE id = ?
           AND user_id = ?
           AND status = 'PENDING'`
      )
      .bind(
        now,
        now,
        id,
        user.id
      )
      .run();

    deposit.status = "EXPIRED";
    deposit.cancelled_at = now;
    deposit.checked_at = now;
  }

  return successResponse({
    deposit: formatDeposit(deposit)
  });
}

export async function checkDeposit(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(error.message, 400);
  }

  const id = Number(body.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return errorResponse(
      "ID deposit tidak valid.",
      400
    );
  }

  const deposit = await env.DB
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
        check_count
       FROM deposits
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(
      id,
      user.id
    )
    .first();

  if (!deposit) {
    return errorResponse(
      "Deposit tidak ditemukan.",
      404
    );
  }

  const now = nowUnix();

  if (deposit.status === "PAID") {
    return successResponse({
      deposit: formatDeposit(deposit),
      paid: true
    });
  }

  if (
    deposit.status === "EXPIRED" ||
    deposit.status === "CANCELLED"
  ) {
    return successResponse({
      deposit: formatDeposit(deposit),
      paid: false
    });
  }

  if (Number(deposit.expires_at) <= now) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED',
             cancelled_at = ?,
             checked_at = ?
         WHERE id = ?
           AND user_id = ?
           AND status = 'PENDING'`
      )
      .bind(
        now,
        now,
        id,
        user.id
      )
      .run();

    deposit.status = "EXPIRED";
    deposit.cancelled_at = now;
    deposit.checked_at = now;

    return successResponse({
      deposit: formatDeposit(deposit),
      paid: false
    });
  }

  const cooldown = await getSettingInt(
    env.DB,
    "deposit_check_cooldown_seconds",
    DEFAULT_CHECK_COOLDOWN
  );

  if (
    deposit.checked_at &&
    Number(deposit.checked_at) + cooldown > now
  ) {
    const remaining =
      Number(deposit.checked_at) +
      cooldown -
      now;

    return errorResponse(
      `Tunggu ${remaining} detik sebelum mengecek kembali.`,
      429,
      {
        retry_after: remaining,
        deposit: formatDeposit(deposit)
      }
    );
  }

  await env.DB
    .prepare(
      `UPDATE deposits
       SET checked_at = ?,
           check_count = check_count + 1
       WHERE id = ?
         AND user_id = ?
         AND status = 'PENDING'`
    )
    .bind(
      now,
      id,
      user.id
    )
    .run();

  const updated = await env.DB
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
        check_count
       FROM deposits
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`
    )
    .bind(
      id,
      user.id
    )
    .first();

  return successResponse({
    deposit: formatDeposit(updated || deposit),
    paid: updated?.status === "PAID",
    checked: true
  });
}

export async function getActiveDeposit(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  const deposit = await env.DB
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
        check_count
       FROM deposits
       WHERE user_id = ?
         AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(user.id)
    .first();

  if (!deposit) {
    return successResponse({
      deposit: null
    });
  }

  const now = nowUnix();

  if (Number(deposit.expires_at) <= now) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED',
             cancelled_at = ?,
             checked_at = ?
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(
        now,
        now,
        deposit.id
      )
      .run();

    return successResponse({
      deposit: null
    });
  }

  return successResponse({
    deposit: formatDeposit(deposit)
  });
}

export async function payDeposit(
  env,
  code,
  telegramReference = null
) {
  const normalizedCode =
    normalizeDepositCode(code);

  const deposit = await env.DB
    .prepare(
      `SELECT
        id,
        user_id,
        code,
        amount,
        status,
        expires_at,
        paid_at
       FROM deposits
       WHERE code = ?
       LIMIT 1`
    )
    .bind(normalizedCode)
    .first();

  if (!deposit) {
    return {
      success: false,
      reason: "NOT_FOUND"
    };
  }

  if (deposit.status === "PAID") {
    const user = await env.DB
      .prepare(
        "SELECT id, username, balance FROM users WHERE id = ? LIMIT 1"
      )
      .bind(deposit.user_id)
      .first();

    return {
      success: true,
      duplicate: true,
      deposit,
      user
    };
  }

  if (deposit.status !== "PENDING") {
    return {
      success: false,
      reason: "INVALID_STATUS",
      status: deposit.status,
      deposit
    };
  }

  const now = nowUnix();

  if (Number(deposit.expires_at) <= now) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED',
             cancelled_at = ?,
             checked_at = ?
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(
        now,
        now,
        deposit.id
      )
      .run();

    return {
      success: false,
      reason: "EXPIRED",
      deposit
    };
  }

  const reference =
    telegramReference ||
    `DEPOSIT:${deposit.code}`;

  const credit = await creditBalance(
    env,
    Number(deposit.user_id),
    Number(deposit.amount),
    reference,
    `Deposit QRIS ${deposit.code}`
  );

  const paidAt = now;

  if (credit.duplicate) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'PAID',
             paid_at = COALESCE(paid_at, ?),
             checked_at = ?
         WHERE id = ?
           AND status != 'PAID'`
      )
      .bind(
        paidAt,
        paidAt,
        deposit.id
      )
      .run();
  } else {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'PAID',
             paid_at = ?,
             checked_at = ?
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(
        paidAt,
        paidAt,
        deposit.id
      )
      .run();
  }

  const user = await env.DB
    .prepare(
      "SELECT id, username, balance FROM users WHERE id = ? LIMIT 1"
    )
    .bind(deposit.user_id)
    .first();

  return {
    success: true,
    duplicate: Boolean(credit.duplicate),
    deposit: {
      ...deposit,
      status: "PAID",
      paid_at: paidAt
    },
    user
  };
}

function formatDeposit(deposit) {
  if (!deposit) {
    return null;
  }

  return {
    id: Number(deposit.id),
    code: deposit.code,
    amount: Number(deposit.amount),
    status: deposit.status,
    payment_method: deposit.payment_method,
    created_at: Number(deposit.created_at),
    expires_at: Number(deposit.expires_at),
    checked_at: deposit.checked_at
      ? Number(deposit.checked_at)
      : null,
    paid_at: deposit.paid_at
      ? Number(deposit.paid_at)
      : null,
    cancelled_at: deposit.cancelled_at
      ? Number(deposit.cancelled_at)
      : null,
    check_count: Number(deposit.check_count || 0)
  };
}
