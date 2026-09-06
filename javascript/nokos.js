import {
  requireAuth,
  requireAdmin
} from "./auth.js";

import {
  debitBalance,
  refundBalance
} from "./wallet.js";

import {
  getProduct,
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
  getUrl,
  cleanString,
  parsePositiveInteger,
  generateOrderNumber,
  nowUnix,
  parseJson
} from "./utils.js";

const NOKOS_PROVIDER = "SMSCODE";
const ORDER_TYPE = "NOKOS";

const ORDER_STATUSES = new Set([
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
  "UNKNOWN"
]);

function internalStatus(providerStatus) {
  const status = mapStatus(providerStatus);

  if (ORDER_STATUSES.has(status)) {
    return status;
  }

  return "UNKNOWN";
}

function getProviderStatus(data) {
  return String(
    data?.status ||
    data?.order?.status ||
    ""
  ).trim().toUpperCase();
}

function getProviderOrderId(data) {
  return (
    data?.id ??
    data?.order_id ??
    data?.order?.id ??
    null
  );
}

function getProviderAmount(data) {
  const values = [
    data?.amount,
    data?.price,
    data?.charge,
    data?.order?.amount,
    data?.order?.price,
    data?.order?.charge
  ];

  for (const value of values) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Math.max(0, Math.round(Number(value)));
    }
  }

  return 0;
}

function getProviderPhone(data) {
  return (
    data?.phone_number ||
    data?.phone ||
    data?.number ||
    data?.order?.phone_number ||
    data?.order?.phone ||
    null
  );
}

function getProviderOtp(data) {
  return (
    data?.otp_code ||
    data?.otp ||
    data?.code ||
    data?.order?.otp_code ||
    null
  );
}

function getProviderOtpMessage(data) {
  return (
    data?.otp_message ||
    data?.message ||
    data?.order?.otp_message ||
    null
  );
}

function getProviderExpiresAt(data) {
  const value =
    data?.expires_at ||
    data?.expired_at ||
    data?.order?.expires_at ||
    null;

  if (!value) {
    return null;
  }

  if (
    typeof value === "number" ||
    /^\d+$/.test(String(value))
  ) {
    const number = Number(value);

    if (number > 100000000000) {
      return Math.floor(number / 1000);
    }

    return number;
  }

  const timestamp =
    Math.floor(
      new Date(value).getTime() / 1000
    );

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function getProviderFailure(data) {
  return (
    data?.failed_reason ||
    data?.failure_reason ||
    data?.error ||
    data?.message ||
    null
  );
}

function getProviderData(data) {
  try {
    return JSON.stringify(data ?? null);
  } catch {
    return null;
  }
}

function normalizeTarget(value) {
  return cleanString(value, 500);
}

function normalizeProductId(value) {
  const id = parsePositiveInteger(value);

  if (!id) {
    return null;
  }

  return id;
}

function normalizeCatalogProductId(value) {
  const id = parsePositiveInteger(value);

  if (!id) {
    return null;
  }

  return id;
}

function normalizeOperatorId(value) {
  const id = parsePositiveInteger(value);

  if (!id) {
    return null;
  }

  return id;
}

function normalizeQuantity(value) {
  const quantity =
    parsePositiveInteger(value);

  if (!quantity) {
    return 1;
  }

  return quantity;
}

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return Math.round(number);
}

function validateCreatePayload(payload) {
  const productId =
    normalizeProductId(
      payload?.product_id ??
      payload?.productId
    );

  const catalogProductId =
    normalizeCatalogProductId(
      payload?.catalog_product_id ??
      payload?.catalogProductId
    );

  const operatorId =
    normalizeOperatorId(
      payload?.operator_id ??
      payload?.operatorId
    );

  const quantity =
    normalizeQuantity(
      payload?.quantity
    );

  const minPrice =
    normalizePrice(
      payload?.min_price ??
      payload?.minPrice
    );

  const maxPrice =
    normalizePrice(
      payload?.max_price ??
      payload?.maxPrice
    );

  const target =
    normalizeTarget(
      payload?.target ||
      payload?.phone_number ||
      ""
    );

  const idempotencyKey =
    cleanString(
      payload?.idempotency_key ??
      payload?.idempotencyKey ??
      "",
      120
    );

  if (!productId && !catalogProductId) {
    return {
      error:
        "product_id atau catalog_product_id wajib diisi."
    };
  }

  if (
    minPrice !== null &&
    maxPrice !== null &&
    minPrice > maxPrice
  ) {
    return {
      error:
        "min_price tidak boleh lebih besar dari max_price."
    };
  }

  return {
    value: {
      productId,
      catalogProductId,
      operatorId,
      quantity,
      minPrice,
      maxPrice,
      target,
      idempotencyKey:
        idempotencyKey || null
    }
  };
}

async function findLocalOrder(
  env,
  userId,
  orderNumber
) {
  return env.DB
    .prepare(
      `
      SELECT
        id,
        user_id,
        order_number,
        type,
        provider,
        external_order_id,
        service_id,
        service_name,
        target,
        quantity,
        rate_unit,
        provider_rate,
        selling_rate,
        provider_amount,
        customer_amount,
        provider_charge,
        provider_currency,
        status,
        provider_status,
        provider_data,
        request_data,
        idempotency_key,
        failure_reason,
        phone_number,
        otp_code,
        otp_message,
        otp_received_at,
        provider_expires_at,
        start_count,
        remains,
        created_at,
        updated_at,
        completed_at,
        cancelled_at
      FROM orders
      WHERE user_id = ?
        AND order_number = ?
      LIMIT 1
      `
    )
    .bind(userId, orderNumber)
    .first();
}

