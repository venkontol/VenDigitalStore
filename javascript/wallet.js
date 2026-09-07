import { errorResponse, jsonResponse, nowUnix, formatRupiah } from "./utils.js";
import { requireAuth } from "./auth.js";

const LEDGER_TYPES = new Set(["DEPOSIT", "PURCHASE", "REFUND", "ADJUSTMENT", "BONUS"]);

function validateAmount(amount, label) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Nominal ${label} tidak valid.`);
  }
  return value;
}

function validateLedgerType(type) {
  if (!LEDGER_TYPES.has(type)) {
    throw new Error("Tipe transaksi saldo tidak valid.");
  }
  return type;
}

function validateUserId(userId) {
  if (userId === null || userId === undefined || userId === "") {
    throw new Error("User tidak valid.");
  }
  return userId;
}

function validateReference(reference) {
  if (reference === null || reference === undefined || reference === "") {
    return null;
  }

  const value = String(reference).trim();

  if (!value) {
    return null;
  }

  if (value.length > 255) {
    throw new Error("Reference transaksi terlalu panjang.");
  }

  return value;
}

function validateOptionalText(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value);

  if (text.length > 1000) {
    throw new Error(`${label} terlalu panjang.`);
  }

  return text;
}

async function findTransactionByReference(env, reference) {
  const normalizedReference = validateReference(reference);

  if (!normalizedReference) {
    return null;
  }

  return env.DB.prepare(`
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
  `).bind(normalizedReference).first();
}

async function getUserBalanceRow(env, userId) {
  validateUserId(userId);

  return env.DB.prepare(`
    SELECT
      id,
      balance
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first();
}

function transactionResult(transaction, fallbackAmount = 0) {
  return {
    success: true,
    id: transaction?.id || null,
    amount: Number(transaction?.amount ?? fallbackAmount),
    balance: Number(transaction?.balance_after ?? 0),
    balance_before: Number(transaction?.balance_before ?? 0),
    balance_after: Number(transaction?.balance_after ?? 0),
    idempotent: false
  };
}

function idempotentResult(transaction) {
  return {
    success: true,
    id: transaction.id,
    amount: Number(transaction.amount),
    balance: Number(transaction.balance_after),
    balance_before: Number(transaction.balance_before),
    balance_after: Number(transaction.balance_after),
    idempotent: true
  };
}

function sameTransaction(
  existing,
  {
    userId,
    amount,
    type,
    orderId = null,
    depositId = null
  }
) {
  if (!existing) {
    return false;
  }

  const expectedAmount =
    type === "PURCHASE" || type === "ADJUSTMENT"
      ? -Number(amount)
      : Number(amount);

  return (
    String(existing.user_id) === String(userId) &&
    Number(existing.amount) === expectedAmount &&
    existing.type === type &&
    String(existing.order_id ?? "") === String(orderId ?? "") &&
    String(existing.deposit_id ?? "") === String(depositId ?? "")
  );
}

async function resolveReference(env, reference, params) {
  if (!reference) {
    return null;
  }

  const existing = await findTransactionByReference(
    env,
    reference
  );

  if (!existing) {
    return null;
  }

  if (!sameTransaction(existing, params)) {
    throw new Error(
      "Reference transaksi sudah digunakan untuk transaksi lain."
    );
  }

  return idempotentResult(existing);
}

export async function getWalletOverview(request, env) {
  const auth = await requireAuth(request, env);

  if (auth.response) {
    return auth.response;
  }

  const user = await getUserBalanceRow(
    env,
    auth.user.id
  );

  if (!user) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const transactions = await env.DB.prepare(`
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
  `).bind(auth.user.id).all();

  return jsonResponse({
    success: true,
    balance: Number(user.balance || 0),
    balance_formatted: formatRupiah(user.balance),
    transactions: transactions.results || []
  });
}

export async function getBalance(env, userId) {
  const user = await getUserBalanceRow(
    env,
    userId
  );

  if (!user) {
    return null;
  }

  return Number(user.balance || 0);
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
  validateUserId(userId);

  amount = validateAmount(
    amount,
    "credit"
  );

  type = validateLedgerType(type);

  reference = validateReference(
    reference
  );

  description = validateOptionalText(
    description,
    "Deskripsi transaksi"
  );

  const existingResult =
    await resolveReference(
      env,
      reference,
      {
        userId,
        amount,
        type,
        orderId,
        depositId
      }
    );

  if (existingResult) {
    return existingResult;
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

  const now = nowUnix();

  const maxSafeBalance =
    Number.MAX_SAFE_INTEGER -
    amount;

  try {
    const result =
      await env.DB.batch([
        env.DB
          .prepare(`
            UPDATE users
            SET
              balance = balance + ?,
              updated_at = ?
            WHERE id = ?
              AND balance >= 0
              AND balance <= ?
          `)
          .bind(
            amount,
            now,
            userId,
            maxSafeBalance
          ),

        env.DB
          .prepare(`
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
              AND changes() = 1
          `)
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

    const changed =
      Number(
        updateResult?.meta?.changes || 0
      );

    const inserted =
      Number(
        insertResult?.meta?.changes || 0
      );

    if (
      changed !== 1 ||
      inserted !== 1
    ) {
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

      throw new Error(
        "Saldo tidak dapat diperbarui."
      );
    }

    const transactionId =
      Number(
        insertResult?.meta?.last_row_id || 0
      );

    const transaction =
      await env.DB
        .prepare(`
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
        `)
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
    if (reference) {
      const existing =
        await findTransactionByReference(
          env,
          reference
        );

      if (existing) {
        if (
          !sameTransaction(
            existing,
            {
              userId,
              amount,
              type,
              orderId,
              depositId
            }
          )
        ) {
          throw new Error(
            "Reference transaksi sudah digunakan untuk transaksi lain."
          );
        }

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
  validateUserId(userId);

  amount = validateAmount(
    amount,
    "debit"
  );

  type = validateLedgerType(type);

  reference = validateReference(
    reference
  );

  description = validateOptionalText(
    description,
    "Deskripsi transaksi"
  );

  const existingResult =
    await resolveReference(
      env,
      reference,
      {
        userId,
        amount,
        type,
        orderId,
        depositId: null
      }
    );

  if (existingResult) {
    return existingResult;
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
        env.DB
          .prepare(`
            UPDATE users
            SET
              balance = balance - ?,
              updated_at = ?
            WHERE id = ?
              AND balance >= ?
          `)
          .bind(
            amount,
            now,
            userId,
            amount
          ),

        env.DB
          .prepare(`
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
              AND changes() = 1
          `)
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

    const inserted =
      Number(
        insertResult?.meta?.changes || 0
      );

    if (
      changed !== 1 ||
      inserted !== 1
    ) {
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

    const transactionId =
      Number(
        insertResult?.meta?.last_row_id || 0
      );

    const transaction =
      await env.DB
        .prepare(`
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
        `)
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
    if (reference) {
      const existing =
        await findTransactionByReference(
          env,
          reference
        );

      if (existing) {
        if (
          !sameTransaction(
            existing,
            {
              userId,
              amount,
              type,
              orderId,
              depositId: null
            }
          )
        ) {
          throw new Error(
            "Reference transaksi sudah digunakan untuk transaksi lain."
          );
        }

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
  const value =
    Number(amount);

  if (
    !Number.isSafeInteger(value) ||
    value === 0
  ) {
    throw new Error(
      "Nominal adjustment tidak valid."
    );
  }

  if (value > 0) {
    return creditBalance(
      env,
      {
        userId,
        amount: value,
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
        amount: Math.abs(value),
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
