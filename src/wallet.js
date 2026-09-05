import {
  cleanString,
  nowUnix,
  successResponse,
  errorResponse
} from "./utils.js";

import {
  requireAuth
} from "./auth.js";

const CREDIT_TYPES = [
  "deposit",
  "refund",
  "bonus",
  "adjustment"
];

const DEBIT_TYPES = [
  "purchase",
  "adjustment"
];

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

function normalizePositiveInteger(value) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function normalizeUserId(value) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
}

function normalizeReference(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const reference =
    cleanString(
      String(value),
      255
    );

  return reference || null;
}

function normalizeDescription(value) {
  const description =
    cleanString(
      String(value ?? ""),
      500
    );

  return description || null;
}

async function findExistingReference(
  env,
  reference
) {
  if (!reference) {
    return null;
  }

  return env.DB
    .prepare(
      `SELECT
         id,
         user_id,
         type,
         amount,
         balance_before,
         balance_after,
         reference,
         description,
         created_at
       FROM balance_transactions
       WHERE reference = ?
       LIMIT 1`
    )
    .bind(reference)
    .first();
}

function transactionResult(
  row,
  duplicate = false
) {
  return {
    success: true,
    duplicate,
    transaction_id:
      Number(row.id),
    balance:
      Number(row.balance_after),
    balance_before:
      Number(row.balance_before),
    balance_after:
      Number(row.balance_after)
  };
}

async function getBalance(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const row =
    await env.DB
      .prepare(
        `SELECT balance
         FROM users
         WHERE id = ?
           AND is_active = 1
         LIMIT 1`
      )
      .bind(
        user.id
      )
      .first();

  if (!row) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  return successResponse({
    balance:
      Number(
        row.balance || 0
      )
  });
}

async function getTransactions(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const url =
    new URL(request.url);

  let limit =
    Number(
      url.searchParams.get(
        "limit"
      ) || 20
    );

  let offset =
    Number(
      url.searchParams.get(
        "offset"
      ) || 0
    );

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    limit = 20;
  }

  if (limit > 100) {
    limit = 100;
  }

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    offset = 0;
  }

  const result =
    await env.DB
      .prepare(
        `SELECT
           id,
           type,
           amount,
           balance_before,
           balance_after,
           reference,
           description,
           created_at
         FROM balance_transactions
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .bind(
        user.id,
        limit,
        offset
      )
      .all();

  return successResponse({
    transactions:
      result.results || [],
    limit,
    offset
  });
}

async function creditBalance(
  env,
  userId,
  amount,
  type = "deposit",
  reference = null,
  description = null
) {
  const numericUserId =
    normalizeUserId(
      userId
    );

  const numericAmount =
    normalizePositiveInteger(
      amount
    );

  if (!numericUserId) {
    return {
      success: false,
      error: "User tidak valid."
    };
  }

  if (!numericAmount) {
    return {
      success: false,
      error: "Nominal kredit tidak valid."
    };
  }

  if (
    !CREDIT_TYPES.includes(
      type
    )
  ) {
    return {
      success: false,
      error: "Tipe transaksi tidak valid."
    };
  }

  const walletReference =
    normalizeReference(
      reference
    );

  const walletDescription =
    normalizeDescription(
      description
    );

  if (
    walletReference
  ) {
    const existing =
      await findExistingReference(
        env,
        walletReference
      );

    if (existing) {
      return transactionResult(
        existing,
        true
      );
    }
  }

  const timestamp =
    nowUnix();

  const update =
    env.DB.prepare(
      `UPDATE users
       SET
         balance = balance + ?,
         updated_at = ?
       WHERE id = ?
         AND is_active = 1
         AND balance >= 0
         AND balance <= ?
         AND balance + ? <= ?`
    ).bind(
      numericAmount,
      timestamp,
      numericUserId,
      MAX_BALANCE,
      numericAmount,
      MAX_BALANCE
    );

  const transaction =
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
         ?,
         ?,
         balance - ?,
         balance,
         ?,
         ?,
         ?
       FROM users
       WHERE id = ?
         AND changes() = 1`
    ).bind(
      numericUserId,
      type,
      numericAmount,
      numericAmount,
      walletReference,
      walletDescription,
      timestamp,
      numericUserId
    );

  try {
    const result =
      await env.DB.batch([
        update,
        transaction
      ]);

    const changed =
      Number(
        result?.[0]?.meta?.changes ||
          0
      );

    const transactionId =
      Number(
        result?.[1]?.meta?.last_row_id ||
          0
      );

    if (
      changed !== 1
    ) {
      if (
        walletReference
      ) {
        const existing =
          await findExistingReference(
            env,
            walletReference
          );

        if (existing) {
          return transactionResult(
            existing,
            true
          );
        }
      }

      return {
        success: false,
        conflict: true,
        error:
          "Saldo berubah bersamaan. Silakan ulangi."
      };
    }

    if (
      transactionId <= 0
    ) {
      return {
        success: false,
        error:
          "Transaksi saldo gagal dicatat."
      };
    }

    const transactionRow =
      await env.DB
        .prepare(
          `SELECT
             id,
             balance_before,
             balance_after
           FROM balance_transactions
           WHERE id = ?
           LIMIT 1`
        )
        .bind(
          transactionId
        )
        .first();

    if (
      !transactionRow
    ) {
      return {
        success: false,
        error:
          "Transaksi saldo tidak ditemukan setelah proses."
      };
    }

    return transactionResult(
      transactionRow,
      false
    );
  } catch (error) {
    if (
      walletReference
    ) {
      const existing =
        await findExistingReference(
          env,
          walletReference
        );

      if (existing) {
        return transactionResult(
          existing,
          true
        );
      }
    }

    throw error;
  }
}

