const DEFAULT_BASE_URL = "https://api.smscode.gg/v2";
const DEFAULT_TIMEOUT_MS = 30000;

class SMSCodeError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "SMSCodeError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
    this.uncertain = options.uncertain === true;
  }
}

function getConfig(env) {
  const baseUrl = String(
    env?.SMSCODE_API_URL ||
    env?.SMSCODE_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  const token = String(
    env?.SMSCODE_TOKEN ||
    env?.SMSCODE_API_TOKEN ||
    ""
  ).trim();

  const timeoutMs = Number(
    env?.SMSCODE_API_TIMEOUT ||
    env?.DEFAULT_TIMEOUT_MS ||
    DEFAULT_TIMEOUT_MS
  );

  if (!token) {
    throw new SMSCodeError("SMSCode token belum dikonfigurasi.", {
      code: "SMSCODE_TOKEN_MISSING"
    });
  }

  return {
    baseUrl,
    token,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS
  };
}

function createHeaders(token, extra = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

async function request(env, path, options = {}) {
  const config = getConfig(env);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;

  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: options.method || "GET",
      headers: createHeaders(config.token, options.headers || {}),
      body: options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);

    if (error?.name === "AbortError") {
      throw new SMSCodeError("Request ke SMSCode timeout.", {
        code: "SMSCODE_TIMEOUT",
        uncertain: true
      });
    }

    throw new SMSCodeError(
      error?.message || "Gagal menghubungi SMSCode.",
      {
        code: "SMSCODE_NETWORK_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  clearTimeout(timer);

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error?.message ||
      data?.error ||
      `SMSCode HTTP ${response.status}`;

    throw new SMSCodeError(String(message), {
      status: response.status,
      code:
        data?.code ||
        data?.error?.code ||
        `HTTP_${response.status}`,
      details: data,
      uncertain: response.status >= 500 || response.status === 429
    });
  }

  if (
    data &&
    data.success === false
  ) {
    throw new SMSCodeError(
      String(
        data.message ||
        data.error?.message ||
        data.error ||
        "SMSCode menolak request."
      ),
      {
        status: response.status,
        code:
          data.code ||
          data.error?.code ||
          "SMSCODE_API_ERROR",
        details: data,
        uncertain: false
      }
    );
  }

  return data;
}

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function unwrap(data) {
  if (!data || typeof data !== "object") {
    return data;
  }

  return firstValue(
    data.data,
    data.result,
    data.order,
    data
  );
}

function normalizeId(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value);
}

function normalizeNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeInteger(value) {
  const number = normalizeNumber(value);

  if (number === null) {
    return null;
  }

  return Number.isSafeInteger(number)
    ? number
    : Math.trunc(number);
}

function normalizeTimestamp(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    if (value > 100000000000) {
      return Math.trunc(value);
    }

    if (value > 1000000000) {
      return Math.trunc(value * 1000);
    }

    return Math.trunc(value);
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    if (numeric > 100000000000) {
      return Math.trunc(numeric);
    }

    if (numeric > 1000000000) {
      return Math.trunc(numeric * 1000);
    }
  }

  const parsed = Date.parse(String(value));

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function mapStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (!status) {
    return "UNKNOWN";
  }

  if (
    [
      "PENDING",
      "WAITING",
      "QUEUED",
      "QUEUE",
      "CREATED"
    ].includes(status)
  ) {
    return "PENDING";
  }

  if (
    [
      "ACTIVE",
      "PROCESSING",
      "IN_PROGRESS",
      "INPROGRESS",
      "RUNNING"
    ].includes(status)
  ) {
    return "PROCESSING";
  }

  if (
    [
      "OTP_RECEIVED",
      "OTP",
      "CODE_RECEIVED"
    ].includes(status)
  ) {
    return "OTP_RECEIVED";
  }

  if (
    [
      "COMPLETED",
      "COMPLETE",
      "DONE",
      "SUCCESS",
      "SUCCESSFUL",
      "FINISHED"
    ].includes(status)
  ) {
    return "COMPLETED";
  }

  if (
    [
      "CANCELED",
      "CANCELLED",
      "CANCEL"
    ].includes(status)
  ) {
    return "CANCELLED";
  }

  if (
    [
      "EXPIRED",
      "EXPIRE",
      "TIMEOUT",
      "TIMED_OUT"
    ].includes(status)
  ) {
    return "EXPIRED";
  }

  if (
    [
      "FAILED",
      "FAIL",
      "ERROR",
      "REJECTED",
      "REJECT",
      "FAILURE"
    ].includes(status)
  ) {
    return "FAILED";
  }

  if (
    [
      "REFUNDED",
      "REFUND"
    ].includes(status)
  ) {
    return "REFUNDED";
  }

  return "UNKNOWN";
}

