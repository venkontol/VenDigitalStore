import {
  errorResponse,
  successResponse,
  cleanString,
  parsePositiveInteger,
  nowUnix,
  generateOrderNumber
} from "./utils.js";
import { getCurrentUser } from "./auth.js";

export async function createOrder(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const body = await request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!items.length) {
    return errorResponse("Keranjang belanja kosong.", 400);
  }

  if (items.length > 50) {
    return errorResponse("Jumlah produk dalam satu pesanan terlalu banyak.", 400);
  }

  const normalizedItems = [];
  const requestedIds = new Map();

  for (const item of items) {
    const productId = parsePositiveInteger(item?.product_id);
    const quantity = parsePositiveInteger(item?.quantity);

    if (!productId || !quantity) {
      return errorResponse("Data item pesanan tidak valid.", 400);
    }

    if (quantity > 100000) {
      return errorResponse("Jumlah produk terlalu besar.", 400);
    }

    requestedIds.set(
      productId,
      (requestedIds.get(productId) || 0) + quantity
    );
  }

  const productIds = [...requestedIds.keys()];
  const placeholders = productIds.map(() => "?").join(",");

  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.name,
      p.price,
      p.stock,
      p.is_active
    FROM products p
    WHERE p.id IN (${placeholders})
  `).bind(...productIds).all();

  const products = new Map(
    (result.results || []).map(product => [
      Number(product.id),
      product
    ])
  );

  for (const productId of productIds) {
    const product = products.get(productId);

    if (!product || Number(product.is_active) !== 1) {
      return errorResponse(
        `Produk dengan ID ${productId} tidak tersedia.`,
        400
      );
    }

    const quantity = requestedIds.get(productId);
    const stock = product.stock === null ? null : Number(product.stock);

    if (stock !== null && stock < quantity) {
      return errorResponse(
        `Stok ${product.name} tidak mencukupi.`,
        400
      );
    }

    normalizedItems.push({
      product_id: productId,
      product_name: product.name,
      quantity,
      unit_price: Number(product.price || 0),
      total_price: Number(product.price || 0) * quantity,
      stock
    });
  }

  const subtotal = normalizedItems.reduce(
    (sum, item) => sum + item.total_price,
    0
  );

  const discount = 0;
  const total = subtotal - discount;

  if (total < 0) {
    return errorResponse("Total pesanan tidak valid.", 400);
  }

  const orderNumber = generateOrderNumber();
  const timestamp = nowUnix();

  const statements = [];

  statements.push(
    env.DB.prepare(`
      UPDATE users
      SET balance = balance - ?,
          updated_at = ?
      WHERE id = ?
        AND is_active = 1
        AND balance >= ?
    `).bind(total, timestamp, user.id, total)
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
      VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?)
    `).bind(
      user.id,
      orderNumber,
      subtotal,
      discount,
      total,
      timestamp,
      timestamp
    )
  );

  const batchResult = await env.DB.batch(statements);

  const balanceUpdate = batchResult[0];
  const orderInsert = batchResult[1];

  if (!balanceUpdate?.meta?.changes) {
    return errorResponse("Saldo tidak mencukupi.", 400);
  }

  if (!orderInsert?.meta?.last_row_id) {
    return errorResponse("Pesanan gagal dibuat.", 500);
  }

  const orderId = Number(orderInsert.meta.last_row_id);

  const itemStatements = normalizedItems.map(item =>
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      item.product_id,
      item.product_name,
      item.quantity,
      item.unit_price,
      item.total_price,
      timestamp
    )
  );

  itemStatements.push(
    env.DB.prepare(`
      INSERT INTO order_events (
        order_id,
        status,
        message,
        created_at
      )
      VALUES (?, 'PENDING', ?, ?)
    `).bind(
      orderId,
      "Pesanan berhasil dibuat dan menunggu diproses.",
      timestamp
    )
  );

  await env.DB.batch(itemStatements);

  const walletTransactionId = await createPurchaseTransaction(
    env,
    user.id,
    total,
    user.balance,
    user.balance - total,
    orderNumber,
    timestamp
  );

  await env.DB.prepare(`
    UPDATE orders
    SET updated_at = ?
    WHERE id = ?
  `).bind(timestamp, orderId).run();

  return successResponse({
    order: {
      id: orderId,
      order_number: orderNumber,
      status: "PENDING",
      subtotal,
      discount,
      total,
      wallet_transaction_id: walletTransactionId,
      created_at: timestamp
    }
  }, 201);
}

export async function getOrders(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
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

  const status = cleanString(
    url.searchParams.get("status"),
    30
  ).toUpperCase();

  const conditions = ["o.user_id = ?"];
  const bindings = [user.id];

  if ([
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "FAILED"
  ].includes(status)) {
    conditions.push("o.status = ?");
    bindings.push(status);
  }

  const where = conditions.join(" AND ");

  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM orders o
    WHERE ${where}
  `).bind(...bindings).first();

  const result = await env.DB.prepare(`
    SELECT
      o.id,
      o.order_number,
      o.status,
      o.subtotal,
      o.discount,
      o.total,
      o.created_at,
      o.updated_at,
      o.completed_at,
      o.cancelled_at,
      COUNT(oi.id) AS item_count
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE ${where}
    GROUP BY o.id
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  const total = Number(count?.total || 0);

  return successResponse({
    orders: (result.results || []).map(formatOrder),
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + (result.results || []).length < total
    }
  });
}

