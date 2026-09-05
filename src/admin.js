import {
  errorResponse,
  successResponse,
  cleanString,
  cleanUsername,
  cleanFirstName,
  parsePositiveInteger,
  parseNonNegativeInteger,
  nowUnix,
  generateOrderNumber
} from "./utils.js";
import {
  getCurrentUser,
  requireAdmin
} from "./auth.js";

export async function getAdminOverview(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const [
    users,
    products,
    categories,
    orders,
    deposits,
    pendingDeposits,
    revenue,
    views
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM users
    `).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM products
      WHERE is_active = 1
    `).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM categories
      WHERE is_active = 1
    `).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM orders
    `).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM deposits
    `).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM deposits
      WHERE status = 'PENDING'
    `).first(),

    env.DB.prepare(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM orders
      WHERE status = 'COMPLETED'
    `).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors
      FROM visitor_stats
    `).first()
  ]);

  return successResponse({
    overview: {
      users: Number(users?.total || 0),
      products: Number(products?.total || 0),
      categories: Number(categories?.total || 0),
      orders: Number(orders?.total || 0),
      deposits: Number(deposits?.total || 0),
      pending_deposits: Number(pendingDeposits?.total || 0),
      completed_revenue: Number(revenue?.total || 0),
      total_views: Number(views?.total_views || 0),
      unique_visitors: Number(views?.unique_visitors || 0)
    }
  });
}

export async function adminGetUsers(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parsePositiveInteger(url.searchParams.get("limit")) || 20,
    100
  );
  const offset = Math.max(
    Number(url.searchParams.get("offset")) || 0,
    0
  );
  const search = cleanString(
    url.searchParams.get("search"),
    100
  );

  const conditions = [];
  const bindings = [];

  if (search) {
    conditions.push("(username LIKE ? OR first_name LIKE ?)");
    const keyword = `%${search}%`;
    bindings.push(keyword, keyword);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM users
    ${where}
  `).bind(...bindings).first();

  const result = await env.DB.prepare(`
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
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  const total = Number(count?.total || 0);

  return successResponse({
    users: (result.results || []).map(formatUser),
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + (result.results || []).length < total
    }
  });
}