async function findOrderById(
  env,
  userId,
  orderId
) {
  return env.DB
    .prepare(
      `
      SELECT
        id,
        user_id,
        order_number,
        type,
        provider,
        external_order_id,
        service_id,
        service_name,
        target,
        quantity,
        rate_unit,
        provider_rate,
        selling_rate,
        provider_amount,
        customer_amount,
        provider_charge,
        provider_currency,
        status,
        provider_status,
        provider_data,
        request_data,
        idempotency_key,
        failure_reason,
        phone_number,
        otp_code,
        otp_message,
        otp_received_at,
        provider_expires_at,
        start_count,
        remains,
        created_at,
        updated_at,
        completed_at,
        cancelled_at
      FROM orders
      WHERE user_id = ?
        AND id = ?
        AND type = ?
      LIMIT 1
      `
    )
    .bind(userId, orderId, ORDER_TYPE)
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
      SELECT
        id,
        user_id,
        order_number,
        type,
        provider,
        external_order_id,
        service_id,
        service_name,
        target,
        quantity,
        rate_unit,
        provider_rate,
        selling_rate,
        provider_amount,
        customer_amount,
        provider_charge,
        provider_currency,
        status,
        provider_status,
        provider_data,
        request_data,
        idempotency_key,
        failure_reason,
        phone_number,
        otp_code,
        otp_message,
        otp_received_at,
        provider_expires_at,
        start_count,
        remains,
        created_at,
        updated_at,
        completed_at,
        cancelled_at
      FROM orders
      WHERE provider = ?
        AND external_order_id = ?
      LIMIT 1
      `
    )
    .bind(
      NOKOS_PROVIDER,
      String(externalOrderId)
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
      SELECT
        id,
        user_id,
        order_number,
        type,
        provider,
        external_order_id,
        service_id,
        service_name,
        target,
        quantity,
        rate_unit,
        provider_rate,
        selling_rate,
        provider_amount,
        customer_amount,
        provider_charge,
        provider_currency,
        status,
        provider_status,
        provider_data,
        request_data,
        idempotency_key,
        failure_reason,
        phone_number,
        otp_code,
        otp_message,
        otp_received_at,
        provider_expires_at,
        start_count,
        remains,
        created_at,
        updated_at,
        completed_at,
        cancelled_at
      FROM orders
      WHERE user_id = ?
        AND idempotency_key = ?
        AND type = ?
      LIMIT 1
      `
    )
    .bind(
      userId,
      idempotencyKey,
      ORDER_TYPE
    )
    .first();
}

async function getProductForOrder(
  env,
  {
    productId,
    catalogProductId,
    operatorId,
    minPrice,
    maxPrice
  }
) {
  if (productId) {
    const product =
      await getProduct(
        env,
        productId
      );

    if (!product) {
      throw new Error(
        "Produk NOKOS tidak ditemukan."
      );
    }

    return product;
  }

  const products =
    await getProducts(
      env,
      {
        catalogProductId,
        operatorId,
        minPrice,
        maxPrice,
        available: true,
        active: true
      }
    );

  if (
    !Array.isArray(products) ||
    !products.length
  ) {
    throw new Error(
      "Produk NOKOS tidak tersedia."
    );
  }

  return products[0];
}

function getProductPrice(product) {
  const values = [
    product?.price,
    product?.selling_price,
    product?.amount
  ];

  for (const value of values) {
    const number = Number(value);

    if (
      Number.isFinite(number) &&
      number >= 0
    ) {
      return Math.round(number);
    }
  }

  return 0;
}

function getProductName(product) {
  return (
    product?.name ||
    product?.service_name ||
    product?.product_name ||
    "NOKOS"
  );
}

function getProductServiceId(product) {
  return (
    product?.id ??
    product?.product_id ??
    product?.productId ??
    null
  );
}

function getCatalogProductId(product) {
  return (
    product?.catalog_product_id ??
    product?.catalogProductId ??
    null
  );
}

function getProductCountry(product) {
  return (
    product?.country_name ||
    product?.country ||
    null
  );
}

function getProductPlatform(product) {
  return (
    product?.platform_name ||
    product?.platform ||
    null
  );
}

function getProductOperator(product) {
  return (
    product?.operator_name ||
    product?.operator ||
    null
  );
}

async function saveNokosService(
  env,
  product
) {
  const productId =
    Number(
      getProductServiceId(product)
    );

  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    return;
  }

  const catalogProductId =
    Number(
      getCatalogProductId(product)
    ) || productId;

  const countryId =
    Number(product?.country_id) ||
    null;

  const platformId =
    Number(product?.platform_id) ||
    null;

  const operatorId =
    Number(product?.operator_id) ||
    null;

  const countryName =
    getProductCountry(product);

  const platformName =
    getProductPlatform(product);

  const operatorName =
    getProductOperator(product);

  const serviceName =
    getProductName(product);

  const providerPrice =
    getProductPrice(product);

  const available =
    product?.available === false
      ? 0
      : 1;

  const active =
    product?.active === false
      ? 0
      : 1;

  const metadata =
    getProviderData(product);

  const timestamp =
    nowUnix();

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
      productId,
      catalogProductId,
      countryId,
      countryName,
      platformId,
      platformName,
      operatorId,
      operatorName,
      serviceName,
      providerPrice,
      providerPrice,
      available,
      active,
      metadata,
      timestamp,
      timestamp
    )
    .run();
}

