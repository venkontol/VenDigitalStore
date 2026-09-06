import {
  requireAuth
} from "./auth.js";

import {
  debitBalance,
  refundBalance
} from "./wallet.js";

import {
  getProducts,
  createOrder,
  getOrder,
  cancelOrder,
  finishOrder,
  resendOrder,
  mapStatus
} from "./smscode.js";

import {
  errorResponse,
  successResponse,
  readJson,
  parsePositiveInteger,
  parseNonNegativeInteger,
  getPagination,
  nowUnix,
  generateOrderNumber,
  parseJson
} from "./utils.js";

const TYPE = "NOKOS";
const PROVIDER = "SMSCODE";

const ACTIVE_STATUSES = [
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED"
];

const FINAL_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
];

function value(data, ...keys) {
  for (const key of keys) {
    if (
      data &&
      data[key] !== undefined &&
      data[key] !== null
    ) {
      return data[key];
    }
  }

  return null;
}

function numberValue(data, ...keys) {
  const result =
    value(data, ...keys);

  if (
    result === null ||
    result === ""
  ) {
    return null;
  }

  const number =
    Number(result);

  return Number.isFinite(number)
    ? number
    : null;
}

function stringValue(data, ...keys) {
  const result =
    value(data, ...keys);

  return result === null
    ? null
    : String(result);
}

function providerData(data) {
  return JSON.stringify(
    data ?? null
  );
}

function providerStatus(data) {
  return stringValue(
    data,
    "status",
    "provider_status"
  );
}

function providerOrderId(data) {
  return stringValue(
    data,
    "id",
    "order_id",
    "orderId"
  );
}

function providerProductId(data) {
  return numberValue(
    data,
    "product_id",
    "productId"
  );
}

function providerCatalogProductId(data) {
  return numberValue(
    data,
    "catalog_product_id",
    "catalogProductId"
  );
}

function providerPhone(data) {
  return stringValue(
    data,
    "phone_number",
    "phoneNumber",
    "phone"
  );
}

function providerOtp(data) {
  return stringValue(
    data,
    "otp_code",
    "otpCode",
    "otp"
  );
}

function providerOtpMessage(data) {
  return stringValue(
    data,
    "otp_message",
    "otpMessage",
    "message"
  );
}

function providerExpiresAt(data) {
  return numberValue(
    data,
    "expires_at",
    "expiresAt"
  );
}

function providerAmount(data) {
  return numberValue(
    data,
    "amount",
    "price",
    "charge"
  );
}

function providerFailure(data) {
  return stringValue(
    data,
    "failed_reason",
    "failure_reason",
    "error",
    "message"
  );
}

function productId(product) {
  return numberValue(
    product,
    "id",
    "product_id",
    "productId"
  );
}

function catalogProductId(product) {
  return numberValue(
    product,
    "catalog_product_id",
    "catalogProductId"
  );
}

function productName(product) {
  return (
    stringValue(
      product,
      "name",
      "service_name",
      "serviceName"
    ) ||
    "NOKOS"
  );
}

function productPrice(product) {
  return numberValue(
    product,
    "price",
    "selling_price",
    "sellingPrice"
  ) ?? 0;
}

function productAvailable(product) {
  const available =
    value(
      product,
      "available"
    );

  if (
    available === null
  ) {
    return true;
  }

  return (
    available === true ||
    Number(available) === 1 ||
    String(available).toLowerCase() === "true"
  );
}

function normalizeProduct(product) {
  return {
    product_id:
      productId(product),
    catalog_product_id:
      catalogProductId(product),
    country_id:
      numberValue(
        product,
        "country_id",
        "countryId"
      ),
    platform_id:
      numberValue(
        product,
        "platform_id",
        "platformId"
      ),
    operator_id:
      numberValue(
        product,
        "operator_id",
        "operatorId"
      ),
    operator_name:
      stringValue(
        product,
        "operator_name",
        "operatorName"
      ),
    name:
      productName(product),
    price:
      productPrice(product),
    available:
      productAvailable(product),
    active:
      value(product, "active") === null
        ? true
        : Boolean(
            Number(
              value(product, "active")
            )
          ),
    metadata:
      product
  };
}

