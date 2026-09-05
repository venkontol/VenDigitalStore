import {
  nowUnix,
  successResponse,
  errorResponse,
  readJson
} from "./utils.js";

import {
  requireAuth,
  requireAdmin
} from "./auth.js";

const CODE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const DEFAULT_MIN_AMOUNT = 1000;
const DEFAULT_MAX_AMOUNT = 10000000;
const DEFAULT_EXPIRY_MINUTES = 60;
const CHECK_COOLDOWN_SECONDS = 30;

function generateDepositCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);

  let code = "";

  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[
      bytes[i] % CODE_CHARS.length
    ];
  }

  return code;
}

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function isValidCode(code) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(
    code
  );
}

function getConfig(env) {
  const min = Number(env.DEPOSIT_MIN_AMOUNT);
  const max = Number(env.DEPOSIT_MAX_AMOUNT);
  const expiry = Number(env.DEPOSIT_EXPIRY_MINUTES);

  const minAmount =
    Number.isSafeInteger(min) && min >= 1000
      ? min
      : DEFAULT_MIN_AMOUNT;

  const maxAmount =
    Number.isSafeInteger(max) &&
    max >= minAmount
      ? max
      : Math.max(
          DEFAULT_MAX_AMOUNT,
          minAmount
        );

  const expiryMinutes =
    Number.isSafeInteger(expiry) &&
    expiry >= 5 &&
    expiry <= 1440
      ? expiry
      : DEFAULT_EXPIRY_MINUTES;

  return {
    min_amount: minAmount,
    max_amount: maxAmount,
    expiry_minutes: expiryMinutes
  };
}

function getQrUrl(request) {
  return `${new URL(request.url).origin}/api/deposit/qr`;
}

function selectDepositSql() {
  return `
    SELECT
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
  `;
}

function formatDeposit(deposit, request = null) {
  if (!deposit) {
    return null;
  }

  return {
    id: Number(deposit.id),
    user_id:
      deposit.user_id != null
        ? Number(deposit.user_id)
        : null,
    code: deposit.code,
    amount: Number(deposit.amount || 0),
    status: deposit.status,
    payment_method:
      deposit.payment_method || "QRIS",
    created_at: deposit.created_at,
    expires_at: deposit.expires_at,
    checked_at: deposit.checked_at,
    paid_at: deposit.paid_at,
    cancelled_at: deposit.cancelled_at,
    check_count: Number(
      deposit.check_count || 0
    ),
    wallet_transaction_id:
      deposit.wallet_transaction_id != null
        ? Number(deposit.wallet_transaction_id)
        : null,
    qr_url: request
      ? getQrUrl(request)
      : "/api/deposit/qr"
  };
}

async function getDepositById(db, id) {
  return db
    .prepare(
      `${selectDepositSql()}
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();
}

async function getDepositByCode(db, code) {
  return db
    .prepare(
      `${selectDepositSql()}
       WHERE code = ?
       LIMIT 1`
    )
    .bind(code)
    .first();
}

async function expireDeposit(db, id, timestamp) {
  const result = await db
    .prepare(
      `UPDATE deposits
       SET status = 'EXPIRED'
       WHERE id = ?
         AND status = 'PENDING'
         AND expires_at <= ?`
    )
    .bind(id, timestamp)
    .run();

  return Number(
    result?.meta?.changes || 0
  ) === 1;
}

async function findUniqueCode(db) {
  for (let i = 0; i < 30; i++) {
    const code = generateDepositCode();

    const row = await db
      .prepare(
        `SELECT id
         FROM deposits
         WHERE code = ?
         LIMIT 1`
      )
      .bind(code)
      .first();

    if (!row) {
      return code;
    }
  }

  return null;
}

async function createDeposit(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Request tidak valid.",
      400
    );
  }

  const config = getConfig(env);

  const amount = Number(body?.amount);

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

  const timestamp = nowUnix();

  const active = await env.DB
    .prepare(
      `${selectDepositSql()}
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

  if (active) {
    return successResponse({
      deposit: formatDeposit(
        active,
        request
      )
    });
  }

  await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'EXPIRED'
       WHERE user_id = ?
         AND status = 'PENDING'
         AND expires_at <= ?`
    )
    .bind(
      user.id,
      timestamp
    )
    .run();

  const code = await findUniqueCode(
    env.DB
  );

  if (!code) {
    return errorResponse(
      "Gagal membuat kode deposit. Silakan coba lagi.",
      500
    );
  }

  const expiresAt =
    timestamp +
    getConfig(env).expiry_minutes * 60;

  let result;

  try {
    result = await env.DB
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
        VALUES (
          ?,
          ?,
          ?,
          'PENDING',
          'QRIS',
          ?,
          ?,
          0
        )`
      )
      .bind(
        user.id,
        code,
        amount,
        timestamp,
        expiresAt
      )
      .run();
  } catch (error) {
    const message = String(
      error?.message || ""
    ).toLowerCase();

    if (
      message.includes("unique")
    ) {
      return errorResponse(
        "Kode deposit bentrok. Silakan coba lagi.",
        409
      );
    }

    throw error;
  }

  const depositId = Number(
    result?.meta?.last_row_id || 0
  );

  if (!depositId) {
    return errorResponse(
      "Deposit gagal dibuat.",
      500
    );
  }

  const deposit =
    await getDepositById(
      env.DB,
      depositId
    );

  if (!deposit) {
    return errorResponse(
      "Deposit berhasil dibuat tetapi gagal dibaca kembali.",
      500
    );
  }

  return successResponse(
    {
      deposit: formatDeposit(
        deposit,
        request
      )
    },
    201
  );
}