export async function adminGetUser(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const url = new URL(request.url);
  const id = parsePositiveInteger(url.searchParams.get("id"));

  if (!id) {
    return errorResponse("ID user tidak valid.", 400);
  }

  const user = await env.DB.prepare(`
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
  `).bind(id).first();

  if (!user) {
    return errorResponse("User tidak ditemukan.", 404);
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
      created_at
    FROM balance_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `).bind(id).all();

  return successResponse({
    user: formatUser(user),
    transactions: (transactions.results || []).map(formatTransaction)
  });
}

export async function adminUpdateUser(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.user_id);

  if (!id) {
    return errorResponse("user_id tidak valid.", 400);
  }

  const target = await env.DB.prepare(`
    SELECT id, is_admin
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!target) {
    return errorResponse("User tidak ditemukan.", 404);
  }

  if (id === admin.id && body?.is_active === false) {
    return errorResponse(
      "Akun admin yang sedang digunakan tidak dapat dinonaktifkan.",
      400
    );
  }

  const updates = [];
  const bindings = [];

  if (body?.first_name !== undefined) {
    const firstName = cleanFirstName(body.first_name);

    if (!firstName) {
      return errorResponse("Nama depan tidak valid.", 400);
    }

    updates.push("first_name = ?");
    bindings.push(firstName);
  }

  if (body?.username !== undefined) {
    const username = cleanUsername(body.username);

    if (!username) {
      return errorResponse("Username tidak valid.", 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE username = ? AND id != ?
      LIMIT 1
    `).bind(username, id).first();

    if (existing) {
      return errorResponse("Username sudah digunakan.", 409);
    }

    updates.push("username = ?");
    bindings.push(username);
  }

  if (body?.is_active !== undefined) {
    updates.push("is_active = ?");
    bindings.push(body.is_active ? 1 : 0);
  }

  if (body?.is_admin !== undefined) {
    updates.push("is_admin = ?");
    bindings.push(body.is_admin ? 1 : 0);
  }

  if (!updates.length) {
    return errorResponse("Tidak ada perubahan.", 400);
  }

  updates.push("updated_at = ?");
  bindings.push(nowUnix(), id);

  await env.DB.prepare(`
    UPDATE users
    SET ${updates.join(", ")}
    WHERE id = ?
  `).bind(...bindings).run();

  if (body?.is_active === false || body?.is_admin === false) {
    await env.DB.prepare(`
      UPDATE user_sessions
      SET revoked_at = ?
      WHERE user_id = ?
        AND revoked_at IS NULL
    `).bind(nowUnix(), id).run();
  }

  return successResponse({
    user_id: id,
    message: "Data user berhasil diperbarui."
  });
}

export async function adminAdjustBalance(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const userId = parsePositiveInteger(body?.user_id);
  const amount = Number(body?.amount);

  if (!userId) {
    return errorResponse("user_id tidak valid.", 400);
  }

  if (!Number.isSafeInteger(amount) || amount === 0) {
    return errorResponse("Nominal saldo tidak valid.", 400);
  }

  if (Math.abs(amount) > 1000000000) {
    return errorResponse("Nominal saldo terlalu besar.", 400);
  }

  const description =
    cleanString(body?.description, 200) ||
    "Penyesuaian saldo oleh admin";

  const user = await env.DB.prepare(`
    SELECT id, balance, is_active
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first();

  if (!user) {
    return errorResponse("User tidak ditemukan.", 404);
  }

  if (Number(user.is_active) !== 1) {
    return errorResponse("Akun user tidak aktif.", 400);
  }

  const before = Number(user.balance || 0);
  const after = before + amount;

  if (after < 0) {
    return errorResponse(
      "Saldo tidak boleh menjadi negatif.",
      400
    );
  }

  const reference =
    `ADMIN:${admin.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET balance = ?,
          updated_at = ?
      WHERE id = ?
        AND balance = ?
        AND is_active = 1
    `).bind(after, nowUnix(), userId, before),

    env.DB.prepare(`
      INSERT INTO balance_transactions (
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference,
        description,
        created_at
      )
      VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      amount,
      before,
      after,
      reference,
      description,
      nowUnix()
    )
  ]);

  if (!result?.[0]?.meta?.changes) {
    return errorResponse(
      "Saldo berubah bersamaan dengan proses ini. Silakan coba lagi.",
      409
    );
  }

  return successResponse({
    user_id: userId,
    amount,
    balance_before: before,
    balance_after: after,
    reference
  });
}

export async function adminGetCategories(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      name,
      slug,
      description,
      sort_order,
      is_active,
      created_at,
      updated_at
    FROM categories
    ORDER BY sort_order ASC, id DESC
  `).all();

  return successResponse({
    categories: result.results || []
  });
}

export async function adminCreateCategory(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const name = cleanString(body?.name, 100);
  const slug = cleanString(body?.slug, 100);
  const description = cleanString(body?.description, 500);
  const sortOrder = parseNonNegativeInteger(body?.sort_order) || 0;

  if (!name || !slug) {
    return errorResponse(
      "Nama dan slug kategori wajib diisi.",
      400
    );
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM categories
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (existing) {
    return errorResponse(
      "Slug kategori sudah digunakan.",
      409
    );
  }

  const timestamp = nowUnix();

  const result = await env.DB.prepare(`
    INSERT INTO categories (
      name,
      slug,
      description,
      sort_order,
      is_active,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(
    name,
    slug,
    description || null,
    sortOrder,
    timestamp,
    timestamp
  ).run();

  return successResponse({
    category_id: Number(result.meta.last_row_id)
  }, 201);
}

export async function adminUpdateCategory(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.category_id);

  if (!id) {
    return errorResponse("category_id tidak valid.", 400);
  }

  const category = await env.DB.prepare(`
    SELECT id
    FROM categories
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!category) {
    return errorResponse("Kategori tidak ditemukan.", 404);
  }

  const updates = [];
  const bindings = [];

  if (body?.name !== undefined) {
    const name = cleanString(body.name, 100);

    if (!name) {
      return errorResponse("Nama kategori tidak valid.", 400);
    }

    updates.push("name = ?");
    bindings.push(name);
  }

  if (body?.slug !== undefined) {
    const slug = cleanString(body.slug, 100);

    if (!slug) {
      return errorResponse("Slug kategori tidak valid.", 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id
      FROM categories
      WHERE slug = ? AND id != ?
      LIMIT 1
    `).bind(slug, id).first();

    if (existing) {
      return errorResponse(
        "Slug kategori sudah digunakan.",
        409
      );
    }

    updates.push("slug = ?");
    bindings.push(slug);
  }

  if (body?.description !== undefined) {
    updates.push("description = ?");
    bindings.push(
      cleanString(body.description, 500) || null
    );
  }

  if (body?.sort_order !== undefined) {
    const sortOrder =
      parseNonNegativeInteger(body.sort_order);

    if (sortOrder === null) {
      return errorResponse(
        "sort_order tidak valid.",
        400
      );
    }

    updates.push("sort_order = ?");
    bindings.push(sortOrder);
  }

  if (body?.is_active !== undefined) {
    updates.push("is_active = ?");
    bindings.push(body.is_active ? 1 : 0);
  }

  if (!updates.length) {
    return errorResponse("Tidak ada perubahan.", 400);
  }

  updates.push("updated_at = ?");
  bindings.push(nowUnix(), id);

  await env.DB.prepare(`
    UPDATE categories
    SET ${updates.join(", ")}
    WHERE id = ?
  `).bind(...bindings).run();

  return successResponse({
    category_id: id,
    message: "Kategori berhasil diperbarui."
  });
}

export async function adminDeleteCategory(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.category_id);

  if (!id) {
    return errorResponse("category_id tidak valid.", 400);
  }

  const result = await env.DB.prepare(`
    UPDATE categories
    SET is_active = 0,
        updated_at = ?
    WHERE id = ?
  `).bind(nowUnix(), id).run();

  if (!result?.meta?.changes) {
    return errorResponse("Kategori tidak ditemukan.", 404);
  }

  return successResponse({
    category_id: id,
    message: "Kategori dinonaktifkan."
  });
}

export async function adminGetProducts(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.category_id,
      p.name,
      p.slug,
      p.description,
      p.price,
      p.stock,
      p.image_url,
      p.is_active,
      p.is_featured,
      p.sort_order,
      p.created_at,
      p.updated_at,
      c.name AS category_name,
      c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.sort_order ASC, p.id DESC
  `).all();

  return successResponse({
    products: (result.results || []).map(formatProduct)
  });
}

export async function adminCreateProduct(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);

  const categoryId = body?.category_id === null ||
    body?.category_id === undefined ||
    body?.category_id === ""
    ? null
    : parsePositiveInteger(body.category_id);

  const name = cleanString(body?.name, 150);
  const slug = cleanString(body?.slug, 150);
  const description = cleanString(body?.description, 2000);
  const imageUrl = cleanString(body?.image_url, 1000);
  const price = Number(body?.price);
  const sortOrder =
    parseNonNegativeInteger(body?.sort_order) || 0;

  let stock = null;

  if (
    body?.stock !== null &&
    body?.stock !== undefined &&
    body?.stock !== ""
  ) {
    stock = parseNonNegativeInteger(body.stock);

    if (stock === null) {
      return errorResponse("Stock tidak valid.", 400);
    }
  }

  if (!name || !slug) {
    return errorResponse(
      "Nama dan slug produk wajib diisi.",
      400
    );
  }

  if (!Number.isSafeInteger(price) || price < 0) {
    return errorResponse("Harga tidak valid.", 400);
  }

  if (categoryId) {
    const category = await env.DB.prepare(`
      SELECT id
      FROM categories
      WHERE id = ?
      LIMIT 1
    `).bind(categoryId).first();

    if (!category) {
      return errorResponse(
        "Kategori tidak ditemukan.",
        400
      );
    }
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (existing) {
    return errorResponse(
      "Slug produk sudah digunakan.",
      409
    );
  }

  const timestamp = nowUnix();

  const result = await env.DB.prepare(`
    INSERT INTO products (
      category_id,
      name,
      slug,
      description,
      price,
      stock,
      image_url,
      is_active,
      is_featured,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).bind(
    categoryId,
    name,
    slug,
    description || null,
    price,
    stock,
    imageUrl || null,
    body?.is_featured ? 1 : 0,
    sortOrder,
    timestamp,
    timestamp
  ).run();

  return successResponse({
    product_id: Number(result.meta.last_row_id)
  }, 201);
}

export async function adminUpdateProduct(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.product_id);

  if (!id) {
    return errorResponse("product_id tidak valid.", 400);
  }

  const product = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!product) {
    return errorResponse("Produk tidak ditemukan.", 404);
  }

  const updates = [];
  const bindings = [];

  if (body?.category_id !== undefined) {
    const categoryId =
      body.category_id === null || body.category_id === ""
        ? null
        : parsePositiveInteger(body.category_id);

    if (categoryId !== null) {
      const category = await env.DB.prepare(`
        SELECT id
        FROM categories
        WHERE id = ?
        LIMIT 1
      `).bind(categoryId).first();

      if (!category) {
        return errorResponse(
          "Kategori tidak ditemukan.",
          400
        );
      }
    }

    updates.push("category_id = ?");
    bindings.push(categoryId);
  }

  if (body?.name !== undefined) {
    const name = cleanString(body.name, 150);

    if (!name) {
      return errorResponse("Nama produk tidak valid.", 400);
    }

    updates.push("name = ?");
    bindings.push(name);
  }

  if (body?.slug !== undefined) {
    const slug = cleanString(body.slug, 150);

    if (!slug) {
      return errorResponse("Slug produk tidak valid.", 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id
      FROM products
      WHERE slug = ? AND id != ?
      LIMIT 1
    `).bind(slug, id).first();

    if (existing) {
      return errorResponse(
        "Slug produk sudah digunakan.",
        409
      );
    }

    updates.push("slug = ?");
    bindings.push(slug);
  }

  if (body?.description !== undefined) {
    updates.push("description = ?");
    bindings.push(
      cleanString(body.description, 2000) || null
    );
  }

  if (body?.price !== undefined) {
    const price = Number(body.price);

    if (!Number.isSafeInteger(price) || price < 0) {
      return errorResponse("Harga tidak valid.", 400);
    }

    updates.push("price = ?");
    bindings.push(price);
  }

  if (body?.stock !== undefined) {
    const stock =
      body.stock === null || body.stock === ""
        ? null
        : parseNonNegativeInteger(body.stock);

    if (
      body.stock !== null &&
      body.stock !== "" &&
      stock === null
    ) {
      return errorResponse("Stock tidak valid.", 400);
    }

    updates.push("stock = ?");
    bindings.push(stock);
  }

  if (body?.image_url !== undefined) {
    updates.push("image_url = ?");
    bindings.push(
      cleanString(body.image_url, 1000) || null
    );
  }

  if (body?.is_active !== undefined) {
    updates.push("is_active = ?");
    bindings.push(body.is_active ? 1 : 0);
  }

  if (body?.is_featured !== undefined) {
    updates.push("is_featured = ?");
    bindings.push(body.is_featured ? 1 : 0);
  }

  if (body?.sort_order !== undefined) {
    const sortOrder =
      parseNonNegativeInteger(body.sort_order);

    if (sortOrder === null) {
      return errorResponse(
        "sort_order tidak valid.",
        400
      );
    }

    updates.push("sort_order = ?");
    bindings.push(sortOrder);
  }

  if (!updates.length) {
    return errorResponse("Tidak ada perubahan.", 400);
  }

  updates.push("updated_at = ?");
  bindings.push(nowUnix(), id);

  await env.DB.prepare(`
    UPDATE products
    SET ${updates.join(", ")}
    WHERE id = ?
  `).bind(...bindings).run();

  return successResponse({
    product_id: id,
    message: "Produk berhasil diperbarui."
  });
}

export async function adminDeleteProduct(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.product_id);

  if (!id) {
    return errorResponse("product_id tidak valid.", 400);
  }

  const result = await env.DB.prepare(`
    UPDATE products
    SET is_active = 0,
        updated_at = ?
    WHERE id = ?
  `).bind(nowUnix(), id).run();

  if (!result?.meta?.changes) {
    return errorResponse("Produk tidak ditemukan.", 404);
  }

  return successResponse({
    product_id: id,
    message: "Produk dinonaktifkan."
  });
}

export async function adminGetOrders(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parsePositiveInteger(url.searchParams.get("limit")) || 30,
    100
  );
  const offset = Math.max(
    Number(url.searchParams.get("offset")) || 0,
    0
  );

  const status = cleanString(
    url.searchParams.get("status"),
    30
  ).toUpperCase();

  const validStatuses = [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "FAILED"
  ];

  const conditions = [];
  const bindings = [];

  if (validStatuses.includes(status)) {
    conditions.push("o.status = ?");
    bindings.push(status);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM orders o
    ${where}
  `).bind(...bindings).first();

  const result = await env.DB.prepare(`
    SELECT
      o.id,
      o.user_id,
      o.order_number,
      o.status,
      o.subtotal,
      o.discount,
      o.total,
      o.created_at,
      o.updated_at,
      o.completed_at,
      o.cancelled_at,
      u.username,
      u.first_name
    FROM orders o
    INNER JOIN users u ON u.id = o.user_id
    ${where}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  const total = Number(count?.total || 0);

  return successResponse({
    orders: (result.results || []).map(order => ({
      id: Number(order.id),
      user_id: Number(order.user_id),
      username: order.username,
      first_name: order.first_name,
      order_number: order.order_number,
      status: order.status,
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      created_at: Number(order.created_at || 0),
      updated_at: Number(order.updated_at || 0),
      completed_at: order.completed_at === null
        ? null
        : Number(order.completed_at),
      cancelled_at: order.cancelled_at === null
        ? null
        : Number(order.cancelled_at)
    })),
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + (result.results || []).length < total
    }
  });
}

export async function adminUpdateOrderStatus(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const orderId = parsePositiveInteger(body?.order_id);
  const status = cleanString(body?.status, 30).toUpperCase();
  const message = cleanString(body?.message, 500);

  const validStatuses = [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "FAILED"
  ];

  if (!orderId) {
    return errorResponse("order_id tidak valid.", 400);
  }

  if (!validStatuses.includes(status)) {
    return errorResponse("Status pesanan tidak valid.", 400);
  }

  const order = await env.DB.prepare(`
    SELECT
      id,
      user_id,
      order_number,
      status,
      total
    FROM orders
    WHERE id = ?
    LIMIT 1
  `).bind(orderId).first();

  if (!order) {
    return errorResponse("Pesanan tidak ditemukan.", 404);
  }

  if (order.status === status) {
    return successResponse({
      order_id: orderId,
      status
    });
  }

  if (status === "REFUNDED") {
    return adminRefundOrder(
      env,
      order,
      message || "Refund pesanan oleh admin."
    );
  }

  const timestamp = nowUnix();
  const updates = [
    "status = ?",
    "updated_at = ?"
  ];
  const bindings = [
    status,
    timestamp
  ];

  if (status === "COMPLETED") {
    updates.push("completed_at = ?");
    bindings.push(timestamp);
  }

  if (status === "CANCELLED") {
    updates.push("cancelled_at = ?");
    bindings.push(timestamp);
  }

  bindings.push(orderId);

  const result = await env.DB.prepare(`
    UPDATE orders
    SET ${updates.join(", ")}
    WHERE id = ?
  `).bind(...bindings).run();

  if (!result?.meta?.changes) {
    return errorResponse(
      "Status pesanan gagal diperbarui.",
      409
    );
  }

  await env.DB.prepare(`
    INSERT INTO order_events (
      order_id,
      status,
      message,
      created_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    orderId,
    status,
    message || `Status pesanan diubah menjadi ${status}.`,
    timestamp
  ).run();

  return successResponse({
    order_id: orderId,
    status
  });
}

async function adminRefundOrder(
  env,
  order,
  message
) {
  const timestamp = nowUnix();
  const refundReference =
    `REFUND:${order.order_number}`;

  const existing = await env.DB.prepare(`
    SELECT id
    FROM balance_transactions
    WHERE reference = ?
    LIMIT 1
  `).bind(refundReference).first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE orders
      SET status = 'REFUNDED',
          updated_at = ?
      WHERE id = ?
    `).bind(timestamp, order.id).run();

    return successResponse({
      order_id: Number(order.id),
      status: "REFUNDED"
    });
  }

  const user = await env.DB.prepare(`
    SELECT balance
    FROM users
    WHERE id = ?
    LIMIT 1
  `).bind(order.user_id).first();

  if (!user) {
    return errorResponse("User pesanan tidak ditemukan.", 404);
  }

  const before = Number(user.balance || 0);
  const refundAmount = Number(order.total || 0);
  const after = before + refundAmount;

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET balance = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(after, timestamp, order.user_id),

    env.DB.prepare(`
      INSERT INTO balance_transactions (
        user_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference,
        description,
        created_at
      )
      VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)
    `).bind(
      order.user_id,
      refundAmount,
      before,
      after,
      refundReference,
      message,
      timestamp
    ),

    env.DB.prepare(`
      UPDATE orders
      SET status = 'REFUNDED',
          updated_at = ?
      WHERE id = ?
    `).bind(timestamp, order.id),

    env.DB.prepare(`
      INSERT INTO order_events (
        order_id,
        status,
        message,
        created_at
      )
      VALUES (?, 'REFUNDED', ?, ?)
    `).bind(
      order.id,
      message,
      timestamp
    )
  ]);

  if (!result?.[2]?.meta?.changes) {
    return errorResponse(
      "Refund gagal diproses.",
      409
    );
  }

  return successResponse({
    order_id: Number(order.id),
    status: "REFUNDED",
    refunded_amount: refundAmount
  });
}

