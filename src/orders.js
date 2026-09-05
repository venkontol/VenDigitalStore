import {
  cleanString,
  parsePositiveInteger,
  nowUnix,
  readJson,
  successResponse,
  errorResponse,
  generateOrderNumber
} from "./utils.js";

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const result = [];

  for (const item of items) {
    const productId = parsePositiveInteger(
      item?.product_id ?? item?.productId
    );

    const quantity = parsePositiveInteger(
      item?.quantity ?? 1
    );

    if (!productId || !quantity) {
      continue;
    }

    result.push({
      productId,
      quantity
    });
  }

  return result;
}

function getOrderStatus(status) {
  return String(status || "")
    .trim()
    .toUpperCase();
}

function isValidOrderStatus(status) {
  return [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
    "REFUNDED",
    "FAILED"
  ].includes(status);
}

function formatOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
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

function formatOrderItem(row) {
  return {
    id: row.id,
    order_id: row.order_id,
    product_id: row.product_id,
    product_name: row.product_name,
    quantity: Number(row.quantity || 0),
    unit_price: Number(row.unit_price || 0),
    total_price: Number(row.total_price || 0),
    created_at: row.created_at
  };
}

function formatOrderEvent(row) {
  return {
    id: row.id,
    order_id: row.order_id,
    status: row.status,
    message: row.message,
    created_at: row.created_at
  };
}

async function requireUser(request, env) {
  const session = await import("./auth.js");

  if (typeof session.requireAuth !== "function") {
    throw new Error("Fungsi autentikasi tidak tersedia.");
  }

  return session.requireAuth(request, env);
}

async function requireAdministrator(request, env) {
  const session = await import("./auth.js");

  if (typeof session.requireAdmin !== "function") {
    throw new Error("Fungsi admin tidak tersedia.");
  }

  return session.requireAdmin(request, env);
}

