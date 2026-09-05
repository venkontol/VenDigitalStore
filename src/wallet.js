import {
  cleanString,
  nowUnix,
  successResponse,
  errorResponse
} from "./utils.js";

import {
  requireAuth
} from "./auth.js";

async function getBalance(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const row =
    await env.DB
      .prepare(
        `SELECT balance
         FROM users
         WHERE id = ?`
      )
      .bind(user.id)
      .first();

  if (!row) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  return successResponse({
    balance:
      Number(row.balance || 0)
  });
}

async function getTransactions(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url =
    new URL(request.url);

  const limit =
    Math.min(
      Math.max(
        Number(
          url.searchParams.get("limit") || 20
        ),
        1
      ),
      100
    );

  const offset =
    Math.max(
      Number(
        url.searchParams.get("offset") || 0
      ),
      0
    );

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
    Number(userId);

  const numericAmount =
    Number(amount);

  if (
    !Number.isSafeInteger(numericUserId) ||
    numericUserId <= 0
  ) {
    return {
      success: false,
      error: "User tidak valid."
    };
  }

  if (
    !Number.isSafeInteger(numericAmount) ||
    numericAmount <= 0
  ) {
    return {
      success: false,
      error: "Nominal kredit tidak valid."
    };
  }

  const allowedTypes = [
    "deposit",
    "refund",
    "bonus",
    "adjustment"
  ];

  if (!allowedTypes.includes(type)) {
    return {
      success: false,
      error: "Tipe transaksi tidak valid."
    };
  }

  const timestamp =
    nowUnix();

  const existing =
    reference
      ? await env.DB
          .prepare(
            `SELECT
               id,
               amount,
               balance_after
             FROM balance_transactions
             WHERE reference = ?`
          )
          .bind(reference)
          .first()
      : null;

  if (existing) {
    return {
      success: true,
      duplicate: true,
      transaction_id:
        Number(existing.id),
      balance:
        Number(existing.balance_after || 0)
    };
  }

  const user =
    await env.DB
      .prepare(
        `SELECT
           id,
           balance
         FROM users
         WHERE id = ?`
      )
      .bind(numericUserId)
      .first();

  if (!user) {
    return {
      success: false,
      error: "User tidak ditemukan."
    };
  }

  const before =
    Number(user.balance || 0);

  const after =
    before + numericAmount;

  if (
    !Number.isSafeInteger(after)
  ) {
    return {
      success: false,
      error: "Saldo melebihi batas."
    };
  }

  const update =
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
        numericUserId,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        numericUserId,
        type,
        numericAmount,
        before,
        after,
        reference,
        cleanString(
          description || "",
          500
        ) || null,
        timestamp
      );

  try {
    const result =
      await env.DB.batch([
        update,
        transaction
      ]);

    if (
      !result?.[0]?.meta?.changes
    ) {
      return {
        success: false,
        conflict: true,
        error:
          "Saldo berubah bersamaan. Silakan ulangi."
      };
    }

    return {
      success: true,
      duplicate: false,
      transaction_id:
        Number(
          result?.[1]?.meta?.last_row_id || 0
        ),
      balance: after,
      balance_before: before,
      balance_after: after
    };
  } catch (error) {
    if (reference) {
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
        return {
          success: true,
          duplicate: true,
          transaction_id:
            Number(duplicate.id),
          balance:
            Number(
              duplicate.balance_after || 0
            )
        };
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
    Number(userId);

  const numericAmount =
    Number(amount);

  if (
    !Number.isSafeInteger(numericUserId) ||
    numericUserId <= 0
  ) {
    return {
      success: false,
      error: "User tidak valid."
    };
  }

  if (
    !Number.isSafeInteger(numericAmount) ||
    numericAmount <= 0
  ) {
    return {
      success: false,
      error: "Nominal debit tidak valid."
    };
  }

  const allowedTypes = [
    "purchase",
    "adjustment"
  ];

  if (!allowedTypes.includes(type)) {
    return {
      success: false,
      error: "Tipe transaksi tidak valid."
    };
  }

  const timestamp =
    nowUnix();

  if (reference) {
    const existing =
      await env.DB
        .prepare(
          `SELECT
             id,
             amount,
             balance_after
           FROM balance_transactions
           WHERE reference = ?`
        )
        .bind(reference)
        .first();

    if (existing) {
      return {
        success: true,
        duplicate: true,
        transaction_id:
          Number(existing.id),
        balance:
          Number(existing.balance_after || 0)
      };
    }
  }

  const user =
    await env.DB
      .prepare(
        `SELECT
           id,
           balance
         FROM users
         WHERE id = ?`
      )
      .bind(numericUserId)
      .first();

  if (!user) {
    return {
      success: false,
      error: "User tidak ditemukan."
    };
  }

  const before =
    Number(user.balance || 0);

  if (
    before < numericAmount
  ) {
    return {
      success: false,
      insufficient: true,
      error: "Saldo tidak mencukupi."
    };
  }

  const after =
    before - numericAmount;

  const update =
    env.DB
      .prepare(
        `UPDATE users
         SET
           balance = ?,
           updated_at = ?
         WHERE id = ?
           AND balance = ?
           AND balance >= ?`
      )
      .bind(
        after,
        timestamp,
        numericUserId,
        before,
        numericAmount
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        numericUserId,
        type,
        -numericAmount,
        before,
        after,
        reference,
        cleanString(
          description || "",
          500
        ) || null,
        timestamp
      );

  try {
    const result =
      await env.DB.batch([
        update,
        transaction
      ]);

    if (
      !result?.[0]?.meta?.changes
    ) {
      return {
        success: false,
        conflict: true,
        error:
          "Saldo berubah bersamaan. Silakan ulangi."
      };
    }

    return {
      success: true,
      duplicate: false,
      transaction_id:
        Number(
          result?.[1]?.meta?.last_row_id || 0
        ),
      balance: after,
      balance_before: before,
      balance_after: after
    };
  } catch (error) {
    if (reference) {
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
        return {
          success: true,
          duplicate: true,
          transaction_id:
            Number(duplicate.id),
          balance:
            Number(
              duplicate.balance_after || 0
            )
        };
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