export async function adminGetDeposits(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parsePositiveInteger(url.searchParams.get("limit")) || 30,
    100
  );
  const offset = Math.max(
    Number(url.searchParams.get("offset")) || 0,
    0
  );

  const status = cleanString(
    url.searchParams.get("status"),
    30
  ).toUpperCase();

  const validStatuses = [
    "PENDING",
    "PAID",
    "EXPIRED",
    "CANCELLED"
  ];

  const conditions = [];
  const bindings = [];

  if (validStatuses.includes(status)) {
    conditions.push("d.status = ?");
    bindings.push(status);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await env.DB.prepare(`
    SELECT
      d.id,
      d.user_id,
      d.code,
      d.amount,
      d.status,
      d.payment_method,
      d.created_at,
      d.expires_at,
      d.checked_at,
      d.paid_at,
      d.cancelled_at,
      d.check_count,
      u.username,
      u.first_name
    FROM deposits d
    INNER JOIN users u ON u.id = d.user_id
    ${where}
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  return successResponse({
    deposits: (result.results || []).map(deposit => ({
      id: Number(deposit.id),
      user_id: Number(deposit.user_id),
      username: deposit.username,
      first_name: deposit.first_name,
      code: deposit.code,
      amount: Number(deposit.amount),
      status: deposit.status,
      payment_method: deposit.payment_method,
      created_at: Number(deposit.created_at),
      expires_at: Number(deposit.expires_at),
      checked_at: deposit.checked_at === null
        ? null
        : Number(deposit.checked_at),
      paid_at: deposit.paid_at === null
        ? null
        : Number(deposit.paid_at),
      cancelled_at: deposit.cancelled_at === null
        ? null
        : Number(deposit.cancelled_at),
      check_count: Number(deposit.check_count || 0)
    }))
  });
}

export async function adminGetAnnouncements(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      title,
      content,
      type,
      is_active,
      sort_order,
      created_at,
      updated_at,
      expires_at
    FROM announcements
    ORDER BY sort_order ASC, id DESC
  `).all();

  return successResponse({
    announcements: result.results || []
  });
}