export async function getOrder(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  const numberParam = cleanString(
    url.searchParams.get("order_number"),
    100
  );

  let order;

  if (idParam) {
    const id = parsePositiveInteger(idParam);

    if (!id) {
      return errorResponse("ID pesanan tidak valid.", 400);
    }

    order = await env.DB.prepare(`
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
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `).bind(id, user.id).first();
  } else if (numberParam) {
    order = await env.DB.prepare(`
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
      WHERE order_number = ? AND user_id = ?
      LIMIT 1
    `).bind(numberParam, user.id).first();
  } else {
    return errorResponse(
      "ID atau nomor pesanan wajib diisi.",
      400
    );
  }

  if (!order) {
    return errorResponse("Pesanan tidak ditemukan.", 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      created_at
    FROM order_items
    WHERE order_id = ?
    ORDER BY id ASC
  `).bind(order.id).all();

  const events = await env.DB.prepare(`
    SELECT
      id,
      status,
      message,
      created_at
    FROM order_events
    WHERE order_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(order.id).all();

  return successResponse({
    order: {
      ...formatOrder(order),
      items: (items.results || []).map(item => ({
        id: Number(item.id),
        product_id: item.product_id === null ? null : Number(item.product_id),
        product_name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        created_at: Number(item.created_at)
      })),
      events: (events.results || []).map(event => ({
        id: Number(event.id),
        status: event.status,
        message: event.message || "",
        created_at: Number(event.created_at)
      }))
    }
  });
}

export async function cancelOrder(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const body = await request.json().catch(() => null);
  const id = parsePositiveInteger(body?.order_id);

  if (!id) {
    return errorResponse("order_id tidak valid.", 400);
  }

  const order = await env.DB.prepare(`
    SELECT
      id,
      order_number,
      status,
      total
    FROM orders
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `).bind(id, user.id).first();

  if (!order) {
    return errorResponse("Pesanan tidak ditemukan.", 404);
  }

  if (order.status !== "PENDING") {
    return errorResponse(
      "Pesanan ini tidak dapat dibatalkan.",
      400
    );
  }

  const timestamp = nowUnix();
  const refundReference = `REFUND:${order.order_number}`;

  const existingRefund = await env.DB.prepare(`
    SELECT id
    FROM balance_transactions
    WHERE reference = ?
    LIMIT 1
  `).bind(refundReference).first();

  if (existingRefund) {
    await env.DB.prepare(`
      UPDATE orders
      SET status = 'REFUNDED',
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(timestamp, id, user.id).run();

    return successResponse({
      order_id: id,
      status: "REFUNDED"
    });
  }

  const currentUser = await env.DB.prepare(`
    SELECT balance
    FROM users
    WHERE id = ? AND is_active = 1
    LIMIT 1
  `).bind(user.id).first();

  if (!currentUser) {
    return errorResponse("User tidak ditemukan.", 404);
  }

  const balanceBefore = Number(currentUser.balance || 0);
  const balanceAfter = balanceBefore + Number(order.total || 0);

  const result = await env.DB.batch([
    env.DB.prepare(`
      UPDATE users
      SET balance = balance + ?,
          updated_at = ?
      WHERE id = ? AND is_active = 1
    `).bind(Number(order.total || 0), timestamp, user.id),

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
      user.id,
      Number(order.total || 0),
      balanceBefore,
      balanceAfter,
      refundReference,
      `Refund pesanan ${order.order_number}`,
      timestamp
    ),

    env.DB.prepare(`
      UPDATE orders
      SET status = 'REFUNDED',
          updated_at = ?,
          cancelled_at = ?
      WHERE id = ?
        AND user_id = ?
        AND status = 'PENDING'
    `).bind(timestamp, timestamp, id, user.id),

    env.DB.prepare(`
      INSERT INTO order_events (
        order_id,
        status,
        message,
        created_at
      )
      VALUES (?, 'REFUNDED', ?, ?)
    `).bind(
      id,
      "Pesanan dibatalkan dan saldo dikembalikan.",
      timestamp
    )
  ]);

  if (!result?.[2]?.meta?.changes) {
    return errorResponse(
      "Pesanan sudah berubah atau tidak dapat dibatalkan.",
      409
    );
  }

  return successResponse({
    order_id: id,
    order_number: order.order_number,
    status: "REFUNDED",
    refunded_amount: Number(order.total || 0)
  });
}

async function createPurchaseTransaction(
  env,
  userId,
  amount,
  balanceBefore,
  balanceAfter,
  reference,
  timestamp
) {
  const result = await env.DB.prepare(`
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
    VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    -Math.abs(amount),
    balanceBefore,
    balanceAfter,
    `ORDER:${reference}`,
    `Pembayaran pesanan ${reference}`,
    timestamp
  ).run();

  return Number(result?.meta?.last_row_id || 0);
}

function formatOrder(order) {
  return {
    id: Number(order.id),
    order_number: order.order_number,
    status: order.status,
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    total: Number(order.total || 0),
    item_count: Number(order.item_count || 0),
    created_at: Number(order.created_at || 0),
    updated_at: Number(order.updated_at || 0),
    completed_at: order.completed_at === null
      ? null
      : Number(order.completed_at),
    cancelled_at: order.cancelled_at === null
      ? null
      : Number(order.cancelled_at)
  };
  }