function normalizeOrder(data) {
  const root = unwrap(data);

  const order =
    root?.order &&
    typeof root.order === "object"
      ? root.order
      : root;

  const providerStatus = firstValue(
    order?.status,
    order?.order_status,
    order?.state,
    root?.status,
    root?.order_status,
    root?.state
  );

  const externalOrderId = normalizeId(
    firstValue(
      order?.id,
      order?.order_id,
      root?.id,
      root?.order_id
    )
  );

  const amount = normalizeNumber(
    firstValue(
      order?.amount,
      order?.price,
      order?.charge,
      order?.cost,
      root?.amount,
      root?.price,
      root?.charge,
      root?.cost
    )
  );

  const phoneNumber = firstValue(
    order?.phone_number,
    order?.phone,
    order?.number,
    order?.mobile,
    root?.phone_number,
    root?.phone,
    root?.number,
    root?.mobile
  );

  const otpCode = firstValue(
    order?.otp_code,
    order?.otp,
    order?.code,
    root?.otp_code,
    root?.otp,
    root?.code
  );

  const otpMessage = firstValue(
    order?.otp_message,
    order?.message,
    root?.otp_message
  );

  const otpReceivedAt = normalizeTimestamp(
    firstValue(
      order?.otp_received_at,
      order?.code_received_at,
      root?.otp_received_at,
      root?.code_received_at
    )
  );

  const providerExpiresAt = normalizeTimestamp(
    firstValue(
      order?.expires_at,
      order?.expired_at,
      order?.expiry,
      order?.expiration,
      root?.expires_at,
      root?.expired_at,
      root?.expiry,
      root?.expiration
    )
  );

  const failureReason = firstValue(
    order?.failed_reason,
    order?.failure_reason,
    order?.failureReason,
    order?.error,
    root?.failed_reason,
    root?.failure_reason,
    root?.failureReason,
    root?.error
  );

  const status = mapStatus(providerStatus);

  return {
    externalOrderId,
    status,
    providerStatus:
      providerStatus === null
        ? null
        : String(providerStatus),
    providerData: data ?? null,
    providerCharge: amount,
    fields: {
      phoneNumber:
        phoneNumber === null
          ? null
          : String(phoneNumber),
      otpCode:
        otpCode === null
          ? null
          : String(otpCode),
      otpMessage:
        otpMessage === null
          ? null
          : String(otpMessage),
      otpReceivedAt,
      providerExpiresAt
    },
    failureReason:
      failureReason === null
        ? null
        : String(failureReason),
    uncertain: false
  };
}

function getOrderIdFromContext(context = {}) {
  const order = context.order || {};

  return normalizeId(
    firstValue(
      context.externalOrderId,
      context.external_order_id,
      order.externalOrderId,
      order.external_order_id
    )
  );
}

function getRequestData(context = {}) {
  const requestData =
    context.requestData &&
    typeof context.requestData === "object"
      ? context.requestData
      : {};

  const order =
    context.order &&
    typeof context.order === "object"
      ? context.order
      : {};

  return {
    ...requestData,
    ...order.requestData
  };
}

