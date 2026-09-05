import {
  cleanString,
  randomId,
  nowUnix,
  getDepositCode,
  getDepositConfig,
  successResponse,
  errorResponse,
  readJson
} from "./utils.js";

import {
  requireAuth,
  requireAdmin
} from "./auth.js";

async function createDeposit(request, env) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const config =
    await getDepositConfig(env);

  const amount =
    Number(body?.amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount < config.min_amount ||
    amount > config.max_amount
  ) {
    return errorResponse(
      `Nominal deposit harus antara Rp${config.min_amount.toLocaleString("id-ID")} dan Rp${config.max_amount.toLocaleString("id-ID")}.`,
      400
    );
  }

  const active =
    await env.DB
      .prepare(
        `SELECT
           id,
           code,
           amount,
           status,
           expires_at
         FROM deposits
         WHERE user_id = ?
           AND status = 'PENDING'
           AND expires_at > ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .bind(
        user.id,
        nowUnix()
      )
      .first();

  if (active) {
    return successResponse({
      deposit:
        formatDeposit(active)
    });
  }

  const timestamp =
    nowUnix();

  const expiresAt =
    timestamp +
    config.expiry_minutes * 60;

  let code = null;

  for (let i = 0; i < 10; i++) {
    const candidate =
      getDepositCode();

    const exists =
      await env.DB
        .prepare(
          `SELECT id
           FROM deposits
           WHERE code = ?`
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
      "Gagal membuat kode deposit.",
      500
    );
  }

  const result =
    await env.DB
      .prepare(
        `INSERT INTO deposits (
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
        timestamp,
        expiresAt
      )
      .run();

  const deposit =
    await env.DB
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
           check_count,
           wallet_transaction_id
         FROM deposits
         WHERE id = ?`
      )
      .bind(
        result.meta.last_row_id
      )
      .first();

  return successResponse({
    deposit:
      formatDeposit(deposit)
  }, 201);
}

async function getDeposit(request, env) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (user instanceof Response) {
    return user;
  }

  const url =
    new URL(request.url);

  const code =
    cleanString(
      url.searchParams.get("code"),
      20
    ).toUpperCase();

  if (!code) {
    return errorResponse(
      "Kode deposit wajib diisi.",
      400
    );
  }

  const deposit =
    await env.DB
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
           check_count,
           wallet_transaction_id
         FROM deposits
         WHERE user_id = ?
           AND code = ?`
      )
      .bind(
        user.id,
        code
      )
      .first();

  if (!deposit) {
    return errorResponse(
      "Deposit tidak ditemukan.",
      404
    );
  }

  if (
    deposit.status === "PENDING" &&
    Number(deposit.expires_at) <= nowUnix()
  ) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           status = 'EXPIRED',
           updated_at = COALESCE(updated_at, expires_at)
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(deposit.id)
      .run();

    deposit.status =
      "EXPIRED";
  }

  return successResponse({
    deposit:
      formatDeposit(deposit)
  });
}