export async function adminCreateAnnouncement(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);

  const title = cleanString(body?.title, 150);
  const content = cleanString(body?.content, 5000);
  const type = cleanString(body?.type, 20).toUpperCase();
  const sortOrder =
    parseNonNegativeInteger(body?.sort_order) || 0;

  const validTypes = [
    "INFO",
    "SUCCESS",
    "WARNING",
    "ERROR"
  ];

  if (!title || !content) {
    return errorResponse(
      "Judul dan isi pengumuman wajib diisi.",
      400
    );
  }

  if (!validTypes.includes(type)) {
    return errorResponse(
      "Tipe pengumuman tidak valid.",
      400
    );
  }

  let expiresAt = null;

  if (
    body?.expires_at !== null &&
    body?.expires_at !== undefined &&
    body?.expires_at !== ""
  ) {
    expiresAt = Number(body.expires_at);

    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
      return errorResponse(
        "expires_at tidak valid.",
        400
      );
    }
  }

  const timestamp = nowUnix();

  const result = await env.DB.prepare(`
    INSERT INTO announcements (
      title,
      content,
      type,
      is_active,
      sort_order,
      created_at,
      updated_at,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    title,
    content,
    type,
    body?.is_active === false ? 0 : 1,
    sortOrder,
    timestamp,
    timestamp,
    expiresAt
  ).run();

  return successResponse({
    announcement_id: Number(result.meta.last_row_id)
  }, 201);
}

export async function adminUpdateAnnouncement(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.announcement_id);

  if (!id) {
    return errorResponse(
      "announcement_id tidak valid.",
      400
    );
  }

  const announcement = await env.DB.prepare(`
    SELECT id
    FROM announcements
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!announcement) {
    return errorResponse(
      "Pengumuman tidak ditemukan.",
      404
    );
  }

  const updates = [];
  const bindings = [];

  if (body?.title !== undefined) {
    const title = cleanString(body.title, 150);

    if (!title) {
      return errorResponse(
        "Judul tidak valid.",
        400
      );
    }

    updates.push("title = ?");
    bindings.push(title);
  }

  if (body?.content !== undefined) {
    const content = cleanString(body.content, 5000);

    if (!content) {
      return errorResponse(
        "Isi pengumuman tidak valid.",
        400
      );
    }

    updates.push("content = ?");
    bindings.push(content);
  }

  if (body?.type !== undefined) {
    const type = cleanString(body.type, 20).toUpperCase();

    if (![
      "INFO",
      "SUCCESS",
      "WARNING",
      "ERROR"
    ].includes(type)) {
      return errorResponse(
        "Tipe pengumuman tidak valid.",
        400
      );
    }

    updates.push("type = ?");
    bindings.push(type);
  }

  if (body?.is_active !== undefined) {
    updates.push("is_active = ?");
    bindings.push(body.is_active ? 1 : 0);
  }

  if (body?.sort_order !== undefined) {
    const sortOrder =
      parseNonNegativeInteger(body.sort_order);

    if (sortOrder === null) {
      return errorResponse(
        "sort_order tidak valid.",
        400
      );
    }

    updates.push("sort_order = ?");
    bindings.push(sortOrder);
  }

  if (body?.expires_at !== undefined) {
    let expiresAt = null;

    if (
      body.expires_at !== null &&
      body.expires_at !== ""
    ) {
      expiresAt = Number(body.expires_at);

      if (
        !Number.isSafeInteger(expiresAt) ||
        expiresAt <= 0
      ) {
        return errorResponse(
          "expires_at tidak valid.",
          400
        );
      }
    }

    updates.push("expires_at = ?");
    bindings.push(expiresAt);
  }

  if (!updates.length) {
    return errorResponse("Tidak ada perubahan.", 400);
  }

  updates.push("updated_at = ?");
  bindings.push(nowUnix(), id);

  await env.DB.prepare(`
    UPDATE announcements
    SET ${updates.join(", ")}
    WHERE id = ?
  `).bind(...bindings).run();

  return successResponse({
    announcement_id: id,
    message: "Pengumuman berhasil diperbarui."
  });
}