export async function getOrders(request, env) {
  try {
    const user = await requireUser(request, env);
    const url = new URL(request.url);

    const limitRaw =
      url.searchParams.get("limit") || "20";

    const offsetRaw =
      url.searchParams.get("offset") || "0";

    const limit =
      Math.min(
        parsePositiveInteger(limitRaw) || 20,
        100
      );

    const offset =
      Math.max(
        Number.parseInt(offsetRaw, 10) || 0,
        0
      );

    const status =
      getOrderStatus(
        url.searchParams.get("status")
      );

    if (
      status &&
      !isValidOrderStatus(status)
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

    const params = [user.id];

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

    params.push(limit, offset);

    const result =
      await env.DB
        .prepare(query)
        .bind(...params)
        .all();

    const countQuery =
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
        `;

    const countParams =
      status
        ? [user.id, status]
        : [user.id];

    const count =
      await env.DB
        .prepare(countQuery)
        .bind(...countParams)
        .first();

    return successResponse({
      orders: (result.results || []).map(
        formatOrder
      ),
      pagination: {
        limit,
        offset,
        total: Number(count?.total || 0)
      }
    });
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Unauthorized.",
        error.status
      );
    }

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

export async function getOrder(request, env) {
  try {
    const user = await requireUser(
      request,
      env
    );

    const url = new URL(request.url);

    const id =
      parsePositiveInteger(
        url.searchParams.get("id")
      );

    const orderNumber =
      cleanString(
        url.searchParams.get(
          "order_number"
        ),
        100
      );

    if (!id && !orderNumber) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
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
            .bind(id, user.id)
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
            .bind(orderNumber, user.id)
            .first();

    if (!row) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

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
        .bind(row.id)
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
        .bind(row.id)
        .all();

    return successResponse({
      order: formatOrder(row),
      items: (items.results || []).map(
        formatOrderItem
      ),
      events: (events.results || []).map(
        formatOrderEvent
      )
    });
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Unauthorized.",
        error.status
      );
    }

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

export async function createOrder(request, env) {
  try {
    const user = await requireUser(
      request,
      env
    );

    const body =
      await readJson(request);

    const items =
      normalizeItems(
        body?.items
      );

    if (!items.length) {
      return errorResponse(
        "Item order tidak boleh kosong.",
        400
      );
    }

    const merged = new Map();

    for (const item of items) {
      const current =
        merged.get(item.productId) || 0;

      const quantity =
        current + item.quantity;

      if (quantity > 100000) {
        return errorResponse(
          "Jumlah item terlalu besar.",
          400
        );
      }

      merged.set(
        item.productId,
        quantity
      );
    }

    const normalizedItems =
      Array.from(
        merged.entries()
      ).map(
        ([productId, quantity])=>({
          productId,
          quantity
        })
      );

    const productIds =
      normalizedItems.map(
        item => item.productId
      );

    const placeholders =
      productIds
        .map(() => "?")
        .join(",");

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
        .bind(...productIds)
        .all();

    const productMap =
      new Map(
        (products.results || []).map(
          product => [
            Number(product.id),
            product
          ]
        )
      );

    const orderItems = [];
    let subtotal = 0;

    for (const item of normalizedItems) {
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

      const quantity =
        item.quantity;

      const stock =
        product.stock === null
          ? null
          : Number(product.stock);

      if (
        stock !== null &&
        stock < quantity
      ) {
        return errorResponse(
          `Stok ${product.name} tidak mencukupi.`,
          400
        );
      }

      const unitPrice =
        Math.max(
          Number(product.price || 0),
          0
        );

      const totalPrice =
        unitPrice * quantity;

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

      subtotal += totalPrice;

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
          String(product.name || ""),
        quantity,
        unitPrice,
        totalPrice,
        stock
      });
    }

    const discount =
      0;

    const total =
      Math.max(
        subtotal - discount,
        0
      );

    if (
      total <= 0
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

    const balance =
      await env.DB
        .prepare(`
          SELECT
            balance
          FROM users
          WHERE id = ?
          LIMIT 1
        `)
        .bind(user.id)
        .first();

    const currentBalance =
      Number(
        balance?.balance || 0
      );

    if (
      currentBalance < total
    ) {
      return errorResponse(
        "Saldo tidak mencukupi.",
        400
      );
    }

    const orderInsert =
      env.DB
        .prepare(`
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
        `)
        .bind(
          user.id,
          orderNumber,
          subtotal,
          discount,
          total,
          createdAt,
          createdAt
        );

    const balanceUpdate =
      env.DB
        .prepare(`
          UPDATE users
          SET
            balance = balance - ?,
            updated_at = ?
          WHERE id = ?
          AND balance >= ?
          AND is_active = 1
        `)
        .bind(
          total,
          createdAt,
          user.id,
          total
        );

    const ledgerInsert =
      env.DB
        .prepare(`
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
          AND balance >= 0
        `)
        .bind(
          user.id,
          -total,
          total,
          reference,
          `Pembelian ${orderNumber}`,
          createdAt,
          user.id
        );

    const itemStatements =
      orderItems.map(
        item =>
          env.DB
            .prepare(`
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
            `)
            .bind(
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

    const stockStatements =
      orderItems
        .filter(
          item =>
            item.stock !== null
        )
        .map(
          item =>
            env.DB
              .prepare(`
                UPDATE products
                SET
                  stock = stock - ?,
                  updated_at = ?
                WHERE id = ?
                AND is_active = 1
                AND stock >= ?
              `)
              .bind(
                item.quantity,
                createdAt,
                item.productId,
                item.quantity
              )
        );

    const eventInsert =
      env.DB
        .prepare(`
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
        `)
        .bind(
          "Order berhasil dibuat.",
          createdAt,
          orderNumber,
          user.id
        );

    const batch =
      await env.DB.batch([
        balanceUpdate,
        orderInsert,
        ledgerInsert,
        ...itemStatements,
        ...stockStatements,
        eventInsert
      ]);

    const balanceResult =
      batch[0];

    const orderResult =
      batch[1];

    const ledgerResult =
      batch[2];

    if (
      Number(
        balanceResult?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Saldo gagal diproses.",
        409
      );
    }

    if (
      Number(
        orderResult?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Order gagal dibuat.",
        500
      );
    }

    if (
      Number(
        ledgerResult?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Ledger transaksi gagal dibuat.",
        500
      );
    }

    const stockStart =
      3 +
      itemStatements.length;

    for (
      let index = 0;
      index < stockStatements.length;
      index++
    ) {
      const result =
        batch[
          stockStart + index
        ];

      if (
        Number(
          result?.meta?.changes || 0
        ) !== 1
      ) {
        return errorResponse(
          "Stok berubah sebelum order selesai. Silakan coba lagi.",
          409
        );
      }
    }

    const createdOrder =
      await env.DB
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
          user.id
        )
        .first();

    return successResponse({
      order: formatOrder(
        createdOrder
      ),
      items: orderItems.map(
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
    if (error?.status) {
      return errorResponse(
        error.message || "Unauthorized.",
        error.status
      );
    }

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

export async function cancelOrder(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const body =
      await readJson(request);

    const id =
      parsePositiveInteger(
        body?.id ??
        body?.order_id
      );

    const orderNumber =
      cleanString(
        body?.order_number,
        100
      );

    if (!id && !orderNumber) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const existing =
      id
        ? await env.DB
            .prepare(`
              SELECT
                id,
                user_id,
                order_number,
                status,
                total
              FROM orders
              WHERE id = ?
              AND user_id = ?
              LIMIT 1
            `)
            .bind(
              id,
              user.id
            )
            .first()
        : await env.DB
            .prepare(`
              SELECT
                id,
                user_id,
                order_number,
                status,
                total
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

    if (!existing) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const status =
      getOrderStatus(
        existing.status
      );

    if (
      status === "CANCELLED"
    ) {
      return successResponse({
        order: formatOrder(
          existing
        ),
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

    const total =
      Number(
        existing.total || 0
      );

    const createdAt =
      nowUnix();

    const reference =
      `ORDER_REFUND:${existing.order_number}`;

    const balanceUpdate =
      env.DB
        .prepare(`
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
        `)
        .bind(
          total,
          createdAt,
          user.id,
          existing.id,
          user.id
        );

    const orderUpdate =
      env.DB
        .prepare(`
          UPDATE orders
          SET
            status = 'CANCELLED',
            updated_at = ?,
            cancelled_at = ?
          WHERE id = ?
          AND user_id = ?
          AND status = 'PENDING'
        `)
        .bind(
          createdAt,
          createdAt,
          existing.id,
          user.id
        );

    const ledgerInsert =
      env.DB
        .prepare(`
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
          AND balance >= ?
        `)
        .bind(
          user.id,
          total,
          total,
          reference,
          `Refund order ${existing.order_number}`,
          createdAt,
          user.id,
          total
        );

    const eventInsert =
      env.DB
        .prepare(`
          INSERT INTO order_events (
            order_id,
            status,
            message,
            created_at
          )
          VALUES (?, 'CANCELLED', ?, ?)
        `)
        .bind(
          existing.id,
          "Order dibatalkan.",
          createdAt
        );

    const result =
      await env.DB.batch([
        balanceUpdate,
        orderUpdate,
        ledgerInsert,
        eventInsert
      ]);

    if (
      Number(
        result[0]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Refund gagal diproses.",
        409
      );
    }

    if (
      Number(
        result[1]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Order sudah berubah status.",
        409
      );
    }

    if (
      Number(
        result[2]?.meta?.changes || 0
      ) !== 1
    ) {
      return errorResponse(
        "Ledger refund gagal dibuat.",
        500
      );
    }

    const updated =
      await env.DB
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
          existing.id,
          user.id
        )
        .first();

    return successResponse({
      order: formatOrder(
        updated
      ),
      message:
        "Order berhasil dibatalkan dan saldo dikembalikan."
    });
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Unauthorized.",
        error.status
      );
    }

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
    await requireAdministrator(
      request,
      env
    );

    const url =
      new URL(request.url);

    const limit =
      Math.min(
        parsePositiveInteger(
          url.searchParams.get(
            "limit"
          )
        ) || 50,
        200
      );

    const offset =
      Math.max(
        Number.parseInt(
          url.searchParams.get(
            "offset"
          ) || "0",
          10
        ) || 0,
        0
      );

    const status =
      getOrderStatus(
        url.searchParams.get(
          "status"
        )
      );

    if (
      status &&
      !isValidOrderStatus(status)
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
        u.username,
        u.first_name,
        o.order_number,
        o.status,
        o.subtotal,
        o.discount,
        o.total,
        o.created_at,
        o.updated_at,
        o.completed_at,
        o.cancelled_at
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

    return successResponse({
      orders:
        (rows.results || []).map(
          row => ({
            ...formatOrder(row),
            user: {
              id: row.user_id,
              username:
                row.username,
              first_name:
                row.first_name
            }
          })
        ),
      pagination: {
        limit,
        offset
      }
    });
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Forbidden.",
        error.status
      );
    }

    console.error(
      "adminGetOrders error:",
      error
    );

    return errorResponse(
      "Gagal mengambil data order.",
      500
    );
  }
}

