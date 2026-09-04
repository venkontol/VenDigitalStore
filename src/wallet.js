import {
  json,
  now,
  getUserById,
  getSessionUser,
  getCookie,
  getBearerToken,
  addBalance,
  chargeCustomer,
  refundCustomer,
  getBalance,
  money,
  number
} from "./utils.js";

const SESSION_COOKIE = "vds_session";

function getToken(request) {
  return (
    getCookie(request, SESSION_COOKIE) ||
    getBearerToken(request) ||
    null
  );
}

async function requireUser(request, env) {
  const token = getToken(request);

  if (!token) {
    return null;
  }

  return await getSessionUser(env, token);
}

function success(data = {}, status = 200) {
  return json(
    {
      success: true,
      ...data
    },
    status
  );
}

function error(message, status = 400, extra = {}) {
  return json(
    {
      success: false,
      error: message,
      ...extra
    },
    status
  );
}

function methodNotAllowed() {
  return error(
    "Method tidak diizinkan.",
    405
  );
}

async function readBody(request) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (
      contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return await request.json();
    }

    const form = await request.formData();

    return Object.fromEntries(
      form.entries()
    );
  } catch {
    return {};
  }
}

function publicBalance(user) {
  return {
    balance: Number(user?.balance || 0),
    formatted: money(
      Number(user?.balance || 0)
    )
  };
}

async function handleBalance(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const balance =
    await getBalance(
      env,
      user.id
    );

  return success({
    balance: Number(balance || 0),
    formatted: money(
      Number(balance || 0)
    )
  });
}