function buildCreatePayload(context = {}) {
  const order =
    context.order &&
    typeof context.order === "object"
      ? context.order
      : {};

  const requestData = getRequestData(context);

  const productId = firstValue(
    requestData.product_id,
    requestData.productId,
    requestData.catalog_product_id,
    requestData.catalogProductId,
    order.service_id,
    order.serviceId
  );

  const catalogProductId = firstValue(
    requestData.catalog_product_id,
    requestData.catalogProductId,
    order.catalog_product_id,
    order.catalogProductId
  );

  const operatorId = firstValue(
    requestData.operator_id,
    requestData.operatorId,
    order.operator_id,
    order.operatorId
  );

  const quantity = firstValue(
    requestData.quantity,
    order.quantity,
    1
  );

  const minPrice = firstValue(
    requestData.min_price,
    requestData.minPrice,
    order.min_price,
    order.minPrice
  );

  const maxPrice = firstValue(
    requestData.max_price,
    requestData.maxPrice,
    order.max_price,
    order.maxPrice
  );

  const payload = {
    quantity: normalizeInteger(quantity)
  };

  if (
    productId !== null &&
    productId !== undefined &&
    productId !== ""
  ) {
    payload.product_id = String(productId);
  } else if (
    catalogProductId !== null &&
    catalogProductId !== undefined &&
    catalogProductId !== ""
  ) {
    payload.catalog_product_id = String(catalogProductId);
  }

  if (
    operatorId !== null &&
    operatorId !== undefined &&
    operatorId !== ""
  ) {
    payload.operator_id = String(operatorId);
  }

  if (
    minPrice !== null &&
    minPrice !== undefined &&
    minPrice !== ""
  ) {
    payload.min_price = normalizeNumber(minPrice);
  }

  if (
    maxPrice !== null &&
    maxPrice !== undefined &&
    maxPrice !== ""
  ) {
    payload.max_price = normalizeNumber(maxPrice);
  }

  return payload;
}

function getIdempotencyKey(context = {}) {
  const order =
    context.order &&
    typeof context.order === "object"
      ? context.order
      : {};

  return firstValue(
    context.idempotencyKey,
    context.idempotency_key,
    order.idempotencyKey,
    order.idempotency_key
  );
}