export async function adminDeleteAnnouncement(request, env) {
  const admin = await requireAdmin(request, env);

  if (!admin) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.announcement_id);

  if (!id) {
    return errorResponse(
      "announcement_id tidak valid.",
      400
    );
  }

  const result = await env.DB.prepare(`
    DELETE FROM announcements
    WHERE id = ?
  `).bind(id).run();

  if (!result?.meta?.changes) {
    return errorResponse(
      "Pengumuman tidak ditemukan.",
      404
    );
  }

  return successResponse({
    announcement_id: id,
    message: "Pengumuman dihapus."
  });
}

export async function getPublicAnnouncements(request, env) {
  const timestamp = nowUnix();

  const result = await env.DB.prepare(`
    SELECT
      id,
      title,
      content,
      type,
      sort_order,
      created_at,
      expires_at
    FROM announcements
    WHERE is_active = 1
      AND (
        expires_at IS NULL
        OR expires_at > ?
      )
    ORDER BY sort_order ASC, id DESC
  `).bind(timestamp).all();

  return successResponse({
    announcements: result.results || []
  });
}

function formatUser(user) {
  return {
    id: Number(user.id),
    first_name: user.first_name,
    username: user.username,
    balance: Number(user.balance || 0),
    is_active: Number(user.is_active || 0) === 1,
    is_admin: Number(user.is_admin || 0) === 1,
    created_at: Number(user.created_at || 0),
    updated_at: Number(user.updated_at || 0),
    last_login_at: user.last_login_at === null
      ? null
      : Number(user.last_login_at)
  };
}

function formatTransaction(transaction) {
  return {
    id: Number(transaction.id),
    type: transaction.type,
    amount: Number(transaction.amount),
    balance_before: Number(transaction.balance_before),
    balance_after: Number(transaction.balance_after),
    reference: transaction.reference,
    description: transaction.description,
    created_at: Number(transaction.created_at)
  };
}

function formatProduct(product) {
  return {
    id: Number(product.id),
    category_id: product.category_id === null
      ? null
      : Number(product.category_id),
    category_name: product.category_name || null,
    category_slug: product.category_slug || null,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    price: Number(product.price || 0),
    stock: product.stock === null
      ? null
      : Number(product.stock),
    image_url: product.image_url || null,
    is_active: Number(product.is_active || 0) === 1,
    is_featured: Number(product.is_featured || 0) === 1,
    sort_order: Number(product.sort_order || 0),
    created_at: Number(product.created_at || 0),
    updated_at: Number(product.updated_at || 0)
  };
    }
