import {
  requireAdmin
} from "./auth.js";

import {
  getOrderStats
} from "./orders.js";

import {
  adjustBalance
} from "./wallet.js";

import {
  cleanFirstName,
  cleanString,
  cleanUsername,
  errorResponse,
  jsonResponse,
  nowUnix,
  parseInteger,
  readJson,
  successResponse
} from "./utils.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeBoolean(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  ) {
    return 1;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "false"
  ) {
    return 0;
  }

  return null;
}

function getPagination(url) {
  const rawPage =
    parseInteger(
      url.searchParams.get("page"),
      {
        min: 1,
        max: 1000000
      }
    ) || 1;

  const rawLimit =
    parseInteger(
      url.searchParams.get("limit"),
      {
        min: 1,
        max: MAX_LIMIT
      }
    ) || DEFAULT_LIMIT;

  const limit =
    Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        rawLimit
      )
    );

  const offset =
    (rawPage - 1) *
    limit;

  return {
    page:
      rawPage,
    limit,
    offset
  };
}

async function getAdminUser(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return {
      response: admin
    };
  }

  return {
    admin
  };
}

export async function adminDashboard(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const [
    usersResult,
    activeUsersResult,
    balanceResult,
    ordersResult,
    depositsResult,
    pendingDepositsResult,
    visitorsResult
  ] =
    await Promise.all([
      env.DB
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM users
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM users
            WHERE is_active = 1
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COALESCE(
                SUM(balance),
                0
              ) AS balance
            FROM users
            WHERE is_active = 1
          `
        )
        .first(),

      getOrderStats(
        env.DB
      ),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS count,
              COALESCE(
                SUM(amount),
                0
              ) AS amount
            FROM deposits
            WHERE status = 'PAID'
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM deposits
            WHERE status = 'PENDING'
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COALESCE(
                SUM(visitors),
                0
              ) AS visitors,
              COALESCE(
                SUM(page_views),
                0
              ) AS page_views
            FROM visitor_stats
          `
        )
        .first()
    ]);

  return successResponse({
    admin: {
      id:
        access.admin.id,
      username:
        access.admin.username,
      first_name:
        access.admin.first_name
    },
    users: {
      total:
        Number(
          usersResult?.count || 0
        ),
      active:
        Number(
          activeUsersResult?.count || 0
        )
    },
    wallet: {
      total_balance:
        Number(
          balanceResult?.balance || 0
        )
    },
    orders:
      ordersResult || {},
    deposits: {
      paid:
        Number(
          depositsResult?.count || 0
        ),
      paid_amount:
        Number(
          depositsResult?.amount || 0
        ),
      pending:
        Number(
          pendingDepositsResult?.count || 0
        )
    },
    visitors: {
      visitors:
        Number(
          visitorsResult?.visitors || 0
        ),
      page_views:
        Number(
          visitorsResult?.page_views || 0
        )
    }
  });
}

export async function adminListUsers(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const url =
    new URL(
      request.url
    );

  const {
    page,
    limit,
    offset
  } =
    getPagination(
      url
    );

  const search =
    cleanString(
      url.searchParams.get(
        "search"
      ),
      80
    );

  const active =
    normalizeBoolean(
      url.searchParams.get(
        "active"
      )
    );

  const admin =
    normalizeBoolean(
      url.searchParams.get(
        "admin"
      )
    );

  const conditions = [];
  const bindings = [];

  if (search) {
    conditions.push(
      `
        (
          username LIKE ?
          OR first_name LIKE ?
        )
      `
    );

    const pattern =
      `%${search}%`;

    bindings.push(
      pattern,
      pattern
    );
  }

  if (
    active !== null
  ) {
    conditions.push(
      "is_active = ?"
    );

    bindings.push(
      active
    );
  }

  if (
    admin !== null
  ) {
    conditions.push(
      "is_admin = ?"
    );

    bindings.push(
      admin
    );
  }

  const where =
    conditions.length
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const count =
    await env.DB
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM users
          ${where}
        `
      )
      .bind(
        ...bindings
      )
      .first();

  const rows =
    await env.DB
      .prepare(
        `
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
          ${where}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .bind(
        ...bindings,
        limit,
        offset
      )
      .all();

  const total =
    Number(
      count?.count || 0
    );

  return successResponse({
    users:
      Array.isArray(
        rows?.results
      )
        ? rows.results
        : [],
    pagination: {
      page,
      limit,
      total,
      pages:
        Math.ceil(
          total / limit
        )
    }
  });
}

