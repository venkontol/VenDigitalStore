import {
  cleanString,
  parsePositiveInteger,
  nowUnix,
  readJson,
  successResponse,
  errorResponse,
  generateOrderNumber
} from "./utils.js";

import {
  requireAuth,
  requireAdmin
} from "./auth.js";

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function validStatus(value) {
  return [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "FAILED"
  ].includes(value);
}

function formatOrder(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    order_number: row.order_number,
    status: row.status,
    subtotal: Number(row.subtotal || 0),
    discount: Number(row.discount || 0),
    total: Number(row.total || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at
  };
}

function formatItem(row) {
  return {
    id: Number(row.id),
    order_id: Number(row.order_id),
    product_id:
      row.product_id === null
        ? null
        : Number(row.product_id),
    product_name: row.product_name,
    quantity: Number(row.quantity || 0),
    unit_price: Number(row.unit_price || 0),
    total_price: Number(row.total_price || 0),
    created_at: row.created_at
  };
}

function formatEvent(row) {
  return {
    id: Number(row.id),
    order_id: Number(row.order_id),
    status: row.status,
    message: row.message,
    created_at: row.created_at
  };
}

function getPathParts(request) {
  const url = new URL(request.url);

  return url.pathname
    .split("/")
    .filter(Boolean);
}

function getOrderIdentifier(request, body = null) {
  const url = new URL(request.url);
  const parts = getPathParts(request);

  const queryId =
    parsePositiveInteger(
      url.searchParams.get("id")
    );

  const bodyId =
    parsePositiveInteger(
      body?.id ??
      body?.order_id
    );

  const queryNumber =
    cleanString(
      url.searchParams.get("order_number"),
      100
    );

  const bodyNumber =
    cleanString(
      body?.order_number,
      100
    );

  const pathOrder =
    parts[0] === "api" &&
    parts[1] === "orders"
      ? parts[2]
      : null;

  const pathId =
    pathOrder &&
    /^\d+$/.test(pathOrder)
      ? parsePositiveInteger(pathOrder)
      : null;

  const pathNumber =
    pathOrder &&
    !/^\d+$/.test(pathOrder)
      ? cleanString(pathOrder, 100)
      : "";

  return {
    id:
      queryId ||
      bodyId ||
      pathId ||
      null,
    orderNumber:
      queryNumber ||
      bodyNumber ||
      pathNumber ||
      ""
  };
}

async function currentUser(request, env) {
  const result =
    await requireAuth(
      request,
      env
    );

  if (result?.response) {
    return {
      user: null,
      response: result.response
    };
  }

  return {
    user: result?.user || null,
    response: null
  };
}

async function currentAdmin(request, env) {
  const result =
    await requireAdmin(
      request,
      env
    );

  if (result?.response) {
    return {
      user: null,
      response: result.response
    };
  }

  return {
    user: result?.user || null,
    response: null
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const merged =
    new Map();

  for (const item of items) {
    const productId =
      parsePositiveInteger(
        item?.product_id ??
        item?.productId
      );

    const quantity =
      parsePositiveInteger(
        item?.quantity ?? 1
      );

    if (!productId || !quantity) {
      continue;
    }

    const current =
      merged.get(productId) || 0;

    const next =
      current + quantity;

    if (next > 100000) {
      return null;
    }

    merged.set(
      productId,
      next
    );
  }

  return Array.from(
    merged.entries()
  ).map(
    ([productId, quantity]) => ({
      productId,
      quantity
    })
  );
}

async function findUserOrder(
  request,
  env,
  userId,
  body = null
) {
  const {
    id,
    orderNumber
  } = getOrderIdentifier(
    request,
    body
  );

  if (!id && !orderNumber) {
    return {
      error: errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      )
    };
  }

  const row =
    id
      ? await env.DB
          .prepare(`
            SELECT
              id,
              user_id,
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
            WHERE id = ?
            AND user_id = ?
            LIMIT 1
          `)
          .bind(
            id,
            userId
          )
          .first()
      : await env.DB
          .prepare(`
            SELECT
              id,
              user_id,
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
            WHERE order_number = ?
            AND user_id = ?
            LIMIT 1
          `)
          .bind(
            orderNumber,
            userId
          )
          .first();

  if (!row) {
    return {
      error: errorResponse(
        "Order tidak ditemukan.",
        404
      )
    };
  }

  return {
    row
  };
}

