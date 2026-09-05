import {
  cleanString,
  parsePositiveInteger,
  nowUnix,
  readJson,
  successResponse,
  errorResponse,
  makeOrderNumber
} from "./utils.js";

import {
  requireAuth
} from "./auth.js";

async function createOrder(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const body =
    await readJson(request);

  const rawItems =
    Array.isArray(body?.items)
      ? body.items
      : [];

  if (!rawItems.length) {
    return errorResponse(
      "Keranjang masih kosong.",
      400
    );
  }

  const items = [];

  for (const item of rawItems) {
    const productId =
      parsePositiveInteger(
        item?.product_id,
        0
      );

    const quantity =
      parsePositiveInteger(
        item?.quantity,
        0
      );

    if (
      !productId ||
      !quantity ||
      quantity > 100
    ) {
      return errorResponse(
        "Data produk atau jumlah tidak valid.",
        400
      );
    }

    items.push({
      productId,
      quantity
    });
  }

  const merged =
    new Map();

  for (const item of items) {
    merged.set(
      item.productId,
      (merged.get(item.productId) || 0) +
        item.quantity
    );
  }

  const normalizedItems =
    Array.from(
      merged,
      ([productId, quantity]) => ({
        productId,
        quantity
      })
    );

  if (
    normalizedItems.some(
      item => item.quantity > 100
    )
  ) {
    return errorResponse(
      "Jumlah produk terlalu banyak.",
      400
    );
  }

  const productIds =
    normalizedItems.map(
      item => item.productId
    );

  const placeholders =
    productIds
      .map(() => "?")
      .join(",");

  const productResult =
    await env.DB
      .prepare(
        `SELECT
           id,
           category_id,
           name,
           slug,
           description,
           price,
           stock,
           image_url,
           is_active
         FROM products
         WHERE id IN (${placeholders})
           AND is_active = 1`
      )
      .bind(...productIds)
      .all();

  const products =
    productResult.results || [];

  if (
    products.length !==
    productIds.length
  ) {
    return errorResponse(
      "Salah satu produk sudah tidak tersedia.",
      409
    );
  }

  const productMap =
    new Map(
      products.map(
        product => [
          Number(product.id),
          product
        ]
      )
    );

  let subtotal = 0;

  const orderItems = [];

  for (const item of normalizedItems) {
    const product =
      productMap.get(
        item.productId
      );

    if (!product) {
      return errorResponse(
        "Produk tidak ditemukan.",
        404
      );
    }

    const price =
      Number(product.price || 0);

    if (
      !Number.isSafeInteger(price) ||
      price < 0
    ) {
      return errorResponse(
        "Harga produk tidak valid.",
        500
      );
    }

    if (
      product.stock !== null &&
      Number(product.stock) <
        item.quantity
    ) {
      return errorResponse(
        `Stok ${product.name} tidak mencukupi.`,
        409
      );
    }

    const totalPrice =
      price * item.quantity;

    if (
      !Number.isSafeInteger(
        totalPrice
      )
    ) {
      return errorResponse(
        "Total harga terlalu besar.",
        400
      );
    }

    subtotal += totalPrice;

    if (
      !Number.isSafeInteger(subtotal)
    ) {
      return errorResponse(
        "Total order tidak valid.",
        400
      );
    }

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: price,
      totalPrice
    });
  }

  const discount =
    Number(body?.discount || 0);

  if (
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > subtotal
  ) {
    return errorResponse(
      "Diskon tidak valid.",
      400
    );
  }

  const total =
    subtotal - discount;

  if (
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    return errorResponse(
      "Total order tidak valid.",
      400
    );
  }

  if (total <= 0) {
    return errorResponse(
      "Total order harus lebih dari 0.",
      400
    );
  }

  const orderNumber =
    makeOrderNumber();

  const timestamp =
    nowUnix();

  const balance =
    await env.DB
      .prepare(
        `SELECT balance
         FROM users
         WHERE id = ?`
      )
      .bind(user.id)
      .first();

  if (!balance) {
    return errorResponse(
      "User tidak ditemukan.",
      404
    );
  }

  const before =
    Number(balance.balance || 0);

  if (
    before < total
  ) {
    return errorResponse(
      "Saldo tidak mencukupi.",
      400
    );
  }

  const after =
    before - total;

  const transactionReference =
    `ORDER:${orderNumber}`;

  const statements = [];

  statements.push(
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
        user.id,
        before,
        total
      )
  );

  statements.push(
    env.DB
      .prepare(
        `INSERT INTO orders (
           user_id,
           order_number,
           status,
           subtotal,
           discount,
           total,
           created_at,
           updated_at
         )
         VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        orderNumber,
        subtotal,
        discount,
        total,
        timestamp,
        timestamp
      )
  );

  const orderItemsSql =
    orderItems.map(
      item => ({
        productId:
          item.productId,
        productName:
          item.productName,
        quantity:
          item.quantity,
        unitPrice:
          item.unitPrice,
        totalPrice:
          item.totalPrice
      })
    );

  const orderInsert =
    await env.DB
      .prepare(
        `SELECT id
         FROM orders
         WHERE order_number = ?`
      )
      .bind(orderNumber)
      .first();

  if (orderInsert) {
    return errorResponse(
      "Order gagal dibuat.",
      409
    );
  }

  const updateStatements =
    [];

  for (const item of orderItemsSql) {
    if (
      item.quantity <= 0
    ) {
      return errorResponse(
        "Jumlah item tidak valid.",
        400
      );
    }

    if (
      productMap.get(
        Number(item.productId)
      )?.stock !== null
    ) {
      updateStatements.push(
        env.DB
          .prepare(
            `UPDATE products
             SET
               stock = stock - ?,
               updated_at = ?
             WHERE id = ?
               AND is_active = 1
               AND stock IS NOT NULL
               AND stock >= ?`
          )
          .bind(
            item.quantity,
            timestamp,
            item.productId,
            item.quantity
          )
      );
    }
  }

  const baseResults =
    await env.DB.batch(
      statements
    );

  const balanceChanged =
    Number(
      baseResults?.[0]?.meta?.changes || 0
    );

  if (!balanceChanged) {
    return errorResponse(
      "Saldo berubah bersamaan. Silakan coba lagi.",
      409
    );
  }

  const orderChanged =
    Number(
      baseResults?.[1]?.meta?.changes || 0
    );

  if (!orderChanged) {
    await env.DB
      .prepare(
        `UPDATE users
         SET
           balance = balance + ?,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(
        total,
        timestamp,
        user.id
      )
      .run();

    return errorResponse(
      "Order gagal dibuat.",
      500
    );
  }

  const createdOrder =
    await env.DB
      .prepare(
        `SELECT id
         FROM orders
         WHERE order_number = ?`
      )
      .bind(orderNumber)
      .first();

  if (!createdOrder) {
    return errorResponse(
      "Order berhasil diproses tetapi ID order tidak ditemukan.",
      500
    );
  }

  const orderId =
    Number(createdOrder.id);

  const itemStatements =
    orderItemsSql.map(
      item =>
        env.DB
          .prepare(
            `INSERT INTO order_items (
               order_id,
               product_id,
               product_name,
               quantity,
               unit_price,
               total_price,
               created_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            orderId,
            item.productId,
            item.productName,
            item.quantity,
            item.unitPrice,
            item.totalPrice,
            timestamp
          )
    );

  const eventStatement =
    env.DB
      .prepare(
        `INSERT INTO order_events (
           order_id,
           status,
           message,
           created_at
         )
         VALUES (?, 'PENDING', ?, ?)`
      )
      .bind(
        orderId,
        "Order berhasil dibuat.",
        timestamp
      );

  const walletStatement =
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
         VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        -total,
        before,
        after,
        transactionReference,
        `Pembelian ${orderNumber}`,
        timestamp
      );

  const stockStatements =
    updateStatements;

  try {
    await env.DB.batch([
      ...stockStatements,
      ...itemStatements,
      eventStatement,
      walletStatement
    ]);
  } catch (error) {
    await env.DB
      .batch([
        env.DB
          .prepare(
            `DELETE FROM order_events
             WHERE order_id = ?`
          )
          .bind(orderId),

        env.DB
          .prepare(
            `DELETE FROM order_items
             WHERE order_id = ?`
          )
          .bind(orderId),

        env.DB
          .prepare(
            `DELETE FROM orders
             WHERE id = ?`
          )
          .bind(orderId),

        env.DB
          .prepare(
            `UPDATE users
             SET
               balance = balance + ?,
               updated_at = ?
             WHERE id = ?`
          )
          .bind(
            total,
            timestamp,
            user.id
          )
      ])
      .catch(() => {});

    throw error;
  }

  return successResponse({
    order: {
      id: orderId,
      order_number:
        orderNumber,
      status:
        "PENDING",
      subtotal,
      discount,
      total,
      balance_before:
        before,
      balance_after:
        after,
      items:
        orderItemsSql
    }
  }, 201);
}

async function getOrders(request, env) {
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
      parsePositiveInteger(
        url.searchParams.get("limit"),
        20
      ),
      50
    );

  const offset =
    Math.max(
      Number(
        url.searchParams.get("offset") || 0
      ),
      0
    );

  const status =
    cleanString(
      url.searchParams.get("status"),
      30
    ).toUpperCase();

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

  const values = [
    user.id
  ];

  if (status) {
    query +=
      " AND status = ?";

    values.push(status);
  }

  query += `
    ORDER BY id DESC
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

async function getOrder(request, env) {
  const user = await requireAuth(
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

  const order =
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
           AND order_number = ?`
      )
      .bind(
        user.id,
        orderNumber
      )
      .first();

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  const [
    items,
    events
  ] = await Promise.all([
    env.DB
      .prepare(
        `SELECT
           id,
           product_id,
           product_name,
           quantity,
           unit_price,
           total_price,
           created_at
         FROM order_items
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .bind(order.id)
      .all(),

    env.DB
      .prepare(
        `SELECT
           id,
           status,
           message,
           created_at
         FROM order_events
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .bind(order.id)
      .all()
  ]);

  return successResponse({
    order: {
      ...order,
      items:
        items.results || [],
      events:
        events.results || []
    }
  });
}

async function cancelOrder(request, env) {
  const user = await requireAuth(
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
      /\/orders\/([^/]+)\/cancel$/
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
         WHERE user_id = ?
           AND order_number = ?`
      )
      .bind(
        user.id,
        orderNumber
      )
      .first();

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    ![
      "PENDING",
      "PROCESSING"
    ].includes(order.status)
  ) {
    return errorResponse(
      "Order tidak dapat dibatalkan.",
      409
    );
  }

  const total =
    Number(order.total || 0);

  const timestamp =
    nowUnix();

  const reference =
    `CANCEL_REFUND:${order.id}`;

  const balance =
    await env.DB
      .prepare(
        `SELECT balance
         FROM users
         WHERE id = ?`
      )
      .bind(user.id)
      .first();

  if (!balance) {
    return errorResponse(
      "User tidak ditemukan.",
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
          `UPDATE orders
           SET
             status = 'CANCELLED',
             updated_at = ?,
             cancelled_at = ?
           WHERE id = ?
             AND user_id = ?
             AND status IN (
               'PENDING',
               'PROCESSING'
             )`
        )
        .bind(
          timestamp,
          timestamp,
          order.id,
          user.id
        ),

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
          user.id,
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
          user.id,
          total,
          before,
          after,
          reference,
          `Refund pembatalan ${orderNumber}`,
          timestamp
        ),

      env.DB
        .prepare(
          `INSERT INTO order_events (
             order_id,
             status,
             message,
             created_at
           )
           VALUES (?, 'CANCELLED', ?, ?)`
        )
        .bind(
          order.id,
          "Order dibatalkan dan saldo dikembalikan.",
          timestamp
        )
    ]);

  if (
    !result?.[0]?.meta?.changes
  ) {
    return errorResponse(
      "Order sudah berubah. Silakan refresh.",
      409
    );
  }

  if (
    !result?.[1]?.meta?.changes
  ) {
    return errorResponse(
      "Saldo gagal dikembalikan.",
      409
    );
  }

  return successResponse({
    message:
      "Order berhasil dibatalkan.",
    amount:
      total,
    balance_before:
      before,
    balance_after:
      after
  });
}

function formatOrder(order, items = [], events = []) {
  return {
    id:
      Number(order.id),
    order_number:
      order.order_number,
    status:
      order.status,
    subtotal:
      Number(order.subtotal || 0),
    discount:
      Number(order.discount || 0),
    total:
      Number(order.total || 0),
    created_at:
      order.created_at,
    updated_at:
      order.updated_at,
    completed_at:
      order.completed_at,
    cancelled_at:
      order.cancelled_at,
    items,
    events
  };
}

export {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
  formatOrder
};