export async function adminUpdateOrderStatus(
  request,
  env
) {
  try {
    await requireAdministrator(
      request,
      env
    );

    const body =
      await readJson(request);

    const id =
      parsePositiveInteger(
        body?.id ??
        body?.order_id
      );

    const orderNumber =
      cleanString(
        body?.order_number,
        100
      );

    const nextStatus =
      getOrderStatus(
        body?.status
      );

    const message =
      cleanString(
        body?.message ||
        `Status order diubah menjadi ${nextStatus}.`,
        500
      );

    if (!id && !orderNumber) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    if (
      !isValidOrderStatus(
        nextStatus
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    const existing =
      id
        ? await env.DB
            .prepare(`
              SELECT
                id,
                user_id,
                order_number,
                status,
                total
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
                total
              FROM orders
              WHERE order_number = ?
              LIMIT 1
            `)
            .bind(orderNumber)
            .first();

    if (!existing) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const currentStatus =
      getOrderStatus(
        existing.status
      );

    if (
      currentStatus ===
      nextStatus
    ) {
      return successResponse({
        message:
          "Status order sudah sesuai.",
        order: formatOrder(
          existing
        )
      });
    }

    const allowedTransitions = {
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

    if (
      !allowedTransitions[
        currentStatus
      ]?.includes(nextStatus)
    ) {
      return errorResponse(
        `Perubahan status ${currentStatus} ke ${nextStatus} tidak diizinkan.`,
        400
      );
    }

    const timestamp =
      nowUnix();

    if (
      nextStatus ===
      "REFUNDED"
    ) {
      return refundCompletedOrder(
        existing,
        message,
        timestamp,
        env
      );
    }

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
          existing.id,
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
        existing.id,
        nextStatus,
        message,
        timestamp
      )
      .run();

    const updated =
      await env.DB
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
        .bind(
          existing.id
        )
        .first();

    return successResponse({
      order:
        formatOrder(updated),
      message:
        "Status order berhasil diperbarui."
    });
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Forbidden.",
        error.status
      );
    }

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

async function refundCompletedOrder(
  existing,
  message,
  timestamp,
  env
) {
  const reference =
    `ORDER_REFUND:${existing.order_number}`;

  const amount =
    Number(
      existing.total || 0
    );

  if (
    amount <= 0
  ) {
    return errorResponse(
      "Nominal refund tidak valid.",
      400
    );
  }

  const balanceUpdate =
    env.DB
      .prepare(`
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
          AND status = 'COMPLETED'
        )
      `)
      .bind(
        amount,
        timestamp,
        existing.user_id,
        existing.id
      );

  const orderUpdate =
    env.DB
      .prepare(`
        UPDATE orders
        SET
          status = 'REFUNDED',
          updated_at = ?
        WHERE id = ?
        AND status = 'COMPLETED'
      `)
      .bind(
        timestamp,
        existing.id
      );

  const ledger =
    env.DB
      .prepare(`
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
        AND balance >= ?
      `)
      .bind(
        existing.user_id,
        amount,
        amount,
        reference,
        `Refund order ${existing.order_number}`,
        timestamp,
        existing.user_id,
        amount
      );

  const event =
    env.DB
      .prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          message,
          created_at
        )
        VALUES (?, 'REFUNDED', ?, ?)
      `)
      .bind(
        existing.id,
        message ||
          "Order berhasil direfund.",
        timestamp
      );

  const result =
    await env.DB.batch([
      balanceUpdate,
      orderUpdate,
      ledger,
      event
    ]);

  if (
    Number(
      result[0]?.meta?.changes || 0
    ) !== 1
  ) {
    return errorResponse(
      "Saldo refund gagal diproses.",
      409
    );
  }

  if (
    Number(
      result[1]?.meta?.changes || 0
    ) !== 1
  ) {
    return errorResponse(
      "Order sudah berubah status.",
      409
    );
  }

  if (
    Number(
      result[2]?.meta?.changes || 0
    ) !== 1
  ) {
    return errorResponse(
      "Ledger refund gagal dibuat.",
      500
    );
  }

  const updated =
    await env.DB
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
      .bind(
        existing.id
      )
      .first();

  return successResponse({
    order:
      formatOrder(updated),
    message:
      "Order berhasil direfund."
  });
}

export async function adminRefundOrder(
  request,
  env
) {
  try {
    await requireAdministrator(
      request,
      env
    );

    const body =
      await readJson(request);

    const id =
      parsePositiveInteger(
        body?.id ??
        body?.order_id
      );

    const orderNumber =
      cleanString(
        body?.order_number,
        100
      );

    const message =
      cleanString(
        body?.message ||
        "Order direfund oleh admin.",
        500
      );

    if (!id && !orderNumber) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const existing =
      id
        ? await env.DB
            .prepare(`
              SELECT
                id,
                user_id,
                order_number,
                status,
                total
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
                total
              FROM orders
              WHERE order_number = ?
              LIMIT 1
            `)
            .bind(orderNumber)
            .first();

    if (!existing) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    if (
      getOrderStatus(
        existing.status
      ) === "REFUNDED"
    ) {
      return successResponse({
        message:
          "Order sudah direfund.",
        order:
          formatOrder(existing)
      });
    }

    if (
      getOrderStatus(
        existing.status
      ) !== "COMPLETED"
    ) {
      return errorResponse(
        "Hanya order COMPLETED yang dapat direfund.",
        400
      );
    }

    return refundCompletedOrder(
      existing,
      message,
      nowUnix(),
      env
    );
  } catch (error) {
    if (error?.status) {
      return errorResponse(
        error.message || "Forbidden.",
        error.status
      );
    }

    console.error(
      "adminRefundOrder error:",
      error
    );

    return errorResponse(
      "Gagal melakukan refund.",
      500
    );
  }
}

export default {
  getOrders,
  getOrder,
  createOrder,
  cancelOrder,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminRefundOrder
};