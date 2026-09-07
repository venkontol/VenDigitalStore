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
  nowUnix
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

const ORDER_COLUMNS = `
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
`;

function internalStatus(providerStatus) {
  const status =
    mapStatus(providerStatus);

  return ORDER_STATUSES.has(status)
    ? status
    : "UNKNOWN";
}

function getProviderStatus(data) {
  return String(
    data?.status ||
    data?.provider_status ||
    data?.order?.status ||
    ""
  )
    .trim()
    .toUpperCase();
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
    const number =
      Number(value);

    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(number)
    ) {
      return Math.max(
        0,
        Math.round(number)
      );
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
    data?.order?.otp ||
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
    data?.expires_at ??
    data?.expired_at ??
    data?.order?.expires_at ??
    null;

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number" ||
    /^\d+$/.test(String(value))
  ) {
    const number =
      Number(value);

    if (
      number > 100000000000
    ) {
      return Math.floor(
        number / 1000
      );
    }

    return number;
  }

  const timestamp =
    Math.floor(
      new Date(value).getTime() /
        1000
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
    return JSON.stringify(
      data ?? null
    );
  } catch {
    return null;
  }
}

function normalizeTarget(value) {
  return cleanString(
    value,
    500
  );
}

function normalizeProductId(value) {
  return (
    parsePositiveInteger(
      value
    ) || null
  );
}

function normalizeCatalogProductId(value) {
  return (
    parsePositiveInteger(
      value
    ) || null
  );
}

function normalizeOperatorId(value) {
  return (
    parsePositiveInteger(
      value
    ) || null
  );
}

function normalizeQuantity(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 1;
  }

  return (
    parsePositiveInteger(
      value
    ) || 0
  );
}

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return Math.round(number);
}

function normalizeIdempotencyKey(
  value
) {
  const key =
    cleanString(
      value ?? "",
      120
    );

  return key || null;
}

function validateCreatePayload(
  payload
) {
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
      payload?.target ??
      payload?.phone_number ??
      ""
    );

  const idempotencyKey =
    normalizeIdempotencyKey(
      payload?.idempotency_key ??
      payload?.idempotencyKey
    );

  if (
    !productId &&
    !catalogProductId
  ) {
    return {
      error:
        "product_id atau catalog_product_id wajib diisi."
    };
  }

  if (!quantity) {
    return {
      error:
        "quantity tidak valid."
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
      idempotencyKey
    }
  };
}

async function findOrderById(
  env,
  userId,
  orderId
) {
  return env.DB
    .prepare(`
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE id = ?
        AND user_id = ?
        AND type = ?
      LIMIT 1
    `)
    .bind(
      orderId,
      userId,
      ORDER_TYPE
    )
    .first();
}

