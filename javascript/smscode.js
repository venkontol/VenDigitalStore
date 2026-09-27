const DEFAULT_BASE_URL = "https://api.smscode.gg/v2";
const DEFAULT_TIMEOUT = 15000;

export class SMSCodeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SMSCodeError";
    this.status = details.status || 502;
    this.code = details.code || null;
    this.providerData = details.providerData || null;
  }
}

function getBaseUrl(env) {
  const value = String(
    env?.SMSCODE_API_URL ||
    DEFAULT_BASE_URL
  ).trim();

  return value.replace(/\/+$/, "");
}

function getToken(env) {
  const token = String(
    env?.SMSCODE_API_KEY ||
    env?.SMSCODE_TOKEN ||
    ""
  ).trim();

  if (!token) {
    throw new SMSCodeError(
      "SMSCode API key belum dikonfigurasi.",
      {
        status: 500,
        code: "SMSCODE_API_KEY_MISSING"
      }
    );
  }

  return token;
}

function normalizeData(data) {
  if (
    data &&
    typeof data === "object" &&
    "data" in data
  ) {
    return data.data;
  }

  return data;
}

async function request(env, path, options = {}) {
  const token = getToken(env);

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      options.timeout || DEFAULT_TIMEOUT
    );

  try {
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
      !headers.has("Content-Type")
    ) {
      headers.set(
        "Content-Type",
        "application/json"
      );
    }

    const response =
      await fetch(
        `${getBaseUrl(env)}${path}`,
        {
          method:
            options.method || "GET",
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal:
            controller.signal
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        data?.detail ||
        `SMSCode API gagal (${response.status}).`;

      throw new SMSCodeError(
        String(message),
        {
          status:
            response.status >= 500
              ? 502
              : response.status,
          code:
            data?.code ||
            data?.error_code ||
            null,
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
      error?.name === "AbortError"
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
        code: "SMSCODE_NETWORK_ERROR"
      }
    );
  } finally {
    clearTimeout(timeout);
  }
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

function normalizeOrderData(data) {
  const normalized =
    normalizeData(data);

  if (
    normalized &&
    typeof normalized === "object" &&
    normalized.order
  ) {
    return normalized.order;
  }

  return normalized;
}

export async function getCountries(env) {
  const response =
    await request(
      env,
      "/catalog/countries"
    );

  return normalizeData(
    response
  );
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

  return normalizeData(
    response
  );
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

  return normalizeData(
    response
  );
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

  if (
    Array.isArray(data)
  ) {
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
  if (!productId) {
    throw new SMSCodeError(
      "Product ID SMSCode tidak valid.",
      {
        status: 400,
        code: "INVALID_PRODUCT_ID"
      }
    );
  }

  const products =
    await getProducts(env);

  return (
    products.find(
      product =>
        String(product.id) ===
        String(productId)
    ) || null
  );
}

export async function getBalance(env) {
  const response =
    await request(
      env,
      "/balance"
    );

  const data =
    normalizeData(response);

  if (
    typeof data === "number"
  ) {
    return {
      balance: data,
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
  if (
    !productId &&
    !catalogProductId
  ) {
    throw new SMSCodeError(
      "Product ID SMSCode wajib diisi.",
      {
        status: 400,
        code: "PRODUCT_ID_REQUIRED"
      }
    );
  }

  const parsedQuantity =
    Number(quantity);

  if (
    !Number.isInteger(
      parsedQuantity
    ) ||
    parsedQuantity < 1
  ) {
    throw new SMSCodeError(
      "Quantity SMSCode tidak valid.",
      {
        status: 400,
        code: "INVALID_QUANTITY"
      }
    );
  }

  const body = {
    quantity:
      parsedQuantity
  };

  if (productId) {
    body.product_id =
      Number(productId);
  }

  if (
    !productId &&
    catalogProductId
  ) {
    body.catalog_product_id =
      Number(catalogProductId);
  }

  if (
    operatorId !== undefined &&
    operatorId !== null &&
    operatorId !== ""
  ) {
    body.operator_id =
      Number(operatorId);
  }

  if (
    minPrice !== undefined &&
    minPrice !== null &&
    minPrice !== ""
  ) {
    body.min_price =
      Number(minPrice);
  }

  if (
    maxPrice !== undefined &&
    maxPrice !== null &&
    maxPrice !== ""
  ) {
    body.max_price =
      Number(maxPrice);
  }

  const headers = {};

  if (idempotencyKey) {
    headers[
      "Idempotency-Key"
    ] =
      String(
        idempotencyKey
      );
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

  return normalizeOrderData(
    response
  );
}

export async function getOrder(
  env,
  orderId
) {
  if (!orderId) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code: "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        String(orderId)
      )}`
    );

  return normalizeOrderData(
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

  if (
    Array.isArray(data)
  ) {
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

export async function cancelOrder(
  env,
  orderId
) {
  if (!orderId) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code: "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        String(orderId)
      )}/cancel`,
      {
        method: "POST"
      }
    );

  return normalizeOrderData(
    response
  );
}

export async function finishOrder(
  env,
  orderId
) {
  if (!orderId) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code: "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        String(orderId)
      )}/finish`,
      {
        method: "POST"
      }
    );

  return normalizeOrderData(
    response
  );
}

export async function resendOrder(
  env,
  orderId
) {
  if (!orderId) {
    throw new SMSCodeError(
      "Order ID SMSCode wajib diisi.",
      {
        status: 400,
        code: "ORDER_ID_REQUIRED"
      }
    );
  }

  const response =
    await request(
      env,
      `/orders/${encodeURIComponent(
        String(orderId)
      )}/resend`,
      {
        method: "POST"
      }
    );

  return normalizeOrderData(
    response
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

    case "PENDING":
      return "PENDING";

    case "PROCESSING":
      return "PROCESSING";

    case "OTP_RECEIVED":
      return "OTP_RECEIVED";

    case "COMPLETED":
      return "COMPLETED";

    case "FAILED":
      return "FAILED";

    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";

    case "EXPIRED":
      return "EXPIRED";

    default:
      return "UNKNOWN";
  }
}

export function normalizeResult(
  data
) {
  const order =
    normalizeOrderData(
      data
    );

  if (
    !order ||
    typeof order !== "object"
  ) {
    return {
      raw: data,
      status: "UNKNOWN"
    };
  }

  const providerStatus =
    String(
      order.status ||
      order.order_status ||
      ""
    )
      .trim()
      .toUpperCase();

  return {
    id:
      order.id ??
      order.order_id ??
      null,

    status:
      mapStatus(
        providerStatus
      ),

    providerStatus:
      providerStatus ||
      null,

    amount:
      Number(
        order.amount ??
        order.price ??
        order.charge ??
        0
      ),

    phoneNumber:
      order.phone_number ??
      order.phone ??
      order.number ??
      null,

    otpCode:
      order.otp_code ??
      order.otp ??
      order.code ??
      null,

    otpMessage:
      order.otp_message ??
      order.message ??
      null,

    expiresAt:
      order.expires_at ??
      order.expired_at ??
      null,

    failureReason:
      order.failed_reason ??
      order.failure_reason ??
      order.error ??
      null,

    raw:
      order
  };
}

export const SMSCODE_ADAPTER = Object.freeze({
  name: "SMSCODE",

  async createOrder(
    env,
    input = {}
  ) {
    const result =
      await createOrder(
        env,
        input
      );

    return {
      ...result,
      normalized:
        normalizeResult(
          result
        )
    };
  },

  async getStatus(
    env,
    orderId
  ) {
    const result =
      await getOrder(
        env,
        orderId
      );

    return {
      ...result,
      normalized:
        normalizeResult(
          result
        )
    };
  },

  async cancelOrder(
    env,
    orderId
  ) {
    const result =
      await cancelOrder(
        env,
        orderId
      );

    return {
      ...result,
      normalized:
        normalizeResult(
          result
        )
    };
  },

  async finishOrder(
    env,
    orderId
  ) {
    const result =
      await finishOrder(
        env,
        orderId
      );

    return {
      ...result,
      normalized:
        normalizeResult(
          result
        )
    };
  },

  async resendOrder(
    env,
    orderId
  ) {
    const result =
      await resendOrder(
        env,
        orderId
      );

    return {
      ...result,
      normalized:
        normalizeResult(
          result
        )
    };
  },

  normalizeResult
});

export default SMSCODE_ADAPTER;