async function createLocalOrder(
  env,
  {
    userId,
    product,
    quantity,
    target,
    idempotencyKey,
    requestData
  }
) {
  const timestamp =
    nowUnix();

  const productId =
    getProductServiceId(product);

  const catalogProductId =
    getCatalogProductId(product);

  const serviceName =
    getProductName(product);

  const providerRate =
    getProductPrice(product);

  const customerAmount =
    providerRate * quantity;

  const orderNumber =
    generateOrderNumber("NK");

  const result =
    await env.DB
      .prepare(
        `
        INSERT INTO orders (
          user_id,
          order_number,
          type,
          provider,
          external_order_id,
          service_id,
          service_name,
          target,
          quantity,
          rate_unit,
          provider_rate,
          selling_rate,
          provider_amount,
          customer_amount,
          provider_charge,
          provider_currency,
          status,
          provider_status,
          provider_data,
          request_data,
          idempotency_key,
          failure_reason,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'FIXED', ?, ?, ?, ?, NULL, 'IDR', 'CREATING', NULL, NULL, ?, ?, NULL, ?, ?)
        `
      )
      .bind(
        userId,
        orderNumber,
        ORDER_TYPE,
        NOKOS_PROVIDER,
        String(
          productId ??
          catalogProductId
        ),
        serviceName,
        target || null,
        quantity,
        providerRate,
        providerRate,
        customerAmount,
        customerAmount,
        requestData,
        idempotencyKey || null,
        timestamp,
        timestamp
      )
      .run();

  return {
    id: result.meta.last_row_id,
    orderNumber,
    customerAmount,
    providerRate,
    serviceName,
    productId,
    catalogProductId
  };
}

async function addOrderEvent(
  env,
  orderId,
  status,
  providerStatus,
  message,
  providerData
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
      providerStatus || null,
      message || null,
      providerData || null,
      nowUnix()
    )
    .run();
}

