import {
  errorResponse,
  jsonResponse,
  nowUnix,
  formatRupiah
} from "./utils.js";

import {
  requireAuth
} from "./auth.js";

const LEDGER_TYPES = new Set([
  "DEPOSIT",
  "PURCHASE",
  "REFUND",
  "ADJUSTMENT",
  "BONUS"
]);

function validateAmount(
  amount,
  label
) {
  const value = Number(amount);

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `Nominal ${label} tidak valid.`
    );
  }

  return value;
}

function validateLedgerType(type) {
  if (!LEDGER_TYPES.has(type)) {
    throw new Error(
      "Tipe transaksi saldo tidak valid."
    );
  }

  return type;
}

async function findTransactionByReference(
  env,
  reference
) {
  if (!reference) {
    return null;
  }

  return env.DB
    .prepare(
      `
      SELECT
        id,
        user_id,
        amount,
        balance_before,
        balance_after,
        type,
        reference,
        description,
        order_id,
        deposit_id,
        created_at
      FROM balance_transactions
      WHERE reference = ?
      LIMIT 1
      `
    )
    .bind(reference)
    .first();
}

async function getUserBalanceRow(
  env,
  userId
) {
  return env.DB
    .prepare(
      `
      SELECT
        id,
        balance
      FROM users
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(userId)
    .first();
}

function transactionResult(
  transaction,
  fallbackAmount = 0
) {
  return {
    success: true,
    id: transaction?.id || null,
    amount: Number(
      transaction?.amount ??
      fallbackAmount
    ),
    balance: Number(
      transaction?.balance_after ?? 0
    ),
    balance_before: Number(
      transaction?.balance_before ?? 0
    ),
    balance_after: Number(
      transaction?.balance_after ?? 0
    ),
    idempotent: false
  };
}

function idempotentResult(
  transaction
) {
  return {
    success: true,
    id: transaction.id,
    amount: Number(
      transaction.amount
    ),
    balance: Number(
      transaction.balance_after
    ),
    balance_before: Number(
      transaction.balance_before
    ),
    balance_after: Number(
      transaction.balance_after
    ),
    idempotent: true
  };
}

export async function getWalletOverview(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const user =
    await getUserBalanceRow(
      env,
      auth.user.id
    );

  if (!user) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const transactions =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          type,
          amount,
          balance_before,
          balance_after,
          reference,
          description,
          order_id,
          deposit_id,
          created_at
        FROM balance_transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 20
        `
      )
      .bind(auth.user.id)
      .all();

  return jsonResponse({
    success: true,
    balance:
      Number(user.balance || 0),

    balance_formatted:
      formatRupiah(
        user.balance
      ),

    transactions:
      transactions.results || []
  });
}

export async function getBalance(
  env,
  userId
) {
  const user =
    await getUserBalanceRow(
      env,
      userId
    );

  if (!user) {
    return null;
  }

  return Number(
    user.balance || 0
  );
}

export async function creditBalance(
  env,
  {
    userId,
    amount,
    type = "DEPOSIT",
    reference = null,
    description = null,
    depositId = null,
    orderId = null
  }
) {
  amount =
    validateAmount(
      amount,
      "credit"
    );

  validateLedgerType(
    type
  );

  if (reference) {
    const existing =
      await findTransactionByReference(
        env,
        reference
      );

    if (existing) {
      return idempotentResult(
        existing
      );
    }
  }

  const user =
    await getUserBalanceRow(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "User tidak ditemukan."
    );
  }

  /*
   * Jangan menghitung saldo baru
   * dari hasil SELECT lalu menulis
   * angka tersebut.
   *
   * Gunakan:
   *
   * balance = balance + amount
   *
   * agar operasi bersifat atomic.
   */

  const now =
    nowUnix();

  const maxSafeBalance =
    Number.MAX_SAFE_INTEGER -
    amount;

  try {
    const result =
      await env.DB.batch([
        env.DB
          .prepare(
            `
            UPDATE users
            SET
              balance = balance + ?,
              updated_at = ?
            WHERE id = ?
              AND balance >= 0
              AND balance <= ?
            `
          )
          .bind(
            amount,
            now,
            userId,
            maxSafeBalance
          ),

        env.DB
          .prepare(
            `
            INSERT INTO balance_transactions (
              user_id,
              order_id,
              deposit_id,
              type,
              amount,
              balance_before,
              balance_after,
              reference,
              description,
              created_at
            )
            SELECT
              id,
              ?,
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
            `
          )
          .bind(
            orderId,
            depositId,
            type,
            amount,
            amount,
            reference,
            description,
            now,
            userId
          )
      ]);

    const updateResult =
      result?.[0];

    const insertResult =
      result?.[1];

    if (
      !updateResult ||
      Number(
        updateResult.meta?.changes || 0
      ) !== 1
    ) {
      throw new Error(
        "Saldo tidak dapat diperbarui."
      );
    }

    if (
      !insertResult ||
      Number(
        insertResult.meta?.changes || 0
      ) !== 1
    ) {
      throw new Error(
        "Gagal mencatat transaksi saldo."
      );
    }

    const transactionId =
      Number(
        insertResult.meta?.last_row_id || 0
      );

    const transaction =
      await env.DB
        .prepare(
          `
          SELECT
            id,
            amount,
            balance_before,
            balance_after,
            type,
            reference,
            description,
            order_id,
            deposit_id,
            created_at
          FROM balance_transactions
          WHERE id = ?
          LIMIT 1
          `
        )
        .bind(transactionId)
        .first();

    if (!transaction) {
      throw new Error(
        "Transaksi saldo tidak ditemukan setelah dibuat."
      );
    }

    return transactionResult(
      transaction,
      amount
    );

  } catch (error) {
    /*
     * Jika dua request bersamaan
     * memakai reference yang sama,
     * unique index akan membuat salah
     * satunya gagal.
     *
     * Cek kembali reference agar
     * operasi tetap idempotent.
     */

    if (reference) {
      const existing =
        await findTransactionByReference(
          env,
          reference
        );

      if (existing) {
        return idempotentResult(
          existing
        );
      }
    }

    throw error;
  }
}