function normalizeOrder(order) {
  const status =
    mapStatus(
      providerStatus(order)
    );

  return {
    external_order_id:
      providerOrderId(order),
    status,
    provider_status:
      providerStatus(order),
    provider_amount:
      providerAmount(order),
    phone_number:
      providerPhone(order),
    otp_code:
      providerOtp(order),
    otp_message:
      providerOtpMessage(order),
    otp_received_at:
      numberValue(
        order,
        "otp_received_at",
        "otpReceivedAt"
      ),
    provider_expires_at:
      providerExpiresAt(order),
    failure_reason:
      providerFailure(order),
    provider_data:
      providerData(order)
  };
}

function serializeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    id:
      order.id,
    order_number:
      order.order_number,
    type:
      order.type,
    provider:
      order.provider,
    external_order_id:
      order.external_order_id,
    service_id:
      order.service_id,
    service_name:
      order.service_name,
    target:
      order.target,
    quantity:
      Number(order.quantity || 0),
    provider_rate:
      Number(order.provider_rate || 0),
    selling_rate:
      Number(order.selling_rate || 0),
    provider_amount:
      Number(order.provider_amount || 0),
    customer_amount:
      Number(order.customer_amount || 0),
    provider_charge:
      order.provider_charge === null
        ? null
        : Number(order.provider_charge),
    provider_currency:
      order.provider_currency,
    status:
      order.status,
    provider_status:
      order.provider_status,
    phone_number:
      order.phone_number,
    otp_code:
      order.otp_code,
    otp_message:
      order.otp_message,
    otp_received_at:
      order.otp_received_at,
    provider_expires_at:
      order.provider_expires_at,
    start_count:
      order.start_count,
    remains:
      order.remains,
    failure_reason:
      order.failure_reason,
    created_at:
      order.created_at,
    updated_at:
      order.updated_at,
    completed_at:
      order.completed_at,
    cancelled_at:
      order.cancelled_at
  };
}

async function findOrder(
  env,
  userId,
  orderId
) {
  return env.DB
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE id = ?
        AND user_id = ?
        AND type = ?
        AND provider = ?
      LIMIT 1
      `
    )
    .bind(
      orderId,
      userId,
      TYPE,
      PROVIDER
    )
    .first();
}

async function findOrderByIdempotency(
  env,
  userId,
  idempotencyKey
) {
  if (!idempotencyKey) {
    return null;
  }

  return env.DB
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE user_id = ?
        AND type = ?
        AND provider = ?
        AND idempotency_key = ?
      LIMIT 1
      `
    )
    .bind(
      userId,
      TYPE,
      PROVIDER,
      idempotencyKey
    )
    .first();
}

async function findOrderByExternalId(
  env,
  externalOrderId
) {
  if (!externalOrderId) {
    return null;
  }

  return env.DB
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE provider = ?
        AND external_order_id = ?
      LIMIT 1
      `
    )
    .bind(
      PROVIDER,
      externalOrderId
    )
    .first();
}

async function addEvent(
  env,
  orderId,
  status,
  providerStatusValue,
  message,
  data
) {
  await env.DB
    .prepare(
      `
      INSERT INTO order_events (
        order_id,
        status,
        provider_status,
        message,
        provider_data,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      orderId,
      status,
      providerStatusValue || null,
      message || null,
      data
        ? providerData(data)
        : null,
      nowUnix()
    )
    .run();
}