async function findOrderByNumber(
  env,
  userId,
  orderNumber
) {
  return env.DB
    .prepare(`
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE order_number = ?
        AND user_id = ?
        AND type = ?
      LIMIT 1
    `)
    .bind(
      orderNumber,
      userId,
      ORDER_TYPE
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
    .prepare(`
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE provider = ?
        AND external_order_id = ?
      LIMIT 1
    `)
    .bind(
      NOKOS_PROVIDER,
      String(
        externalOrderId
      )
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
    .prepare(`
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE user_id = ?
        AND idempotency_key = ?
        AND type = ?
      LIMIT 1
    `)
    .bind(
      userId,
      idempotencyKey,
      ORDER_TYPE
    )
    .first();
}

async function findOrderIdentifier(
  request,
  env,
  userId,
  body = null
) {
  const url =
    getUrl(request);

  const id =
    parsePositiveInteger(
      url.searchParams.get(
        "id"
      ) ??
      body?.id ??
      body?.order_id ??
      body?.orderId
    );

  const orderNumber =
    cleanString(
      url.searchParams.get(
        "order_number"
      ) ??
      body?.order_number ??
      body?.orderNumber ??
      "",
      120
    );

  if (id) {
    return findOrderById(
      env,
      userId,
      id
    );
  }

  if (orderNumber) {
    return findOrderByNumber(
      env,
      userId,
      orderNumber
    );
  }

  return null;
}

function getProductPrice(
  product
) {
  const values = [
    product?.price,
    product?.selling_price,
    product?.amount
  ];

  for (const value of values) {
    const number =
      Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return Math.round(
        number
      );
    }
  }

  return 0;
}

function getProductName(
  product
) {
  return (
    product?.name ||
    product?.service_name ||
    product?.product_name ||
    "NOKOS"
  );
}

function getProductServiceId(
  product
) {
  return (
    product?.id ??
    product?.product_id ??
    product?.productId ??
    null
  );
}

function getCatalogProductId(
  product
) {
  return (
    product?.catalog_product_id ??
    product?.catalogProductId ??
    null
  );
}

function getProductCountry(
  product
) {
  return (
    product?.country_name ||
    product?.country ||
    null
  );
}

function getProductPlatform(
  product
) {
  return (
    product?.platform_name ||
    product?.platform ||
    null
  );
}

function getProductOperator(
  product
) {
  return (
    product?.operator_name ||
    product?.operator ||
    null
  );
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
        platformId:
          undefined,
        serviceId:
          undefined,
        operatorId,
        minPrice,
        maxPrice
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

  const matched =
    products.find(
      product =>
        String(
          getCatalogProductId(
            product
          ) ?? ""
        ) ===
        String(
          catalogProductId
        )
    );

  return matched ||
    products[0];
}

async function saveNokosService(
  env,
  product
) {
  const productId =
    Number(
      getProductServiceId(
        product
      )
    );

  if (
    !Number.isInteger(
      productId
    ) ||
    productId <= 0
  ) {
    return null;
  }

  const catalogProductId =
    Number(
      getCatalogProductId(
        product
      )
    ) ||
    productId;

  const countryId =
    Number(
      product?.country_id
    ) || null;

  const platformId =
    Number(
      product?.platform_id
    ) || null;

  const operatorId =
    Number(
      product?.operator_id
    ) || null;

  const countryName =
    getProductCountry(
      product
    );

  const platformName =
    getProductPlatform(
      product
    );

  const operatorName =
    getProductOperator(
      product
    );

  const serviceName =
    getProductName(
      product
    );

  const providerPrice =
    getProductPrice(
      product
    );

  const available =
    product?.available === false
      ? 0
      : 1;

  const active =
    product?.active === false
      ? 0
      : 1;

  const metadata =
    getProviderData(
      product
    );

  const timestamp =
    nowUnix();

  await env.DB
    .prepare(`
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
        selling_price = excluded.selling_price,
        available = excluded.available,
        active = excluded.active,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `)
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

  return true;
}

async function createLocalOrder(
  env,
  {
    userId,
    product,
    quantity,
    target,
    idempotencyKey,
    requestData,
    customerAmount
  }
) {
  const timestamp =
    nowUnix();

  const productId =
    getProductServiceId(
      product
    );

  const catalogProductId =
    getCatalogProductId(
      product
    );

  const serviceName =
    getProductName(
      product
    );

  const providerRate =
    getProductPrice(
      product
    );

  const orderNumber =
    generateOrderNumber(
      "NK"
    );

  const result =
    await env.DB
      .prepare(`
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
        VALUES (
          ?,
          ?,
          ?,
          ?,
          NULL,
          ?,
          ?,
          ?,
          ?,
          'FIXED',
          ?,
          ?,
          ?,
          ?,
          NULL,
          'IDR',
          'CREATING',
          NULL,
          NULL,
          ?,
          ?,
          NULL,
          ?,
          ?
        )
      `)
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
        providerRate *
          quantity,
        customerAmount,
        requestData,
        idempotencyKey,
        timestamp,
        timestamp
      )
      .run();

  const id =
    Number(
      result?.meta?.last_row_id
    );

  if (!id) {
    throw new Error(
      "Gagal membuat order NOKOS."
    );
  }

  return {
    id,
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
  providerStatus = null,
  message = null,
  providerData = null
) {
  await env.DB
    .prepare(`
      INSERT INTO order_events (
        order_id,
        status,
        provider_status,
        message,
        provider_data,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      orderId,
      status,
      providerStatus,
      message,
      providerData,
      nowUnix()
    )
    .run();
}

async function updateLocalOrder(
  env,
  orderId,
  updates = {}
) {
  const current =
    await env.DB
      .prepare(`
        SELECT
          status,
          external_order_id,
          provider_status,
          provider_data,
          failure_reason,
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
      `)
      .bind(
        orderId
      )
      .first();

  if (!current) {
    throw new Error(
      "Order NOKOS tidak ditemukan."
    );
  }

  const status =
    updates.status ??
    current.status ??
    "UNKNOWN";

  const externalOrderId =
    updates.externalOrderId ??
    current.external_order_id ??
    null;

  const providerStatus =
    updates.providerStatus ??
    current.provider_status ??
    null;

  const providerData =
    updates.providerData ??
    current.provider_data ??
    null;

  const failureReason =
    updates.failureReason !== undefined
      ? updates.failureReason
      : current.failure_reason;

  const providerAmount =
    updates.providerAmount ??
    current.provider_amount ??
    0;

  const providerCharge =
    updates.providerCharge ??
    current.provider_charge ??
    null;

  const phoneNumber =
    updates.phoneNumber ??
    current.phone_number ??
    null;

  const otpCode =
    updates.otpCode ??
    current.otp_code ??
    null;

  const otpMessage =
    updates.otpMessage ??
    current.otp_message ??
    null;

  const otpReceivedAt =
    updates.otpReceivedAt ??
    current.otp_received_at ??
    null;

  const providerExpiresAt =
    updates.providerExpiresAt ??
    current.provider_expires_at ??
    null;

  const startCount =
    updates.startCount ??
    current.start_count ??
    null;

  const remains =
    updates.remains ??
    current.remains ??
    null;

  const completedAt =
    updates.completedAt !== undefined
      ? updates.completedAt
      : current.completed_at;

  const cancelledAt =
    updates.cancelledAt !== undefined
      ? updates.cancelledAt
      : current.cancelled_at;

  await env.DB
    .prepare(`
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
    `)
    .bind(
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
      cancelledAt,
      nowUnix(),
      orderId
    )
    .run();

  await addOrderEvent(
    env,
    orderId,
    status,
    providerStatus,
    failureReason,
    providerData
  );
}

function isDefiniteProviderFailure(
  error
) {
  const status =
    Number(
      error?.status
    );

  return (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 409 &&
    status !== 429
  );
}

async function refundFailedCreation(
  env,
  {
    orderId,
    userId,
    amount,
    orderNumber
  }
) {
  if (
    !Number.isSafeInteger(
      Number(amount)
    ) ||
    Number(amount) <= 0
  ) {
    return false;
  }

  const refund =
    await refundBalance(
      env,
      {
        userId,
        amount,
        reference:
          `REFUND:${orderNumber}`,
        description:
          `Refund NOKOS ${orderNumber}`,
        orderId
      }
    );

  await updateLocalOrder(
    env,
    orderId,
    {
      status:
        refund?.success === false
          ? "FAILED"
          : "REFUNDED",
      failureReason:
        refund?.success === false
          ? "Provider gagal dan refund saldo belum berhasil."
          : "Order provider gagal dan saldo dikembalikan."
    }
  );

  return (
    refund?.success !== false
  );
}

function serializeOrder(
  order
) {
  if (!order) {
    return null;
  }

  return {
    id: Number(order.id),
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
    rate_unit:
      order.rate_unit,
    provider_rate:
      Number(
        order.provider_rate || 0
      ),
    selling_rate:
      Number(
        order.selling_rate || 0
      ),
    provider_amount:
      Number(
        order.provider_amount || 0
      ),
    customer_amount:
      Number(
        order.customer_amount || 0
      ),
    provider_charge:
      Number(
        order.provider_charge || 0
      ),
    provider_currency:
      order.provider_currency,
    status:
      order.status,
    provider_status:
      order.provider_status,
    failure_reason:
      order.failure_reason,
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

async function loadOrderEvents(
  env,
  orderId
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        FROM order_events
        WHERE order_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(orderId)
      .all();

  return Array.isArray(
    result?.results
  )
    ? result.results
    : [];
}

async function applyProviderOrder(
  env,
  order,
  providerOrder
) {
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

  const normalizedStatus =
    status === "UNKNOWN" &&
    order.status !== "UNKNOWN"
      ? "PROCESSING"
      : status;

  const completedAt =
    normalizedStatus ===
    "COMPLETED"
      ? (
          order.completed_at ||
          nowUnix()
        )
      : order.completed_at;

  const cancelledAt =
    normalizedStatus ===
    "CANCELLED"
      ? (
          order.cancelled_at ||
          nowUnix()
        )
      : order.cancelled_at;

  const otpReceivedAt =
    providerStatus ===
    "OTP_RECEIVED"
      ? (
          order.otp_received_at ||
          nowUnix()
        )
      : order.otp_received_at;

  await updateLocalOrder(
    env,
    order.id,
    {
      externalOrderId:
        getProviderOrderId(
          providerOrder
        ) ||
        order.external_order_id,
      status:
        normalizedStatus,
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
        providerAmount > 0
          ? providerAmount
          : order.provider_amount,
      providerCharge:
        providerAmount > 0
          ? providerAmount
          : order.provider_charge,
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
      completedAt,
      cancelledAt
    }
  );

  return normalizedStatus;
}

export async function listNokosProducts(
  request,
  env
) {
  try {
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const url =
      getUrl(request);

    const productId =
      normalizeProductId(
        url.searchParams.get(
          "product_id"
        )
      );

    const catalogProductId =
      normalizeCatalogProductId(
        url.searchParams.get(
          "catalog_product_id"
        )
      );

    const operatorId =
      normalizeOperatorId(
        url.searchParams.get(
          "operator_id"
        )
      );

    const minPrice =
      normalizePrice(
        url.searchParams.get(
          "min_price"
        )
      );

    const maxPrice =
      normalizePrice(
        url.searchParams.get(
          "max_price"
        )
      );

    if (
      minPrice !== null &&
      maxPrice !== null &&
      minPrice > maxPrice
    ) {
      return errorResponse(
        "min_price tidak boleh lebih besar dari max_price.",
        400
      );
    }

    const products =
      productId
        ? [
            await getProduct(
              env,
              productId
            )
          ].filter(Boolean)
        : await getProducts(
            env,
            {
              operatorId,
              minPrice,
              maxPrice,
              available: true,
              active: true
            }
          );

    const filtered =
      catalogProductId
        ? products.filter(
            product =>
              String(
                getCatalogProductId(
                  product
                ) ?? ""
              ) ===
              String(
                catalogProductId
              )
          )
        : products;

    for (
      const product
      of filtered
    ) {
      try {
        await saveNokosService(
          env,
          product
        );
      } catch {}
    }

    return successResponse({
      products: filtered
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    let order =
      await findOrderIdentifier(
        request,
        env,
        auth.user.id
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.external_order_id
    ) {
      try {
        const providerOrder =
          await getOrder(
            env,
            order.external_order_id
          );

        await applyProviderOrder(
          env,
          order,
          providerOrder
        );

        order =
          await findOrderById(
            env,
            auth.user.id,
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    userId =
      auth.user.id;

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
    } =
      validation.value;

    if (idempotencyKey) {
      const existing =
        await findOrderByIdempotency(
          env,
          userId,
          idempotencyKey
        );

      if (existing) {
        return successResponse({
          idempotent: true,
          order:
            serializeOrder(
              existing
            )
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

    if (!product) {
      return errorResponse(
        "Produk NOKOS tidak ditemukan.",
        404
      );
    }

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
      getProductPrice(
        product
      );

    if (
      !Number.isSafeInteger(
        providerRate
      ) ||
      providerRate <= 0
    ) {
      return errorResponse(
        "Harga produk NOKOS tidak valid.",
        409
      );
    }

    customerAmount =
      providerRate *
      quantity;

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
          userId,
          product,
          quantity,
          target,
          idempotencyKey,
          requestData,
          customerAmount
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
        {
          userId,
          amount:
            customerAmount,
          type:
            "PURCHASE",
          reference:
            `ORDER:${orderNumber}`,
          description:
            `Pembelian NOKOS ${orderNumber}`,
          orderId
        }
      );

    if (
      debit?.insufficient ||
      debit?.success === false
    ) {
      await updateLocalOrder(
        env,
        orderId,
        {
          status:
            "FAILED",
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
        status:
          "PROCESSING"
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
            minPrice,
            maxPrice,
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
        const refunded =
          await refundFailedCreation(
            env,
            {
              orderId,
              userId,
              amount:
                customerAmount,
              orderNumber
            }
          );

        return errorResponse(
          refunded
            ? (
                error?.message ||
                "Provider menolak order NOKOS."
              )
            : "Provider menolak order dan refund belum berhasil.",
          502
        );
      }

      await updateLocalOrder(
        env,
        orderId,
        {
          status:
            "UNKNOWN",
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

    if (!externalOrderId) {
      await updateLocalOrder(
        env,
        orderId,
        {
          status:
            "UNKNOWN",
          providerData:
            getProviderData(
              providerOrder
            ),
          failureReason:
            "Provider tidak mengembalikan ID order."
        }
      );

      return errorResponse(
        "Order provider dibuat tetapi ID order tidak dapat dipastikan.",
        202
      );
    }

    const localOrder =
      await findOrderById(
        env,
        userId,
        orderId
      );

    const status =
      await applyProviderOrder(
        env,
        localOrder,
        providerOrder
      );

    const saved =
      await findOrderById(
        env,
        userId,
        orderId
      );

    return successResponse(
      {
        order:
          serializeOrder(
            saved
          )
      },
      status === "COMPLETED"
        ? 201
        : 201
    );
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
            status:
              "UNKNOWN",
            failureReason:
              error?.message ||
              "Terjadi kesalahan yang belum dapat dipastikan."
          }
        );
      } catch {}
    }

    if (
      error?.message ===
      "Saldo tidak mencukupi."
    ) {
      return errorResponse(
        error.message,
        402
      );
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const payload =
      await readJson(request);

    const order =
      await findOrderIdentifier(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      [
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
        "FAILED"
      ].includes(
        order.status
      )
    ) {
      return successResponse({
        order:
          serializeOrder(
            order
          ),
        refunded:
          order.status ===
          "REFUNDED"
      });
    }

    if (
      !order.external_order_id
    ) {
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
      await updateLocalOrder(
        env,
        order.id,
        {
          status:
            "UNKNOWN",
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

    if (
      status !==
      "CANCELLED"
    ) {
      await updateLocalOrder(
        env,
        order.id,
        {
          status:
            status ===
            "UNKNOWN"
              ? "UNKNOWN"
              : status,
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
              auth.user.id,
              order.id
            )
          ),
        refunded: false
      });
    }

    const refund =
      await refundBalance(
        env,
        {
          userId:
            auth.user.id,
          amount:
            Number(
              order.customer_amount
            ),
          reference:
            `REFUND:${order.order_number}`,
          description:
            `Refund NOKOS ${order.order_number}`,
          orderId:
            order.id
        }
      );

    const refunded =
      refund?.success !== false;

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
          order.cancelled_at ||
          nowUnix()
      }
    );

    const saved =
      await findOrderById(
        env,
        auth.user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(
          saved
        ),
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const payload =
      await readJson(request);

    const order =
      await findOrderIdentifier(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.status ===
      "COMPLETED"
    ) {
      return successResponse({
        order:
          serializeOrder(
            order
          )
      });
    }

    if (
      !order.external_order_id
    ) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
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
          status:
            "UNKNOWN",
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

    await applyProviderOrder(
      env,
      order,
      providerOrder
    );

    const saved =
      await findOrderById(
        env,
        auth.user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(
          saved
        )
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const payload =
      await readJson(request);

    const order =
      await findOrderIdentifier(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      !order.external_order_id
    ) {
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

    await applyProviderOrder(
      env,
      order,
      providerOrder
    );

    const saved =
      await findOrderById(
        env,
        auth.user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(
          saved
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal meminta OTP ulang.",
      error?.status || 502
    );
  }
}

export async function listMyNokosOrders(
  request,
  env
) {
  try {
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const url =
      getUrl(request);

    const limit =
      Math.min(
        parsePositiveInteger(
          url.searchParams.get(
            "limit"
          )
        ) || 20,
        100
      );

    const offsetValue =
      Number(
        url.searchParams.get(
          "offset"
        )
      );

    const offset =
      Number.isInteger(
        offsetValue
      ) &&
      offsetValue >= 0
        ? offsetValue
        : 0;

    const status =
      cleanString(
        url.searchParams.get(
          "status"
        ) || "",
        40
      ).toUpperCase();

    if (
      status &&
      !ORDER_STATUSES.has(
        status
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    let query = `
      SELECT ${ORDER_COLUMNS}
      FROM orders
      WHERE user_id = ?
        AND type = ?
    `;

    const binds = [
      auth.user.id,
      ORDER_TYPE
    ];

    if (status) {
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
      Array.isArray(
        result?.results
      )
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
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const payload =
      await readJson(request);

    const order =
      await findOrderIdentifier(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      !order.external_order_id
    ) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    const providerOrder =
      await getOrder(
        env,
        order.external_order_id
      );

    await applyProviderOrder(
      env,
      order,
      providerOrder
    );

    const saved =
      await findOrderById(
        env,
        auth.user.id,
        order.id
      );

    return successResponse({
      order:
        serializeOrder(
          saved
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal sinkronisasi order NOKOS.",
      error?.status || 502
    );
  }
}

export async function adminListNokosOrders(
  request,
  env
) {
  try {
    const auth =
      await requireAdmin(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const url =
      getUrl(request);

    const limit =
      Math.min(
        parsePositiveInteger(
          url.searchParams.get(
            "limit"
          )
        ) || 50,
        200
      );

    const offsetValue =
      Number(
        url.searchParams.get(
          "offset"
        )
      );

    const offset =
      Number.isInteger(
        offsetValue
      ) &&
      offsetValue >= 0
        ? offsetValue
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
        url.searchParams.get(
          "user_id"
        )
      );

    if (
      status &&
      !ORDER_STATUSES.has(
        status
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    let query = `
      SELECT
        o.*,
        u.username,
        u.first_name
      FROM orders o
      INNER JOIN users u
        ON u.id = o.user_id
      WHERE o.type = ?
    `;

    const binds = [
      ORDER_TYPE
    ];

    if (status) {
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
        Array.isArray(
          result?.results
        )
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
    const auth =
      await requireAdmin(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const url =
      getUrl(request);

    const orderId =
      parsePositiveInteger(
        url.searchParams.get(
          "id"
        )
      );

    if (!orderId) {
      return errorResponse(
        "id order wajib diisi.",
        400
      );
    }

    const order =
      await env.DB
        .prepare(`
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
        `)
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

  await applyProviderOrder(
    env,
    order,
    providerOrder
  );

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `)
    .bind(order.id)
    .first();
}

export async function getNokosStats(
  request,
  env
) {
  try {
    const auth =
      await requireAdmin(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const result =
      await env.DB
        .prepare(`
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
        `)
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
      .replace(
        /\/+$/,
        ""
      ) || "/";

  if (
    request.method ===
      "GET" &&
    (
      path ===
        "/api/nokos/products" ||
      path ===
        "/api/nokos/services"
    )
  ) {
    return listNokosProducts(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/orders"
  ) {
    return createNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/nokos/orders"
  ) {
    return listMyNokosOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/nokos/order"
  ) {
    return getNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/sync"
  ) {
    return syncNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/cancel"
  ) {
    return cancelNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/finish"
  ) {
    return finishNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/resend"
  ) {
    return resendNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/orders"
  ) {
    return adminListNokosOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/order"
  ) {
    return adminGetNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/stats"
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