export async function adminGetUser(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const url =
    new URL(
      request.url
    );

  const userId =
    parseInteger(
      url.searchParams.get(
        "id"
      ),
      {
        min: 1
      }
    );

  if (!userId) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  const user =
    await env.DB
      .prepare(
        `
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
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(
        userId
      )
      .first();

  if (!user) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const [
    orders,
    transactions,
    deposits
  ] =
    await Promise.all([
      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS count
            FROM orders
            WHERE user_id = ?
          `
        )
        .bind(
          userId
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS count,
              COALESCE(
                SUM(
                  CASE
                    WHEN amount > 0
                    THEN amount
                    ELSE 0
                  END
                ),
                0
              ) AS credit,
              COALESCE(
                SUM(
                  CASE
                    WHEN amount < 0
                    THEN ABS(amount)
                    ELSE 0
                  END
                ),
                0
              ) AS debit
            FROM balance_transactions
            WHERE user_id = ?
          `
        )
        .bind(
          userId
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS count,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'PAID'
                    THEN amount
                    ELSE 0
                  END
                ),
                0
              ) AS paid_amount
            FROM deposits
            WHERE user_id = ?
          `
        )
        .bind(
          userId
        )
        .first()
    ]);

  return successResponse({
    user,
    statistics: {
      orders:
        Number(
          orders?.count || 0
        ),
      transactions:
        Number(
          transactions?.count || 0
        ),
      credit:
        Number(
          transactions?.credit || 0
        ),
      debit:
        Number(
          transactions?.debit || 0
        ),
      deposits:
        Number(
          deposits?.count || 0
        ),
      paid_deposits:
        Number(
          deposits?.paid_amount || 0
        )
    }
  });
}

