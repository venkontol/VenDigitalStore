import {
  cleanString,
  randomId,
  nowUnix,
  successResponse,
  errorResponse,
  readJson
} from "./utils.js";

import {
  requireAuth,
  requireAdmin
} from "./auth.js";

const DEPOSIT_CODE_CHARS =
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
    code +=
      DEPOSIT_CODE_CHARS[
        bytes[i] % DEPOSIT_CODE_CHARS.length
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
  const min =
    Number(env.DEPOSIT_MIN_AMOUNT);

  const max =
    Number(env.DEPOSIT_MAX_AMOUNT);

  const expiry =
    Number(env.DEPOSIT_EXPIRY_MINUTES);

  return {
    min_amount:
      Number.isSafeInteger(min) &&
      min >= 1000
        ? min
        : DEFAULT_MIN_AMOUNT,

    max_amount:
      Number.isSafeInteger(max) &&
      max >= 1000
        ? max
        : DEFAULT_MAX_AMOUNT,

    expiry_minutes:
      Number.isSafeInteger(expiry) &&
      expiry >= 5 &&
      expiry <= 1440
        ? expiry
        : DEFAULT_EXPIRY_MINUTES
  };
}

function getQrUrl(request) {
  const url =
    new URL(request.url);

  return `${url.origin}/api/deposit/qr`;
}

async function findUniqueCode(db) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code =
      generateDepositCode();

    const exists =
      await db
        .prepare(
          `SELECT id
           FROM deposits
           WHERE code = ?
           LIMIT 1`
        )
        .bind(code)
        .first();

    if (!exists) {
      return code;
    }
  }

  return null;
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

function formatDeposit(
  deposit,
  request = null
) {
  if (!deposit) {
    return null;
  }

  return {
    id:
      Number(deposit.id),

    user_id:
      deposit.user_id
        ? Number(deposit.user_id)
        : undefined,

    code:
      deposit.code,

    amount:
      Number(deposit.amount || 0),

    status:
      deposit.status,

    payment_method:
      deposit.payment_method || "QRIS",

    created_at:
      deposit.created_at,

    expires_at:
      deposit.expires_at,

    checked_at:
      deposit.checked_at,

    paid_at:
      deposit.paid_at,

    cancelled_at:
      deposit.cancelled_at,

    check_count:
      Number(deposit.check_count || 0),

    wallet_transaction_id:
      deposit.wallet_transaction_id
        ? Number(
            deposit.wallet_transaction_id
          )
        : null,

    qr_url:
      request
        ? getQrUrl(request)
        : "/api/deposit/qr"
  };
}

async function expireDeposit(
  db,
  depositId,
  timestamp
) {
  const result =
    await db
      .prepare(
        `UPDATE deposits
         SET status = 'EXPIRED'
         WHERE id = ?
           AND status = 'PENDING'
           AND expires_at <= ?`
      )
      .bind(
        depositId,
        timestamp
      )
      .run();

  return Boolean(
    result?.meta?.changes
  );
}

async function getDepositByCode(
  db,
  code
) {
  return db
    .prepare(
      `${selectDepositSql()}
       WHERE code = ?
       LIMIT 1`
    )
    .bind(code)
    .first();
}

async function createDeposit(
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

  const config =
    getConfig(env);

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

  const timestamp =
    nowUnix();

  const active =
    await env.DB
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
      deposit:
        formatDeposit(
          active,
          request
        )
    });
  }

  const expiresAt =
    timestamp +
    config.expiry_minutes * 60;

  const code =
    await findUniqueCode(
      env.DB
    );

  if (!code) {
    return errorResponse(
      "Gagal membuat kode deposit. Silakan coba lagi.",
      500
    );
  }

  let result;

  try {
    result =
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
    const message =
      String(
        error?.message || ""
      );

    if (
      message
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Kode deposit bentrok. Silakan coba lagi.",
        409
      );
    }

    throw error;
  }

  const depositId =
    Number(
      result?.meta?.last_row_id || 0
    );

  if (!depositId) {
    return errorResponse(
      "Deposit gagal dibuat.",
      500
    );
  }

  const deposit =
    await env.DB
      .prepare(
        `${selectDepositSql()}
         WHERE id = ?
         LIMIT 1`
      )
      .bind(
        depositId
      )
      .first();

  if (!deposit) {
    return errorResponse(
      "Deposit berhasil dibuat tetapi gagal dibaca kembali.",
      500
    );
  }

  return successResponse(
    {
      deposit:
        formatDeposit(
          deposit,
          request
        )
    },
    201
  );
}