async function updateOrder(
  env,
  orderId,
  patch = {},
  event = true
) {
  const current =
    await env.DB
      .prepare(
        `
        SELECT *
        FROM orders
        WHERE id = ?
        LIMIT 1
        `
      )
      .bind(orderId)
      .first();

  if (!current) {
    throw new Error(
      "Order NOKOS tidak ditemukan."
    );
  }

  const next =
    {
      external_order_id:
        patch.external_order_id ??
        current.external_order_id ??
        null,
      status:
        patch.status ??
        current.status ??
        "UNKNOWN",
      provider_status:
        patch.provider_status ??
        current.provider_status ??
        null,
      provider_data:
        patch.provider_data ??
        current.provider_data ??
        null,
      failure_reason:
        patch.failure_reason ??
        current.failure_reason ??
        null,
      provider_amount:
        patch.provider_amount ??
        current.provider_amount ??
        0,
      provider_charge:
        patch.provider_charge ??
        current.provider_charge ??
        null,
      phone_number:
        patch.phone_number ??
        current.phone_number ??
        null,
      otp_code:
        patch.otp_code ??
        current.otp_code ??
        null,
      otp_message:
        patch.otp_message ??
        current.otp_message ??
        null,
      otp_received_at:
        patch.otp_received_at ??
        current.otp_received_at ??
        null,
      provider_expires_at:
        patch.provider_expires_at ??
        current.provider_expires_at ??
        null,
      start_count:
        patch.start_count ??
        current.start_count ??
        null,
      remains:
        patch.remains ??
        current.remains ??
        null,
      completed_at:
        patch.completed_at ??
        current.completed_at ??
        null,
      cancelled_at:
        patch.cancelled_at ??
        current.cancelled_at ??
        null
    };

  await env.DB
    .prepare(
      `
      UPDATE orders
      SET
        external_order_id = ?,
        status = ?,
        provider_status = ?,
        provider_data = ?,
        failure_reason = ?,
        provider_amount = ?,
        provider_charge = ?,
        phone_number = ?,
        otp_code = ?,
        otp_message = ?,
        otp_received_at = ?,
        provider_expires_at = ?,
        start_count = ?,
        remains = ?,
        completed_at = ?,
        cancelled_at = ?,
        updated_at = ?
      WHERE id = ?
      `
    )
    .bind(
      next.external_order_id,
      next.status,
      next.provider_status,
      next.provider_data,
      next.failure_reason,
      next.provider_amount,
      next.provider_charge,
      next.phone_number,
      next.otp_code,
      next.otp_message,
      next.otp_received_at,
      next.provider_expires_at,
      next.start_count,
      next.remains,
      next.completed_at,
      next.cancelled_at,
      nowUnix(),
      orderId
    )
    .run();

  if (event) {
    await addEvent(
      env,
      orderId,
      next.status,
      next.provider_status,
      next.failure_reason,
      parseJson(next.provider_data)
    );
  }

  return findOrderById(
    env,
    orderId
  );
}

async function findOrderById(
  env,
  orderId
) {
  return env.DB
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(orderId)
    .first();
}

async function saveService(
  env,
  product
) {
  const id =
    productId(product);

  if (!id) {
    return;
  }

  const timestamp =
    nowUnix();

  const catalogId =
    catalogProductId(product);

  const countryId =
    numberValue(
      product,
      "country_id",
      "countryId"
    );

  const platformId =
    numberValue(
      product,
      "platform_id",
      "platformId"
    );

  const operatorId =
    numberValue(
      product,
      "operator_id",
      "operatorId"
    );

  const countryName =
    stringValue(
      product,
      "country_name",
      "countryName"
    );

  const platformName =
    stringValue(
      product,
      "platform_name",
      "platformName"
    );

  const operatorName =
    stringValue(
      product,
      "operator_name",
      "operatorName"
    );

  const name =
    productName(product);

  const price =
    productPrice(product);

  const available =
    productAvailable(product)
      ? 1
      : 0;

  const active =
    value(product, "active") === null
      ? 1
      : Number(
          value(product, "active")
        )
          ? 1
          : 0;

  await env.DB
    .prepare(
      `
      INSERT INTO nokos_services (
        product_id,
        catalog_product_id,
        country_id,
        country_name,
        platform_id,
        platform_name,
        operator_id,
        operator_name,
        service_name,
        provider_price,
        selling_price,
        available,
        active,
        metadata,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id)
      DO UPDATE SET
        catalog_product_id = excluded.catalog_product_id,
        country_id = excluded.country_id,
        country_name = excluded.country_name,
        platform_id = excluded.platform_id,
        platform_name = excluded.platform_name,
        operator_id = excluded.operator_id,
        operator_name = excluded.operator_name,
        service_name = excluded.service_name,
        provider_price = excluded.provider_price,
        available = excluded.available,
        active = excluded.active,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      `
    )
    .bind(
      id,
      catalogId ?? id,
      countryId,
      countryName,
      platformId,
      platformName,
      operatorId,
      operatorName,
      name,
      price,
      price,
      available,
      active,
      providerData(product),
      timestamp,
      timestamp
    )
    .run();
}