async function debitBalance(
  env,
  userId,
  amount,
  type = "purchase",
  reference = null,
  description = null
) {
  const numericUserId =
    normalizeUserId(
      userId
    );

  const numericAmount =
    normalizePositiveInteger(
      amount
    );

  if (!numericUserId) {
    return {
      success: false,
      error: "User tidak valid."
    };
  }

  if (!numericAmount) {
    return {
      success: false,
      error: "Nominal debit tidak valid."
    };
  }

  if (
    !DEBIT_TYPES.includes(
      type
    )
  ) {
    return {
      success: false,
      error: "Tipe transaksi tidak valid."
    };
  }

  const walletReference =
    normalizeReference(
      reference
    );

  const walletDescription =
    normalizeDescription(
      description
    );

  if (
    walletReference
  ) {
    const existing =
      await findExistingReference(
        env,
        walletReference
      );

    if (existing) {
      return transactionResult(
        existing,
        true
      );
    }
  }

  const timestamp =
    nowUnix();

  const update =
    env.DB.prepare(
      `UPDATE users
       SET
         balance = balance - ?,
         updated_at = ?
       WHERE id = ?
         AND is_active = 1
         AND balance >= ?
         AND balance - ? >= 0`
    ).bind(
      numericAmount,
      timestamp,
      numericUserId,
      numericAmount,
      numericAmount
    );

  const transaction =
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
         ?,
         -?,
         balance + ?,
         balance,
         ?,
         ?,
         ?
       FROM users
       WHERE id = ?
         AND changes() = 1`
    ).bind(
      numericUserId,
      type,
      numericAmount,
      numericAmount,
      walletReference,
      walletDescription,
      timestamp,
      numericUserId
    );

  try {
    const result =
      await env.DB.batch([
        update,
        transaction
      ]);

    const changed =
      Number(
        result?.[0]?.meta?.changes ||
          0
      );

    const transactionId =
      Number(
        result?.[1]?.meta?.last_row_id ||
          0
      );

    if (
      changed !== 1
    ) {
      if (
        walletReference
      ) {
        const existing =
          await findExistingReference(
            env,
            walletReference
          );

        if (existing) {
          return transactionResult(
            existing,
            true
          );
        }
      }

      const current =
        await env.DB
          .prepare(
            `SELECT
               balance,
               is_active
             FROM users
             WHERE id = ?
             LIMIT 1`
          )
          .bind(
            numericUserId
          )
          .first();

      if (
        !current
      ) {
        return {
          success: false,
          error:
            "User tidak ditemukan."
        };
      }

      if (
        Number(
          current.is_active
        ) !== 1
      ) {
        return {
          success: false,
          error:
            "Akun tidak aktif."
        };
      }

      if (
        Number(
          current.balance || 0
        ) < numericAmount
      ) {
        return {
          success: false,
          insufficient: true,
          error:
            "Saldo tidak mencukupi."
        };
      }

      return {
        success: false,
        conflict: true,
        error:
          "Saldo berubah bersamaan. Silakan ulangi."
      };
    }

    if (
      transactionId <= 0
    ) {
      return {
        success: false,
        error:
          "Transaksi saldo gagal dicatat."
      };
    }

    const transactionRow =
      await env.DB
        .prepare(
          `SELECT
             id,
             balance_before,
             balance_after
           FROM balance_transactions
           WHERE id = ?
           LIMIT 1`
        )
        .bind(
          transactionId
        )
        .first();

    if (
      !transactionRow
    ) {
      return {
        success: false,
        error:
          "Transaksi saldo tidak ditemukan setelah proses."
      };
    }

    return transactionResult(
      transactionRow,
      false
    );
  } catch (error) {
    if (
      walletReference
    ) {
      const existing =
        await findExistingReference(
          env,
          walletReference
        );

      if (existing) {
        return transactionResult(
          existing,
          true
        );
      }
    }

    throw error;
  }
}

export {
  getBalance,
  getTransactions,
  creditBalance,
  debitBalance
};