async function createOrder(env, context = {}) {
  const payload = buildCreatePayload(context);

  if (
    !Number.isSafeInteger(payload.quantity) ||
    payload.quantity <= 0
  ) {
    throw new SMSCodeError(
      "Quantity order SMSCode tidak valid.",
      {
        code: "INVALID_QUANTITY"
      }
    );
  }

  if (
    !payload.product_id &&
    !payload.catalog_product_id
  ) {
    throw new SMSCodeError(
      "Product ID SMSCode belum ditentukan.",
      {
        code: "PRODUCT_ID_MISSING"
      }
    );
  }

  const idempotencyKey = getIdempotencyKey(context);

  const headers = {};

  if (idempotencyKey) {
    headers["Idempotency-Key"] = String(idempotencyKey);
  }

  let data;

  try {
    data = await request(env, "/orders/create", {
      method: "POST",
      headers,
      body: payload
    });
  } catch (error) {
    if (error instanceof SMSCodeError) {
      throw error;
    }

    throw new SMSCodeError(
      error?.message || "SMSCode create order gagal.",
      {
        code: "CREATE_ORDER_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  return normalizeOrder(data);
}

async function getOrder(env, context = {}) {
  const orderId = getOrderIdFromContext(context);

  if (!orderId) {
    throw new SMSCodeError(
      "External order ID SMSCode belum tersedia.",
      {
        code: "EXTERNAL_ORDER_ID_MISSING"
      }
    );
  }

  let data;

  try {
    data = await request(
      env,
      `/orders/${encodeURIComponent(orderId)}`
    );
  } catch (error) {
    if (error instanceof SMSCodeError) {
      throw error;
    }

    throw new SMSCodeError(
      error?.message || "SMSCode get order gagal.",
      {
        code: "GET_ORDER_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  return normalizeOrder(data);
}

async function getStatus(env, context = {}) {
  return getOrder(env, context);
}

async function cancelOrder(env, context = {}) {
  const orderId = getOrderIdFromContext(context);

  if (!orderId) {
    throw new SMSCodeError(
      "External order ID SMSCode belum tersedia.",
      {
        code: "EXTERNAL_ORDER_ID_MISSING"
      }
    );
  }

  let data;

  try {
    data = await request(
      env,
      `/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        method: "POST",
        body: {}
      }
    );
  } catch (error) {
    if (error instanceof SMSCodeError) {
      throw error;
    }

    throw new SMSCodeError(
      error?.message || "SMSCode cancel order gagal.",
      {
        code: "CANCEL_ORDER_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  return normalizeOrder(data);
}

async function finishOrder(env, context = {}) {
  const orderId = getOrderIdFromContext(context);

  if (!orderId) {
    throw new SMSCodeError(
      "External order ID SMSCode belum tersedia.",
      {
        code: "EXTERNAL_ORDER_ID_MISSING"
      }
    );
  }

  let data;

  try {
    data = await request(
      env,
      `/orders/${encodeURIComponent(orderId)}/finish`,
      {
        method: "POST",
        body: {}
      }
    );
  } catch (error) {
    if (error instanceof SMSCodeError) {
      throw error;
    }

    throw new SMSCodeError(
      error?.message || "SMSCode finish order gagal.",
      {
        code: "FINISH_ORDER_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  return normalizeOrder(data);
}

async function resendOrder(env, context = {}) {
  const orderId = getOrderIdFromContext(context);

  if (!orderId) {
    throw new SMSCodeError(
      "External order ID SMSCode belum tersedia.",
      {
        code: "EXTERNAL_ORDER_ID_MISSING"
      }
    );
  }

  let data;

  try {
    data = await request(
      env,
      `/orders/${encodeURIComponent(orderId)}/resend`,
      {
        method: "POST",
        body: {}
      }
    );
  } catch (error) {
    if (error instanceof SMSCodeError) {
      throw error;
    }

    throw new SMSCodeError(
      error?.message || "SMSCode resend order gagal.",
      {
        code: "RESEND_ORDER_ERROR",
        uncertain: true,
        details: error
      }
    );
  }

  return normalizeOrder(data);
}

async function getCountries(env) {
  return request(env, "/countries");
}

async function getServices(env, params = {}) {
  const query = new URLSearchParams();

  if (params.countryId !== undefined) {
    query.set("country_id", String(params.countryId));
  }

  if (params.country_id !== undefined) {
    query.set("country_id", String(params.country_id));
  }

  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }

  if (params.limit !== undefined) {
    query.set("limit", String(params.limit));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(env, `/services${suffix}`);
}

async function getOperators(env, params = {}) {
  const query = new URLSearchParams();

  if (params.countryId !== undefined) {
    query.set("country_id", String(params.countryId));
  }

  if (params.country_id !== undefined) {
    query.set("country_id", String(params.country_id));
  }

  if (params.serviceId !== undefined) {
    query.set("service_id", String(params.serviceId));
  }

  if (params.service_id !== undefined) {
    query.set("service_id", String(params.service_id));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(env, `/operators${suffix}`);
}

async function getProducts(env, params = {}) {
  const query = new URLSearchParams();

  if (params.countryId !== undefined) {
    query.set("country_id", String(params.countryId));
  }

  if (params.country_id !== undefined) {
    query.set("country_id", String(params.country_id));
  }

  if (params.operatorId !== undefined) {
    query.set("operator_id", String(params.operatorId));
  }

  if (params.operator_id !== undefined) {
    query.set("operator_id", String(params.operator_id));
  }

  if (params.serviceId !== undefined) {
    query.set("service_id", String(params.serviceId));
  }

  if (params.service_id !== undefined) {
    query.set("service_id", String(params.service_id));
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : "";

  return request(env, `/products${suffix}`);
}

async function getProduct(env, productId) {
  if (
    productId === undefined ||
    productId === null ||
    productId === ""
  ) {
    throw new SMSCodeError(
      "Product ID SMSCode belum tersedia.",
      {
        code: "PRODUCT_ID_MISSING"
      }
    );
  }

  return request(
    env,
    `/products/${encodeURIComponent(String(productId))}`
  );
}

async function getBalance(env) {
  return request(env, "/balance");
}

async function getActiveOrders(env) {
  return request(env, "/orders/active");
}

export {
  SMSCodeError,
  mapStatus,
  normalizeOrder,
  createOrder,
  getOrder,
  getStatus,
  cancelOrder,
  finishOrder,
  resendOrder,
  getCountries,
  getServices,
  getOperators,
  getProducts,
  getProduct,
  getBalance,
  getActiveOrders
};
