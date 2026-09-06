import {
  errorResponse,
  jsonResponse,
  nowUnix,
  requireAuth,
  formatRupiah
} from "./utils.js";

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
    await env.DB
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
      .bind(auth.user.id)
      .first();

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
    balance: Number(user.balance || 0),
    balance_formatted:
      formatRupiah(user.balance),
    transactions:
      transactions.results || []
  });
}

export async function getBalance(
  env,
  userId
) {
  const user =
    await env.DB
      .prepare(
        `
        SELECT balance
        FROM users
        WHERE id = ?
        LIMIT 1
        `
      )
      .bind(userId)
      .first();

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
    Number(amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Nominal credit tidak valid."
    );
  }

  const now =
    nowUnix();

  if (reference) {
    const existing =
      await env.DB
        .prepare(
          `
          SELECT
            id,
            amount,
            balance_after
          FROM balance_transactions
          WHERE reference = ?
          LIMIT 1
          `
        )
        .bind(reference)
        .first();

    if (existing) {
      return {
        id: existing.id,
        amount: Number(
          existing.amount
        ),
        balance:
          Number(
            existing.balance_after
          ),
        idempotent: true
      };
    }
  }

  const statements = [
    env.DB
      .prepare(
        `
        UPDATE users
        SET
          balance = balance + ?,
          updated_at = ?
        WHERE id = ?
        `
      )
      .bind(
        amount,
        now,
        userId
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
          AND balance >= ?
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
        userId,
        amount
      )
  ];

  await env.DB.batch(
    statements
  );

  const transaction =
    reference
      ? await env.DB
          .prepare(
            `
            SELECT
              id,
              amount,
              balance_after
            FROM balance_transactions
            WHERE reference = ?
            LIMIT 1
            `
          )
          .bind(reference)
          .first()
      : await env.DB
          .prepare(
            `
            SELECT
              id,
              amount,
              balance_after
            FROM balance_transactions
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 1
            `
          )
          .bind(userId)
          .first();

  if (!transaction) {
    throw new Error(
      "Gagal mencatat transaksi credit."
    );
  }

  return {
    id: transaction.id,
    amount: Number(
      transaction.amount
    ),
    balance: Number(
      transaction.balance_after
    ),
    idempotent: false
  };
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
    Number(amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Nominal debit tidak valid."
    );
  }

  const now =
    nowUnix();

  if (reference) {
    const existing =
      await env.DB
        .prepare(
          `
          SELECT
            id,
            amount,
            balance_after
          FROM balance_transactions
          WHERE reference = ?
          LIMIT 1
          `
        )
        .bind(reference)
        .first();

    if (existing) {
      return {
        id: existing.id,
        amount: Number(
          existing.amount
        ),
        balance:
          Number(
            existing.balance_after
          ),
        idempotent: true
      };
    }
  }

  const user =
    await env.DB
      .prepare(
        `
        SELECT balance
        FROM users
        WHERE id = ?
        LIMIT 1
        `
      )
      .bind(userId)
      .first();

  if (!user) {
    throw new Error(
      "User tidak ditemukan."
    );
  }

  if (
    Number(user.balance || 0) <
    amount
  ) {
    return {
      success: false,
      insufficient: true,
      balance: Number(
        user.balance || 0
      )
    };
  }

  const result =
    await env.DB.batch([
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
            AND balance = balance
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

  const transaction =
    reference
      ? await env.DB
          .prepare(
            `
            SELECT
              id,
              amount,
              balance_after
            FROM balance_transactions
            WHERE reference = ?
            LIMIT 1
            `
          )
          .bind(reference)
          .first()
      : null;

  if (!transaction) {
    const current =
      await getBalance(
        env,
        userId
      );

    return {
      success: false,
      insufficient:
        Number(current || 0) <
        amount,
      balance:
        Number(current || 0)
    };
  }

  return {
    success: true,
    id: transaction.id,
    amount: Number(
      transaction.amount
    ),
    balance: Number(
      transaction.balance_after
    ),
    idempotent: false,
    batch: result
  };
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

  if (
    result.insufficient
  ) {
    throw new Error(
      "Saldo tidak mencukupi."
    );
  }

  return result;
}