async function syncProviderOrder(
  env,
  order
) {
  if (!order?.external_order_id) {
    return order;
  }

  const provider =
    await getOrder(
      env,
      order.external_order_id
    );

  const normalized =
    normalizeOrder(provider);

  const completedAt =
    normalized.status === "COMPLETED"
      ? nowUnix()
      : null;

  const cancelledAt =
    normalized.status === "CANCELLED"
      ? nowUnix()
      : null;

  return updateOrder(
    env,
    order.id,
    {
      ...normalized,
      completed_at:
        completedAt,
      cancelled_at:
        cancelledAt
    }
  );
}

export async function listNokosProducts(
  request,
  env
) {
  try {
    await requireAuth(
      request,
      env
    );

    const url =
      new URL(request.url);

    const filters = {
      countryId:
        parsePositiveInteger(
          url.searchParams.get(
            "country_id"
          )
        ) || undefined,
      platformId:
        parsePositiveInteger(
          url.searchParams.get(
            "platform_id"
          )
        ) || undefined,
      serviceId:
        parsePositiveInteger(
          url.searchParams.get(
            "service_id"
          )
        ) || undefined,
      operatorId:
        parsePositiveInteger(
          url.searchParams.get(
            "operator_id"
          )
        ) || undefined,
      available: true,
      active: true
    };

    const products =
      await getProducts(
        env,
        filters
      );

    const normalized =
      Array.isArray(products)
        ? products
            .filter(productAvailable)
            .map(normalizeProduct)
        : [];

    if (normalized.length) {
      await Promise.all(
        normalized.map(
          product =>
            saveService(
              env,
              product
            )
        )
      );
    }

    return successResponse({
      products: normalized
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil produk NOKOS.",
      error?.status || 500
    );
  }
}

export async function createNokosOrder(
  request,
  env
) {
  let userId = null;
  let orderId = null;
  let debited = false;

  try {
    const user =
      await requireAuth(
        request,
        env
      );

    userId =
      user.id;

    const payload =
      await readJson(request);

    const requestedProductId =
      parsePositiveInteger(
        value(
          payload,
          "product_id",
          "productId"
        )
      );

    const requestedCatalogProductId =
      parsePositiveInteger(
        value(
          payload,
          "catalog_product_id",
          "catalogProductId"
        )
      );

    const quantity =
      parsePositiveInteger(
        value(
          payload,
          "quantity"
        )
      ) || 1;

    const idempotencyKey =
      String(
        value(
          payload,
          "idempotency_key",
          "idempotencyKey"
        ) || ""
      ).trim();

    if (
      !requestedProductId &&
      !requestedCatalogProductId
    ) {
      return errorResponse(
        "product_id atau catalog_product_id wajib diisi.",
        400
      );
    }

    if (
      quantity !== 1
    ) {
      return errorResponse(
        "Quantity NOKOS harus 1.",
        400
      );
    }

    if (idempotencyKey) {
      const existing =
        await findOrderByIdempotency(
          env,
          userId,
          idempotencyKey
        );

      if (existing) {
        return successResponse({
          order:
            serializeOrder(existing),
          idempotent: true
        });
      }
    }

    const products =
      await getProducts(
        env,
        {
          available: true,
          active: true,
          ...(requestedProductId
            ? {}
            : {
                catalogProductId:
                  requestedCatalogProductId
              })
        }
      );

    const list =
      Array.isArray(products)
        ? products
        : [];

    const product =
      list.find(
        item => {
          const id =
            productId(item);

          const catalogId =
            catalogProductId(item);

          if (
            requestedProductId &&
            id === requestedProductId
          ) {
            return true;
          }

          return (
            requestedCatalogProductId &&
            catalogId ===
              requestedCatalogProductId
          );
        }
      );

    if (!product) {
      return errorResponse(
        "Produk NOKOS tidak ditemukan atau tidak tersedia.",
        404
      );
    }

    await saveService(
      env,
      product
    );

    const selectedProductId =
      productId(product);

    const selectedCatalogProductId =
      catalogProductId(product);

    const price =
      productPrice(product);

    if (
      !selectedProductId &&
      !selectedCatalogProductId
    ) {
      return errorResponse(
        "Produk NOKOS tidak memiliki ID provider yang valid.",
        409
      );
    }

    if (
      price <= 0
    ) {
      return errorResponse(
        "Harga produk NOKOS tidak valid.",
        409
      );
    }

    const requestData =
      JSON.stringify({
        product_id:
          selectedProductId,
        catalog_product_id:
          selectedCatalogProductId,
        quantity,
        idempotency_key:
          idempotencyKey || null
      });

    const orderNumber =
      generateOrderNumber(
        "NK"
      );

    const timestamp =
      nowUnix();

    const inserted =
      await env.DB
        .prepare(
          `
          INSERT INTO orders (
            user_id,
            order_number,
            type,
            provider,
            service_id,
            service_name,
            target,
            quantity,
            rate_unit,
            provider_rate,
            selling_rate,
            provider_amount,
            customer_amount,
            provider_currency,
            status,
            request_data,
            idempotency_key,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, NULL, ?, 'FIXED',
            ?, ?, ?, ?, 'IDR',
            'CREATING', ?, ?, ?, ?
          )
          `
        )
        .bind(
          userId,
          orderNumber,
          TYPE,
          PROVIDER,
          String(
            selectedProductId ??
              selectedCatalogProductId
          ),
          productName(product),
          quantity,
          price,
          price,
          price,
          price,
          requestData,
          idempotencyKey || null,
          timestamp,
          timestamp
        )
        .run();

    orderId =
      inserted.meta.last_row_id;

    await addEvent(
      env,
      orderId,
      "CREATING",
      null,
      null,
      null
    );

    const debit =
      await debitBalance(
        env,
        userId,
        price,
        `PURCHASE:${orderNumber}`,
        `Pembelian NOKOS ${orderNumber}`
      );

    if (
      debit?.success !== true
    ) {
      return errorResponse(
        debit?.message ||
          "Saldo tidak mencukupi.",
        400
      );
    }

    debited = true;

    const providerOrder =
      await createOrder(
        env,
        {
          productId:
            selectedProductId ||
            undefined,
          catalogProductId:
            selectedCatalogProductId ||
            undefined,
          quantity,
          idempotencyKey:
            idempotencyKey ||
            undefined
        }
      );

    const normalized =
      normalizeOrder(
        providerOrder
      );

    const saved =
      await updateOrder(
        env,
        orderId,
        {
          ...normalized,
          status:
            normalized.status ===
              "UNKNOWN"
              ? "PENDING"
              : normalized.status
        }
      );

    return successResponse({
      order:
        serializeOrder(saved)
    }, 201);
  } catch (error) {
    if (
      orderId &&
      debited
    ) {
      try {
        const current =
          await findOrderById(
            env,
            orderId
          );

        if (
          current &&
          !current.external_order_id
        ) {
          await updateOrder(
            env,
            orderId,
            {
              status:
                "UNKNOWN",
              failure_reason:
                error?.message ||
                "Status provider tidak dapat dipastikan."
            }
          );
        } else if (
          current &&
          ACTIVE_STATUSES.includes(
            current.status
          )
        ) {
          await updateOrder(
            env,
            orderId,
            {
              status:
                "UNKNOWN",
              failure_reason:
                error?.message ||
                "Status provider tidak dapat dipastikan."
            }
          );
        }
      } catch {}
    }

    return errorResponse(
      error?.message ||
        "Gagal membuat order NOKOS.",
      error?.status || 500
    );
  }
}

export async function getNokosOrder(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const url =
      new URL(request.url);

    const orderId =
      parsePositiveInteger(
        url.searchParams.get(
          "order_id"
        ) ||
        url.searchParams.get(
          "id"
        )
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    let order =
      await findOrder(
        env,
        user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.external_order_id &&
      ACTIVE_STATUSES.includes(
        order.status
      )
    ) {
      try {
        order =
          await syncProviderOrder(
            env,
            order
          );
      } catch {}
    }

    return successResponse({
      order:
        serializeOrder(order)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil order NOKOS.",
      error?.status || 500
    );
  }
}

export async function listMyNokosOrders(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const url =
      new URL(request.url);

    const pagination =
      getPagination(
        url
      );

    const rows =
      await env.DB
        .prepare(
          `
          SELECT *
          FROM orders
          WHERE user_id = ?
            AND type = ?
            AND provider = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
          `
        )
        .bind(
          user.id,
          TYPE,
          PROVIDER,
          pagination.limit,
          pagination.offset
        )
        .all();

    const total =
      await env.DB
        .prepare(
          `
          SELECT COUNT(*) AS total
          FROM orders
          WHERE user_id = ?
            AND type = ?
            AND provider = ?
          `
        )
        .bind(
          user.id,
          TYPE,
          PROVIDER
        )
        .first();

    return successResponse({
      orders:
        (rows.results || [])
          .map(serializeOrder),
      pagination: {
        page:
          pagination.page,
        limit:
          pagination.limit,
        total:
          Number(
            total?.total || 0
          )
      }
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil riwayat NOKOS.",
      error?.status || 500
    );
  }
}

export async function syncNokosOrder(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const payload =
      await readJson(request);

    const orderId =
      parsePositiveInteger(
        value(
          payload,
          "order_id",
          "orderId"
        )
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrder(
        env,
        user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    const updated =
      await syncProviderOrder(
        env,
        order
      );

    return successResponse({
      order:
        serializeOrder(updated)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal melakukan sinkronisasi NOKOS.",
      error?.status || 500
    );
  }
}

export async function cancelNokosOrder(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const payload =
      await readJson(request);

    const orderId =
      parsePositiveInteger(
        value(
          payload,
          "order_id",
          "orderId"
        )
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    let order =
      await findOrder(
        env,
        user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      FINAL_STATUSES.includes(
        order.status
      )
    ) {
      return successResponse({
        order:
          serializeOrder(order),
        refunded:
          order.status === "REFUNDED"
      });
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    let providerOrder;

    try {
      providerOrder =
        await cancelOrder(
          env,
          order.external_order_id
        );
    } catch (error) {
      order =
        await updateOrder(
          env,
          order.id,
          {
            status:
              "UNKNOWN",
            failure_reason:
              error?.message ||
              "Pembatalan provider belum dapat dipastikan."
          }
        );

      return errorResponse(
        "Pembatalan belum dapat dipastikan. Jangan melakukan pembayaran ulang.",
        502
      );
    }

    const normalized =
      normalizeOrder(
        providerOrder
      );

    if (
      normalized.status !==
      "CANCELLED"
    ) {
      order =
        await updateOrder(
          env,
          order.id,
          normalized
        );

      return successResponse({
        order:
          serializeOrder(order),
        refunded: false
      });
    }

    const refundReference =
      `REFUND:${order.order_number}`;

    let refunded =
      false;

    try {
      const refund =
        await refundBalance(
          env,
          user.id,
          order.customer_amount,
          refundReference,
          `Refund NOKOS ${order.order_number}`
        );

      refunded =
        refund?.success === true;
    } catch {
      refunded =
        false;
    }

    if (!refunded) {
      order =
        await updateOrder(
          env,
          order.id,
          {
            ...normalized,
            status:
              "CANCELLED",
            failure_reason:
              "Order provider sudah dibatalkan tetapi refund saldo belum berhasil."
          }
        );

      return successResponse({
        order:
          serializeOrder(order),
        refunded: false
      });
    }

    order =
      await updateOrder(
        env,
        order.id,
        {
          ...normalized,
          status:
            "REFUNDED",
          failure_reason:
            null,
          cancelled_at:
            nowUnix()
        }
      );

    return successResponse({
      order:
        serializeOrder(order),
      refunded: true
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membatalkan order NOKOS.",
      error?.status || 500
    );
  }
}

export async function finishNokosOrder(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const payload =
      await readJson(request);

    const orderId =
      parsePositiveInteger(
        value(
          payload,
          "order_id",
          "orderId"
        )
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrder(
        env,
        user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    const providerOrder =
      await finishOrder(
        env,
        order.external_order_id
      );

    const normalized =
      normalizeOrder(
        providerOrder
      );

    const updated =
      await updateOrder(
        env,
        order.id,
        normalized
      );

    return successResponse({
      order:
        serializeOrder(updated)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyelesaikan order NOKOS.",
      error?.status || 500
    );
  }
}

export async function resendNokosOrder(
  request,
  env
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const payload =
      await readJson(request);

    const orderId =
      parsePositiveInteger(
        value(
          payload,
          "order_id",
          "orderId"
        )
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrder(
        env,
        user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    const providerOrder =
      await resendOrder(
        env,
        order.external_order_id
      );

    const normalized =
      normalizeOrder(
        providerOrder
      );

    const updated =
      await updateOrder(
        env,
        order.id,
        normalized
      );

    return successResponse({
      order:
        serializeOrder(updated)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal melakukan resend NOKOS.",
      error?.status || 500
    );
  }
}

export async function getNokosOrderByExternalId(
  env,
  externalOrderId
) {
  const order =
    await findOrderByExternalId(
      env,
      externalOrderId
    );

  if (!order) {
    return null;
  }

  return syncProviderOrder(
    env,
    order
  );
}

export async function syncNokosProviderOrder(
  env,
  externalOrderId
) {
  return getNokosOrderByExternalId(
    env,
    externalOrderId
  );
}

export async function handleNokos(
  request,
  env
) {
  const url =
    new URL(request.url);

  const path =
    url.pathname
      .replace(
        /\/+$/,
        ""
      ) || "/";

  const routes = {
    "GET /api/nokos/products":
      listNokosProducts,
    "GET /api/nokos/services":
      listNokosProducts,
    "GET /api/nokos/orders":
      listMyNokosOrders,
    "GET /api/nokos/order":
      getNokosOrder,
    "POST /api/nokos/orders":
      createNokosOrder,
    "POST /api/nokos/order/sync":
      syncNokosOrder,
    "POST /api/nokos/order/cancel":
      cancelNokosOrder,
    "POST /api/nokos/order/finish":
      finishNokosOrder,
    "POST /api/nokos/order/resend":
      resendNokosOrder
  };

  const handler =
    routes[
      `${request.method} ${path}`
    ];

  if (!handler) {
    return errorResponse(
      "Endpoint NOKOS tidak ditemukan.",
      404
    );
  }

  return handler(
    request,
    env
  );
}

export default {
  handleNokos,
  listNokosProducts,
  createNokosOrder,
  getNokosOrder,
  listMyNokosOrders,
  syncNokosOrder,
  cancelNokosOrder,
  finishNokosOrder,
  resendNokosOrder,
  getNokosOrderByExternalId,
  syncNokosProviderOrder
};