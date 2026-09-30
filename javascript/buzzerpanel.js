const DEFAULT_BASE_URL = "https://buzzerpanel.id/api/json.php";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CACHE_TTL = 300;
const DEFAULT_MAX_SERVICES = 300;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const MAX_ID_LENGTH = 256;
const MAX_LINK_LENGTH = 4096;
const MAX_QUANTITY_LENGTH = 32;
const MAX_OPTION_LENGTH = 4096;
const MAX_SERVICE_NAME_LENGTH = 512;
const MAX_CATEGORY_LENGTH = 256;
const MAX_TYPE_LENGTH = 128;
const MAX_STATUS_LENGTH = 128;
const MAX_ERROR_LENGTH = 1000;

const servicesCache = new Map();

export class BuzzerPanelError extends Error {
  constructor(message, options = {}) {
    super(String(message || "BuzzerPanel error."));
    this.name = "BuzzerPanelError";
    this.status = Number.isFinite(Number(options.status)) ? Number(options.status) : 502;
    this.code = String(options.code || "BUZZERPANEL_ERROR");
    this.details = options.details ?? null;
  }
}

function getBaseUrl(env) {
  const value = String(env?.BUZZER_API_URL || DEFAULT_BASE_URL).trim();

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new BuzzerPanelError("BuzzerPanel API URL tidak valid.", {
      status: 500,
      code: "BUZZERPANEL_API_URL_INVALID"
    });
  }

  if (url.protocol !== "https:") {
    throw new BuzzerPanelError("BuzzerPanel API wajib menggunakan HTTPS.", {
      status: 500,
      code: "BUZZERPANEL_API_URL_INVALID"
    });
  }

  return url.toString();
}

function getCredentials(env) {
  const apiKey = String(env?.BUZZER_API_KEY || "").trim();
  const secretKey = String(env?.BUZZER_SECRET_KEY || "").trim();

  if (!apiKey) {
    throw new BuzzerPanelError("BuzzerPanel API key belum dikonfigurasi.", {
      status: 500,
      code: "BUZZER_API_KEY_MISSING"
    });
  }

  if (!secretKey) {
    throw new BuzzerPanelError("BuzzerPanel secret key belum dikonfigurasi.", {
      status: 500,
      code: "BUZZER_SECRET_KEY_MISSING"
    });
  }

  return {
    apiKey,
    secretKey
  };
}

function getTimeout(env, requested) {
  const requestedValue = Number(requested);

  if (
    Number.isFinite(requestedValue) &&
    requestedValue >= MIN_TIMEOUT_MS &&
    requestedValue <= MAX_TIMEOUT_MS
  ) {
    return Math.floor(requestedValue);
  }

  const value = Number(env?.BUZZER_API_TIMEOUT || DEFAULT_TIMEOUT_MS);

  if (
    Number.isFinite(value) &&
    value >= MIN_TIMEOUT_MS &&
    value <= MAX_TIMEOUT_MS
  ) {
    return Math.floor(value);
  }

  return DEFAULT_TIMEOUT_MS;
}

function getCacheTtl(env) {
  const value = Number(
    env?.BUZZER_SERVICES_CACHE_TTL ??
      env?.CACHE_TTL ??
      DEFAULT_CACHE_TTL
  );

  if (Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return DEFAULT_CACHE_TTL;
}

function getMaxServices(env) {
  const value = Number(env?.MAX_SERVICES ?? DEFAULT_MAX_SERVICES);

  if (Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  return DEFAULT_MAX_SERVICES;
}

function clean(value, maxLength = MAX_OPTION_LENGTH) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildForm(payload) {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      form.set(key, value.join("\n"));
      continue;
    }

    form.set(key, String(value));
  }

  return form;
}

function getRequestCredentials(env) {
  const { apiKey, secretKey } = getCredentials(env);

  return {
    api_key: apiKey,
    secret_key: secretKey
  };
}

function extractApiMessage(data) {
  if (typeof data === "string") {
    return clean(data, MAX_ERROR_LENGTH);
  }

  if (!isObject(data)) {
    return "";
  }

  return clean(
    data.error ??
      data.message ??
      data.msg ??
      data.data?.error ??
      data.data?.message ??
      data.data?.msg ??
      "",
    MAX_ERROR_LENGTH
  );
}