async function checkDeposit(request, env) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const code =
    cleanString(
      body?.code,
      20
    ).toUpperCase();

  if (!code) {
    return errorResponse(
      "Kode deposit wajib diisi.",
      400
    );
  }

  const timestamp =
    nowUnix();

  const deposit =
    await env.DB
      .prepare(
        `SELECT
           id,
           code,
           amount,
           status,
           expires_at,
           check_count,
           checked_at
         FROM deposits
         WHERE user_id = ?
           AND code = ?`
      )
      .bind(
        user.id,
        code
      )
      .first();

  if (!deposit) {
    return errorResponse(
      "Deposit tidak ditemukan.",
      404
    );
  }

  if (
    deposit.status === "PAID"
  ) {
    return successResponse({
      status:
        "PAID",
      message:
        "Deposit sudah dibayar."
    });
  }

  if (
    deposit.status !== "PENDING"
  ) {
    return errorResponse(
      "Deposit tidak dapat dicek.",
      409
    );
  }

  if (
    Number(deposit.expires_at) <= timestamp
  ) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED'
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(deposit.id)
      .run();

    return errorResponse(
      "Deposit sudah expired.",
      409
    );
  }

  const cooldown =
    30;

  if (
    deposit.checked_at &&
    timestamp -
      Number(deposit.checked_at) <
      cooldown
  ) {
    const remaining =
      cooldown -
      (
        timestamp -
        Number(deposit.checked_at)
      );

    return errorResponse(
      `Tunggu ${remaining} detik sebelum mengecek kembali.`,
      429
    );
  }

  const result =
    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           checked_at = ?,
           check_count = check_count + 1
         WHERE id = ?
           AND status = 'PENDING'
           AND (
             checked_at IS NULL
             OR ? - checked_at >= ?
           )`
      )
      .bind(
        timestamp,
        deposit.id,
        timestamp,
        cooldown
      )
      .run();

  if (!result.meta.changes) {
    return errorResponse(
      "Pengecekan terlalu cepat. Silakan tunggu.",
      429
    );
  }

  return successResponse({
    status:
      "PENDING",
    message:
      "Permintaan pengecekan pembayaran berhasil dicatat.",
    code:
      deposit.code,
    amount:
      Number(deposit.amount)
  });
}

async function getActiveDeposit(request, env) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (user instanceof Response) {
    return user;
  }

  const timestamp =
    nowUnix();

  const deposit =
    await env.DB
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
           check_count,
           wallet_transaction_id
         FROM deposits
         WHERE user_id = ?
           AND status = 'PENDING'
           AND expires_at > ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .bind(
        user.id,
        timestamp
      )
      .first();

  return successResponse({
    deposit:
      deposit
        ? formatDeposit(deposit)
        : null
  });
}

async function payDeposit(request, env) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (admin instanceof Response) {
    return admin;
  }

  const body =
    await readJson(request);

  const code =
    cleanString(
      body?.code,
      20
    ).toUpperCase();

  if (!code) {
    return errorResponse(
      "Kode deposit wajib diisi.",
      400
    );
  }

  const timestamp =
    nowUnix();

  const deposit =
    await env.DB
      .prepare(
        `SELECT
           d.id,
           d.user_id,
           d.code,
           d.amount,
           d.status,
           d.expires_at,
           d.wallet_transaction_id,
           u.username,
           u.balance
         FROM deposits d
         JOIN users u
           ON u.id = d.user_id
         WHERE d.code = ?`
      )
      .bind(code)
      .first();

  if (!deposit) {
    return errorResponse(
      "Kode deposit tidak ditemukan.",
      404
    );
  }

  if (
    deposit.status === "PAID"
  ) {
    return successResponse({
      status:
        "PAID",
      message:
        "Deposit sudah pernah dibayar.",
      code:
        deposit.code,
      amount:
        Number(deposit.amount),
      balance:
        Number(deposit.balance || 0),
      transaction_id:
        deposit.wallet_transaction_id
          ? Number(
              deposit.wallet_transaction_id
            )
          : null
    });
  }

  if (
    deposit.status !== "PENDING"
  ) {
    return errorResponse(
      `Deposit berstatus ${deposit.status}.`,
      409
    );
  }

  if (
    Number(deposit.expires_at) <= timestamp
  ) {
    await env.DB
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED'
         WHERE id = ?
           AND status = 'PENDING'`
      )
      .bind(deposit.id)
      .run();

    return errorResponse(
      "Deposit sudah expired.",
      409
    );
  }

  const amount =
    Number(deposit.amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return errorResponse(
      "Nominal deposit tidak valid.",
      500
    );
  }

  const before =
    Number(deposit.balance || 0);

  const after =
    before + amount;

  if (
    !Number.isSafeInteger(after)
  ) {
    return errorResponse(
      "Saldo user melebihi batas.",
      500
    );
  }

  const reference =
    `DEPOSIT:${deposit.code}`;

  const existingTransaction =
    await env.DB
      .prepare(
        `SELECT
           id,
           balance_after
         FROM balance_transactions
         WHERE reference = ?`
      )
      .bind(reference)
      .first();

  if (existingTransaction) {
    const transactionId =
      Number(existingTransaction.id);

    const balanceAfter =
      Number(
        existingTransaction.balance_after
      );

    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           status = 'PAID',
           paid_at = COALESCE(paid_at, ?),
           checked_at = COALESCE(checked_at, ?),
           wallet_transaction_id = ?
         WHERE id = ?
           AND status IN ('PENDING','PAID')`
      )
      .bind(
        timestamp,
        timestamp,
        transactionId,
        deposit.id
      )
      .run();

    return successResponse({
      status:
        "PAID",
      message:
        "Deposit sudah dikonfirmasi sebelumnya.",
      code:
        deposit.code,
      amount,
      balance:
        balanceAfter,
      transaction_id:
        transactionId
    });
  }

  const updateUser =
    env.DB
      .prepare(
        `UPDATE users
         SET
           balance = ?,
           updated_at = ?
         WHERE id = ?
           AND balance = ?`
      )
      .bind(
        after,
        timestamp,
        deposit.user_id,
        before
      );

  const transaction =
    env.DB
      .prepare(
        `INSERT INTO balance_transactions (
           user_id,
           type,
           amount,
           balance_before,
           balance_after,
           reference,
           description,
           created_at
         )
         VALUES (?, 'deposit', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        deposit.user_id,
        amount,
        before,
        after,
        reference,
        `Deposit QRIS ${deposit.code}`,
        timestamp
      );

  try {
    const result =
      await env.DB.batch([
        updateUser,
        transaction
      ]);

    if (
      !result?.[0]?.meta?.changes
    ) {
      return errorResponse(
        "Saldo user berubah bersamaan. Silakan ulangi.",
        409
      );
    }

    const transactionId =
      Number(
        result?.[1]?.meta?.last_row_id || 0
      );

    const depositUpdate =
      await env.DB
        .prepare(
          `UPDATE deposits
           SET
             status = 'PAID',
             paid_at = ?,
             checked_at = COALESCE(checked_at, ?),
             wallet_transaction_id = ?
           WHERE id = ?
             AND status = 'PENDING'`
        )
        .bind(
          timestamp,
          timestamp,
          transactionId,
          deposit.id
        )
        .run();

    if (
      !depositUpdate.meta.changes
    ) {
      const alreadyPaid =
        await env.DB
          .prepare(
            `SELECT
               status,
               wallet_transaction_id
             FROM deposits
             WHERE id = ?`
          )
          .bind(deposit.id)
          .first();

      if (
        alreadyPaid?.status === "PAID"
      ) {
        return successResponse({
          status:
            "PAID",
          message:
            "Deposit sudah dikonfirmasi.",
          code:
            deposit.code,
          amount,
          balance:
            after,
          transaction_id:
            Number(
              alreadyPaid.wallet_transaction_id ||
              transactionId
            )
        });
      }

      return errorResponse(
        "Saldo sudah bertambah tetapi status deposit gagal diperbarui. Hubungi admin.",
        500
      );
    }

    return successResponse({
      status:
        "PAID",
      message:
        "Deposit berhasil dikonfirmasi.",
      code:
        deposit.code,
      amount,
      balance:
        after,
      transaction_id:
        transactionId
    });
  } catch (error) {
    const duplicate =
      await env.DB
        .prepare(
          `SELECT
             id,
             balance_after
           FROM balance_transactions
           WHERE reference = ?`
        )
        .bind(reference)
        .first();

    if (duplicate) {
      const transactionId =
        Number(duplicate.id);

      await env.DB
        .prepare(
          `UPDATE deposits
           SET
             status = 'PAID',
             paid_at = COALESCE(paid_at, ?),
             wallet_transaction_id = ?
           WHERE id = ?`
        )
        .bind(
          timestamp,
          transactionId,
          deposit.id
        )
        .run();

      return successResponse({
        status:
          "PAID",
        message:
          "Deposit sudah dikonfirmasi.",
        code:
          deposit.code,
        amount,
        balance:
          Number(
            duplicate.balance_after || 0
          ),
        transaction_id:
          transactionId
      });
    }

    throw error;
  }
}

function formatDeposit(deposit) {
  if (!deposit) {
    return null;
  }

  return {
    id:
      Number(deposit.id),
    code:
      deposit.code,
    amount:
      Number(deposit.amount || 0),
    status:
      deposit.status,
    payment_method:
      deposit.payment_method ||
      "QRIS",
    created_at:
      deposit.created_at,
    expires_at:
      deposit.expires_at,
    checked_at:
      deposit.checked_at,
    paid_at:
      deposit.paid_at,
    check_count:
      Number(
        deposit.check_count || 0
      ),
    wallet_transaction_id:
      deposit.wallet_transaction_id
        ? Number(
            deposit.wallet_transaction_id
          )
        : null
  };
}

export {
  createDeposit,
  getDeposit,
  checkDeposit,
  getActiveDeposit,
  payDeposit,
  formatDeposit
};