async function getDeposit(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url = new URL(request.url);

  const code = normalizeCode(
    url.searchParams.get("code")
  );

  if (!code) {
    return errorResponse(
      "Kode deposit wajib diisi.",
      400
    );
  }

  if (!isValidCode(code)) {
    return errorResponse(
      "Kode deposit tidak valid.",
      400
    );
  }

  const deposit = await env.DB
    .prepare(
      `${selectDepositSql()}
       WHERE user_id = ?
         AND code = ?
       LIMIT 1`
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

  const timestamp = nowUnix();

  if (
    deposit.status === "PENDING" &&
    Number(deposit.expires_at) <= timestamp
  ) {
    await expireDeposit(
      env.DB,
      deposit.id,
      timestamp
    );

    deposit.status = "EXPIRED";
  }

  return successResponse({
    deposit: formatDeposit(
      deposit,
      request
    ),
    status: deposit.status,
    amount: Number(
      deposit.amount || 0
    ),
    code: deposit.code,
    expired_at: deposit.expires_at
  });
}

async function checkDeposit(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Request tidak valid.",
      400
    );
  }

  const code = normalizeCode(
    body?.code
  );

  if (!code) {
    return errorResponse(
      "Kode deposit wajib diisi.",
      400
    );
  }

  if (!isValidCode(code)) {
    return errorResponse(
      "Kode deposit tidak valid.",
      400
    );
  }

  const timestamp = nowUnix();

  const deposit = await env.DB
    .prepare(
      `SELECT
        id,
        user_id,
        code,
        amount,
        status,
        expires_at,
        check_count,
        checked_at
       FROM deposits
       WHERE user_id = ?
         AND code = ?
       LIMIT 1`
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

  if (deposit.status === "PAID") {
    return successResponse({
      status: "PAID",
      code: deposit.code,
      amount: Number(
        deposit.amount || 0
      ),
      message:
        "Deposit sudah dibayar."
    });
  }

  if (deposit.status !== "PENDING") {
    return errorResponse(
      `Deposit tidak dapat dicek karena statusnya ${deposit.status}.`,
      409,
      {
        status: deposit.status
      }
    );
  }

  if (
    Number(deposit.expires_at) <=
    timestamp
  ) {
    await expireDeposit(
      env.DB,
      deposit.id,
      timestamp
    );

    return errorResponse(
      "Deposit sudah expired.",
      409,
      {
        status: "EXPIRED"
      }
    );
  }

  const lastChecked =
    deposit.checked_at != null
      ? Number(deposit.checked_at)
      : 0;

  if (
    lastChecked > 0 &&
    timestamp - lastChecked <
      CHECK_COOLDOWN_SECONDS
  ) {
    const remaining =
      CHECK_COOLDOWN_SECONDS -
      (
        timestamp -
        lastChecked
      );

    return errorResponse(
      `Tunggu ${remaining} detik sebelum mengecek kembali.`,
      429,
      {
        retry_after: remaining
      }
    );
  }

  const result = await env.DB
    .prepare(
      `UPDATE deposits
       SET
         checked_at = ?,
         check_count = check_count + 1
       WHERE id = ?
         AND status = 'PENDING'
         AND expires_at > ?
         AND (
           checked_at IS NULL
           OR ? - checked_at >= ?
         )`
    )
    .bind(
      timestamp,
      deposit.id,
      timestamp,
      timestamp,
      CHECK_COOLDOWN_SECONDS
    )
    .run();

  if (
    Number(
      result?.meta?.changes || 0
    ) !== 1
  ) {
    return errorResponse(
      "Pengecekan terlalu cepat atau deposit sudah berubah.",
      429
    );
  }

  return successResponse({
    status: "PENDING",
    code: deposit.code,
    amount: Number(
      deposit.amount || 0
    ),
    message:
      "Permintaan pengecekan pembayaran berhasil dicatat.",
    check_count:
      Number(
        deposit.check_count || 0
      ) + 1
  });
}