async function handleTransactions(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const url = new URL(
    request.url
  );

  let limit = Number(
    url.searchParams.get("limit") || 20
  );

  let offset = Number(
    url.searchParams.get("offset") || 0
  );

  if (
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    limit = 20;
  }

  if (limit > 100) {
    limit = 100;
  }

  if (
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    offset = 0;
  }

  const type =
    url.searchParams.get("type");

  const params = [
    user.id
  ];

  let where = `
    WHERE user_id = ?
  `;

  if (type) {
    where += `
      AND type = ?
    `;

    params.push(type);
  }

  const query = `
    SELECT
      id,
      user_id,
      type,
      amount,
      reference_id,
      description,
      balance_before,
      balance_after,
      created_at
    FROM balance_transactions
    ${where}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(
    limit,
    offset
  );

  const result =
    await env.DB
      .prepare(query)
      .bind(...params)
      .all();

  const rows =
    result?.results || [];

  const transactions =
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(
        row.amount || 0
      ),
      formatted_amount: money(
        Number(row.amount || 0)
      ),
      reference_id:
        row.reference_id || null,
      description:
        row.description || "",
      balance_before:
        Number(
          row.balance_before || 0
        ),
      balance_after:
        Number(
          row.balance_after || 0
        ),
      formatted_balance_before:
        money(
          Number(
            row.balance_before || 0
          )
        ),
      formatted_balance_after:
        money(
          Number(
            row.balance_after || 0
          )
        ),
      created_at:
        row.created_at
    }));

  return success({
    transactions,
    pagination: {
      limit,
      offset,
      count: transactions.length
    }
  });
}

async function handleWalletOverview(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const current =
    await getUserById(
      env,
      user.id
    );

  if (!current) {
    return error(
      "User tidak ditemukan.",
      404
    );
  }

  const balance =
    Number(current.balance || 0);

  const result =
    await env.DB
      .prepare(
        `SELECT
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
         LIMIT 10`
      )
      .bind(current.id)
      .all();

  const transactions =
    (result?.results || [])
      .map((row) => ({
        id: row.id,
        type: row.type,
        amount:
          Number(row.amount || 0),
        formatted_amount:
          money(
            Number(
              row.amount || 0
            )
          ),
        reference_id:
          row.reference_id ||
          null,
        description:
          row.description || "",
        balance_before:
          Number(
            row.balance_before ||
              0
          ),
        balance_after:
          Number(
            row.balance_after ||
              0
          ),
        created_at:
          row.created_at
      }));

  return success({
    balance,
    formatted:
      money(balance),
    transactions
  });
}

async function handleCharge(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const body =
    await readBody(request);

  const amount =
    Number(body.amount);

  const referenceId =
    String(
      body.reference_id ||
      body.referenceId ||
      ""
    ).trim();

  const description =
    String(
      body.description ||
      "Pembayaran pesanan"
    ).trim();

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return error(
      "Nominal saldo tidak valid."
    );
  }

  if (amount > 1000000000) {
    return error(
      "Nominal terlalu besar."
    );
  }

  const result =
    await chargeCustomer(
      env,
      user.id,
      amount,
      referenceId ||
        `CHARGE-${user.id}-${Date.now()}`,
      description
    );

  if (
    !result ||
    result.success === false
  ) {
    return error(
      result?.error ||
        "Saldo tidak mencukupi.",
      400,
      {
        code:
          result?.code ||
          "INSUFFICIENT_BALANCE"
      }
    );
  }

  return success({
    message:
      "Saldo berhasil dipotong.",
    transaction:
      result.transaction || null,
    balance:
      Number(
        result.balance ??
          result.balance_after ??
          0
      ),
    formatted:
      money(
        Number(
          result.balance ??
            result.balance_after ??
            0
        )
      )
  });
}

async function handleRefund(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const body =
    await readBody(request);

  const amount =
    Number(body.amount);

  const referenceId =
    String(
      body.reference_id ||
      body.referenceId ||
      ""
    ).trim();

  const description =
    String(
      body.description ||
      "Refund pesanan"
    ).trim();

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return error(
      "Nominal refund tidak valid."
    );
  }

  if (amount > 1000000000) {
    return error(
      "Nominal refund terlalu besar."
    );
  }

  const result =
    await refundCustomer(
      env,
      user.id,
      amount,
      referenceId ||
        `REFUND-${user.id}-${Date.now()}`,
      description
    );

  if (
    !result ||
    result.success === false
  ) {
    return error(
      result?.error ||
        "Refund gagal.",
      400
    );
  }

  return success({
    message:
      "Saldo berhasil dikembalikan.",
    transaction:
      result.transaction || null,
    balance:
      Number(
        result.balance ??
          result.balance_after ??
          0
      ),
    formatted:
      money(
        Number(
          result.balance ??
            result.balance_after ??
            0
        )
      )
  });
}

async function handleAdminCredit(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const configuredOwner =
    String(
      env.OWNER_USERNAME || ""
    )
      .trim()
      .toLowerCase();

  if (
    !configuredOwner ||
    String(
      user.username || ""
    ).toLowerCase() !==
      configuredOwner
  ) {
    return error(
      "Akses ditolak.",
      403
    );
  }

  const body =
    await readBody(request);

  const targetUserId =
    Number(
      body.user_id ||
      body.userId
    );

  const amount =
    Number(body.amount);

  const referenceId =
    String(
      body.reference_id ||
      body.referenceId ||
      ""
    ).trim();

  const description =
    String(
      body.description ||
      "Penambahan saldo oleh admin"
    ).trim();

  if (
    !Number.isSafeInteger(
      targetUserId
    ) ||
    targetUserId <= 0
  ) {
    return error(
      "User ID tidak valid."
    );
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return error(
      "Nominal tidak valid."
    );
  }

  if (amount > 1000000000) {
    return error(
      "Nominal terlalu besar."
    );
  }

  const target =
    await getUserById(
      env,
      targetUserId
    );

  if (!target) {
    return error(
      "User tujuan tidak ditemukan.",
      404
    );
  }

  const result =
    await addBalance(
      env,
      targetUserId,
      amount,
      referenceId ||
        `ADMIN-${user.id}-${Date.now()}`,
      description
    );

  if (
    !result ||
    result.success === false
  ) {
    return error(
      result?.error ||
        "Gagal menambahkan saldo.",
      500
    );
  }

  return success({
    message:
      "Saldo berhasil ditambahkan.",
    user: {
      id: target.id,
      username:
        target.username
    },
    balance:
      Number(
        result.balance ??
          result.balance_after ??
          0
      ),
    formatted:
      money(
        Number(
          result.balance ??
            result.balance_after ??
            0
        )
      )
  });
}

async function handleBalanceHistory(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user = await requireUser(
    request,
    env
  );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const result =
    await env.DB
      .prepare(
        `SELECT
           type,
           COUNT(*) AS total_transactions,
           COALESCE(
             SUM(
               CASE
                 WHEN amount > 0
                 THEN amount
                 ELSE 0
               END
             ),
             0
           ) AS total_credit,
           COALESCE(
             SUM(
               CASE
                 WHEN amount < 0
                 THEN ABS(amount)
                 ELSE 0
               END
             ),
             0
           ) AS total_debit
         FROM balance_transactions
         WHERE user_id = ?
         GROUP BY type
         ORDER BY type ASC`
      )
      .bind(user.id)
      .all();

  const rows =
    result?.results || [];

  const history =
    rows.map((row) => ({
      type: row.type,
      total_transactions:
        Number(
          row.total_transactions ||
            0
        ),
      total_credit:
        Number(
          row.total_credit || 0
        ),
      total_debit:
        Number(
          row.total_debit || 0
        )
    }));

  return success({
    history
  });
}

async function handleWalletRoutes(
  request,
  env,
  pathname
) {
  switch (pathname) {
    case "/api/wallet":
    case "/api/wallet/overview":
      return await handleWalletOverview(
        request,
        env
      );

    case "/api/wallet/balance":
      return await handleBalance(
        request,
        env
      );

    case "/api/wallet/transactions":
      return await handleTransactions(
        request,
        env
      );

    case "/api/wallet/history":
      return await handleBalanceHistory(
        request,
        env
      );

    case "/api/wallet/charge":
      return await handleCharge(
        request,
        env
      );

    case "/api/wallet/refund":
      return await handleRefund(
        request,
        env
      );

    case "/api/wallet/admin/credit":
      return await handleAdminCredit(
        request,
        env
      );

    default:
      return null;
  }
}

export async function walletHandler(
  request,
  env,
  pathname
) {
  try {
    const response =
      await handleWalletRoutes(
        request,
        env,
        pathname
      );

    if (response) {
      return response;
    }

    return error(
      "Endpoint wallet tidak ditemukan.",
      404
    );
  } catch (err) {
    console.error(
      "WALLET_ERROR",
      err
    );

    return error(
      "Terjadi kesalahan pada sistem wallet.",
      500
    );
  }
}

export default walletHandler;