async function findAnyOrder(
  request,
  env,
  body = null
) {
  const {
    id,
    orderNumber
  } = getOrderIdentifier(
    request,
    body
  );

  if (!id && !orderNumber) {
    return {
      error: errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      )
    };
  }

  const row =
    id
      ? await env.DB
          .prepare(`
            SELECT
              id,
              user_id,
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
            WHERE id = ?
            LIMIT 1
          `)
          .bind(id)
          .first()
      : await env.DB
          .prepare(`
            SELECT
              id,
              user_id,
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
            WHERE order_number = ?
            LIMIT 1
          `)
          .bind(orderNumber)
          .first();

  if (!row) {
    return {
      error: errorResponse(
        "Order tidak ditemukan.",
        404
      )
    };
  }

  return {
    row
  };
}

export async function getOrders(
  request,
  env
) {
  try {
    const auth =
      await currentUser(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const user =
      auth.user;

    const url =
      new URL(request.url);

    const limit =
      Math.min(
        parsePositiveInteger(
          url.searchParams.get("limit")
        ) || 20,
        100
      );

    const offset =
      Math.max(
        Number.parseInt(
          url.searchParams.get("offset") ||
          "0",
          10
        ) || 0,
        0
      );

    const status =
      statusOf(
        url.searchParams.get("status")
      );

    if (
      status &&
      !validStatus(status)
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    let query = `
      SELECT
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
    `;

    const params =
      [user.id];

    if (status) {
      query += `
        AND status = ?
      `;

      params.push(status);
    }

    query += `
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(
      limit,
      offset
    );

    const rows =
      await env.DB
        .prepare(query)
        .bind(...params)
        .all();

    const count =
      await env.DB
        .prepare(
          status
            ? `
              SELECT COUNT(*) AS total
              FROM orders
              WHERE user_id = ?
              AND status = ?
            `
            : `
              SELECT COUNT(*) AS total
              FROM orders
              WHERE user_id = ?
            `
        )
        .bind(
          ...(status
            ? [user.id, status]
            : [user.id])
        )
        .first();

    return successResponse({
      orders:
        (rows.results || [])
          .map(formatOrder),
      pagination: {
        limit,
        offset,
        total:
          Number(
            count?.total || 0
          )
      }
    });
  } catch (error) {
    console.error(
      "getOrders error:",
      error
    );

    return errorResponse(
      "Gagal mengambil order.",
      500
    );
  }
}

export async function getOrder(
  request,
  env
) {
  try {
    const auth =
      await currentUser(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const found =
      await findUserOrder(
        request,
        env,
        auth.user.id
      );

    if (found.error) {
      return found.error;
    }

    const order =
      found.row;

    const items =
      await env.DB
        .prepare(`
          SELECT
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            created_at
          FROM order_items
          WHERE order_id = ?
          ORDER BY id ASC
        `)
        .bind(order.id)
        .all();

    const events =
      await env.DB
        .prepare(`
          SELECT
            id,
            order_id,
            status,
            message,
            created_at
          FROM order_events
          WHERE order_id = ?
          ORDER BY id ASC
        `)
        .bind(order.id)
        .all();

    return successResponse({
      order:
        formatOrder(order),
      items:
        (items.results || [])
          .map(formatItem),
      events:
        (events.results || [])
          .map(formatEvent)
    });
  } catch (error) {
    console.error(
      "getOrder error:",
      error
    );

    return errorResponse(
      "Gagal mengambil detail order.",
      500
    );
  }
}

export async function createOrder(
  request,
  env
) {
  try {
    const auth =
      await currentUser(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const user =
      auth.user;

    const body =
      await readJson(request);

    const items =
      normalizeItems(
        body?.items
      );

    if (items === null) {
      return errorResponse(
        "Jumlah item terlalu besar.",
        400
      );
    }

    if (!items.length) {
      return errorResponse(
        "Item order tidak boleh kosong.",
        400
      );
    }

    const ids =
      items.map(
        item =>
          item.productId
      );

    const placeholders =
      ids.map(
        () => "?"
      ).join(",");

    const products =
      await env.DB
        .prepare(`
          SELECT
            id,
            name,
            price,
            stock,
            is_active
          FROM products
          WHERE id IN (${placeholders})
        `)
        .bind(...ids)
        .all();

    const productMap =
      new Map(
        (products.results || [])
          .map(
            product => [
              Number(product.id),
              product
            ]
          )
      );

    const orderItems =
      [];

    let subtotal =
      0;

    for (const item of items) {
      const product =
        productMap.get(
          item.productId
        );

      if (!product) {
        return errorResponse(
          `Produk ${item.productId} tidak ditemukan.`,
          404
        );
      }

      if (
        Number(product.is_active) !== 1
      ) {
        return errorResponse(
          `Produk ${product.name} sedang tidak aktif.`,
          400
        );
      }

      const price =
        Number(
          product.price || 0
        );

      if (
        !Number.isSafeInteger(price) ||
        price < 0
      ) {
        return errorResponse(
          "Harga produk tidak valid.",
          500
        );
      }

      const stock =
        product.stock === null
          ? null
          : Number(product.stock);

      if (
        stock !== null &&
        (
          !Number.isSafeInteger(stock) ||
          stock < item.quantity
        )
      ) {
        return errorResponse(
          `Stok ${product.name} tidak mencukupi.`,
          400
        );
      }

      const totalPrice =
        price *
        item.quantity;

      if (
        !Number.isSafeInteger(
          totalPrice
        )
      ) {
        return errorResponse(
          "Total harga tidak valid.",
          400
        );
      }

      subtotal +=
        totalPrice;

      if (
        !Number.isSafeInteger(
          subtotal
        )
      ) {
        return errorResponse(
          "Total order terlalu besar.",
          400
        );
      }

      orderItems.push({
        productId:
          item.productId,
        productName:
          String(
            product.name || ""
          ),
        quantity:
          item.quantity,
        unitPrice:
          price,
        totalPrice,
        stock
      });
    }

    const discount =
      0;

    const total =
      subtotal -
      discount;

    if (
      total <= 0 ||
      !Number.isSafeInteger(total)
    ) {
      return errorResponse(
        "Total order tidak valid.",
        400
      );
    }

    const orderNumber =
      generateOrderNumber();

    const createdAt =
      nowUnix();

    const reference =
      `ORDER:${orderNumber}`;

    const statements =
      [];

    statements.push(
      env.DB.prepare(`
        UPDATE users
        SET
          balance = balance - ?,
          updated_at = ?
        WHERE id = ?
        AND is_active = 1
        AND balance >= ?
      `).bind(
        total,
        createdAt,
        user.id,
        total
      )
    );

    statements.push(
      env.DB.prepare(`
        INSERT INTO orders (
          user_id,
          order_number,
          status,
          subtotal,
          discount,
          total,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          'PENDING',
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).bind(
        user.id,
        orderNumber,
        subtotal,
        discount,
        total,
        createdAt,
        createdAt
      )
    );

    statements.push(
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
        SELECT
          ?,
          'purchase',
          ?,
          balance + ?,
          balance,
          ?,
          ?,
          ?
        FROM users
        WHERE id = ?
      `).bind(
        user.id,
        -total,
        total,
        reference,
        `Pembelian ${orderNumber}`,
        createdAt,
        user.id
      )
    );

    for (
      const item of orderItems
    ) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO order_items (
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            created_at
          )
          SELECT
            id,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          FROM orders
          WHERE order_number = ?
          AND user_id = ?
        `).bind(
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.totalPrice,
          createdAt,
          orderNumber,
          user.id
        )
      );
    }

    const stockIndexes =
      [];

    for (
      const item of orderItems
    ) {
      if (
        item.stock === null
      ) {
        continue;
      }

      stockIndexes.push(
        statements.length
      );

      statements.push(
        env.DB.prepare(`
          UPDATE products
          SET
            stock = stock - ?,
            updated_at = ?
          WHERE id = ?
          AND is_active = 1
          AND stock >= ?
        `).bind(
          item.quantity,
          createdAt,
          item.productId,
          item.quantity
        )
      );
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          message,
          created_at
        )
        SELECT
          id,
          'PENDING',
          ?,
          ?
        FROM orders
        WHERE order_number = ?
        AND user_id = ?
      `).bind(
        "Order berhasil dibuat.",
        createdAt,
        orderNumber,
        user.id
      )
    );

    const validationIndex =
      statements.length;

    statements.push(
      env.DB.prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          message,
          created_at
        )
        SELECT
          NULL,
          'FAILED',
          'validation',
          ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM users
          WHERE id = ?
          AND balance >= 0
        )
      `).bind(
        createdAt,
        user.id
      )
    );

    const batch =
      await env.DB.batch(
        statements
      );

    if (
      Number(
        batch[0]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Saldo tidak mencukupi atau akun tidak aktif.",
        409
      );
    }

    if (
      Number(
        batch[1]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Order gagal dibuat.",
        500
      );
    }

    if (
      Number(
        batch[2]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Ledger transaksi gagal dibuat.",
        500
      );
    }

    for (
      const index of stockIndexes
    ) {
      if (
        Number(
          batch[index]?.meta?.changes || 0
        ) !== 1
      ) {
        return errorResponse(
          "Stok berubah. Silakan coba lagi.",
          409
        );
      }
    }

    if (
      !batch[validationIndex]
    ) {
      return errorResponse(
        "Order gagal divalidasi.",
        500
      );
    }

    const createdOrder =
      await env.DB
        .prepare(`
          SELECT
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
          WHERE order_number = ?
          AND user_id = ?
          LIMIT 1
        `)
        .bind(
          orderNumber,
          user.id
        )
        .first();

    return successResponse({
      order:
        formatOrder(
          createdOrder
        ),
      items:
        orderItems.map(
          item => ({
            product_id:
              item.productId,
            product_name:
              item.productName,
            quantity:
              item.quantity,
            unit_price:
              item.unitPrice,
            total_price:
              item.totalPrice
          })
        )
    }, 201);
  } catch (error) {
    console.error(
      "createOrder error:",
      error
    );

    return errorResponse(
      "Gagal membuat order.",
      500
    );
  }
}

