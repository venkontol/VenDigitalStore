import {
  cleanString,
  parsePositiveInteger,
  parseNonNegativeInteger,
  nowUnix,
  readJson,
  successResponse,
  errorResponse
} from "./utils.js";

import {
  adminUser
} from "./admin.js";

import {
  adminGetVisitorStats
} from "./visitor.js";

async function adminGetCategories(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM categories
         ORDER BY sort_order ASC, id ASC`
      )
      .all();

  return successResponse({
    categories:
      result.results || []
  });
}

async function adminCreateCategory(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const name =
    cleanString(
      body?.name,
      120
    );

  const slug =
    cleanString(
      body?.slug,
      120
    );

  const description =
    cleanString(
      body?.description,
      1000
    );

  const sortOrder =
    parseNonNegativeInteger(
      body?.sort_order,
      0
    );

  if (!name || !slug) {
    return errorResponse(
      "Nama dan slug kategori wajib diisi.",
      400
    );
  }

  const timestamp =
    nowUnix();

  try {
    const result =
      await env.DB
        .prepare(
          `INSERT INTO categories (
             name,
             slug,
             description,
             sort_order,
             is_active,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          name,
          slug,
          description,
          sortOrder,
          Number(body?.is_active) === 0
            ? 0
            : 1,
          timestamp,
          timestamp
        )
        .run();

    return successResponse({
      id:
        result.meta.last_row_id,
      message:
        "Kategori berhasil dibuat."
    });
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Slug kategori sudah digunakan.",
        409
      );
    }

    throw error;
  }
}

async function adminUpdateCategory(request, env) {
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
    path.match(
      /\/categories\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID kategori tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  const fields = [];
  const values = [];

  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(
      cleanString(
        body.name,
        120
      )
    );
  }

  if (body.slug !== undefined) {
    fields.push("slug = ?");
    values.push(
      cleanString(
        body.slug,
        120
      )
    );
  }

  if (body.description !== undefined) {
    fields.push(
      "description = ?"
    );

    values.push(
      cleanString(
        body.description,
        1000
      )
    );
  }

  if (body.sort_order !== undefined) {
    fields.push(
      "sort_order = ?"
    );

    values.push(
      parseNonNegativeInteger(
        body.sort_order,
        0
      )
    );
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
    const result =
      await env.DB
        .prepare(
          `UPDATE categories
           SET ${fields.join(", ")}
           WHERE id = ?`
        )
        .bind(...values)
        .run();

    if (!result.meta.changes) {
      return errorResponse(
        "Kategori tidak ditemukan.",
        404
      );
    }
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Slug kategori sudah digunakan.",
        409
      );
    }

    throw error;
  }

  return successResponse({
    message:
      "Kategori berhasil diperbarui."
  });
}

async function adminDeleteCategory(request, env) {
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
    path.match(
      /\/categories\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID kategori tidak valid.",
      400
    );
  }

  const products =
    await env.DB
      .prepare(
        `SELECT COUNT(*) AS total
         FROM products
         WHERE category_id = ?`
      )
      .bind(id)
      .first();

  if (
    Number(products?.total || 0) > 0
  ) {
    return errorResponse(
      "Kategori masih memiliki produk. Pindahkan produk terlebih dahulu.",
      409
    );
  }

  const result =
    await env.DB
      .prepare(
        `DELETE FROM categories
         WHERE id = ?`
      )
      .bind(id)
      .run();

  if (!result.meta.changes) {
    return errorResponse(
      "Kategori tidak ditemukan.",
      404
    );
  }

  return successResponse({
    message:
      "Kategori berhasil dihapus."
  });
}

async function adminGetProducts(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const result =
    await env.DB
      .prepare(
        `SELECT
           p.*,
           c.name AS category_name,
           c.slug AS category_slug
         FROM products p
         LEFT JOIN categories c
           ON c.id = p.category_id
         ORDER BY p.sort_order ASC, p.id DESC`
      )
      .all();

  return successResponse({
    products:
      result.results || []
  });
}