async function updateLocalOrder(
  env,
  orderId,
  {
    externalOrderId,
    status,
    providerStatus,
    providerData,
    failureReason,
    providerAmount,
    providerCharge,
    phoneNumber,
    otpCode,
    otpMessage,
    otpReceivedAt,
    providerExpiresAt,
    startCount,
    remains,
    completedAt,
    cancelledAt
  } = {}
) {
  const timestamp =
    nowUnix();

  const current =
    await env.DB
      .prepare(
        `
        SELECT
          status,
          external_order_id,
          provider_amount,
          provider_charge,
          phone_number,
          otp_code,
          otp_message,
          otp_received_at,
          provider_expires_at,
          start_count,
          remains,
          completed_at,
          cancelled_at
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

  const nextStatus =
    status ||
    current.status ||
    "UNKNOWN";

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
      externalOrderId ??
        current.external_order_id ??
        null,
      nextStatus,
      providerStatus ??
        null,
      providerData ??
        null,
      failureReason ??
        null,
      providerAmount ??
        current.provider_amount ??
        0,
      providerCharge ??
        current.provider_charge ??
        null,
      phoneNumber ??
        current.phone_number ??
        null,
      otpCode ??
        current.otp_code ??
        null,
      otpMessage ??
        current.otp_message ??
        null,
      otpReceivedAt ??
        current.otp_received_at ??
        null,
      providerExpiresAt ??
        current.provider_expires_at ??
        null,
      startCount ??
        current.start_count ??
        null,
      remains ??
        current.remains ??
        null,
      completedAt ??
        current.completed_at ??
        null,
      cancelledAt ??
        current.cancelled_at ??
        null,
      timestamp,
      orderId
    )
    .run();

  await addOrderEvent(
    env,
    orderId,
    nextStatus,
    providerStatus,
    failureReason,
    providerData
  );
}

function isDefiniteProviderFailure(error) {
  const status =
    Number(error?.status);

  if (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return true;
  }

  return false;
}

async function refundFailedCreation(
  env,
  orderId,
  userId,
  amount,
  orderNumber
) {
  if (!amount || amount <= 0) {
    return;
  }

  await refundBalance(
    env,
    userId,
    amount,
    `REFUND:${orderNumber}`,
    `Refund NOKOS ${orderNumber}`
  );

  await updateLocalOrder(
    env,
    orderId,
    {
      status: "REFUNDED",
      failureReason:
        "Order provider gagal dan saldo dikembalikan."
    }
  );
}

function serializeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    order_number: order.order_number,
    type: order.type,
    provider: order.provider,
    external_order_id:
      order.external_order_id,
    service_id: order.service_id,
    service_name: order.service_name,
    target: order.target,
    quantity: order.quantity,
    rate_unit: order.rate_unit,
    provider_rate: order.provider_rate,
    selling_rate: order.selling_rate,
    provider_amount: order.provider_amount,
    customer_amount: order.customer_amount,
    provider_charge: order.provider_charge,
    provider_currency: order.provider_currency,
    status: order.status,
    provider_status: order.provider_status,
    failure_reason: order.failure_reason,
    phone_number: order.phone_number,
    otp_code: order.otp_code,
    otp_message: order.otp_message,
    otp_received_at:
      order.otp_received_at,
    provider_expires_at:
      order.provider_expires_at,
    start_count: order.start_count,
    remains: order.remains,
    created_at: order.created_at,
    updated_at: order.updated_at,
    completed_at: order.completed_at,
    cancelled_at: order.cancelled_at
  };
}

async function loadOrderEvents(
  env,
  orderId
) {
  const result =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        FROM order_events
        WHERE order_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        `
      )
      .bind(orderId)
      .all();

  return Array.isArray(result.results)
    ? result.results
    : [];
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
      getUrl(request);

    const productId =
      normalizeProductId(
        url.searchParams.get("product_id")
      );

    const catalogProductId =
      normalizeCatalogProductId(
        url.searchParams.get(
          "catalog_product_id"
        )
      );

    const operatorId =
      normalizeOperatorId(
        url.searchParams.get("operator_id")
      );

    const minPrice =
      normalizePrice(
        url.searchParams.get("min_price")
      );

    const maxPrice =
      normalizePrice(
        url.searchParams.get("max_price")
      );

    const products =
      await getProducts(
        env,
        {
          productId,
          catalogProductId,
          operatorId,
          minPrice,
          maxPrice,
          available: true,
          active: true
        }
      );

    for (const product of products) {
      try {
        await saveNokosService(
          env,
          product
        );
      } catch {}
    }

    return successResponse({
      products
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil produk NOKOS.",
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
      getUrl(request);

    const orderId =
      parsePositiveInteger(
        url.searchParams.get("id")
      );

    const orderNumber =
      cleanString(
        url.searchParams.get(
          "order_number"
        ) || "",
        120
      );

    let order = null;

    if (orderId) {
      order =
        await findOrderById(
          env,
          user.id,
          orderId
        );
    } else if (orderNumber) {
      order =
        await findLocalOrder(
          env,
          user.id,
          orderNumber
        );
    }

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (order.external_order_id) {
      try {
        const providerOrder =
          await getOrder(
            env,
            order.external_order_id
          );

        const providerStatus =
          getProviderStatus(
            providerOrder
          );

        const status =
          internalStatus(
            providerStatus
          );

        await updateLocalOrder(
          env,
          order.id,
          {
            externalOrderId:
              getProviderOrderId(
                providerOrder
              ) ||
              order.external_order_id,
            status,
            providerStatus,
            providerData:
              getProviderData(
                providerOrder
              ),
            failureReason:
              getProviderFailure(
                providerOrder
              ),
            providerAmount:
              getProviderAmount(
                providerOrder
              ),
            phoneNumber:
              getProviderPhone(
                providerOrder
              ),
            otpCode:
              getProviderOtp(
                providerOrder
              ),
            otpMessage:
              getProviderOtpMessage(
                providerOrder
              ),
            otpReceivedAt:
              providerStatus ===
              "OTP_RECEIVED"
                ? nowUnix()
                : order.otp_received_at,
            providerExpiresAt:
              getProviderExpiresAt(
                providerOrder
              ),
            completedAt:
              status === "COMPLETED"
                ? nowUnix()
                : order.completed_at,
            cancelledAt:
              status === "CANCELLED"
                ? nowUnix()
                : order.cancelled_at
          }
        );

        order =
          await findOrderById(
            env,
            user.id,
            order.id
          );
      } catch {}
    }

    const events =
      await loadOrderEvents(
        env,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(order),
      events
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil order NOKOS.",
      error?.status || 500
    );
  }
}

export async function createNokosOrder(
  request,
  env
) {
  let orderId = null;
  let userId = null;
  let customerAmount = 0;
  let orderNumber = null;
  let debited = false;

  try {
    const user =
      await requireAuth(
        request,
        env
      );

    userId = user.id;

    const payload =
      await readJson(request);

    const validation =
      validateCreatePayload(
        payload
      );

    if (validation.error) {
      return errorResponse(
        validation.error,
        400
      );
    }

    const {
      productId,
      catalogProductId,
      operatorId,
      quantity,
      minPrice,
      maxPrice,
      target,
      idempotencyKey
    } = validation.value;

    if (idempotencyKey) {
      const existing =
        await findOrderByIdempotency(
          env,
          user.id,
          idempotencyKey
        );

      if (existing) {
        return successResponse({
          idempotent: true,
          order:
            serializeOrder(existing)
        });
      }
    }

    const product =
      await getProductForOrder(
        env,
        {
          productId,
          catalogProductId,
          operatorId,
          minPrice,
          maxPrice
        }
      );

    if (
      product?.available === false ||
      product?.active === false
    ) {
      return errorResponse(
        "Produk NOKOS sedang tidak tersedia.",
        409
      );
    }

    await saveNokosService(
      env,
      product
    );

    const providerRate =
      getProductPrice(product);

    if (
      !Number.isFinite(providerRate) ||
      providerRate <= 0
    ) {
      return errorResponse(
        "Harga produk NOKOS tidak valid.",
        409
      );
    }

    customerAmount =
      providerRate * quantity;

    if (
      !Number.isSafeInteger(
        customerAmount
      ) ||
      customerAmount <= 0
    ) {
      return errorResponse(
        "Total harga NOKOS tidak valid.",
        400
      );
    }

    const requestData =
      JSON.stringify({
        product_id:
          productId,
        catalog_product_id:
          catalogProductId,
        operator_id:
          operatorId,
        quantity,
        min_price:
          minPrice,
        max_price:
          maxPrice,
        target:
          target || null
      });

    const local =
      await createLocalOrder(
        env,
        {
          userId: user.id,
          product,
          quantity,
          target,
          idempotencyKey,
          requestData
        }
      );

    orderId =
      local.id;

    orderNumber =
      local.orderNumber;

    await addOrderEvent(
      env,
      orderId,
      "CREATING",
      null,
      "Order NOKOS dibuat.",
      null
    );

    const debit =
      await debitBalance(
        env,
        user.id,
        customerAmount,
        `ORDER:${orderNumber}`,
        `Pembelian NOKOS ${orderNumber}`,
        orderId
      );

    if (!debit?.success) {
      await updateLocalOrder(
        env,
        orderId,
        {
          status: "FAILED",
          failureReason:
            "Saldo tidak mencukupi."
        }
      );

      return errorResponse(
        "Saldo tidak mencukupi.",
        402
      );
    }

    debited = true;

    await updateLocalOrder(
      env,
      orderId,
      {
        status: "PROCESSING"
      }
    );

    let providerOrder;

    try {
      providerOrder =
        await createOrder(
          env,
          {
            productId:
              product?.id ??
              product?.product_id ??
              productId,
            catalogProductId:
              product?.catalog_product_id ??
              catalogProductId,
            operatorId:
              product?.operator_id ??
              operatorId,
            quantity,
            idempotencyKey:
              idempotencyKey ||
              orderNumber
          }
        );
    } catch (error) {
      if (
        isDefiniteProviderFailure(
          error
        )
      ) {
        await refundFailedCreation(
          env,
          orderId,
          user.id,
          customerAmount,
          orderNumber
        );

        return errorResponse(
          error?.message ||
          "Provider menolak order NOKOS.",
          502
        );
      }

      await updateLocalOrder(
        env,
        orderId,
        {
          status: "UNKNOWN",
          failureReason:
            "Status provider tidak dapat dipastikan."
        }
      );

      return errorResponse(
        "Order sedang diproses tetapi status provider belum dapat dipastikan.",
        202
      );
    }

    const externalOrderId =
      getProviderOrderId(
        providerOrder
      );

    const providerStatus =
      getProviderStatus(
        providerOrder
      );

    const status =
      internalStatus(
        providerStatus
      );

    const providerAmount =
      getProviderAmount(
        providerOrder
      );

    const finalProviderAmount =
      providerAmount > 0
        ? providerAmount
        : customerAmount;

    const otpReceivedAt =
      providerStatus ===
      "OTP_RECEIVED"
        ? nowUnix()
        : null;

    await updateLocalOrder(
      env,
      orderId,
      {
        externalOrderId,
        status:
          status === "UNKNOWN"
            ? "PROCESSING"
            : status,
        providerStatus,
        providerData:
          getProviderData(
            providerOrder
          ),
        failureReason:
          getProviderFailure(
            providerOrder
          ),
        providerAmount:
          finalProviderAmount,
        providerCharge:
          getProviderAmount(
            providerOrder
          ),
        phoneNumber:
          getProviderPhone(
            providerOrder
          ),
        otpCode:
          getProviderOtp(
            providerOrder
          ),
        otpMessage:
          getProviderOtpMessage(
            providerOrder
          ),
        otpReceivedAt,
        providerExpiresAt:
          getProviderExpiresAt(
            providerOrder
          ),
        completedAt:
          status === "COMPLETED"
            ? nowUnix()
            : null,
        cancelledAt:
          status === "CANCELLED"
            ? nowUnix()
            : null
      }
    );

    const saved =
      await findOrderById(
        env,
        user.id,
        orderId
      );

    return successResponse({
      order:
        serializeOrder(saved)
    }, 201);
  } catch (error) {
    if (
      orderId &&
      userId &&
      debited
    ) {
      try {
        await updateLocalOrder(
          env,
          orderId,
          {
            status: "UNKNOWN",
            failureReason:
              error?.message ||
              "Terjadi kesalahan yang belum dapat dipastikan."
          }
        );
      } catch {}
    }

    return errorResponse(
      error?.message ||
      "Gagal membuat order NOKOS.",
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
        payload?.order_id ??
        payload?.orderId
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrderById(
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

    if (
      [
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
        "FAILED"
      ].includes(order.status)
    ) {
      return successResponse({
        order:
          serializeOrder(order)
      });
    }

    let providerOrder;

    try {
      providerOrder =
        await cancelOrder(
          env,
          order.external_order_id
        );
    } catch (error) {
      await updateLocalOrder(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            error?.message ||
            "Pembatalan provider belum dapat dipastikan."
        }
      );

      return errorResponse(
        "Pembatalan belum dapat dipastikan. Jangan melakukan pembayaran ulang.",
        502
      );
    }

    const providerStatus =
      getProviderStatus(
        providerOrder
      );

    const status =
      internalStatus(
        providerStatus
      );

    if (status !== "CANCELLED") {
      await updateLocalOrder(
        env,
        order.id,
        {
          status,
          providerStatus,
          providerData:
            getProviderData(
              providerOrder
            ),
          failureReason:
            getProviderFailure(
              providerOrder
            )
        }
      );

      return successResponse({
        order:
          serializeOrder(
            await findOrderById(
              env,
              user.id,
              order.id
            )
          ),
        refunded: false
      });
    }

    const refundReference =
      `REFUND:${order.order_number}`;

    let refunded = false;

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
        refund?.success !== false;
    } catch {
      refunded = false;
    }

    await updateLocalOrder(
      env,
      order.id,
      {
        status:
          refunded
            ? "REFUNDED"
            : "CANCELLED",
        providerStatus,
        providerData:
          getProviderData(
            providerOrder
          ),
        failureReason:
          refunded
            ? null
            : "Provider berhasil membatalkan order tetapi refund wallet belum berhasil.",
        cancelledAt:
          nowUnix()
      }
    );

    const saved =
      await findOrderById(
        env,
        user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(saved),
      refunded
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
        payload?.order_id ??
        payload?.orderId
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrderById(
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

    if (
      order.status === "COMPLETED"
    ) {
      return successResponse({
        order:
          serializeOrder(order)
      });
    }

    let providerOrder;

    try {
      providerOrder =
        await finishOrder(
          env,
          order.external_order_id
        );
    } catch (error) {
      await updateLocalOrder(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            error?.message ||
            "Penyelesaian order belum dapat dipastikan."
        }
      );

      return errorResponse(
        "Status penyelesaian order belum dapat dipastikan.",
        502
      );
    }

    const providerStatus =
      getProviderStatus(
        providerOrder
      );

    const status =
      internalStatus(
        providerStatus
      );

    await updateLocalOrder(
      env,
      order.id,
      {
        status,
        providerStatus,
        providerData:
          getProviderData(
            providerOrder
          ),
        failureReason:
          getProviderFailure(
            providerOrder
          ),
        phoneNumber:
          getProviderPhone(
            providerOrder
          ),
        otpCode:
          getProviderOtp(
            providerOrder
          ),
        otpMessage:
          getProviderOtpMessage(
            providerOrder
          ),
        completedAt:
          status === "COMPLETED"
            ? nowUnix()
            : order.completed_at
      }
    );

    const saved =
      await findOrderById(
        env,
        user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(saved)
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
        payload?.order_id ??
        payload?.orderId
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrderById(
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

    let providerOrder;

    try {
      providerOrder =
        await resendOrder(
          env,
          order.external_order_id
        );
    } catch (error) {
      return errorResponse(
        error?.message ||
        "Gagal meminta OTP ulang.",
        error?.status || 502
      );
    }

    const providerStatus =
      getProviderStatus(
        providerOrder
      );

    const status =
      internalStatus(
        providerStatus
      );

    await updateLocalOrder(
      env,
      order.id,
      {
        status,
        providerStatus,
        providerData:
          getProviderData(
            providerOrder
          ),
        failureReason:
          getProviderFailure(
            providerOrder
          ),
        phoneNumber:
          getProviderPhone(
            providerOrder
          ),
        otpCode:
          getProviderOtp(
            providerOrder
          ),
        otpMessage:
          getProviderOtpMessage(
            providerOrder
          ),
        otpReceivedAt:
          providerStatus ===
          "OTP_RECEIVED"
            ? nowUnix()
            : order.otp_received_at,
        providerExpiresAt:
          getProviderExpiresAt(
            providerOrder
          )
      }
    );

    const saved =
      await findOrderById(
        env,
        user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(saved)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal meminta OTP ulang.",
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
      getUrl(request);

    const limitRaw =
      parsePositiveInteger(
        url.searchParams.get("limit")
      );

    const limit =
      Math.min(
        limitRaw || 20,
        100
      );

    const offsetRaw =
      Number(
        url.searchParams.get("offset")
      );

    const offset =
      Number.isInteger(offsetRaw) &&
      offsetRaw >= 0
        ? offsetRaw
        : 0;

    const status =
      cleanString(
        url.searchParams.get(
          "status"
        ) || "",
        40
      ).toUpperCase();

    let query = `
      SELECT
        id,
        user_id,
        order_number,
        type,
        provider,
        external_order_id,
        service_id,
        service_name,
        target,
        quantity,
        rate_unit,
        provider_rate,
        selling_rate,
        provider_amount,
        customer_amount,
        provider_charge,
        provider_currency,
        status,
        provider_status,
        provider_data,
        request_data,
        idempotency_key,
        failure_reason,
        phone_number,
        otp_code,
        otp_message,
        otp_received_at,
        provider_expires_at,
        start_count,
        remains,
        created_at,
        updated_at,
        completed_at,
        cancelled_at
      FROM orders
      WHERE user_id = ?
        AND type = ?
    `;

    const binds = [
      user.id,
      ORDER_TYPE
    ];

    if (
      status &&
      ORDER_STATUSES.has(status)
    ) {
      query +=
        " AND status = ?";
      binds.push(status);
    }

    query +=
      " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?";

    binds.push(
      limit,
      offset
    );

    const result =
      await env.DB
        .prepare(query)
        .bind(...binds)
        .all();

    const orders =
      Array.isArray(result.results)
        ? result.results.map(
            serializeOrder
          )
        : [];

    return successResponse({
      orders,
      limit,
      offset
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil daftar order NOKOS.",
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
        payload?.order_id ??
        payload?.orderId
      );

    if (!orderId) {
      return errorResponse(
        "order_id wajib diisi.",
        400
      );
    }

    const order =
      await findOrderById(
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

    let providerOrder;

    try {
      providerOrder =
        await getOrder(
          env,
          order.external_order_id
        );
    } catch (error) {
      await updateLocalOrder(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            error?.message ||
            "Provider tidak dapat dihubungi."
        }
      );

      return errorResponse(
        "Status provider belum dapat diperbarui.",
        502
      );
    }

    const providerStatus =
      getProviderStatus(
        providerOrder
      );

    const status =
      internalStatus(
        providerStatus
      );

    await updateLocalOrder(
      env,
      order.id,
      {
        externalOrderId:
          getProviderOrderId(
            providerOrder
          ) ||
          order.external_order_id,
        status,
        providerStatus,
        providerData:
          getProviderData(
            providerOrder
          ),
        failureReason:
          getProviderFailure(
            providerOrder
          ),
        providerAmount:
          getProviderAmount(
            providerOrder
          ),
        providerCharge:
          getProviderAmount(
            providerOrder
          ),
        phoneNumber:
          getProviderPhone(
            providerOrder
          ),
        otpCode:
          getProviderOtp(
            providerOrder
          ),
        otpMessage:
          getProviderOtpMessage(
            providerOrder
          ),
        otpReceivedAt:
          providerStatus ===
          "OTP_RECEIVED"
            ? nowUnix()
            : order.otp_received_at,
        providerExpiresAt:
          getProviderExpiresAt(
            providerOrder
          ),
        completedAt:
          status === "COMPLETED"
            ? nowUnix()
            : order.completed_at,
        cancelledAt:
          status === "CANCELLED"
            ? nowUnix()
            : order.cancelled_at
      }
    );

    const saved =
      await findOrderById(
        env,
        user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(saved)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal sinkronisasi order NOKOS.",
      error?.status || 500
    );
  }
}

export async function adminListNokosOrders(
  request,
  env
) {
  try {
    await requireAdmin(
      request,
      env
    );

    const url =
      getUrl(request);

    const limitRaw =
      parsePositiveInteger(
        url.searchParams.get("limit")
      );

    const limit =
      Math.min(
        limitRaw || 50,
        200
      );

    const offsetRaw =
      Number(
        url.searchParams.get("offset")
      );

    const offset =
      Number.isInteger(offsetRaw) &&
      offsetRaw >= 0
        ? offsetRaw
        : 0;

    const status =
      cleanString(
        url.searchParams.get(
          "status"
        ) || "",
        40
      ).toUpperCase();

    const userId =
      parsePositiveInteger(
        url.searchParams.get("user_id")
      );

    let query = `
      SELECT
        o.id,
        o.user_id,
        u.username,
        u.first_name,
        o.order_number,
        o.type,
        o.provider,
        o.external_order_id,
        o.service_id,
        o.service_name,
        o.target,
        o.quantity,
        o.rate_unit,
        o.provider_rate,
        o.selling_rate,
        o.provider_amount,
        o.customer_amount,
        o.provider_charge,
        o.provider_currency,
        o.status,
        o.provider_status,
        o.failure_reason,
        o.phone_number,
        o.otp_code,
        o.otp_message,
        o.otp_received_at,
        o.provider_expires_at,
        o.start_count,
        o.remains,
        o.created_at,
        o.updated_at,
        o.completed_at,
        o.cancelled_at
      FROM orders o
      INNER JOIN users u
        ON u.id = o.user_id
      WHERE o.type = ?
    `;

    const binds = [
      ORDER_TYPE
    ];

    if (
      status &&
      ORDER_STATUSES.has(status)
    ) {
      query +=
        " AND o.status = ?";
      binds.push(status);
    }

    if (userId) {
      query +=
        " AND o.user_id = ?";
      binds.push(userId);
    }

    query +=
      " ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?";

    binds.push(
      limit,
      offset
    );

    const result =
      await env.DB
        .prepare(query)
        .bind(...binds)
        .all();

    return successResponse({
      orders:
        Array.isArray(result.results)
          ? result.results
          : [],
      limit,
      offset
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil order NOKOS.",
      error?.status || 500
    );
  }
}

export async function adminGetNokosOrder(
  request,
  env
) {
  try {
    await requireAdmin(
      request,
      env
    );

    const url =
      getUrl(request);

    const orderId =
      parsePositiveInteger(
        url.searchParams.get("id")
      );

    if (!orderId) {
      return errorResponse(
        "id order wajib diisi.",
        400
      );
    }

    const order =
      await env.DB
        .prepare(
          `
          SELECT
            o.*,
            u.username,
            u.first_name
          FROM orders o
          INNER JOIN users u
            ON u.id = o.user_id
          WHERE o.id = ?
            AND o.type = ?
          LIMIT 1
          `
        )
        .bind(
          orderId,
          ORDER_TYPE
        )
        .first();

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    const events =
      await loadOrderEvents(
        env,
        order.id
      );

    return successResponse({
      order,
      events
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil detail order NOKOS.",
      error?.status || 500
    );
  }
}

export async function syncNokosProviderOrder(
  env,
  order
) {
  if (
    !order?.external_order_id
  ) {
    return order;
  }

  const providerOrder =
    await getOrder(
      env,
      order.external_order_id
    );

  const providerStatus =
    getProviderStatus(
      providerOrder
    );

  const status =
    internalStatus(
      providerStatus
    );

  await updateLocalOrder(
    env,
    order.id,
    {
      externalOrderId:
        getProviderOrderId(
          providerOrder
        ) ||
        order.external_order_id,
      status,
      providerStatus,
      providerData:
        getProviderData(
          providerOrder
        ),
      failureReason:
        getProviderFailure(
          providerOrder
        ),
      providerAmount:
        getProviderAmount(
          providerOrder
        ),
      providerCharge:
        getProviderAmount(
          providerOrder
        ),
      phoneNumber:
        getProviderPhone(
          providerOrder
        ),
      otpCode:
        getProviderOtp(
          providerOrder
        ),
      otpMessage:
        getProviderOtpMessage(
          providerOrder
        ),
      otpReceivedAt:
        providerStatus ===
        "OTP_RECEIVED"
          ? nowUnix()
          : order.otp_received_at,
      providerExpiresAt:
        getProviderExpiresAt(
          providerOrder
        ),
      completedAt:
        status === "COMPLETED"
          ? nowUnix()
          : order.completed_at,
      cancelledAt:
        status === "CANCELLED"
          ? nowUnix()
          : order.cancelled_at
    }
  );

  return env.DB
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
      `
    )
    .bind(order.id)
    .first();
}

export async function getNokosStats(
  request,
  env
) {
  try {
    await requireAdmin(
      request,
      env
    );

    const result =
      await env.DB
        .prepare(
          `
          SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN status = 'CREATING'
                THEN 1
                ELSE 0
              END
            ) AS creating,
            SUM(
              CASE
                WHEN status = 'PROCESSING'
                THEN 1
                ELSE 0
              END
            ) AS processing,
            SUM(
              CASE
                WHEN status = 'OTP_RECEIVED'
                THEN 1
                ELSE 0
              END
            ) AS otp_received,
            SUM(
              CASE
                WHEN status = 'COMPLETED'
                THEN 1
                ELSE 0
              END
            ) AS completed,
            SUM(
              CASE
                WHEN status = 'CANCELLED'
                THEN 1
                ELSE 0
              END
            ) AS cancelled,
            SUM(
              CASE
                WHEN status = 'EXPIRED'
                THEN 1
                ELSE 0
              END
            ) AS expired,
            SUM(
              CASE
                WHEN status = 'REFUNDED'
                THEN 1
                ELSE 0
              END
            ) AS refunded,
            SUM(
              CASE
                WHEN status = 'FAILED'
                THEN 1
                ELSE 0
              END
            ) AS failed,
            SUM(
              CASE
                WHEN status = 'UNKNOWN'
                THEN 1
                ELSE 0
              END
            ) AS unknown,
            COALESCE(
              SUM(customer_amount),
              0
            ) AS customer_amount
          FROM orders
          WHERE type = ?
          `
        )
        .bind(
          ORDER_TYPE
        )
        .first();

    return successResponse({
      stats: {
        total:
          Number(
            result?.total || 0
          ),
        creating:
          Number(
            result?.creating || 0
          ),
        processing:
          Number(
            result?.processing || 0
          ),
        otp_received:
          Number(
            result?.otp_received || 0
          ),
        completed:
          Number(
            result?.completed || 0
          ),
        cancelled:
          Number(
            result?.cancelled || 0
          ),
        expired:
          Number(
            result?.expired || 0
          ),
        refunded:
          Number(
            result?.refunded || 0
          ),
        failed:
          Number(
            result?.failed || 0
          ),
        unknown:
          Number(
            result?.unknown || 0
          ),
        customer_amount:
          Number(
            result?.customer_amount || 0
          )
      }
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal mengambil statistik NOKOS.",
      error?.status || 500
    );
  }
}

export async function handleNokos(
  request,
  env
) {
  const url =
    getUrl(request);

  const path =
    url.pathname
      .replace(/\/+$/, "")
      || "/";

  if (
    request.method === "GET" &&
    (
      path === "/api/nokos/products" ||
      path === "/api/nokos/services"
    )
  ) {
    return listNokosProducts(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path === "/api/nokos/orders"
  ) {
    return createNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/nokos/orders"
  ) {
    return listMyNokosOrders(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/nokos/order"
  ) {
    return getNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path === "/api/nokos/order/sync"
  ) {
    return syncNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path === "/api/nokos/order/cancel"
  ) {
    return cancelNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path === "/api/nokos/order/finish"
  ) {
    return finishNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path === "/api/nokos/order/resend"
  ) {
    return resendNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/admin/nokos/orders"
  ) {
    return adminListNokosOrders(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/admin/nokos/order"
  ) {
    return adminGetNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path === "/api/admin/nokos/stats"
  ) {
    return getNokosStats(
      request,
      env
    );
  }

  return errorResponse(
    "Endpoint NOKOS tidak ditemukan.",
    404
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
  adminListNokosOrders,
  adminGetNokosOrder,
  getNokosStats,
  syncNokosProviderOrder
};