async function getDeposit(
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

  const url =
    new URL(request.url);

  const code =
    normalizeCode(
      url.searchParams.get(
        "code"
      )
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

  const deposit =
    await env.DB
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

  const timestamp =
    nowUnix();

  if (
    deposit.status ===
      "PENDING" &&
    Number(
      deposit.expires_at
    ) <= timestamp
  ) {
    await expireDeposit(
      env.DB,
      deposit.id,
      timestamp
    );

    deposit.status =
      "EXPIRED";
  }

  return successResponse({
    deposit:
      formatDeposit(
        deposit,
        request
      ),

    status:
      deposit.status,

    amount:
      Number(
        deposit.amount || 0
      ),

    code:
      deposit.code,

    expired_at:
      deposit.expires_at
  });
}

async function checkDeposit(
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

  if (
    deposit.status ===
    "PAID"
  ) {
    return successResponse({
      status:
        "PAID",
      code:
        deposit.code,
      amount:
        Number(
          deposit.amount
        ),
      message:
        "Deposit sudah dibayar."
    });
  }

  if (
    deposit.status !==
    "PENDING"
  ) {
    return errorResponse(
      `Deposit tidak dapat dicek karena statusnya ${deposit.status}.`,
      409,
      {
        status:
          deposit.status
      }
    );
  }

  if (
    Number(
      deposit.expires_at
    ) <= timestamp
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
        status:
          "EXPIRED"
      }
    );
  }

  const lastChecked =
    deposit.checked_at
      ? Number(
          deposit.checked_at
        )
      : 0;

  if (
    lastChecked > 0 &&
    timestamp -
      lastChecked <
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
        retry_after:
          remaining
      }
    );
  }

  const update =
    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           checked_at = ?,
           check_count =
             check_count + 1
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
    !update?.meta?.changes
  ) {
    return errorResponse(
      "Pengecekan terlalu cepat atau deposit sudah berubah.",
      429
    );
  }

  return successResponse({
    status:
      "PENDING",

    code:
      deposit.code,

    amount:
      Number(
        deposit.amount
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
    deposit:
      deposit
        ? formatDeposit(
            deposit,
            request
          )
        : null
  });
}