export async function adminUpdateUser(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const data =
    await readJson(
      request
    );

  if (!data) {
    return errorResponse(
      "Data user tidak valid.",
      400
    );
  }

  const userId =
    parseInteger(
      data.id ??
        data.user_id,
      {
        min: 1
      }
    );

  if (!userId) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  const existing =
    await env.DB
      .prepare(
        `
          SELECT
            id,
            first_name,
            username,
            is_active,
            is_admin
          FROM users
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(
        userId
      )
      .first();

  if (!existing) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  if (
    Number(
      existing.id
    ) ===
    Number(
      access.admin.id
    ) &&
    data.is_active !==
      undefined
  ) {
    const requestedActive =
      normalizeBoolean(
        data.is_active
      );

    if (
      requestedActive === 0
    ) {
      return errorResponse(
        "Admin aktif tidak dapat menonaktifkan akunnya sendiri.",
        400
      );
    }
  }

  const updates = [];
  const bindings = [];

  if (
    data.first_name !==
    undefined
  ) {
    const firstName =
      cleanFirstName(
        data.first_name
      );

    if (!firstName) {
      return errorResponse(
        "Nama depan tidak valid.",
        400
      );
    }

    updates.push(
      "first_name = ?"
    );

    bindings.push(
      firstName
    );
  }

  if (
    data.username !==
    undefined
  ) {
    const username =
      cleanUsername(
        data.username
      );

    if (!username) {
      return errorResponse(
        "Username tidak valid.",
        400
      );
    }

    const duplicate =
      await env.DB
        .prepare(
          `
            SELECT id
            FROM users
            WHERE username = ?
              AND id != ?
            LIMIT 1
          `
        )
        .bind(
          username,
          userId
        )
        .first();

    if (duplicate) {
      return errorResponse(
        "Username sudah digunakan.",
        409
      );
    }

    updates.push(
      "username = ?"
    );

    bindings.push(
      username
    );
  }

  if (
    data.is_active !==
    undefined
  ) {
    const active =
      normalizeBoolean(
        data.is_active
      );

    if (
      active === null
    ) {
      return errorResponse(
        "Status aktif tidak valid.",
        400
      );
    }

    updates.push(
      "is_active = ?"
    );

    bindings.push(
      active
    );
  }

  if (
    data.is_admin !==
    undefined
  ) {
    const admin =
      normalizeBoolean(
        data.is_admin
      );

    if (
      admin === null
    ) {
      return errorResponse(
        "Status admin tidak valid.",
        400
      );
    }

    if (
      Number(
        existing.id
      ) ===
      Number(
        access.admin.id
      ) &&
      admin === 0
    ) {
      return errorResponse(
        "Admin aktif tidak dapat menghapus hak admin dirinya sendiri.",
        400
      );
    }

    updates.push(
      "is_admin = ?"
    );

    bindings.push(
      admin
    );
  }

  if (!updates.length) {
    return errorResponse(
      "Tidak ada perubahan.",
      400
    );
  }

  updates.push(
    "updated_at = ?"
  );

  bindings.push(
    nowUnix(),
    userId
  );

  try {
    await env.DB
      .prepare(
        `
          UPDATE users
          SET
            ${updates.join(
              ", "
            )}
          WHERE id = ?
        `
      )
      .bind(
        ...bindings
      )
      .run();
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memperbarui user.",
      500
    );
  }

  const updated =
    await env.DB
      .prepare(
        `
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
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(
        userId
      )
      .first();

  return successResponse({
    user:
      updated
  });
}

export async function adminAdjustUserBalance(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const data =
    await readJson(
      request
    );

  if (!data) {
    return errorResponse(
      "Data saldo tidak valid.",
      400
    );
  }

  const userId =
    parseInteger(
      data.userId ??
        data.user_id,
      {
        min: 1
      }
    );

  const amount =
    parseInteger(
      data.amount,
      {
        min: -1000000000,
        max: 1000000000
      }
    );

  const reason =
    cleanString(
      data.reason ??
        data.description,
      255
    );

  if (!userId) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  if (
    amount === null ||
    amount === 0
  ) {
    return errorResponse(
      "Jumlah saldo tidak valid.",
      400
    );
  }

  if (!reason) {
    return errorResponse(
      "Alasan adjustment wajib diisi.",
      400
    );
  }

  const user =
    await env.DB
      .prepare(
        `
          SELECT
            id,
            username,
            balance,
            is_active
          FROM users
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(
        userId
      )
      .first();

  if (!user) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  if (
    Number(
      user.is_active
    ) !== 1
  ) {
    return errorResponse(
      "User sedang tidak aktif.",
      400
    );
  }

  const reference =
    `ADMIN-ADJUST:${access.admin.id}:${randomReference()}`;

  const result =
    await adjustBalance(
      env.DB,
      userId,
      amount,
      reference,
      reason
    );

  if (
    result?.success !== true
  ) {
    return errorResponse(
      result?.error ||
        "Gagal mengubah saldo.",
      400
    );
  }

  return successResponse({
    user_id:
      userId,
    username:
      user.username,
    amount,
    balance_before:
      result.balance_before,
    balance_after:
      result.balance_after,
    reference
  });
}

function randomReference() {
  const bytes =
    new Uint8Array(
      12
    );

  crypto.getRandomValues(
    bytes
  );

  return Array.from(
    bytes,
    byte =>
      byte
        .toString(16)
        .padStart(
          2,
          "0"
        )
  ).join("");
}

export async function adminListRecentActivity(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const url =
    new URL(
      request.url
    );

  const limit =
    parseInteger(
      url.searchParams.get(
        "limit"
      ),
      {
        min: 1,
        max: 100
      }
    ) || 20;

  const [
    transactions,
    deposits,
    orders,
    users
  ] =
    await Promise.all([
      env.DB
        .prepare(
          `
            SELECT
              bt.id,
              bt.user_id,
              u.username,
              bt.type,
              bt.amount,
              bt.balance_before,
              bt.balance_after,
              bt.reference,
              bt.description,
              bt.created_at
            FROM balance_transactions bt
            INNER JOIN users u
              ON u.id = bt.user_id
            ORDER BY bt.created_at DESC
            LIMIT ?
          `
        )
        .bind(
          limit
        )
        .all(),

      env.DB
        .prepare(
          `
            SELECT
              d.id,
              d.user_id,
              u.username,
              d.code,
              d.amount,
              d.status,
              d.payment_method,
              d.created_at,
              d.paid_at
            FROM deposits d
            INNER JOIN users u
              ON u.id = d.user_id
            ORDER BY d.created_at DESC
            LIMIT ?
          `
        )
        .bind(
          limit
        )
        .all(),

      env.DB
        .prepare(
          `
            SELECT
              o.id,
              o.user_id,
              u.username,
              o.order_number,
              o.type,
              o.provider,
              o.service_name,
              o.customer_amount,
              o.status,
              o.created_at,
              o.updated_at
            FROM orders o
            INNER JOIN users u
              ON u.id = o.user_id
            ORDER BY o.created_at DESC
            LIMIT ?
          `
        )
        .bind(
          limit
        )
        .all(),

      env.DB
        .prepare(
          `
            SELECT
              id,
              first_name,
              username,
              is_active,
              is_admin,
              created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .bind(
          limit
        )
        .all()
    ]);

  return successResponse({
    transactions:
      transactions?.results ||
      [],
    deposits:
      deposits?.results ||
      [],
    orders:
      orders?.results ||
      [],
    users:
      users?.results ||
      []
  });
}

