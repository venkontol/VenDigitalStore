const DEFAULT_BASE_URL = "https://api.smscode.gg/v2";
const DEFAULT_TIMEOUT = 15000;

class SMSCodeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SMSCodeError";
    this.status = Number(details.status || 502);
    this.code = details.code || null;
    this.providerData = details.providerData ?? null;
  }
}

function getBaseUrl(env) {
  const value = String(
    env?.SMSCODE_API_URL ||
    DEFAULT_BASE_URL
  ).trim();

  if (!value) {
    throw new SMSCodeError(
      "SMSCode API URL belum dikonfigurasi.",
      {
        status: 500,
        code: "SMSCODE_URL_MISSING"
      }
    );
  }

  try {
    return new URL(
      value.endsWith("/")
        ? value
        : `${value}/`
    );
  } catch {
    throw new SMSCodeError(
      "SMSCode API URL tidak valid.",
      {
        status: 500,
        code: "SMSCODE_URL_INVALID"
      }
    );
  }
}

function getToken(env) {
  const token = String(
    env?.SMSCODE_TOKEN || ""
  ).trim();

  if (!token) {
    throw new SMSCodeError(
      "SMSCode API token belum dikonfigurasi.",
      {
        status: 500,
        code: "SMSCODE_TOKEN_MISSING"
      }
    );
  }

  return token;
}

function normalizeData(data) {
  if (
    data &&
    typeof data === "object" &&
    Object.prototype.hasOwnProperty.call(
      data,
      "data"
    )
  ) {
    return data.data;
  }

  return data;
}

function normalizeProviderPayload(data) {
  const normalized =
    normalizeData(data);

  if (
    normalized &&
    typeof normalized === "object" &&
    normalized.order &&
    typeof normalized.order === "object"
  ) {
    return normalized.order;
  }

  return normalized;
}

function getErrorMessage(data, status) {
  if (
    typeof data === "string" &&
    data.trim()
  ) {
    return data.trim();
  }

  if (
    data &&
    typeof data === "object"
  ) {
    return String(
      data.error ||
      data.message ||
      data.detail ||
      data.error_message ||
      data.errors?.message ||
      `SMSCode API gagal (${status}).`
    );
  }

  return `SMSCode API gagal (${status}).`;
}

function getErrorCode(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }

  return (
    data.code ||
    data.error_code ||
    data.errorCode ||
    data.errors?.code ||
    null
  );
}

function buildQuery(params = {}) {
  const query =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    query.set(
      key,
      String(value)
    );
  }

  const result =
    query.toString();

  return result
    ? `?${result}`
    : "";
}

function normalizePositiveInteger(
  value,
  label,
  required = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    if (required) {
      throw new SMSCodeError(
        `${label} wajib diisi.`,
        {
          status: 400,
          code: `${label
            .toUpperCase()
            .replace(/\s+/g, "_")}_REQUIRED`
        }
      );
    }

    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new SMSCodeError(
      `${label} tidak valid.`,
      {
        status: 400,
        code: `INVALID_${label
          .toUpperCase()
          .replace(/\s+/g, "_")}`
      }
    );
  }

  return parsed;
}

async function request(
  env,
  path,
  options = {}
) {
  const token =
    getToken(env);

  const baseUrl =
    getBaseUrl(env);

  const controller =
    new AbortController();

  const timeoutMs =
    Number(options.timeout) > 0
      ? Number(options.timeout)
      : DEFAULT_TIMEOUT;

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const url =
      new URL(
        String(path).replace(
          /^\/+/,
          ""
        ),
        baseUrl
      );

    const headers =
      new Headers(
        options.headers || {}
      );

    headers.set(
      "Authorization",
      `Bearer ${token}`
    );

    headers.set(
      "Accept",
      "application/json"
    );

    if (
      options.body !== undefined &&
      !headers.has(
        "Content-Type"
      )
    ) {
      headers.set(
        "Content-Type",
        "application/json"
      );
    }

    const response =
      await fetch(
        url,
        {
          method:
            options.method || "GET",
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(
                  options.body
                )
              : undefined,
          signal:
            controller.signal
        }
      );

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let data = null;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      try {
        data =
          await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        const text =
          await response.text();

        data =
          text.trim()
            ? text
            : null;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw new SMSCodeError(
        getErrorMessage(
          data,
          response.status
        ),
        {
          status:
            response.status >= 500
              ? 502
              : response.status,
          code:
            getErrorCode(data),
          providerData:
            data
        }
      );
    }

    return data;
  } catch (error) {
    if (
      error instanceof SMSCodeError
    ) {
      throw error;
    }

    if (
      error?.name ===
      "AbortError"
    ) {
      throw new SMSCodeError(
        "SMSCode API timeout.",
        {
          status: 504,
          code: "SMSCODE_TIMEOUT"
        }
      );
    }

    throw new SMSCodeError(
      "Tidak dapat terhubung ke SMSCode API.",
      {
        status: 502,
        code:
          "SMSCODE_NETWORK_ERROR",
        providerData:
          error?.message || null
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCountries(
  env
) {
  const response =
    await request(
      env,
      "/catalog/countries"
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.countries
    )
  ) {
    return data.countries;
  }

  return data;
}

export async function getServices(
  env,
  countryId
) {
  const query =
    buildQuery({
      country_id:
        countryId
    });

  const response =
    await request(
      env,
      `/catalog/services${query}`
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.services
    )
  ) {
    return data.services;
  }

  return data;
}

export async function getOperators(
  env,
  {
    countryId,
    platformId
  } = {}
) {
  const query =
    buildQuery({
      country_id:
        countryId,
      platform_id:
        platformId
    });

  const response =
    await request(
      env,
      `/catalog/operators${query}`
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.operators
    )
  ) {
    return data.operators;
  }

  return data;
}