async function payDepositInternal(
  env,
  code,
  reference = null
) {
  const normalized =
    normalizeCode(code);

  if (
    !isValidCode(normalized)
  ) {
    return {
      success: false,
      reason: "INVALID_CODE"
    };
  }

  const timestamp =
    nowUnix();

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
    Number(
      user.is_active
    ) !== 1
  ) {
    return {
      success: false,
      reason: "USER_INACTIVE"
    };
  }

  if (
    deposit.status ===
    "PAID"
  ) {
    const existing =
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
          reference ||
            `DEPOSIT:${normalized}`
        )
        .first();

    return {
      success: true,
      duplicate: true,
      deposit,
      user: {
        id:
          Number(user.id),
        username:
          user.username,
        balance:
          Number(
            existing?.balance_after ??
              user.balance ??
              0
          )
      },
      transaction_id:
        existing?.id
          ? Number(
              existing.id
            )
          : deposit.wallet_transaction_id
            ? Number(
                deposit.wallet_transaction_id
              )
            : null
    };
  }

  if (
    deposit.status !==
    "PENDING"
  ) {
    return {
      success: false,
      reason:
        "INVALID_STATUS",
      status:
        deposit.status
    };
  }

  if (
    Number(
      deposit.expires_at
    ) <= timestamp
  ) {
    await expireDeposit(
      env.DB,
      deposit.id,
      timestamp
    );

    return {
      success: false,
      reason: "EXPIRED",
      status:
        "EXPIRED"
    };
  }

  const amount =
    Number(
      deposit.amount
    );

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount < 1000 ||
    amount > 10000000
  ) {
    return {
      success: false,
      reason:
        "INVALID_AMOUNT"
    };
  }

  const before =
    Number(
      user.balance || 0
    );

  if (
    !Number.isSafeInteger(
      before
    ) ||
    before < 0
  ) {
    return {
      success: false,
      reason:
        "INVALID_BALANCE"
    };
  }

  const after =
    before + amount;

  if (
    !Number.isSafeInteger(
      after
    ) ||
    after < before
  ) {
    return {
      success: false,
      reason:
        "BALANCE_OVERFLOW"
    };
  }

  const walletReference =
    reference ||
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
    await env.DB
      .prepare(
        `UPDATE deposits
         SET
           status = 'PAID',
           paid_at =
             COALESCE(
               paid_at,
               ?
             ),
           checked_at =
             COALESCE(
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
        Number(
          existing.id
        ),
        deposit.id
      )
      .run();

    const latestUser =
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
      deposit: {
        ...deposit,
        status:
          "PAID",
        wallet_transaction_id:
          Number(
            existing.id
          )
      },
      user: {
        id:
          Number(
            latestUser?.id ??
              user.id
          ),
        username:
          latestUser?.username ||
          user.username,
        balance:
          Number(
            existing.balance_after
          )
      },
      transaction_id:
        Number(
          existing.id
        )
    };
  }

  const updateUser =
    env.DB
      .prepare(
        `UPDATE users
         SET
           balance = ?,
           updated_at = ?
         WHERE id = ?
           AND is_active = 1
           AND balance = ?`
      )
      .bind(
        after,
        timestamp,
        deposit.user_id,
        before
      );

  const insertTransaction =
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
         VALUES (
           ?,
           'deposit',
           ?,
           ?,
           ?,
           ?,
           ?,
           ?
         )`
      )
      .bind(
        deposit.user_id,
        amount,
        before,
        after,
        walletReference,
        `Deposit QRIS ${normalized}`,
        timestamp
      );

  try {
    const batch =
      await env.DB.batch([
        updateUser,
        insertTransaction
      ]);

    const userChanged =
      Number(
        batch?.[0]?.meta?.changes ||
          0
      );

    if (!userChanged) {
      const latest =
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

      const duplicate =
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

      if (duplicate) {
        await env.DB
          .prepare(
            `UPDATE deposits
             SET
               status = 'PAID',
               paid_at =
                 COALESCE(
                   paid_at,
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
            Number(
              duplicate.id
            ),
            deposit.id
          )
          .run();

        return {
          success: true,
          duplicate: true,
          deposit: {
            ...deposit,
            status:
              "PAID",
            wallet_transaction_id:
              Number(
                duplicate.id
              )
          },
          user: {
            id:
              Number(
                latest?.id ??
                  user.id
              ),
            username:
              latest?.username ||
              user.username,
            balance:
              Number(
                duplicate.balance_after
              )
          },
          transaction_id:
            Number(
              duplicate.id
            )
        };
      }

      return {
        success: false,
        reason:
          "BALANCE_CHANGED"
      };
    }

    const transactionId =
      Number(
        batch?.[1]?.meta?.last_row_id ||
          0
      );

    if (!transactionId) {
      const duplicate =
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

      if (!duplicate) {
        return {
          success: false,
          reason:
            "TRANSACTION_FAILED"
        };
      }
    }

    const finalTransaction =
      transactionId ||
      Number(
        (
          await env.DB
            .prepare(
              `SELECT id
               FROM balance_transactions
               WHERE reference = ?
               LIMIT 1`
            )
            .bind(
              walletReference
            )
            .first()
        )?.id || 0
      );

    const depositUpdate =
      await env.DB
        .prepare(
          `UPDATE deposits
           SET
             status = 'PAID',
             paid_at = ?,
             checked_at =
               COALESCE(
                 checked_at,
                 ?
               ),
             wallet_transaction_id = ?
           WHERE id = ?
             AND status = 'PENDING'`
        )
        .bind(
          timestamp,
          timestamp,
          finalTransaction,
          deposit.id
        )
        .run();

    if (
      !depositUpdate?.meta?.changes
    ) {
      const current =
        await getDepositByCode(
          env.DB,
          normalized
        );

      if (
        current?.status ===
        "PAID"
      ) {
        return {
          success: true,
          duplicate: true,
          deposit: current,
          user: {
            id:
              Number(
                user.id
              ),
            username:
              user.username,
            balance:
              after
          },
          transaction_id:
            Number(
              current.wallet_transaction_id ||
                finalTransaction
            )
        };
      }

      return {
        success: false,
        reason:
          "DEPOSIT_STATE_FAILED"
      };
    }

    return {
      success: true,
      duplicate: false,
      deposit: {
        ...deposit,
        status:
          "PAID",
        paid_at:
          timestamp,
        wallet_transaction_id:
          finalTransaction
      },
      user: {
        id:
          Number(
            user.id
          ),
        username:
          user.username,
        balance:
          after
      },
      transaction_id:
        finalTransaction
    };
  } catch (error) {
    const duplicate =
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

    if (duplicate) {
      await env.DB
        .prepare(
          `UPDATE deposits
           SET
             status = 'PAID',
             paid_at =
               COALESCE(
                 paid_at,
                 ?
               ),
             checked_at =
               COALESCE(
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
          Number(
            duplicate.id
          ),
          deposit.id
        )
        .run();

      return {
        success: true,
        duplicate: true,
        deposit: {
          ...deposit,
          status:
            "PAID",
          wallet_transaction_id:
            Number(
              duplicate.id
            )
        },
        user: {
          id:
            Number(
              user.id
            ),
          username:
            user.username,
          balance:
            Number(
              duplicate.balance_after
            )
        },
        transaction_id:
          Number(
            duplicate.id
          )
      };
    }

    throw error;
  }
}

async function payDeposit(
  requestOrEnv,
  envOrCode,
  codeOrReference = null,
  ctx = null
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

    if (!code) {
      return errorResponse(
        "Kode deposit wajib diisi.",
        400
      );
    }

    const result =
      await payDepositInternal(
        env,
        code,
        `DEPOSIT:${code}`
      );

    if (
      !result.success
    ) {
      const status =
        result.reason ===
        "NOT_FOUND"
          ? 404
          : result.reason ===
              "EXPIRED" ||
            result.reason ===
              "INVALID_STATUS"
            ? 409
            : 400;

      return errorResponse(
        result.reason ===
          "NOT_FOUND"
          ? "Kode deposit tidak ditemukan."
          : result.reason ===
              "EXPIRED"
            ? "Deposit sudah expired."
            : result.reason ===
                "INVALID_STATUS"
              ? `Deposit tidak bisa dibayar. Status: ${result.status}.`
              : "Deposit gagal dikonfirmasi.",
        status,
        {
          reason:
            result.reason,
          status:
            result.status ||
            null
        }
      );
    }

    return successResponse({
      status:
        "PAID",
      message:
        result.duplicate
          ? "Deposit sudah dikonfirmasi sebelumnya."
          : "Deposit berhasil dikonfirmasi.",
      code:
        result.deposit.code,
      amount:
        Number(
          result.deposit.amount
        ),
      balance:
        Number(
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

  const reference =
    codeOrReference ||
    `DEPOSIT:${code}`;

  return payDepositInternal(
    env,
    code,
    reference
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

  if (
    !isValidCode(code)
  ) {
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
    !result?.meta?.changes
  ) {
    return errorResponse(
      "Deposit tidak dapat dibatalkan.",
      409
    );
  }

  return successResponse({
    status:
      "CANCELLED",
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
