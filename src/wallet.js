import {
  errorResponse,
  getCurrentUser,
  nowUnix,
  successResponse
} from "./utils.js";

export async function getBalance(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  const row = await env.DB
    .prepare("SELECT balance FROM users WHERE id = ? LIMIT 1")
    .bind(user.id)
    .first();

  if (!row) {
    return errorResponse("User tidak ditemukan.", 404);
  }

  return successResponse({
    balance: Number(row.balance)
  });
}

export async function getTransactions(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Kamu harus login terlebih dahulu.", 401);
  }

  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get("limit") || 20);
  const limit = Math.min(Math.max(Math.floor(limitValue), 1), 100);

  const rows = await env.DB
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
      ORDER BY created_at DESC, id DESC
      LIMIT ?`
    )
    .bind(user.id, limit)
    .all();

  return successResponse({
    transactions: (rows.results || []).map(row => ({
      id: Number(row.id),
      type: row.type,
      amount: Number(row.amount),
      balance_before: Number(row.balance_before),
      balance_after: Number(row.balance_after),
      reference: row.reference,
      description: row.description,
      created_at: Number(row.created_at)
    }))
  });
}

export async function creditBalance(
  env,
  userId,
  amount,
  reference = null,
  description = null
) {
  const value = Number(amount);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Nominal saldo tidak valid.");
  }

  const now = nowUnix();

  if (reference) {
    const existing = await env.DB
      .prepare(
        `SELECT id, balance_after
         FROM balance_transactions
         WHERE reference = ?
         LIMIT 1`
      )
      .bind(reference)
      .first();

    if (existing) {
      return {
        transactionId: Number(existing.id),
        balance: Number(existing.balance_after),
        duplicate: true
      };
    }
  }

  const user = await env.DB
    .prepare(
      `SELECT id, balance
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first();

  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const before = Number(user.balance);
  const after = before + value;

  const statements = [
    env.DB
      .prepare(
        `UPDATE users
         SET balance = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        after,
        now,
        userId
      ),
    env.DB
      .prepare(
        `INSERT INTO balance_transactions
        (
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
        userId,
        value,
        before,
        after,
        reference,
        description,
        now
      )
  ];

  try {
    const result = await env.DB.batch(statements);

    return {
      transactionId: Number(result[1]?.meta?.last_row_id || 0),
      balance: after,
      duplicate: false
    };
  } catch (error) {
    if (reference) {
      const existing = await env.DB
        .prepare(
          `SELECT id, balance_after
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1`
        )
        .bind(reference)
        .first();

      if (existing) {
        return {
          transactionId: Number(existing.id),
          balance: Number(existing.balance_after),
          duplicate: true
        };
      }
    }

    throw error;
  }
}

export async function debitBalance(
  env,
  userId,
  amount,
  reference = null,
  description = null
) {
  const value = Number(amount);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Nominal saldo tidak valid.");
  }

  const now = nowUnix();

  if (reference) {
    const existing = await env.DB
      .prepare(
        `SELECT id, balance_after
         FROM balance_transactions
         WHERE reference = ?
         LIMIT 1`
      )
      .bind(reference)
      .first();

    if (existing) {
      return {
        transactionId: Number(existing.id),
        balance: Number(existing.balance_after),
        duplicate: true
      };
    }
  }

  const user = await env.DB
    .prepare(
      `SELECT id, balance
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first();

  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const before = Number(user.balance);

  if (before < value) {
    return {
      transactionId: null,
      balance: before,
      duplicate: false,
      insufficient: true
    };
  }

  const after = before - value;

  const statements = [
    env.DB
      .prepare(
        `UPDATE users
         SET balance = ?, updated_at = ?
         WHERE id = ?
           AND balance >= ?`
      )
      .bind(
        after,
        now,
        userId,
        value
      ),
    env.DB
      .prepare(
        `INSERT INTO balance_transactions
        (
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          reference,
          description,
          created_at
        )
        VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        -value,
        before,
        after,
        reference,
        description,
        now
      )
  ];

  try {
    const result = await env.DB.batch(statements);

    if (!result[0]?.meta?.changes) {
      return {
        transactionId: null,
        balance: before,
        duplicate: false,
        insufficient: true
      };
    }

    return {
      transactionId: Number(result[1]?.meta?.last_row_id || 0),
      balance: after,
      duplicate: false,
      insufficient: false
    };
  } catch (error) {
    if (reference) {
      const existing = await env.DB
        .prepare(
          `SELECT id, balance_after
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1`
        )
        .bind(reference)
        .first();

      if (existing) {
        return {
          transactionId: Number(existing.id),
          balance: Number(existing.balance_after),
          duplicate: true
        };
      }
    }

    throw error;
  }
}

export async function refundBalance(
  env,
  userId,
  amount,
  reference = null,
  description = null
) {
  const value = Number(amount);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Nominal refund tidak valid.");
  }

  const now = nowUnix();

  if (reference) {
    const existing = await env.DB
      .prepare(
        `SELECT id, balance_after
         FROM balance_transactions
         WHERE reference = ?
         LIMIT 1`
      )
      .bind(reference)
      .first();

    if (existing) {
      return {
        transactionId: Number(existing.id),
        balance: Number(existing.balance_after),
        duplicate: true
      };
    }
  }

  const user = await env.DB
    .prepare(
      `SELECT id, balance
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first();

  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const before = Number(user.balance);
  const after = before + value;

  const statements = [
    env.DB
      .prepare(
        `UPDATE users
         SET balance = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        after,
        now,
        userId
      ),
    env.DB
      .prepare(
        `INSERT INTO balance_transactions
        (
          user_id,
          type,
          amount,
          balance_before,
          balance_after,
          reference,
          description,
          created_at
        )
        VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        value,
        before,
        after,
        reference,
        description,
        now
      )
  ];

  try {
    const result = await env.DB.batch(statements);

    return {
      transactionId: Number(result[1]?.meta?.last_row_id || 0),
      balance: after,
      duplicate: false
    };
  } catch (error) {
    if (reference) {
      const existing = await env.DB
        .prepare(
          `SELECT id, balance_after
           FROM balance_transactions
           WHERE reference = ?
           LIMIT 1`
        )
        .bind(reference)
        .first();

      if (existing) {
        return {
          transactionId: Number(existing.id),
          balance: Number(existing.balance_after),
          duplicate: true
        };
      }
    }

    throw error;
  }
}