export async function getProducts(
  env,
  filters = {}
) {
  const query =
    buildQuery({
      country_id:
        filters.countryId,
      platform_id:
        filters.platformId,
      service_id:
        filters.serviceId,
      operator_id:
        filters.operatorId,
      available:
        filters.available,
      active:
        filters.active
    });

  const response =
    await request(
      env,
      `/catalog/products${query}`
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.products
    )
  ) {
    return data.products;
  }

  return [];
}

export async function getProduct(
  env,
  productId
) {
  const parsedProductId =
    normalizePositiveInteger(
      productId,
      "Product ID SMSCode",
      true
    );

  const products =
    await getProducts(
      env
    );

  return (
    products.find(
      product =>
        String(
          product.id
        ) ===
        String(
          parsedProductId
        )
    ) || null
  );
}

export async function getBalance(
  env
) {
  const response =
    await request(
      env,
      "/balance"
    );

  const data =
    normalizeData(response);

  if (
    typeof data ===
    "number"
  ) {
    return {
      balance: data,
      currency: "IDR"
    };
  }

  if (
    typeof data ===
    "string" &&
    data.trim() &&
    Number.isFinite(
      Number(data)
    )
  ) {
    return {
      balance:
        Number(data),
      currency: "IDR"
    };
  }

  return {
    balance:
      Number(
        data?.balance ??
        data?.amount ??
        0
      ),
    currency:
      String(
        data?.currency ||
        "IDR"
      ).toUpperCase(),
    raw: data
  };
}

export async function createOrder(
  env,
  {
    productId,
    catalogProductId,
    operatorId,
    minPrice,
    maxPrice,
    quantity = 1,
    idempotencyKey
  } = {}
) {
  const parsedProductId =
    productId !== undefined &&
    productId !== null &&
    productId !== ""
      ? normalizePositiveInteger(
          productId,
          "Product ID SMSCode"
        )
      : null;

  const parsedCatalogProductId =
    catalogProductId !== undefined &&
    catalogProductId !== null &&
    catalogProductId !== ""
      ? normalizePositiveInteger(
          catalogProductId,
          "Catalog Product ID SMSCode"
        )
      : null;

  if (
    !parsedProductId &&
    !parsedCatalogProductId
  ) {
    throw new SMSCodeError(
      "Product ID SMSCode wajib diisi.",
      {
        status: 400,
        code:
          "PRODUCT_ID_REQUIRED"
      }
    );
  }

  const parsedQuantity =
    normalizePositiveInteger(
      quantity,
      "Quantity SMSCode",
      true
    );

  const body = {
    quantity:
      parsedQuantity
  };

  if (
    parsedProductId
  ) {
    body.product_id =
      parsedProductId;
  } else {
    body.catalog_product_id =
      parsedCatalogProductId;
  }

  if (
    operatorId !== undefined &&
    operatorId !== null &&
    operatorId !== ""
  ) {
    body.operator_id =
      normalizePositiveInteger(
        operatorId,
        "Operator ID SMSCode"
      );
  }

  if (
    minPrice !== undefined &&
    minPrice !== null &&
    minPrice !== ""
  ) {
    const parsedMinPrice =
      Number(minPrice);

    if (
      !Number.isFinite(
        parsedMinPrice
      ) ||
      parsedMinPrice < 0
    ) {
      throw new SMSCodeError(
        "Minimum price SMSCode tidak valid.",
        {
          status: 400,
          code:
            "INVALID_MIN_PRICE"
        }
      );
    }

    body.min_price =
      parsedMinPrice;
  }

  if (
    maxPrice !== undefined &&
    maxPrice !== null &&
    maxPrice !== ""
  ) {
    const parsedMaxPrice =
      Number(maxPrice);

    if (
      !Number.isFinite(
        parsedMaxPrice
      ) ||
      parsedMaxPrice < 0
    ) {
      throw new SMSCodeError(
        "Maximum price SMSCode tidak valid.",
        {
          status: 400,
          code:
            "INVALID_MAX_PRICE"
        }
      );
    }

    body.max_price =
      parsedMaxPrice;
  }

  if (
    body.min_price !== undefined &&
    body.max_price !== undefined &&
    body.min_price >
      body.max_price
  ) {
    throw new SMSCodeError(
      "Minimum price tidak boleh lebih besar dari maximum price.",
      {
        status: 400,
        code:
          "INVALID_PRICE_RANGE"
      }
    );
  }

  const headers = {};

  if (
    idempotencyKey !== undefined &&
    idempotencyKey !== null &&
    String(
      idempotencyKey
    ).trim()
  ) {
    headers[
      "Idempotency-Key"
    ] = String(
      idempotencyKey
    ).trim();
  }

  const response =
    await request(
      env,
      "/orders/create",
      {
        method: "POST",
        headers,
        body
      }
    );

  return normalizeData(
    response
  );
}

