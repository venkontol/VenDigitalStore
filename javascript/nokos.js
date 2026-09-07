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
  createOrder as createProviderOrder,
  getOrder as getProviderOrder,
  cancelOrder as cancelProviderOrder,
  finishOrder as finishProviderOrder,
  resendOrder as resendProviderOrder,
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

const FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

function numberValue(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

function integerValue(value, fallback = 0) {
  const number = numberValue(value, fallback);
  return Math.round(number);
}

function normalizeStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();

  if (!status) {
    return "UNKNOWN";
  }

  const mapped = mapStatus(status);

  return ORDER_STATUSES.has(mapped)
    ? mapped
    : "UNKNOWN";
}

function getProviderStatus(data) {
  return String(
    data?.status ??
    data?.order?.status ??
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
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Math.max(
        0,
        Math.round(Number(value))
      );
    }
  }

  return 0;
}

function getProviderPhone(data) {
  return (
    data?.phone_number ??
    data?.phone ??
    data?.number ??
    data?.order?.phone_number ??
    data?.order?.phone ??
    null
  );
}

function getProviderOtp(data) {
  return (
    data?.otp_code ??
    data?.otp ??
    data?.code ??
    data?.order?.otp_code ??
    null
  );
}

function getProviderOtpMessage(data) {
  return (
    data?.otp_message ??
    data?.message ??
    data?.order?.otp_message ??
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
    const timestamp = Number(value);

    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return timestamp > 100000000000
      ? Math.floor(timestamp / 1000)
      : timestamp;
  }

  const timestamp = Math.floor(
    new Date(value).getTime() / 1000
  );

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function getProviderFailure(data) {
  return (
    data?.failed_reason ??
    data?.failure_reason ??
    data?.error ??
    null
  );
}

function stringifyProviderData(data) {
  try {
    return JSON.stringify(data ?? null);
  } catch {
    return null;
  }
}

function normalizeTarget(value) {
  return cleanString(value, 500);
}

function normalizeId(value) {
  return parsePositiveInteger(value) || null;
}

function normalizeQuantity(value) {
  return parsePositiveInteger(value) || 1;
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

function normalizeCreatePayload(payload) {
  const productId = normalizeId(
    payload?.product_id ??
    payload?.productId
  );

  const catalogProductId = normalizeId(
    payload?.catalog_product_id ??
    payload?.catalogProductId
  );

  const operatorId = normalizeId(
    payload?.operator_id ??
    payload?.operatorId
  );

  const quantity = normalizeQuantity(
    payload?.quantity
  );

  const minPrice = normalizePrice(
    payload?.min_price ??
    payload?.minPrice
  );

  const maxPrice = normalizePrice(
    payload?.max_price ??
    payload?.maxPrice
  );

  const target = normalizeTarget(
    payload?.target ??
    payload?.phone_number ??
    ""
  );

  const idempotencyKey = cleanString(
    payload?.idempotency_key ??
    payload?.idempotencyKey ??
    "",
    120
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
  return String(
    product?.name ??
    product?.service_name ??
    product?.product_name ??
    "NOKOS"
  );
}

function getProductId(product) {
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
    product?.country_name ??
    product?.country ??
    null
  );
}

function getProductPlatform(product) {
  return (
    product?.platform_name ??
    product?.platform ??
    null
  );
}

function getProductOperator(product) {
  return (
    product?.operator_name ??
    product?.operator ??
    null
  );
}

function getMarkupPercent(env) {
  const markup = Number(
    env?.MARKUP_PERCENT ?? 0
  );

  if (
    !Number.isFinite(markup) ||
    markup < 0
  ) {
    return 0;
  }

  return markup;
}

function calculateSellingPrice(env, providerPrice) {
  const price = Math.max(
    0,
    integerValue(providerPrice)
  );

  const markup = getMarkupPercent(env);

  return Math.max(
    price,
    Math.round(
      price +
      (price * markup / 100)
    )
  );
}

function calculateCustomerAmount(
  env,
  providerPrice,
  quantity
) {
  const sellingPrice =
    calculateSellingPrice(
      env,
      providerPrice
    );

  const total =
    sellingPrice * quantity;

  if (
    !Number.isSafeInteger(total) ||
    total <= 0
  ) {
    throw new Error(
      "Total harga NOKOS tidak valid."
    );
  }

  return {
    sellingPrice,
    customerAmount: total
  };
}

async function findOrderById(
  env,
  userId,
  orderId
) {
  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      AND user_id = ?
      AND type = ?
      LIMIT 1
    `)
    .bind(
      userId,
      orderId,
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
      SELECT *
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
      SELECT *
      FROM orders
      WHERE provider = ?
      AND external_order_id = ?
      AND type = ?
      LIMIT 1
    `)
    .bind(
      NOKOS_PROVIDER,
      String(externalOrderId),
      ORDER_TYPE
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
      SELECT *
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

async function saveNokosService(
  env,
  product
) {
  const productId = Number(
    getProductId(product)
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
    Number(product?.country_id) || null;

  const platformId =
    Number(product?.platform_id) || null;

  const operatorId =
    Number(product?.operator_id) || null;

  const providerPrice =
    getProductPrice(product);

  const sellingPrice =
    calculateSellingPrice(
      env,
      providerPrice
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
    stringifyProviderData(product);

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
      getProductCountry(product),
      platformId,
      getProductPlatform(product),
      operatorId,
      getProductOperator(product),
      getProductName(product),
      providerPrice,
      sellingPrice,
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
    requestData,
    providerPrice,
    sellingPrice,
    customerAmount
  }
) {
  const productId =
    getProductId(product);

  const catalogProductId =
    getCatalogProductId(product);

  const orderNumber =
    generateOrderNumber("NK");

  const timestamp =
    nowUnix();

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
        getProductName(product),
        target || null,
        quantity,
        providerPrice,
        sellingPrice,
        providerPrice * quantity,
        customerAmount,
        requestData,
        idempotencyKey,
        timestamp,
        timestamp
      )
      .run();

  if (
    !result?.success &&
    !result?.meta?.last_row_id
  ) {
    throw new Error(
      "Gagal membuat order NOKOS."
    );
  }

  return {
    id: result.meta.last_row_id,
    orderNumber
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
  patch = {}
) {
  const current =
    await env.DB
      .prepare(`
        SELECT *
        FROM orders
        WHERE id = ?
        AND type = ?
        LIMIT 1
      `)
      .bind(
        orderId,
        ORDER_TYPE
      )
      .first();

  if (!current) {
    throw new Error(
      "Order NOKOS tidak ditemukan."
    );
  }

  const status =
    patch.status ??
    current.status ??
    "UNKNOWN";

  const values = {
    externalOrderId:
      patch.externalOrderId ??
      current.external_order_id ??
      null,

    providerStatus:
      patch.providerStatus ??
      current.provider_status ??
      null,

    providerData:
      patch.providerData ??
      current.provider_data ??
      null,

    failureReason:
      patch.failureReason !== undefined
        ? patch.failureReason
        : current.failure_reason ?? null,

    providerAmount:
      patch.providerAmount !== undefined
        ? patch.providerAmount
        : current.provider_amount ?? 0,

    providerCharge:
      patch.providerCharge !== undefined
        ? patch.providerCharge
        : current.provider_charge ?? null,

    phoneNumber:
      patch.phoneNumber !== undefined
        ? patch.phoneNumber
        : current.phone_number ?? null,

    otpCode:
      patch.otpCode !== undefined
        ? patch.otpCode
        : current.otp_code ?? null,

    otpMessage:
      patch.otpMessage !== undefined
        ? patch.otpMessage
        : current.otp_message ?? null,

    otpReceivedAt:
      patch.otpReceivedAt !== undefined
        ? patch.otpReceivedAt
        : current.otp_received_at ?? null,

    providerExpiresAt:
      patch.providerExpiresAt !== undefined
        ? patch.providerExpiresAt
        : current.provider_expires_at ?? null,

    startCount:
      patch.startCount !== undefined
        ? patch.startCount
        : current.start_count ?? null,

    remains:
      patch.remains !== undefined
        ? patch.remains
        : current.remains ?? null,

    completedAt:
      patch.completedAt !== undefined
        ? patch.completedAt
        : current.completed_at ?? null,

    cancelledAt:
      patch.cancelledAt !== undefined
        ? patch.cancelledAt
        : current.cancelled_at ?? null
  };

  const timestamp =
    nowUnix();

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
      AND type = ?
    `)
    .bind(
      values.externalOrderId,
      status,
      values.providerStatus,
      values.providerData,
      values.failureReason,
      values.providerAmount,
      values.providerCharge,
      values.phoneNumber,
      values.otpCode,
      values.otpMessage,
      values.otpReceivedAt,
      values.providerExpiresAt,
      values.startCount,
      values.remains,
      values.completedAt,
      values.cancelledAt,
      timestamp,
      orderId,
      ORDER_TYPE
    )
    .run();

  await addOrderEvent(
    env,
    orderId,
    status,
    values.providerStatus,
    values.failureReason,
    values.providerData
  );
}

function buildProviderPatch(
  providerOrder,
  currentOrder = null
) {
  const providerStatus =
    getProviderStatus(
      providerOrder
    );

  const status =
    normalizeStatus(
      providerStatus
    );

  const now =
    nowUnix();

  return {
    externalOrderId:
      getProviderOrderId(
        providerOrder
      ) ??
      currentOrder?.external_order_id ??
      null,

    status:
      status === "UNKNOWN" &&
      currentOrder?.status &&
      !FINAL_STATUSES.has(
        currentOrder.status
      )
        ? "PROCESSING"
        : status,

    providerStatus:
      providerStatus || null,

    providerData:
      stringifyProviderData(
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
      status === "OTP_RECEIVED"
        ? now
        : currentOrder?.otp_received_at ??
          null,

    providerExpiresAt:
      getProviderExpiresAt(
        providerOrder
      ),

    completedAt:
      status === "COMPLETED"
        ? currentOrder?.completed_at ??
          now
        : currentOrder?.completed_at ??
          null,

    cancelledAt:
      status === "CANCELLED"
        ? currentOrder?.cancelled_at ??
          now
        : currentOrder?.cancelled_at ??
          null
  };
}

async function syncProviderResponse(
  env,
  order,
  providerOrder
) {
  const patch =
    buildProviderPatch(
      providerOrder,
      order
    );

  await updateLocalOrder(
    env,
    order.id,
    patch
  );

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      AND type = ?
      LIMIT 1
    `)
    .bind(
      order.id,
      ORDER_TYPE
    )
    .first();
}

function isDefiniteProviderFailure(
  error
) {
  const status =
    Number(error?.status);

  return (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

async function refundOrder(
  env,
  order,
  reason
) {
  const amount =
    integerValue(
      order.customer_amount
    );

  if (
    amount <= 0
  ) {
    return false;
  }

  const result =
    await refundBalance(
      env,
      {
        userId: order.user_id,
        amount,
        type: "REFUND",
        reference:
          `REFUND:ORDER:${order.order_number}`,
        description:
          reason ||
          `Refund NOKOS ${order.order_number}`,
        orderId: order.id
      }
    );

  return result?.success !== false;
}

function serializeOrder(order) {
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
      Number(order.provider_rate || 0),
    selling_rate:
      Number(order.selling_rate || 0),
    provider_amount:
      Number(order.provider_amount || 0),
    customer_amount:
      Number(order.customer_amount || 0),
    provider_charge:
      Number(order.provider_charge || 0),
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
        ORDER BY created_at DESC, id DESC
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

async function getUserOrderFromRequest(
  request,
  env,
  userId
) {
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

  if (orderId) {
    return findOrderById(
      env,
      userId,
      orderId
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

async function getOrderIdFromBody(
  request
) {
  const payload =
    await readJson(request);

  const orderId =
    parsePositiveInteger(
      payload?.order_id ??
      payload?.orderId
    );

  return {
    payload,
    orderId
  };
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
      normalizeId(
        url.searchParams.get(
          "product_id"
        )
      );

    const catalogProductId =
      normalizeId(
        url.searchParams.get(
          "catalog_product_id"
        )
      );

    const operatorId =
      normalizeId(
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

    const normalized =
      products.map(
        product => ({
          ...product,
          provider_price:
            getProductPrice(
              product
            ),
          selling_price:
            calculateSellingPrice(
              env,
              getProductPrice(
                product
              )
            )
        })
      );

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
  let localOrder = null;
  let debited = false;

  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const payload =
      await readJson(request);

    const validation =
      normalizeCreatePayload(
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

    if (
      product?.available === false ||
      product?.active === false
    ) {
      return errorResponse(
        "Produk NOKOS sedang tidak tersedia.",
        409
      );
    }

    const providerPrice =
      getProductPrice(
        product
      );

    if (
      !Number.isSafeInteger(
        providerPrice
      ) ||
      providerPrice <= 0
    ) {
      return errorResponse(
        "Harga produk NOKOS tidak valid.",
        409
      );
    }

    const {
      sellingPrice,
      customerAmount
    } = calculateCustomerAmount(
      env,
      providerPrice,
      quantity
    );

    await saveNokosService(
      env,
      product
    );

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

    localOrder =
      await createLocalOrder(
        env,
        {
          userId:
            user.id,
          product,
          quantity,
          target,
          idempotencyKey,
          requestData,
          providerPrice,
          sellingPrice,
          customerAmount
        }
      );

    await addOrderEvent(
      env,
      localOrder.id,
      "CREATING",
      null,
      "Order NOKOS dibuat.",
      null
    );

    const debit =
      await debitBalance(
        env,
        {
          userId:
            user.id,
          amount:
            customerAmount,
          type:
            "PURCHASE",
          reference:
            `ORDER:${localOrder.orderNumber}`,
          description:
            `Pembelian NOKOS ${localOrder.orderNumber}`,
          orderId:
            localOrder.id
        }
      );

    if (!debit?.success) {
      await updateLocalOrder(
        env,
        localOrder.id,
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
      localOrder.id,
      {
        status:
          "PROCESSING"
      }
    );

    let providerOrder;

    try {
      providerOrder =
        await createProviderOrder(
          env,
          {
            productId:
              getProductId(
                product
              ) ??
              productId,
            catalogProductId:
              getCatalogProductId(
                product
              ) ??
              catalogProductId,
            operatorId:
              product?.operator_id ??
              operatorId,
            quantity,
            minPrice,
            maxPrice,
            idempotencyKey:
              idempotencyKey ||
              localOrder.orderNumber
          }
        );
    } catch (error) {
      if (
        isDefiniteProviderFailure(
          error
        )
      ) {
        const order =
          await findOrderById(
            env,
            user.id,
            localOrder.id
          );

        if (order) {
          await refundOrder(
            env,
            order,
            `Refund NOKOS ${order.order_number}`
          );

          await updateLocalOrder(
            env,
            order.id,
            {
              status:
                "REFUNDED",
              failureReason:
                error?.message ||
                "Provider menolak order NOKOS."
            }
          );
        }

        return errorResponse(
          error?.message ||
          "Provider menolak order NOKOS.",
          502
        );
      }

      await updateLocalOrder(
        env,
        localOrder.id,
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

    const order =
      await findOrderById(
        env,
        user.id,
        localOrder.id
      );

    if (!order) {
      throw new Error(
        "Order NOKOS tidak ditemukan setelah dibuat."
      );
    }

    const saved =
      await syncProviderResponse(
        env,
        order,
        providerOrder
      );

    return successResponse(
      {
        order:
          serializeOrder(
            saved
          )
      },
      201
    );
  } catch (error) {
    if (
      localOrder?.id &&
      debited
    ) {
      try {
        const order =
          await findOrderById(
            env,
            localOrder.id === null
              ? 0
              : localOrder.id,
            localOrder.id
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

    let order =
      await getUserOrderFromRequest(
        request,
        env,
        user.id
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (order.external_order_id) {
      try {
        const providerOrder =
          await getProviderOrder(
            env,
            order.external_order_id
          );

        order =
          await syncProviderResponse(
            env,
            order,
            providerOrder
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
        serializeOrder(
          order
        ),
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

    let query = `
      SELECT *
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

    query += `
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

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
          ? result.results.map(
              serializeOrder
            )
          : [],
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

    const {
      orderId
    } =
      await getOrderIdFromBody(
        request
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

    try {
      const providerOrder =
        await getProviderOrder(
          env,
          order.external_order_id
        );

      const saved =
        await syncProviderResponse(
          env,
          order,
          providerOrder
        );

      return successResponse({
        order:
          serializeOrder(
            saved
          )
      });
    } catch (error) {
      await updateLocalOrder(
        env,
        order.id,
        {
          status:
            "UNKNOWN",
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
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal sinkronisasi order NOKOS.",
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

    const {
      orderId
    } =
      await getOrderIdFromBody(
        request
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

    if (
      FINAL_STATUSES.has(
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

    if (!order.external_order_id) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    let providerOrder;

    try {
      providerOrder =
        await cancelProviderOrder(
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
      normalizeStatus(
        providerStatus
      );

    if (
      status !==
      "CANCELLED"
    ) {
      const saved =
        await syncProviderResponse(
          env,
          order,
          providerOrder
        );

      return successResponse({
        order:
          serializeOrder(
            saved
          ),
        refunded:
          false
      });
    }

    let refunded = false;

    try {
      refunded =
        await refundOrder(
          env,
          order,
          `Refund NOKOS ${order.order_number}`
        );
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
          stringifyProviderData(
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
  return executeProviderAction(
    request,
    env,
    finishProviderOrder,
    "Gagal menyelesaikan order NOKOS.",
    "Status penyelesaian order belum dapat dipastikan."
  );
}

export async function resendNokosOrder(
  request,
  env
) {
  return executeProviderAction(
    request,
    env,
    resendProviderOrder,
    "Gagal meminta OTP ulang.",
    "Status permintaan OTP ulang belum dapat dipastikan."
  );
}

async function executeProviderAction(
  request,
  env,
  providerAction,
  genericError,
  uncertainMessage
) {
  try {
    const user =
      await requireAuth(
        request,
        env
      );

    const {
      orderId
    } =
      await getOrderIdFromBody(
        request
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
      providerAction ===
        finishProviderOrder &&
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

    let providerOrder;

    try {
      providerOrder =
        await providerAction(
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
            uncertainMessage
        }
      );

      return errorResponse(
        uncertainMessage,
        502
      );
    }

    const saved =
      await syncProviderResponse(
        env,
        order,
        providerOrder
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
      genericError,
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

    query += `
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?
    `;

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
    await requireAdmin(
      request,
      env
    );

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
    await getProviderOrder(
      env,
      order.external_order_id
    );

  return syncProviderResponse(
    env,
    order,
    providerOrder
  );
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
          numberValue(
            result?.total
          ),
        creating:
          numberValue(
            result?.creating
          ),
        processing:
          numberValue(
            result?.processing
          ),
        otp_received:
          numberValue(
            result?.otp_received
          ),
        completed:
          numberValue(
            result?.completed
          ),
        cancelled:
          numberValue(
            result?.cancelled
          ),
        expired:
          numberValue(
            result?.expired
          ),
        refunded:
          numberValue(
            result?.refunded
          ),
        failed:
          numberValue(
            result?.failed
          ),
        unknown:
          numberValue(
            result?.unknown
          ),
        customer_amount:
          numberValue(
            result?.customer_amount
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
      .replace(/\/+$/, "") ||
      "/";

  if (
    request.method === "GET" &&
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
    request.method === "POST" &&
    path ===
      "/api/nokos/orders"
  ) {
    return createNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path ===
      "/api/nokos/orders"
  ) {
    return listMyNokosOrders(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path ===
      "/api/nokos/order"
  ) {
    return getNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path ===
      "/api/nokos/order/sync"
  ) {
    return syncNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path ===
      "/api/nokos/order/cancel"
  ) {
    return cancelNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path ===
      "/api/nokos/order/finish"
  ) {
    return finishNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    path ===
      "/api/nokos/order/resend"
  ) {
    return resendNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path ===
      "/api/admin/nokos/orders"
  ) {
    return adminListNokosOrders(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    path ===
      "/api/admin/nokos/order"
  ) {
    return adminGetNokosOrder(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
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

export const listNokosServices =
  listNokosProducts;

export const createNokos =
  createNokosOrder;

export const getNokos =
  getNokosOrder;

export const syncNokos =
  syncNokosOrder;

export const cancelNokos =
  cancelNokosOrder;

export const finishNokos =
  finishNokosOrder;

export const resendNokos =
  resendNokosOrder;

export default {
  handleNokos,
  listNokosProducts,
  listNokosServices,
  createNokosOrder,
  createNokos,
  getNokosOrder,
  getNokos,
  listMyNokosOrders,
  syncNokosOrder,
  syncNokos,
  cancelNokosOrder,
  cancelNokos,
  finishNokosOrder,
  finishNokos,
  resendNokosOrder,
  resendNokos,
  adminListNokosOrders,
  adminGetNokosOrder,
  getNokosStats,
  syncNokosProviderOrder
};
