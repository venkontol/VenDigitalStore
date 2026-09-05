import {
  cleanString,
  cleanUsername,
  cleanFirstName,
  isValidUsername,
  parsePositiveInteger,
  parseNonNegativeInteger,
  nowUnix,
  randomId,
  readJson,
  successResponse,
  errorResponse
} from "./utils.js";

import {
  requireAdmin
} from "./auth.js";

import {
  getVisitorOverview
} from "./visitor.js";

async function adminUser(request, env) {
  const user = await requireAdmin(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  return user;
}

async function getAdminOverview(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const [
    users,
    activeUsers,
    products,
    orders,
    pendingOrders,
    deposits,
    pendingDeposits,
    transactions,
    visitors
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users WHERE is_active = 1"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM products WHERE is_active = 1"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM orders"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM orders WHERE status IN ('PENDING','PROCESSING')"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM deposits"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM deposits WHERE status = 'PENDING'"
    ).first(),

    env.DB.prepare(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN type = 'deposit' THEN amount
             ELSE 0
           END
         ),0) AS deposits,
         COALESCE(SUM(
           CASE
             WHEN type = 'purchase' THEN ABS(amount)
             ELSE 0
           END
         ),0) AS purchases
       FROM balance_transactions`
    ).first(),

    getVisitorOverview(
      request,
      env
    )
  ]);

  return successResponse({
    users: {
      total: Number(users?.total || 0),
      active: Number(activeUsers?.total || 0)
    },
    products: {
      active: Number(products?.total || 0)
    },
    orders: {
      total: Number(orders?.total || 0),
      pending: Number(pendingOrders?.total || 0)
    },
    deposits: {
      total: Number(deposits?.total || 0),
      pending: Number(pendingDeposits?.total || 0),
      amount: Number(
        transactions?.deposits || 0
      )
    },
    purchases: Number(
      transactions?.purchases || 0
    ),
    visitors:
      visitors?.data ??
      visitors ??
      {}
  });
}

async function adminGetUsers(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url =
    new URL(request.url);

  const search =
    cleanString(
      url.searchParams.get("search"),
      100
    );

  const limit =
    Math.min(
      parsePositiveInteger(
        url.searchParams.get("limit"),
        50
      ),
      100
    );

  const offset =
    Math.max(
      parseNonNegativeInteger(
        url.searchParams.get("offset"),
        0
      ),
      0
    );

  let query = `
    SELECT
      id,
      first_name,
      username,
      balance,
      is_active,
      is_admin,
      created_at,
      updated_at,
      last_login_at
    FROM users
  `;

  const bindings = [];

  if (search) {
    query += `
      WHERE
        username LIKE ?
        OR first_name LIKE ?
    `;

    bindings.push(
      `%${search}%`,
      `%${search}%`
    );
  }

  query += `
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  bindings.push(
    limit,
    offset
  );

  const result =
    await env.DB
      .prepare(query)
      .bind(...bindings)
      .all();

  return successResponse({
    users:
      result.results || [],
    limit,
    offset
  });
}

async function adminGetUser(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const path =
    new URL(request.url).pathname;

  const match =
    path.match(/\/users\/(\d+)$/);

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  const target =
    await env.DB
      .prepare(
        `SELECT
           id,
           first_name,
           username,
           balance,
           is_active,
           is_admin,
           created_at,
           updated_at,
           last_login_at
         FROM users
         WHERE id = ?`
      )
      .bind(id)
      .first();

  if (!target) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const transactions =
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
         LIMIT 50`
      )
      .bind(id)
      .all();

  const orders =
    await env.DB
      .prepare(
        `SELECT
           id,
           order_number,
           status,
           subtotal,
           discount,
           total,
           created_at,
           updated_at,
           completed_at,
           cancelled_at
         FROM orders
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT 50`
      )
      .bind(id)
      .all();

  return successResponse({
    user: target,
    transactions:
      transactions.results || [],
    orders:
      orders.results || []
  });
}

async function adminUpdateUser(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const path =
    new URL(request.url).pathname;

  const match =
    path.match(/\/users\/(\d+)$/);

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  if (
    !body ||
    typeof body !== "object"
  ) {
    return errorResponse(
      "Data tidak valid.",
      400
    );
  }

  const fields = [];
  const values = [];

  if (body.first_name !== undefined) {
    const firstName =
      cleanFirstName(
        body.first_name
      );

    if (!firstName) {
      return errorResponse(
        "Nama depan tidak valid.",
        400
      );
    }

    fields.push(
      "first_name = ?"
    );

    values.push(firstName);
  }

  if (body.username !== undefined) {
    const username =
      cleanUsername(
        body.username
      );

    if (!isValidUsername(username)) {
      return errorResponse(
        "Username tidak valid.",
        400
      );
    }

    fields.push(
      "username = ?"
    );

    values.push(username);
  }

  if (body.is_active !== undefined) {
    fields.push(
      "is_active = ?"
    );

    values.push(
      Number(body.is_active) === 1
        ? 1
        : 0
    );
  }

  if (body.is_admin !== undefined) {
    if (id === user.id) {
      return errorResponse(
        "Status admin akun sendiri tidak dapat diubah.",
        400
      );
    }

    fields.push(
      "is_admin = ?"
    );

    values.push(
      Number(body.is_admin) === 1
        ? 1
        : 0
    );
  }

  if (!fields.length) {
    return errorResponse(
      "Tidak ada perubahan.",
      400
    );
  }

  fields.push(
    "updated_at = ?"
  );

  values.push(
    nowUnix(),
    id
  );

  try {
    await env.DB
      .prepare(
        `UPDATE users
         SET ${fields.join(", ")}
         WHERE id = ?`
      )
      .bind(...values)
      .run();
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Username sudah digunakan.",
        409
      );
    }

    throw error;
  }

  return successResponse({
    message:
      "User berhasil diperbarui."
  });
}

async function adminAdjustBalance(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const path =
    new URL(request.url).pathname;

  const match =
    path.match(/\/users\/(\d+)\/balance$/);

  const userId =
    Number(match?.[1] || 0);

  if (!userId) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  const amount =
    Number(body?.amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount === 0
  ) {
    return errorResponse(
      "Nominal saldo tidak valid.",
      400
    );
  }

  const description =
    cleanString(
      body?.description ||
      "Penyesuaian saldo oleh admin",
      500
    );

  const reference =
    cleanString(
      body?.reference ||
      `ADMIN:${user.id}:${randomId(10)}`,
      200
    );

  const target =
    await env.DB
      .prepare(
        `SELECT
           id,
           balance
         FROM users
         WHERE id = ?`
      )
      .bind(userId)
      .first();

  if (!target) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const before =
    Number(target.balance || 0);

  const after =
    before + amount;

  if (after < 0) {
    return errorResponse(
      "Saldo tidak boleh menjadi negatif.",
      400
    );
  }

  const timestamp =
    nowUnix();

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
        userId,
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
         VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        amount,
        before,
        after,
        reference,
        description,
        timestamp
      );

  const result =
    await env.DB.batch([
      update,
      transaction
    ]);

  if (
    !result?.[0]?.meta?.changes
  ) {
    return errorResponse(
      "Saldo berubah bersamaan. Silakan coba lagi.",
      409
    );
  }

  return successResponse({
    message:
      "Saldo berhasil disesuaikan.",
    balance_before: before,
    balance_after: after,
    amount
  });
}

export {
  adminUser,
  getAdminOverview,
  adminGetUsers,
  adminGetUser,
  adminUpdateUser,
  adminAdjustBalance
};
