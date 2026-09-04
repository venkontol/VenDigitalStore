import {
  json,
  getSessionFromRequest,
  getBalance,
  dbAll
} from "./utils.js";

async function authenticatedSession(request, env) {
  return await getSessionFromRequest(env, request);
}

function unauthorized() {
  return json(
    {
      success: false,
      error: "Unauthorized."
    },
    401
  );
}

function notFound() {
  return json(
    {
      success: false,
      error: "Wallet endpoint tidak ditemukan."
    },
    404
  );
}

export async function balance(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return unauthorized();
  }

  try {
    const currentBalance = await getBalance(
      env,
      session.user_id
    );

    return json({
      success: true,
      balance: Number(currentBalance || 0)
    });
  } catch (error) {
    console.error("WALLET_BALANCE_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal mengambil saldo."
      },
      500
    );
  }
}

export async function transactions(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);

  let limit = Number(url.searchParams.get("limit") || 50);

  if (!Number.isSafeInteger(limit)) {
    limit = 50;
  }

  limit = Math.max(1, Math.min(limit, 100));

  try {
    const rows = await dbAll(
      env,
      `
        SELECT
          id,
          type,
          amount,
          reference_id,
          description,
          balance_before,
          balance_after,
          created_at
        FROM balance_transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      [session.user_id, limit]
    );

    return json({
      success: true,
      transactions: rows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        amount: Number(row.amount || 0),
        reference_id: row.reference_id || null,
        description: row.description || "",
        balance_before: Number(row.balance_before || 0),
        balance_after: Number(row.balance_after || 0),
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error("WALLET_TRANSACTIONS_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal mengambil riwayat transaksi."
      },
      500
    );
  }
}

export async function overview(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return unauthorized();
  }

  try {
    const currentBalance = await getBalance(
      env,
      session.user_id
    );

    const rows = await dbAll(
      env,
      `
        SELECT
          id,
          type,
          amount,
          reference_id,
          description,
          balance_before,
          balance_after,
          created_at
        FROM balance_transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 10
      `,
      [session.user_id]
    );

    return json({
      success: true,
      balance: Number(currentBalance || 0),
      transactions: rows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        amount: Number(row.amount || 0),
        reference_id: row.reference_id || null,
        description: row.description || "",
        balance_before: Number(row.balance_before || 0),
        balance_after: Number(row.balance_after || 0),
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error("WALLET_OVERVIEW_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal mengambil informasi wallet."
      },
      500
    );
  }
}

export async function walletHandler(request, env) {
  const url = new URL(request.url);
  const pathname =
    url.pathname.replace(/\/+$/, "") || "/";

  if (
    request.method === "GET" &&
    pathname === "/api/wallet/balance"
  ) {
    return await balance(request, env);
  }

  if (
    request.method === "GET" &&
    pathname === "/api/wallet/transactions"
  ) {
    return await transactions(request, env);
  }

  if (
    request.method === "GET" &&
    pathname === "/api/wallet/overview"
  ) {
    return await overview(request, env);
  }

  return notFound();
}

export default walletHandler;