export async function getOrder(
  env,
  orderId
) {
  const normalizedOrderId =
    String(
      orderId ?? ""
    ).trim();

  if (
    !normalizedOrderId
  ) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code:
          "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        normalizedOrderId
      )}`
    );

  return normalizeData(
    response
  );
}

export async function getActiveOrders(
  env
) {
  const response =
    await request(
      env,
      "/orders/active"
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.orders
    )
  ) {
    return data.orders;
  }

  return [];
}

async function executeOrderAction(
  env,
  orderId,
  action
) {
  const normalizedOrderId =
    String(
      orderId ?? ""
    ).trim();

  if (
    !normalizedOrderId
  ) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code:
          "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        normalizedOrderId
      )}/${action}`,
      {
        method: "POST"
      }
    );

  return normalizeData(
    response
  );
}

export async function cancelOrder(
  env,
  orderId
) {
  return executeOrderAction(
    env,
    orderId,
    "cancel"
  );
}

export async function finishOrder(
  env,
  orderId
) {
  return executeOrderAction(
    env,
    orderId,
    "finish"
  );
}

export async function resendOrder(
  env,
  orderId
) {
  return executeOrderAction(
    env,
    orderId,
    "resend"
  );
}

export function mapStatus(
  providerStatus
) {
  const status =
    String(
      providerStatus || ""
    )
      .trim()
      .toUpperCase();

  switch (status) {
    case "ACTIVE":
      return "PROCESSING";

    case "OTP_RECEIVED":
      return "OTP_RECEIVED";

    case "COMPLETED":
      return "COMPLETED";

    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";

    case "EXPIRED":
      return "EXPIRED";

    case "FAILED":
    case "FAIL":
      return "FAILED";

    case "PENDING":
      return "PENDING";

    case "PROCESSING":
      return "PROCESSING";

    default:
      return "UNKNOWN";
  }
}

export function normalizeOrder(
  data
) {
  if (!data) {
    return null;
  }

  const order =
    normalizeProviderPayload(
      data
    );

  if (
    !order ||
    typeof order !==
      "object"
  ) {
    return null;
  }

  const rawStatus =
    order.status ??
    order.provider_status ??
    null;

  const amount =
    Number(
      order.amount ??
      order.price ??
      order.charge ??
      0
    );

  return {
    id:
      order.id ??
      order.order_id ??
      null,

    status:
      mapStatus(
        rawStatus
      ),

    provider_status:
      rawStatus,

    product_id:
      order.product_id ??
      null,

    catalog_product_id:
      order.catalog_product_id ??
      null,

    operator_id:
      order.operator_id ??
      null,

    phone_number:
      order.phone_number ??
      order.phone ??
      order.number ??
      null,

    amount:
      Number.isFinite(
        amount
      )
        ? amount
        : 0,

    otp_code:
      order.otp_code ??
      order.otp ??
      order.code ??
      null,

    otp_received_at:
      order.otp_received_at ??
      null,

    expires_at:
      order.expires_at ??
      order.expired_at ??
      null,

    canceled_at:
      order.canceled_at ??
      null,

    failed_reason:
      order.failed_reason ??
      order.failure_reason ??
      order.error ??
      null,

    raw: data
  };
}

export {
  SMSCodeError
};