async function getActiveDeposit(
  request,
  env
) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const timestamp = nowUnix();

  await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'EXPIRED'
       WHERE user_id = ?
         AND status = 'PENDING'
         AND expires_at <= ?`
    )
    .bind(
      user.id,
      timestamp
    )
    .run();

  const deposit = await env.DB
    .prepare(
      `${selectDepositSql()}
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
    deposit: deposit
      ? formatDeposit(
          deposit,
          request
        )
      : null
  });
}

async function payDepositInternal(
  env,
  code
) {
  const normalized =
    normalizeCode(code);

  if (!isValidCode(normalized)) {
    return {
      success: false,
      reason: "INVALID_CODE"
    };
  }

  const timestamp = nowUnix();

  const deposit =
    await getDepositByCode(
      env.DB,
      normalized
    );

  if (!deposit) {
    return {
      success: false,
      reason: "NOT_FOUND"
    };
  }

  const walletReference =
    `DEPOSIT:${normalized}`;

  const existing =
    await env.DB
      .prepare(
        `SELECT
          id,
          user_id,
          amount,
          balance_before,
          balance_after
         FROM balance_transactions
         WHERE reference = ?
         LIMIT 1`
      )
      .bind(
        walletReference
      )
      .first();

  if (existing) {
    const currentDeposit =
      await getDepositByCode(
        env.DB,
        normalized
      );

    if (
      currentDeposit?.status !==
      "PAID"
    ) {
      await env.DB
        .prepare(
          `UPDATE deposits
           SET
             status = 'PAID',
             paid_at = COALESCE(
               paid_at,
               ?
             ),
             checked_at = COALESCE(
               checked_at,
               ?
             ),
             wallet_transaction_id = ?
           WHERE id = ?
             AND status IN (
               'PENDING',
               'PAID'
             )`
        )
        .bind(
          timestamp,
          timestamp,
          Number(existing.id),
          Number(deposit.id)
        )
        .run();
    }

    const user =
      await env.DB
        .prepare(
          `SELECT
            id,
            username,
            balance,
            is_active
           FROM users
           WHERE id = ?
           LIMIT 1`
        )
        .bind(
          deposit.user_id
        )
        .first();

    return {
      success: true,
      duplicate: true,
      deposit:
        await getDepositByCode(
          env.DB,
          normalized
        ),
      user: {
        id: Number(
          user?.id ??
            deposit.user_id
        ),
        username:
          user?.username ||
          "unknown",
        balance: Number(
          existing.balance_after
        )
      },
      transaction_id:
        Number(existing.id)
    };
  }

  if (
    deposit.status !== "PENDING"
  ) {
    return {
      success: false,
      reason: "INVALID_STATUS",
      status: deposit.status
    };
  }

  if (
    Number(deposit.expires_at) <=
    timestamp
  ) {
    await expireDeposit(
      env.DB,
      deposit.id,
      timestamp
    );

    return {
      success: false,
      reason: "EXPIRED",
      status: "EXPIRED"
    };
  }

  const amount =
    Number(deposit.amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount < DEFAULT_MIN_AMOUNT ||
    amount > DEFAULT_MAX_AMOUNT
  ) {
    return {
      success: false,
      reason: "INVALID_AMOUNT"
    };
  }

  const user =
    await env.DB
      .prepare(
        `SELECT
          id,
          username,
          balance,
          is_active
         FROM users
         WHERE id = ?
         LIMIT 1`
      )
      .bind(
        deposit.user_id
      )
      .first();

  if (!user) {
    return {
      success: false,
      reason: "USER_NOT_FOUND"
    };
  }

  if (
    Number(user.is_active) !== 1
  ) {
    return {
      success: false,
      reason: "USER_INACTIVE"
    };
  }

  const before =
    Number(user.balance || 0);

  if (
    !Number.isSafeInteger(before) ||
    before < 0
  ) {
    return {
      success: false,
      reason: "INVALID_BALANCE"
    };
  }

  const after =
    before + amount;

  if (
    !Number.isSafeInteger(after) ||
    after < before
  ) {
    return {
      success: false,
      reason: "BALANCE_OVERFLOW"
    };
  }

  const updateUser =
    env.DB.prepare(
      `UPDATE users
       SET
         balance = ?,
         updated_at = ?
       WHERE id = ?
         AND is_active = 1
         AND balance = ?
         AND EXISTS (
           SELECT 1
           FROM deposits
           WHERE id = ?
             AND status = 'PENDING'
             AND expires_at > ?
         )`
    ).bind(
      after,
      timestamp,
      deposit.user_id,
      before,
      deposit.id,
      timestamp
    );

  const insertTransaction =
    env.DB.prepare(
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
      SELECT
        ?,
        'deposit',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      WHERE changes() = 1`
    ).bind(
      deposit.user_id,
      amount,
      before,
      after,
      walletReference,
      `Deposit QRIS ${normalized}`,
      timestamp
    );

  const updateDeposit =
    env.DB.prepare(
      `UPDATE deposits
       SET
         status = 'PAID',
         checked_at = COALESCE(
           checked_at,
           ?
         ),
         paid_at = COALESCE(
           paid_at,
           ?
         ),
         wallet_transaction_id = (
           SELECT id
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1
         )
       WHERE id = ?
         AND status = 'PENDING'
         AND expires_at > ?
         AND changes() = 1`
    ).bind(
      timestamp,
      timestamp,
      walletReference,
      deposit.id,
      timestamp
    );

  try {
    const batch = await env.DB.batch([
      updateUser,
      insertTransaction,
      updateDeposit
    ]);

    const userChanged =
      Number(
        batch?.[0]?.meta?.changes ||
          0
      );

    const transactionCreated =
      Number(
        batch?.[1]?.meta?.changes ||
          0
      );

    const depositChanged =
      Number(
        batch?.[2]?.meta?.changes ||
          0
      );

    if (
      userChanged === 1 &&
      transactionCreated === 1 &&
      depositChanged === 1
    ) {
      const transaction =
        await env.DB
          .prepare(
            `SELECT
              id,
              balance_after
             FROM balance_transactions
             WHERE reference = ?
             LIMIT 1`
          )
          .bind(
            walletReference
          )
          .first();

      const finalDeposit =
        await getDepositByCode(
          env.DB,
          normalized
        );

      return {
        success: true,
        duplicate: false,
        deposit: finalDeposit,
        user: {
          id: Number(user.id),
          username: user.username,
          balance: Number(
            transaction?.balance_after ??
              after
          )
        },
        transaction_id:
          transaction?.id
            ? Number(transaction.id)
            : null
      };
    }
  } catch (error) {
    const duplicate =
      await env.DB
        .prepare(
          `SELECT
            id,
            user_id,
            amount,
            balance_before,
            balance_after
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1`
        )
        .bind(
          walletReference
        )
        .first();

    if (duplicate) {
      const finalDeposit =
        await getDepositByCode(
          env.DB,
          normalized
        );

      return {
        success: true,
        duplicate: true,
        deposit: finalDeposit,
        user: {
          id: Number(
            user.id
          ),
          username:
            user.username,
          balance: Number(
            duplicate.balance_after
          )
        },
        transaction_id:
          Number(duplicate.id)
      };
    }

    throw error;
  }

  const duplicate =
    await env.DB
      .prepare(
        `SELECT
          id,
          user_id,
          amount,
          balance_before,
          balance_after
         FROM balance_transactions
         WHERE reference = ?
         LIMIT 1`
      )
      .bind(
        walletReference
      )
      .first();

  if (duplicate) {
    const finalDeposit =
      await getDepositByCode(
        env.DB,
        normalized
      );

    return {
      success: true,
      duplicate: true,
      deposit: finalDeposit,
      user: {
        id: Number(
          user.id
        ),
        username:
          user.username,
        balance: Number(
          duplicate.balance_after
        )
      },
      transaction_id:
        Number(duplicate.id)
    };
  }

  const latestDeposit =
    await getDepositByCode(
      env.DB,
      normalized
    );

  if (
    latestDeposit?.status ===
    "PAID"
  ) {
    const transaction =
      await env.DB
        .prepare(
          `SELECT
            id,
            balance_after
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1`
        )
        .bind(
          walletReference
        )
        .first();

    if (transaction) {
      return {
        success: true,
        duplicate: true,
        deposit: latestDeposit,
        user: {
          id: Number(
            user.id
          ),
          username:
            user.username,
          balance: Number(
            transaction.balance_after
          )
        },
        transaction_id:
          Number(transaction.id)
      };
    }
  }

  return {
    success: false,
    reason: "BALANCE_CHANGED"
  };
}

async function payDeposit(
  requestOrEnv,
  envOrCode,
  codeOrReference = null
) {
  if (
    requestOrEnv instanceof Request
  ) {
    const request =
      requestOrEnv;

    const env =
      envOrCode;

    const admin =
      await requireAdmin(
        request,
        env
      );

    if (admin instanceof Response) {
      return admin;
    }

    let body;

    try {
      body =
        await readJson(request);
    } catch (error) {
      return errorResponse(
        error?.message ||
          "Request tidak valid.",
        400
      );
    }

    const code =
      normalizeCode(
        body?.code
      );

    if (!isValidCode(code)) {
      return errorResponse(
        "Kode deposit tidak valid.",
        400
      );
    }

    const result =
      await payDepositInternal(
        env,
        code
      );

    if (!result.success) {
      const status =
        result.reason ===
        "NOT_FOUND"
          ? 404
          : result.reason ===
              "EXPIRED" ||
            result.reason ===
              "INVALID_STATUS"
            ? 409
            : result.reason ===
                "USER_INACTIVE"
              ? 403
              : 400;

      const message =
        result.reason ===
          "NOT_FOUND"
          ? "Kode deposit tidak ditemukan."
          : result.reason ===
              "EXPIRED"
            ? "Deposit sudah expired."
            : result.reason ===
                "INVALID_STATUS"
              ? `Deposit tidak bisa dibayar. Status: ${result.status}.`
              : result.reason ===
                  "USER_INACTIVE"
                ? "Akun pengguna tidak aktif."
                : "Deposit gagal dikonfirmasi.";

      return errorResponse(
        message,
        status,
        {
          reason:
            result.reason,
          status:
            result.status || null
        }
      );
    }

    return successResponse({
      status: "PAID",
      message:
        result.duplicate
          ? "Deposit sudah dikonfirmasi sebelumnya."
          : "Deposit berhasil dikonfirmasi.",
      code:
        result.deposit.code,
      amount: Number(
        result.deposit.amount
      ),
      balance: Number(
        result.user.balance
      ),
      transaction_id:
        result.transaction_id,
      duplicate:
        Boolean(
          result.duplicate
        )
    });
  }

  const env =
    requestOrEnv;

  const code =
    normalizeCode(
      envOrCode
    );

  return payDepositInternal(
    env,
    code
  );
}

async function cancelDeposit(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (user instanceof Response) {
    return user;
  }

  let body;

  try {
    body =
      await readJson(request);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Request tidak valid.",
      400
    );
  }

  const code =
    normalizeCode(
      body?.code
    );

  if (!isValidCode(code)) {
    return errorResponse(
      "Kode deposit tidak valid.",
      400
    );
  }

  const result =
    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           status = 'CANCELLED',
           cancelled_at = ?
         WHERE user_id = ?
           AND code = ?
           AND status = 'PENDING'`
      )
      .bind(
        nowUnix(),
        user.id,
        code
      )
      .run();

  if (
    Number(
      result?.meta?.changes || 0
    ) !== 1
  ) {
    return errorResponse(
      "Deposit tidak dapat dibatalkan.",
      409
    );
  }

  return successResponse({
    status: "CANCELLED",
    code
  });
}

export {
  createDeposit,
  getDeposit,
  checkDeposit,
  getActiveDeposit,
  payDeposit,
  cancelDeposit,
  formatDeposit
};