export async function debitBalance(
  env,
  {
    userId,
    amount,
    type = "PURCHASE",
    reference = null,
    description = null,
    orderId = null
  }
) {
  amount =
    validateAmount(
      amount,
      "debit"
    );

  validateLedgerType(
    type
  );

  if (reference) {
    const existing =
      await findTransactionByReference(
        env,
        reference
      );

    if (existing) {
      return idempotentResult(
        existing
      );
    }
  }

  const user =
    await getUserBalanceRow(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "User tidak ditemukan."
    );
  }

  const currentBalance =
    Number(
      user.balance || 0
    );

  if (
    currentBalance <
    amount
  ) {
    return {
      success: false,
      insufficient: true,
      balance: currentBalance
    };
  }

  const now =
    nowUnix();

  try {
    const result =
      await env.DB.batch([
        /*
         * Atomic debit.
         *
         * Kalau saldo tidak cukup,
         * UPDATE menghasilkan 0 row.
         */
        env.DB
          .prepare(
            `
            UPDATE users
            SET
              balance = balance - ?,
              updated_at = ?
            WHERE id = ?
              AND balance >= ?
            `
          )
          .bind(
            amount,
            now,
            userId,
            amount
          ),

        /*
         * Ambil saldo SETELAH UPDATE
         * untuk membuat ledger yang akurat.
         *
         * balance_after = balance
         * balance_before = balance + amount
         */
        env.DB
          .prepare(
            `
            INSERT INTO balance_transactions (
              user_id,
              order_id,
              type,
              amount,
              balance_before,
              balance_after,
              reference,
              description,
              created_at
            )
            SELECT
              id,
              ?,
              ?,
              ?,
              balance + ?,
              balance,
              ?,
              ?,
              ?
            FROM users
            WHERE id = ?
              AND balance >= 0
            `
          )
          .bind(
            orderId,
            type,
            -amount,
            amount,
            reference,
            description,
            now,
            userId
          )
      ]);

    const updateResult =
      result?.[0];

    const insertResult =
      result?.[1];

    const changed =
      Number(
        updateResult?.meta?.changes || 0
      );

    /*
     * UPDATE 0 berarti saldo
     * tidak cukup atau user tidak ada.
     */
    if (changed !== 1) {
      const latest =
        await getUserBalanceRow(
          env,
          userId
        );

      if (!latest) {
        throw new Error(
          "User tidak ditemukan."
        );
      }

      return {
        success: false,
        insufficient: true,
        balance: Number(
          latest.balance || 0
        )
      };
    }

    if (
      !insertResult ||
      Number(
        insertResult.meta?.changes || 0
      ) !== 1
    ) {
      throw new Error(
        "Gagal mencatat transaksi debit."
      );
    }

    const transactionId =
      Number(
        insertResult.meta?.last_row_id || 0
      );

    const transaction =
      await env.DB
        .prepare(
          `
          SELECT
            id,
            amount,
            balance_before,
            balance_after,
            type,
            reference,
            description,
            order_id,
            created_at
          FROM balance_transactions
          WHERE id = ?
          LIMIT 1
          `
        )
        .bind(transactionId)
        .first();

    if (!transaction) {
      throw new Error(
        "Transaksi debit tidak ditemukan setelah dibuat."
      );
    }

    return transactionResult(
      transaction,
      -amount
    );

  } catch (error) {
    /*
     * Menangani race condition
     * ketika reference yang sama
     * diproses lebih dari sekali.
     */
    if (reference) {
      const existing =
        await findTransactionByReference(
          env,
          reference
        );

      if (existing) {
        return idempotentResult(
          existing
        );
      }
    }

    throw error;
  }
}

export async function refundBalance(
  env,
  {
    userId,
    amount,
    reference,
    description = "Refund pesanan",
    orderId = null
  }
) {
  return creditBalance(
    env,
    {
      userId,
      amount,
      type: "REFUND",
      reference,
      description,
      orderId
    }
  );
}

export async function adjustmentBalance(
  env,
  {
    userId,
    amount,
    reference,
    description = "Penyesuaian saldo"
  }
) {
  amount =
    Number(amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount === 0
  ) {
    throw new Error(
      "Nominal adjustment tidak valid."
    );
  }

  if (amount > 0) {
    return creditBalance(
      env,
      {
        userId,
        amount,
        type: "ADJUSTMENT",
        reference,
        description
      }
    );
  }

  const result =
    await debitBalance(
      env,
      {
        userId,
        amount:
          Math.abs(amount),
        type: "ADJUSTMENT",
        reference,
        description
      }
    );

  if (result.insufficient) {
    throw new Error(
      "Saldo tidak mencukupi."
    );
  }

  return result;
  }