export async function cancelOrder(
  request,
  env
) {
  try {
    const auth =
      await currentUser(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const body =
      await readJson(request);

    const found =
      await findUserOrder(
        request,
        env,
        auth.user.id,
        body
      );

    if (found.error) {
      return found.error;
    }

    const order =
      found.row;

    const status =
      statusOf(
        order.status
      );

    if (
      status === "CANCELLED"
    ) {
      return successResponse({
        order:
          formatOrder(order),
        message:
          "Order sudah dibatalkan."
      });
    }

    if (
      status !== "PENDING"
    ) {
      return errorResponse(
        "Order tidak dapat dibatalkan pada status saat ini.",
        400
      );
    }

    const timestamp =
      nowUnix();

    const reference =
      `ORDER_REFUND:${order.order_number}`;

    const statements = [
      env.DB.prepare(`
        UPDATE users
        SET
          balance = balance + ?,
          updated_at = ?
        WHERE id = ?
        AND is_active = 1
        AND EXISTS (
          SELECT 1
          FROM orders
          WHERE id = ?
          AND user_id = ?
          AND status = 'PENDING'
        )
      `).bind(
        Number(order.total),
        timestamp,
        auth.user.id,
        order.id,
        auth.user.id
      ),

      env.DB.prepare(`
        UPDATE orders
        SET
          status = 'CANCELLED',
          updated_at = ?,
          cancelled_at = ?
        WHERE id = ?
        AND user_id = ?
        AND status = 'PENDING'
      `).bind(
        timestamp,
        timestamp,
        order.id,
        auth.user.id
      ),

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
        SELECT
          ?,
          'refund',
          ?,
          balance - ?,
          balance,
          ?,
          ?,
          ?
        FROM users
        WHERE id = ?
      `).bind(
        auth.user.id,
        Number(order.total),
        Number(order.total),
        reference,
        `Refund order ${order.order_number}`,
        timestamp,
        auth.user.id
      ),

      env.DB.prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          message,
          created_at
        )
        VALUES (
          ?,
          'CANCELLED',
          ?,
          ?
        )
      `).bind(
        order.id,
        "Order dibatalkan.",
        timestamp
      )
    ];

    await env.DB.batch(
      statements
    );

    const updated =
      await env.DB
        .prepare(`
          SELECT
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
          WHERE id = ?
          AND user_id = ?
          LIMIT 1
        `)
        .bind(
          order.id,
          auth.user.id
        )
        .first();

    if (
      statusOf(
        updated?.status
      ) !== "CANCELLED"
    ) {
      return errorResponse(
        "Order berubah sebelum dibatalkan.",
        409
      );
    }

    return successResponse({
      order:
        formatOrder(updated),
      message:
        "Order berhasil dibatalkan dan saldo dikembalikan."
    });
  } catch (error) {
    console.error(
      "cancelOrder error:",
      error
    );

    return errorResponse(
      "Gagal membatalkan order.",
      500
    );
  }
}