async function adminCreateProduct(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const name =
    cleanString(
      body?.name,
      200
    );

  const slug =
    cleanString(
      body?.slug,
      200
    );

  const description =
    cleanString(
      body?.description,
      5000
    );

  const price =
    parseNonNegativeInteger(
      body?.price,
      0
    );

  const stock =
    body?.stock === null ||
    body?.stock === undefined ||
    body?.stock === ""
      ? null
      : parseNonNegativeInteger(
          body.stock,
          0
        );

  const categoryId =
    body?.category_id === null ||
    body?.category_id === undefined ||
    body?.category_id === ""
      ? null
      : parsePositiveInteger(
          body.category_id,
          0
        );

  const imageUrl =
    cleanString(
      body?.image_url,
      2000
    );

  const sortOrder =
    parseNonNegativeInteger(
      body?.sort_order,
      0
    );

  if (!name || !slug) {
    return errorResponse(
      "Nama dan slug produk wajib diisi.",
      400
    );
  }

  const timestamp =
    nowUnix();

  try {
    const result =
      await env.DB
        .prepare(
          `INSERT INTO products (
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
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          categoryId,
          name,
          slug,
          description,
          price,
          stock,
          imageUrl,
          Number(body?.is_active) === 0
            ? 0
            : 1,
          Number(body?.is_featured) === 1
            ? 1
            : 0,
          sortOrder,
          timestamp,
          timestamp
        )
        .run();

    return successResponse({
      id:
        result.meta.last_row_id,
      message:
        "Produk berhasil dibuat."
    });
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Slug produk sudah digunakan.",
        409
      );
    }

    throw error;
  }
}

async function adminUpdateProduct(request, env) {
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
    path.match(
      /\/products\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID produk tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  const fields = [];
  const values = [];

  if (body.category_id !== undefined) {
    const categoryId =
      body.category_id === null ||
      body.category_id === ""
        ? null
        : parsePositiveInteger(
            body.category_id,
            0
          );

    fields.push(
      "category_id = ?"
    );

    values.push(categoryId);
  }

  if (body.name !== undefined) {
    fields.push("name = ?");
    values.push(
      cleanString(
        body.name,
        200
      )
    );
  }

  if (body.slug !== undefined) {
    fields.push("slug = ?");
    values.push(
      cleanString(
        body.slug,
        200
      )
    );
  }

  if (body.description !== undefined) {
    fields.push(
      "description = ?"
    );

    values.push(
      cleanString(
        body.description,
        5000
      )
    );
  }

  if (body.price !== undefined) {
    fields.push("price = ?");
    values.push(
      parseNonNegativeInteger(
        body.price,
        0
      )
    );
  }

  if (body.stock !== undefined) {
    fields.push("stock = ?");

    values.push(
      body.stock === null ||
      body.stock === ""
        ? null
        : parseNonNegativeInteger(
            body.stock,
            0
          )
    );
  }

  if (body.image_url !== undefined) {
    fields.push(
      "image_url = ?"
    );

    values.push(
      cleanString(
        body.image_url,
        2000
      )
    );
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

  if (body.is_featured !== undefined) {
    fields.push(
      "is_featured = ?"
    );

    values.push(
      Number(body.is_featured) === 1
        ? 1
        : 0
    );
  }

  if (body.sort_order !== undefined) {
    fields.push(
      "sort_order = ?"
    );

    values.push(
      parseNonNegativeInteger(
        body.sort_order,
        0
      )
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
    const result =
      await env.DB
        .prepare(
          `UPDATE products
           SET ${fields.join(", ")}
           WHERE id = ?`
        )
        .bind(...values)
        .run();

    if (!result.meta.changes) {
      return errorResponse(
        "Produk tidak ditemukan.",
        404
      );
    }
  } catch (error) {
    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Slug produk sudah digunakan.",
        409
      );
    }

    throw error;
  }

  return successResponse({
    message:
      "Produk berhasil diperbarui."
  });
}

async function adminDeleteProduct(request, env) {
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
    path.match(
      /\/products\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID produk tidak valid.",
      400
    );
  }

  const result =
    await env.DB
      .prepare(
        `UPDATE products
         SET
           is_active = 0,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(
        nowUnix(),
        id
      )
      .run();

  if (!result.meta.changes) {
    return errorResponse(
      "Produk tidak ditemukan.",
      404
    );
  }

  return successResponse({
    message:
      "Produk dinonaktifkan."
  });
}

async function adminGetOrders(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url =
    new URL(request.url);

  const status =
    cleanString(
      url.searchParams.get("status"),
      30
    ).toUpperCase();

  const limit =
    Math.min(
      parsePositiveInteger(
        url.searchParams.get("limit"),
        50
      ),
      100
    );

  const offset =
    parseNonNegativeInteger(
      url.searchParams.get("offset"),
      0
    );

  let query = `
    SELECT
      o.*,
      u.username,
      u.first_name
    FROM orders o
    JOIN users u
      ON u.id = o.user_id
  `;

  const values = [];

  if (status) {
    query +=
      " WHERE o.status = ?";

    values.push(status);
  }

  query += `
    ORDER BY o.id DESC
    LIMIT ? OFFSET ?
  `;

  values.push(
    limit,
    offset
  );

  const result =
    await env.DB
      .prepare(query)
      .bind(...values)
      .all();

  return successResponse({
    orders:
      result.results || [],
    limit,
    offset
  });
}

async function adminUpdateOrderStatus(request, env) {
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
    path.match(
      /\/orders\/([^/]+)$/
    );

  const orderNumber =
    cleanString(
      match?.[1],
      100
    );

  if (!orderNumber) {
    return errorResponse(
      "Order tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  const status =
    cleanString(
      body?.status,
      30
    ).toUpperCase();

  const allowed = [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "FAILED"
  ];

  if (!allowed.includes(status)) {
    return errorResponse(
      "Status order tidak valid.",
      400
    );
  }

  const order =
    await env.DB
      .prepare(
        `SELECT
           id,
           status
         FROM orders
         WHERE order_number = ?`
      )
      .bind(orderNumber)
      .first();

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  const timestamp =
    nowUnix();

  const completedAt =
    status === "COMPLETED"
      ? timestamp
      : null;

  const cancelledAt =
    status === "CANCELLED"
      ? timestamp
      : null;

  const result =
    await env.DB.batch([
      env.DB
        .prepare(
          `UPDATE orders
           SET
             status = ?,
             updated_at = ?,
             completed_at = ?,
             cancelled_at = ?
           WHERE id = ?`
        )
        .bind(
          status,
          timestamp,
          completedAt,
          cancelledAt,
          order.id
        ),

      env.DB
        .prepare(
          `INSERT INTO order_events (
             order_id,
             status,
             message,
             created_at
           )
           VALUES (?, ?, ?, ?)`
        )
        .bind(
          order.id,
          status,
          cleanString(
            body?.message ||
            `Status order diubah menjadi ${status}`,
            500
          ),
          timestamp
        )
    ]);

  if (
    !result?.[0]?.meta?.changes
  ) {
    return errorResponse(
      "Order gagal diperbarui.",
      409
    );
  }

  return successResponse({
    message:
      "Status order berhasil diperbarui."
  });
}

async function adminRefundOrder(request, env) {
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
    path.match(
      /\/orders\/([^/]+)\/refund$/
    );

  const orderNumber =
    cleanString(
      match?.[1],
      100
    );

  if (!orderNumber) {
    return errorResponse(
      "Order tidak valid.",
      400
    );
  }

  const order =
    await env.DB
      .prepare(
        `SELECT
           id,
           user_id,
           status,
           total
         FROM orders
         WHERE order_number = ?`
      )
      .bind(orderNumber)
      .first();

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    [
      "REFUNDED",
      "CANCELLED",
      "FAILED",
      "PENDING"
    ].includes(order.status)
  ) {
    return errorResponse(
      "Order tidak dapat direfund dari status saat ini.",
      409
    );
  }

  const total =
    Number(order.total || 0);

  if (total <= 0) {
    return errorResponse(
      "Nominal refund tidak valid.",
      400
    );
  }

  const timestamp =
    nowUnix();

  const reference =
    `REFUND:${order.id}`;

  const existing =
    await env.DB
      .prepare(
        `SELECT id
         FROM balance_transactions
         WHERE reference = ?`
      )
      .bind(reference)
      .first();

  if (existing) {
    return errorResponse(
      "Order sudah direfund.",
      409
    );
  }

  const balance =
    await env.DB
      .prepare(
        `SELECT balance
         FROM users
         WHERE id = ?`
      )
      .bind(order.user_id)
      .first();

  if (!balance) {
    return errorResponse(
      "User order tidak ditemukan.",
      404
    );
  }

  const before =
    Number(balance.balance || 0);

  const after =
    before + total;

  const result =
    await env.DB.batch([
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
          order.user_id,
          before
        ),

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
           VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          order.user_id,
          total,
          before,
          after,
          reference,
          `Refund order ${orderNumber}`,
          timestamp
        ),

      env.DB
        .prepare(
          `UPDATE orders
           SET
             status = 'REFUNDED',
             updated_at = ?
           WHERE id = ?
             AND status NOT IN (
               'REFUNDED',
               'CANCELLED',
               'FAILED',
               'PENDING'
             )`
        )
        .bind(
          timestamp,
          order.id
        ),

      env.DB
        .prepare(
          `INSERT INTO order_events (
             order_id,
             status,
             message,
             created_at
           )
           VALUES (?, 'REFUNDED', ?, ?)`
        )
        .bind(
          order.id,
          `Refund sebesar ${total} berhasil.`,
          timestamp
        )
    ]);

  if (
    !result?.[0]?.meta?.changes
  ) {
    return errorResponse(
      "Refund gagal karena saldo/order berubah bersamaan.",
      409
    );
  }

  return successResponse({
    message:
      "Refund berhasil.",
    amount: total,
    balance_before: before,
    balance_after: after
  });
}

async function adminGetDeposits(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url =
    new URL(request.url);

  const status =
    cleanString(
      url.searchParams.get("status"),
      30
    ).toUpperCase();

  const limit =
    Math.min(
      parsePositiveInteger(
        url.searchParams.get("limit"),
        50
      ),
      100
    );

  const offset =
    parseNonNegativeInteger(
      url.searchParams.get("offset"),
      0
    );

  let query = `
    SELECT
      d.*,
      u.username,
      u.first_name
    FROM deposits d
    JOIN users u
      ON u.id = d.user_id
  `;

  const values = [];

  if (status) {
    query +=
      " WHERE d.status = ?";

    values.push(status);
  }

  query += `
    ORDER BY d.id DESC
    LIMIT ? OFFSET ?
  `;

  values.push(
    limit,
    offset
  );

  const result =
    await env.DB
      .prepare(query)
      .bind(...values)
      .all();

  return successResponse({
    deposits:
      result.results || [],
    limit,
    offset
  });
}

async function adminGetAnnouncements(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM announcements
         ORDER BY sort_order ASC, id DESC`
      )
      .all();

  return successResponse({
    announcements:
      result.results || []
  });
}

async function adminCreateAnnouncement(request, env) {
  const user = await adminUser(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const title =
    cleanString(
      body?.title,
      200
    );

  const content =
    cleanString(
      body?.content,
      10000
    );

  const type =
    cleanString(
      body?.type || "INFO",
      20
    ).toUpperCase();

  if (
    !title ||
    !content ||
    ![
      "INFO",
      "SUCCESS",
      "WARNING",
      "ERROR"
    ].includes(type)
  ) {
    return errorResponse(
      "Data pengumuman tidak valid.",
      400
    );
  }

  const timestamp =
    nowUnix();

  let expiresAt = null;

  if (
    body?.expires_at !== null &&
    body?.expires_at !== undefined &&
    body?.expires_at !== ""
  ) {
    const value =
      Number(body.expires_at);

    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      return errorResponse(
        "Waktu expired tidak valid.",
        400
      );
    }

    expiresAt = value;
  }

  const result =
    await env.DB
      .prepare(
        `INSERT INTO announcements (
           title,
           content,
           type,
           is_active,
           sort_order,
           created_at,
           updated_at,
           expires_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        title,
        content,
        type,
        Number(body?.is_active) === 0
          ? 0
          : 1,
        parseNonNegativeInteger(
          body?.sort_order,
          0
        ),
        timestamp,
        timestamp,
        expiresAt
      )
      .run();

  return successResponse({
    id:
      result.meta.last_row_id,
    message:
      "Pengumuman berhasil dibuat."
  });
}

async function adminUpdateAnnouncement(request, env) {
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
    path.match(
      /\/announcements\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID pengumuman tidak valid.",
      400
    );
  }

  const body =
    await readJson(request);

  const fields = [];
  const values = [];

  if (body.title !== undefined) {
    fields.push("title = ?");
    values.push(
      cleanString(
        body.title,
        200
      )
    );
  }

  if (body.content !== undefined) {
    fields.push(
      "content = ?"
    );

    values.push(
      cleanString(
        body.content,
        10000
      )
    );
  }

  if (body.type !== undefined) {
    const type =
      cleanString(
        body.type,
        20
      ).toUpperCase();

    if (
      ![
        "INFO",
        "SUCCESS",
        "WARNING",
        "ERROR"
      ].includes(type)
    ) {
      return errorResponse(
        "Tipe pengumuman tidak valid.",
        400
      );
    }

    fields.push("type = ?");
    values.push(type);
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

  if (body.sort_order !== undefined) {
    fields.push(
      "sort_order = ?"
    );

    values.push(
      parseNonNegativeInteger(
        body.sort_order,
        0
      )
    );
  }

  if (body.expires_at !== undefined) {
    let expiresAt = null;

    if (
      body.expires_at !== null &&
      body.expires_at !== ""
    ) {
      const value =
        Number(body.expires_at);

      if (
        !Number.isSafeInteger(value) ||
        value <= 0
      ) {
        return errorResponse(
          "Waktu expired tidak valid.",
          400
        );
      }

      expiresAt = value;
    }

    fields.push(
      "expires_at = ?"
    );

    values.push(expiresAt);
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

  const result =
    await env.DB
      .prepare(
        `UPDATE announcements
         SET ${fields.join(", ")}
         WHERE id = ?`
      )
      .bind(...values)
      .run();

  if (!result.meta.changes) {
    return errorResponse(
      "Pengumuman tidak ditemukan.",
      404
    );
  }

  return successResponse({
    message:
      "Pengumuman berhasil diperbarui."
  });
}

async function adminDeleteAnnouncement(request, env) {
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
    path.match(
      /\/announcements\/(\d+)$/
    );

  const id =
    Number(match?.[1] || 0);

  if (!id) {
    return errorResponse(
      "ID pengumuman tidak valid.",
      400
    );
  }

  const result =
    await env.DB
      .prepare(
        `DELETE FROM announcements
         WHERE id = ?`
      )
      .bind(id)
      .run();

  if (!result.meta.changes) {
    return errorResponse(
      "Pengumuman tidak ditemukan.",
      404
    );
  }

  return successResponse({
    message:
      "Pengumuman berhasil dihapus."
  });
}

async function getPublicAnnouncements(request, env) {
  const timestamp =
    nowUnix();

  const result =
    await env.DB
      .prepare(
        `SELECT
           id,
           title,
           content,
           type,
           created_at,
           expires_at
         FROM announcements
         WHERE is_active = 1
           AND (
             expires_at IS NULL
             OR expires_at > ?
           )
         ORDER BY sort_order ASC, id DESC`
      )
      .bind(timestamp)
      .all();

  return successResponse({
    announcements:
      result.results || []
  });
}

export {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminGetProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminRefundOrder,
  adminGetDeposits,
  adminGetAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  getPublicAnnouncements,
  adminGetVisitorStats
};