function isProviderError(data) {
  if (!isObject(data)) {
    return false;
  }

  if (
    data.error !== undefined &&
    data.error !== null &&
    data.error !== false &&
    data.error !== ""
  ) {
    return true;
  }

  if (data.success === false) {
    return true;
  }

  return false;
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(env, payload, options = {}) {
  const credentials = getRequestCredentials(env);
  const timeoutMs = getTimeout(env, options.timeoutMs);
  const contentType = options.contentType === "json"
    ? "application/json"
    : "application/x-www-form-urlencoded";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestPayload = {
    ...credentials,
    ...payload
  };

  let body;

  if (contentType === "application/json") {
    body = JSON.stringify(requestPayload);
  } else {
    body = buildForm(requestPayload).toString();
  }

  try {
    const response = await fetch(getBaseUrl(env), {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Accept: "application/json"
      },
      body,
      signal: controller.signal
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new BuzzerPanelError(
        extractApiMessage(data) || `BuzzerPanel HTTP ${response.status}.`,
        {
          status: 502,
          code: "BUZZERPANEL_HTTP_ERROR",
          details: {
            httpStatus: response.status,
            response: data
          }
        }
      );
    }

    if (data === null) {
      throw new BuzzerPanelError(
        "BuzzerPanel memberikan respons kosong.",
        {
          status: 502,
          code: "BUZZERPANEL_EMPTY_RESPONSE"
        }
      );
    }

    if (isProviderError(data)) {
      throw new BuzzerPanelError(
        extractApiMessage(data) || "BuzzerPanel menolak request.",
        {
          status: 502,
          code: "BUZZERPANEL_API_ERROR",
          details: data
        }
      );
    }

    return data;
  } catch (error) {
    if (error instanceof BuzzerPanelError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new BuzzerPanelError(
        "Request ke BuzzerPanel timeout.",
        {
          status: 504,
          code: "BUZZERPANEL_TIMEOUT"
        }
      );
    }

    throw new BuzzerPanelError(
      error?.message || "Gagal terhubung ke BuzzerPanel.",
      {
        status: 502,
        code: "BUZZERPANEL_NETWORK_ERROR"
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

function requireText(value, message, code, maxLength) {
  if (
    value === undefined ||
    value === null ||
    !String(value).trim()
  ) {
    throw new BuzzerPanelError(message, {
      status: 400,
      code
    });
  }

  const normalized = String(value).trim();

  if (normalized.length > maxLength) {
    throw new BuzzerPanelError(`${message} terlalu panjang.`, {
      status: 400,
      code: `${code}_TOO_LONG`
    });
  }

  return normalized;
}

function normalizeQuantity(value) {
  const quantity = Number(
    String(value ?? "").replace(/[^\d]/g, "")
  );

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BuzzerPanelError(
      "Quantity BuzzerPanel tidak valid.",
      {
        status: 400,
        code: "BUZZERPANEL_QUANTITY_INVALID"
      }
    );
  }

  return quantity;
}

function normalizeService(service) {
  if (!isObject(service)) {
    return null;
  }

  const id =
    service.service ??
    service.service_id ??
    service.id ??
    null;

  if (
    id === null ||
    id === undefined ||
    !String(id).trim()
  ) {
    return null;
  }

  const rate = Number(
    service.rate ??
      service.price ??
      service.cost ??
      0
  );

  const min = Number(
    service.min ??
      service.minimum ??
      0
  );

  const max = Number(
    service.max ??
      service.maximum ??
      0
  );

  return {
    id: String(id).trim(),
    service_id: String(id).trim(),
    name: clean(
      service.name ??
        service.service_name ??
        "",
      MAX_SERVICE_NAME_LENGTH
    ),
    category:
      clean(
        service.category ?? "",
        MAX_CATEGORY_LENGTH
      ) || null,
    type:
      clean(
        service.type ??
          service.service_type ??
          "",
        MAX_TYPE_LENGTH
      ) || null,
    rate:
      Number.isFinite(rate) && rate >= 0
        ? rate
        : 0,
    min:
      Number.isFinite(min) && min >= 0
        ? min
        : 0,
    max:
      Number.isFinite(max) && max >= 0
        ? max
        : 0,
    refill:
      service.refill === true ||
      service.refill === 1 ||
      ["true", "1", "yes"].includes(
        String(service.refill ?? "").trim().toLowerCase()
      ),
    dripfeed:
      service.dripfeed === true ||
      service.dripfeed === 1 ||
      ["true", "1", "yes"].includes(
        String(service.dripfeed ?? "").trim().toLowerCase()
      ),
    raw: service
  };
}

function extractServices(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!isObject(data)) {
    return [];
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  if (Array.isArray(data.result)) {
    return data.result;
  }

  return [];
}

function extractOrderId(data) {
  if (!isObject(data)) {
    return null;
  }

  const value =
    data.order ??
    data.order_id ??
    data.id ??
    data.data?.order ??
    data.data?.order_id ??
    data.data?.id ??
    null;

  if (
    value === null ||
    value === undefined ||
    !String(value).trim()
  ) {
    return null;
  }

  return String(value).trim();
}

function extractStatusData(data) {
  if (!isObject(data)) {
    return null;
  }

  const source = isObject(data.data) ? data.data : data;

  const orderId =
    source.order ??
    source.order_id ??
    source.id ??
    data.order ??
    data.order_id ??
    data.id ??
    null;

  const status =
    source.status ??
    data.status ??
    null;

  return {
    externalOrderId:
      orderId === null ||
      orderId === undefined ||
      !String(orderId).trim()
        ? null
        : String(orderId).trim(),
    providerStatus:
      clean(
        status,
        MAX_STATUS_LENGTH
      ) || null,
    charge: normalizeAmount(
      source.charge ??
        data.charge
    ),
    startCount: normalizeNumber(
      source.start_count ??
        data.start_count
    ),
    remains: normalizeNumber(
      source.remains ??
        data.remains
    ),
    currency:
      clean(
        source.currency ??
          data.currency ??
          "IDR",
        16
      ) || "IDR",
    raw: data
  };
}

function normalizeAmount(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
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

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
}

function normalizeOptional(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).slice(0, MAX_OPTION_LENGTH);
}

function extractInput(context = {}) {
  if (isObject(context.requestData)) {
    return context.requestData;
  }

  if (isObject(context)) {
    return context;
  }

  return {};
}

function extractOrderIdFromContext(context = {}) {
  const input = extractInput(context);

  return (
    context.externalOrderId ??
    context.orderId ??
    input.externalOrderId ??
    input.orderId ??
    input.id ??
    null
  );
}

export function mapStatus(status) {
  const value = clean(status, MAX_STATUS_LENGTH)
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) {
    return "UNKNOWN";
  }

  if (
    ["PENDING", "WAITING", "QUEUED", "QUEUE", "IN QUEUE", "AWAITING"].includes(value)
  ) {
    return "PENDING";
  }

  if (
    ["PROCESSING", "IN PROGRESS", "INPROGRESS", "RUNNING", "STARTED", "WORKING"].includes(value)
  ) {
    return "PROCESSING";
  }

  if (
    ["COMPLETED", "COMPLETE", "DONE", "SUCCESS", "SUCCESSFUL"].includes(value)
  ) {
    return "COMPLETED";
  }

  if (
    ["PARTIAL", "PARTIALLY COMPLETED", "PARTIALLY"].includes(value)
  ) {
    return "PARTIAL";
  }

  if (
    ["CANCELED", "CANCELLED", "CANCEL", "STOPPED"].includes(value)
  ) {
    return "CANCELLED";
  }

  if (
    ["EXPIRED", "EXPIRE", "TIMEOUT", "TIMED OUT"].includes(value)
  ) {
    return "EXPIRED";
  }

  if (
    ["FAILED", "FAIL", "ERROR", "REJECTED", "REJECT", "FAILURE"].includes(value)
  ) {
    return "FAILED";
  }

  return "UNKNOWN";
}

export async function getServices(env, options = {}) {
  const baseUrl = getBaseUrl(env);
  const maxServices = getMaxServices(env);
  const ttl = getCacheTtl(env);
  const action = clean(
    options.action || "services",
    64
  ) || "services";

  const cacheKey = `${baseUrl}|${action}|${maxServices}`;
  const now = Date.now();
  const cached = servicesCache.get(cacheKey);

  if (
    cached &&
    ttl > 0 &&
    now - cached.timestamp < ttl * 1000
  ) {
    return cached.services;
  }

  const data = await request(
    env,
    {
      action
    },
    options
  );

  const services = extractServices(data)
    .map(normalizeService)
    .filter(Boolean)
    .slice(0, maxServices);

  servicesCache.set(cacheKey, {
    timestamp: now,
    services
  });

  return services;
}

export async function createOrder(env, context = {}, options = {}) {
  const input = extractInput(context);

  const service = requireText(
    input.service ??
      input.serviceId ??
      input.service_id,
    "Service BuzzerPanel wajib diisi.",
    "BUZZERPANEL_SERVICE_MISSING",
    MAX_ID_LENGTH
  );

  const link = requireText(
    input.link ??
      input.data ??
      input.target,
    "Target BuzzerPanel wajib diisi.",
    "BUZZERPANEL_TARGET_MISSING",
    MAX_LINK_LENGTH
  );

  const rawQuantity =
    input.quantity ??
    input.qty ??
    input.jumlah;

  const payload = {
    action: "order",
    service,
    data: link
  };

  if (
    input.komen !== undefined &&
    input.komen !== null
  ) {
    payload.komen = normalizeOptional(input.komen);
  }

  if (
    input.comments !== undefined &&
    input.comments !== null
  ) {
    payload.comments = normalizeOptional(input.comments);
  }

  if (
    input.usernames !== undefined &&
    input.usernames !== null
  ) {
    payload.usernames = normalizeOptional(input.usernames);
  }

  const isCustomTextOrder =
    Boolean(
      payload.komen ||
      payload.comments ||
      payload.usernames
    );

  if (!isCustomTextOrder) {
    payload.quantity = String(
      normalizeQuantity(rawQuantity)
    );
  } else if (
    rawQuantity !== undefined &&
    rawQuantity !== null &&
    String(rawQuantity).trim()
  ) {
    payload.quantity = String(
      normalizeQuantity(rawQuantity)
    );
  }

  if (
    input.runs !== undefined &&
    input.runs !== null &&
    String(input.runs).trim()
  ) {
    payload.runs = normalizeOptional(input.runs);
  }

  if (
    input.interval !== undefined &&
    input.interval !== null &&
    String(input.interval).trim()
  ) {
    payload.interval = normalizeOptional(input.interval);
  }

  const contentType =
    options.contentType === "form"
      ? "form"
      : options.contentType === "json"
        ? "json"
        : isCustomTextOrder
          ? "json"
          : "form";

  const data = await request(
    env,
    payload,
    {
      ...options,
      contentType
    }
  );

  const externalOrderId = extractOrderId(data);

  if (!externalOrderId) {
    throw new BuzzerPanelError(
      "BuzzerPanel tidak mengembalikan ID order.",
      {
        status: 502,
        code: "BUZZERPANEL_ORDER_ID_MISSING",
        details: data
      }
    );
  }

  return {
    externalOrderId,
    providerData: data
  };
}

export async function getOrderStatus(
  env,
  orderId,
  options = {}
) {
  const id = requireText(
    orderId,
    "ID order BuzzerPanel wajib diisi.",
    "BUZZERPANEL_ORDER_ID_MISSING",
    MAX_ID_LENGTH
  );

  const data = await request(
    env,
    {
      action: "status",
      id
    },
    {
      ...options,
      contentType: options.contentType || "form"
    }
  );

  const result = extractStatusData(data);

  if (!result) {
    throw new BuzzerPanelError(
      "Respons status BuzzerPanel tidak valid.",
      {
        status: 502,
        code: "BUZZERPANEL_STATUS_INVALID",
        details: data
      }
    );
  }

  return {
    ...result,
    status: mapStatus(result.providerStatus)
  };
}

export async function getOrdersStatus(
  env,
  orderIds,
  options = {}
) {
  if (!Array.isArray(orderIds)) {
    throw new BuzzerPanelError(
      "Daftar ID order BuzzerPanel harus berupa array.",
      {
        status: 400,
        code: "BUZZERPANEL_ORDER_IDS_INVALID"
      }
    );
  }

  const ids = orderIds
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);

  if (!ids.length) {
    throw new BuzzerPanelError(
      "Daftar ID order BuzzerPanel kosong.",
      {
        status: 400,
        code: "BUZZERPANEL_ORDER_IDS_EMPTY"
      }
    );
  }

  const data = await request(
    env,
    {
      action: "status",
      orders: ids.join(",")
    },
    {
      ...options,
      contentType: options.contentType || "form"
    }
  );

  return data;
}

export async function getBalance(env, options = {}) {
  return request(
    env,
    {
      action: "balance"
    },
    {
      ...options,
      contentType: options.contentType || "form"
    }
  );
}

export async function requestRefill(
  env,
  orderId,
  options = {}
) {
  const id = requireText(
    orderId,
    "ID order BuzzerPanel wajib diisi.",
    "BUZZERPANEL_ORDER_ID_MISSING",
    MAX_ID_LENGTH
  );

  return request(
    env,
    {
      action: "refill",
      id
    },
    {
      ...options,
      contentType: options.contentType || "form"
    }
  );
}

export async function getRefillStatus(
  env,
  refillId,
  options = {}
) {
  const id = requireText(
    refillId,
    "ID refill BuzzerPanel wajib diisi.",
    "BUZZERPANEL_REFILL_ID_MISSING",
    MAX_ID_LENGTH
  );

  return request(
    env,
    {
      action: "status_refill",
      id
    },
    {
      ...options,
      contentType: options.contentType || "form"
    }
  );
}

export const BUZZERPANEL_ADAPTER = {
  name: "BUZZERPANEL",
  getServices,
  createOrder,
  getOrderStatus,
  getOrdersStatus,
  getBalance,
  requestRefill,
  getRefillStatus,
  mapStatus
};

export default BUZZERPANEL_ADAPTER;