export async function adminGetOrders(
  request,
  env
) {
  try {
    const auth =
      await currentAdmin(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const url =
      new URL(request.url);

    const limit =
      Math.min(
        parsePositiveInteger(
          url.searchParams.get("limit")
        ) || 50,
        200
      );

    const offset =
      Math.max(
        Number.parseInt(
          url.searchParams.get("offset") ||
          "0",
          10
        ) || 0,
        0
      );

    const status =
      statusOf(
        url.searchParams.get("status")
      );

    if (
      status &&
      !validStatus(status)
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    let query = `
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
      INNER JOIN users u
        ON u.id = o.user_id
      WHERE 1 = 1
    `;

    const params = [];

    if (status) {
      query += `
        AND o.status = ?
      `;

      params.push(status);
    }

    query += `
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(
      limit,
      offset
    );

    const rows =
      await env.DB
        .prepare(query)
        .bind(...params)
        .all();

    const total =
      await env.DB
        .prepare(
          status
            ? `
              SELECT COUNT(*) AS total
              FROM orders
              WHERE status = ?
            `
            : `
              SELECT COUNT(*) AS total
              FROM orders
            `
        )
        .bind(
          ...(status
            ? [status]
            : [])
        )
        .first();

    return successResponse({
      orders:
        (rows.results || [])
          .map(
            row => ({
              ...formatOrder(row),
              user_id:
                Number(row.user_id),
              username:
                row.username,
              first_name:
                row.first_name
            })
          ),
      pagination: {
        limit,
        offset,
        total:
          Number(
            total?.total || 0
          )
      }
    });
  } catch (error) {
    console.error(
      "adminGetOrders error:",
      error
    );

    return errorResponse(
      "Gagal mengambil daftar order.",
      500
    );
  }
}

const transitions = {
  PENDING: [
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "FAILED"
  ],
  PROCESSING: [
    "COMPLETED",
    "CANCELLED",
    "FAILED"
  ],
  COMPLETED: [
    "REFUNDED"
  ],
  CANCELLED: [],
  REFUNDED: [],
  FAILED: []
};

async function refundCompletedOrder(
  order,
  message,
  env
) {
  const timestamp =
    nowUnix();

  const reference =
    `ORDER_REFUND:${order.order_number}`;

  const statements = [
    env.DB.prepare(`
      UPDATE users
      SET
        balance = balance + ?,
        updated_at = ?
      WHERE id = ?
      AND is_active = 1
    `).bind(
      Number(order.total),
      timestamp,
      order.user_id
    ),

    env.DB.prepare(`
      UPDATE orders
      SET
        status = 'REFUNDED',
        updated_at = ?
      WHERE id = ?
      AND status = 'COMPLETED'
    `).bind(
      timestamp,
      order.id
    ),

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
      SELECT
        ?,
        'refund',
        ?,
        balance - ?,
        balance,
        ?,
        ?,
        ?
      FROM users
      WHERE id = ?
    `).bind(
      order.user_id,
      Number(order.total),
      Number(order.total),
      reference,
      `Refund order ${order.order_number}`,
      timestamp,
      order.user_id
    ),

    env.DB.prepare(`
      INSERT INTO order_events (
        order_id,
        status,
        message,
        created_at
      )
      VALUES (
        ?,
        'REFUNDED',
        ?,
        ?
      )
    `).bind(
      order.id,
      message ||
        "Order berhasil direfund.",
      timestamp
    )
  ];

  await env.DB.batch(
    statements
  );

  const updated =
    await env.DB
      .prepare(`
        SELECT
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
        WHERE id = ?
        LIMIT 1
      `)
      .bind(order.id)
      .first();

  if (
    statusOf(
      updated?.status
    ) !== "REFUNDED"
  ) {
    return errorResponse(
      "Order berubah sebelum refund selesai.",
      409
    );
  }

  return successResponse({
    order:
      formatOrder(updated),
    message:
      "Order berhasil direfund."
  });
}

export async function adminUpdateOrderStatus(
  request,
  env
) {
  try {
    const auth =
      await currentAdmin(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const body =
      await readJson(request);

    const found =
      await findAnyOrder(
        request,
        env,
        body
      );

    if (found.error) {
      return found.error;
    }

    const order =
      found.row;

    const nextStatus =
      statusOf(
        body?.status
      );

    if (
      !validStatus(nextStatus)
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    const currentStatus =
      statusOf(
        order.status
      );

    if (
      currentStatus ===
      nextStatus
    ) {
      return successResponse({
        message:
          "Status order sudah sesuai.",
        order:
          formatOrder(order)
      });
    }

    if (
      !transitions[
        currentStatus
      ]?.includes(
        nextStatus
      )
    ) {
      return errorResponse(
        `Perubahan status ${currentStatus} ke ${nextStatus} tidak diizinkan.`,
        400
      );
    }

    const message =
      cleanString(
        body?.message ||
          `Status order diubah menjadi ${nextStatus}.`,
        500
      );

    if (
      nextStatus ===
      "REFUNDED"
    ) {
      return refundCompletedOrder(
        order,
        message,
        env
      );
    }

    const timestamp =
      nowUnix();

    const completedAt =
      nextStatus ===
      "COMPLETED"
        ? timestamp
        : null;

    const cancelledAt =
      nextStatus ===
      "CANCELLED"
        ? timestamp
        : null;

    const update =
      await env.DB
        .prepare(`
          UPDATE orders
          SET
            status = ?,
            updated_at = ?,
            completed_at = ?,
            cancelled_at = ?
          WHERE id = ?
          AND status = ?
        `)
        .bind(
          nextStatus,
          timestamp,
          completedAt,
          cancelledAt,
          order.id,
          currentStatus
        )
        .run();

    if (
      Number(
        update?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Order berubah sebelum status diperbarui.",
        409
      );
    }

    try {
      await env.DB
        .prepare(`
          INSERT INTO order_events (
            order_id,
            status,
            message,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `)
        .bind(
          order.id,
          nextStatus,
          message,
          timestamp
        )
        .run();
    } catch (eventError) {
      await env.DB
        .prepare(`
          UPDATE orders
          SET
            status = ?,
            updated_at = ?,
            completed_at = ?,
            cancelled_at = ?
          WHERE id = ?
        `)
        .bind(
          currentStatus,
          timestamp,
          order.completed_at || null,
          order.cancelled_at || null,
          order.id
        )
        .run();

      throw eventError;
    }

    const updated =
      await env.DB
        .prepare(`
          SELECT
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
          WHERE id = ?
          LIMIT 1
        `)
        .bind(order.id)
        .first();

    return successResponse({
      order:
        formatOrder(updated),
      message:
        "Status order berhasil diperbarui."
    });
  } catch (error) {
    console.error(
      "adminUpdateOrderStatus error:",
      error
    );

    return errorResponse(
      "Gagal memperbarui status order.",
      500
    );
  }
}

export async function adminRefundOrder(
  request,
  env
) {
  try {
    const auth =
      await currentAdmin(
        request,
        env
      );

    if (auth.response) {
      return auth.response;
    }

    const body =
      await readJson(request);

    const found =
      await findAnyOrder(
        request,
        env,
        body
      );

    if (found.error) {
      return found.error;
    }

    const order =
      found.row;

    const status =
      statusOf(
        order.status
      );

    if (
      status === "REFUNDED"
    ) {
      return successResponse({
        message:
          "Order sudah direfund.",
        order:
          formatOrder(order)
      });
    }

    if (
      status !== "COMPLETED"
    ) {
      return errorResponse(
        "Hanya order COMPLETED yang dapat direfund.",
        400
      );
    }

    const message =
      cleanString(
        body?.message ||
          "Order direfund oleh admin.",
        500
      );

    return refundCompletedOrder(
      order,
      message,
      env
    );
  } catch (error) {
    console.error(
      "adminRefundOrder error:",
      error
    );

    return errorResponse(
      "Gagal melakukan refund order.",
      500
    );
  }
}