export async function adminDeleteUser(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const data =
    await readJson(
      request
    );

  if (!data) {
    return errorResponse(
      "Data tidak valid.",
      400
    );
  }

  const userId =
    parseInteger(
      data.id ??
        data.user_id,
      {
        min: 1
      }
    );

  if (!userId) {
    return errorResponse(
      "ID user tidak valid.",
      400
    );
  }

  if (
    Number(
      userId
    ) ===
    Number(
      access.admin.id
    )
  ) {
    return errorResponse(
      "Admin tidak dapat menghapus akunnya sendiri.",
      400
    );
  }

  const user =
    await env.DB
      .prepare(
        `
          SELECT
            id,
            username,
            is_admin
          FROM users
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(
        userId
      )
      .first();

  if (!user) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  if (
    Number(
      user.is_admin
    ) === 1
  ) {
    return errorResponse(
      "Akun admin tidak dapat dihapus melalui endpoint ini.",
      403
    );
  }

  const orderCount =
    await env.DB
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM orders
          WHERE user_id = ?
        `
      )
      .bind(
        userId
      )
      .first();

  if (
    Number(
      orderCount?.count || 0
    ) > 0
  ) {
    return errorResponse(
      "User memiliki riwayat order dan tidak dapat dihapus. Nonaktifkan akun sebagai gantinya.",
      409
    );
  }

  try {
    const result =
      await env.DB
        .prepare(
          `
            DELETE FROM users
            WHERE id = ?
              AND is_admin = 0
          `
        )
        .bind(
          userId
        )
        .run();

    if (
      result?.meta?.changes !== 1
    ) {
      return errorResponse(
        "User gagal dihapus.",
        500
      );
    }
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menghapus user.",
      500
    );
  }

  return successResponse({
    deleted: true,
    user_id:
      userId,
    username:
      user.username
  });
}

export async function adminGetSystemCounts(
  request,
  env
) {
  const access =
    await getAdminUser(
      request,
      env
    );

  if (access.response) {
    return access.response;
  }

  const [
    users,
    orders,
    deposits,
    socialServices,
    nokosServices,
    announcements
  ] =
    await Promise.all([
      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN is_active = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS active,
              COALESCE(
                SUM(
                  CASE
                    WHEN is_admin = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS admins
            FROM users
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN status IN (
                      'CREATING',
                      'PENDING',
                      'PROCESSING',
                      'OTP_RECEIVED'
                    )
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS active,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'COMPLETED'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS completed
            FROM orders
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'PENDING'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS pending,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'PAID'
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS paid
            FROM deposits
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN active = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS active
            FROM social_services
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN active = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS active,
              COALESCE(
                SUM(
                  CASE
                    WHEN available = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS available
            FROM nokos_services
          `
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total,
              COALESCE(
                SUM(
                  CASE
                    WHEN is_active = 1
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) AS active
            FROM announcements
          `
        )
        .first()
    ]);

  return jsonResponse({
    success: true,
    users:
      users || {},
    orders:
      orders || {},
    deposits:
      deposits || {},
    social_services:
      socialServices || {},
    nokos_services:
      nokosServices || {},
    announcements:
      announcements || {}
  });
}