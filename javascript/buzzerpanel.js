const DEFAULT_BASE_URL = "https://buzzerpanel.id/api/json.php";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CACHE_TTL = 60;
const DEFAULT_MAX_SERVICES = 300;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const MAX_ID_LENGTH = 256;
const MAX_LINK_LENGTH = 4096;
const MAX_QUANTITY_LENGTH = 32;
const MAX_OPTION_LENGTH = 4096;

const servicesCache = new Map();

export class BuzzerPanelError extends Error {
  constructor(message, options = {}) {
    super(String(message || "BuzzerPanel error."));
    this.name = "BuzzerPanelError";
    this.status = Number.isFinite(Number(options.status))
      ? Number(options.status)
      : 502;
    this.code = String(options.code || "BUZZERPANEL_ERROR");
    this.details = options.details ?? null;
  }
}

function getBaseUrl(env) {
  const value = String(
    env?.BUZZER_API_URL || DEFAULT_BASE_URL
  ).trim();

  if (!value) {
    throw new BuzzerPanelError(
      "BuzzerPanel API URL belum dikonfigurasi.",
      {
        status: 500,
        code: "BUZZERPANEL_API_URL_MISSING"
      }
    );
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new BuzzerPanelError(
      "BuzzerPanel API URL tidak valid.",
      {
        status: 500,
        code: "BUZZERPANEL_API_URL_INVALID"
      }
    );
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new BuzzerPanelError(
      "Protokol BuzzerPanel API tidak valid.",
      {
        status: 500,
        code: "BUZZERPANEL_API_URL_INVALID"
      }
    );
  }

  return url.toString();
}

function getCredentials(env) {
  const apiKey = String(
    env?.BUZZER_API_KEY || ""
  ).trim();

  const secretKey = String(
    env?.BUZZER_SECRET_KEY || ""
  ).trim();

  if (!apiKey) {
    throw new BuzzerPanelError(
      "BuzzerPanel API key belum dikonfigurasi.",
      {
        status: 500,
        code: "BUZZER_API_KEY_MISSING"
      }
    );
  }

  if (!secretKey) {
    throw new BuzzerPanelError(
      "BuzzerPanel secret key belum dikonfigurasi.",
      {
        status: 500,
        code: "BUZZER_SECRET_KEY_MISSING"
      }
    );
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

  const value = Number(
    env?.BUZZER_API_TIMEOUT || DEFAULT_TIMEOUT_MS
  );

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
    env?.CACHE_TTL ?? DEFAULT_CACHE_TTL
  );

  if (
    Number.isFinite(value) &&
    value >= 0
  ) {
    return value;
  }

  return DEFAULT_CACHE_TTL;
}

function getMaxServices(env) {
  const value = Number(
    env?.MAX_SERVICES ?? DEFAULT_MAX_SERVICES
  );

  if (
    Number.isFinite(value) &&
    value >= 1
  ) {
    return Math.floor(value);
  }

  return DEFAULT_MAX_SERVICES;
}

function clean(value, max = 4096) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function buildForm(payload) {
  const form = new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(payload || {})
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      form.set(
        key,
        value.join("\n")
      );
      continue;
    }

    form.set(
      key,
      String(value)
    );
  }

  return form;
}

function extractApiMessage(data) {
  if (!data) {
    return "BuzzerPanel tidak memberikan respons.";
  }

  if (typeof data === "string") {
    return clean(data, 1000) ||
      "BuzzerPanel tidak memberikan respons.";
  }

  if (!isObject(data)) {
    return "BuzzerPanel memberikan respons tidak valid.";
  }

  return clean(
    data.error ||
      data.message ||
      data.msg ||
      data.data?.error ||
      data.data?.message ||
      data.data?.msg ||
      "",
    1000
  );
}

function getStatusValue(value) {
  return clean(value, 128)
    .toLowerCase()
    .trim();
}

function isProviderError(data) {
  if (!isObject(data)) {
    return false;
  }

  if (
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return true;
  }

  if (data.error === true) {
    return true;
  }

  if (data.success === false) {
    return true;
  }

  if (data.status === false) {
    return true;
  }

  const status = getStatusValue(data.status);
  const nestedStatus = getStatusValue(
    data.data?.status
  );

  if (
    [
      "error",
      "failed",
      "failure",
      "rejected",
      "invalid"
    ].includes(status)
  ) {
    return true;
  }

  if (
    [
      "error",
      "failed",
      "failure",
      "rejected",
      "invalid"
    ].includes(nestedStatus)
  ) {
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
  const {
    apiKey,
    secretKey
  } = getCredentials(env);

  const timeoutMs = getTimeout(
    env,
    options.timeoutMs
  );

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  const form = buildForm({
    api_key: apiKey,
    secret_key: secretKey,
    ...payload
  });

  try {
    const response = await fetch(
      getBaseUrl(env),
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: form.toString(),
        signal: controller.signal
      }
    );

    const data = await parseResponse(
      response
    );

    if (!response.ok) {
      throw new BuzzerPanelError(
        extractApiMessage(data) ||
          `BuzzerPanel HTTP ${response.status}.`,
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
        extractApiMessage(data) ||
          "BuzzerPanel menolak request.",
        {
          status: 502,
          code: "BUZZERPANEL_API_ERROR",
          details: data
        }
      );
    }

    return data;
  } catch (error) {
    if (
      error instanceof BuzzerPanelError
    ) {
      throw error;
    }

    if (
      error?.name === "AbortError"
    ) {
      throw new BuzzerPanelError(
        "Request ke BuzzerPanel timeout.",
        {
          status: 504,
          code: "BUZZERPANEL_TIMEOUT"
        }
      );
    }

    throw new BuzzerPanelError(
      error?.message ||
        "Gagal terhubung ke BuzzerPanel.",
      {
        status: 502,
        code: "BUZZERPANEL_NETWORK_ERROR"
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

function unwrapData(data) {
  if (!isObject(data)) {
    return data;
  }

  if (isObject(data.data)) {
    return data.data;
  }

  return data;
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

function parseBoolean(value) {
  if (
    value === true ||
    value === 1
  ) {
    return true;
  }

  const normalized = String(
    value ?? ""
  )
    .trim()
    .toLowerCase();

  return [
    "true",
    "1",
    "yes",
    "y",
    "on"
  ].includes(normalized);
}

export function normalizeService(service) {
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
    id === "" ||
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
      512
    ),
    category:
      clean(
        service.category ?? "",
        256
      ) || null,
    type:
      clean(
        service.type ??
          service.service_type ??
          "",
        128
      ) || null,
    rate:
      Number.isFinite(rate) &&
      rate >= 0
        ? rate
        : 0,
    min:
      Number.isFinite(min) &&
      min >= 0
        ? min
        : 0,
    max:
      Number.isFinite(max) &&
      max >= 0
        ? max
        : 0,
    refill:
      parseBoolean(service.refill),
    dripfeed:
      parseBoolean(service.dripfeed),
    currency:
      clean(
        service.currency ?? "IDR",
        16
      ) || "IDR",
    raw: service
  };
}

export async function getServices(
  env,
  options = {}
) {
  const baseUrl = getBaseUrl(env);
  const maxServices = getMaxServices(env);
  const cacheKey = `${baseUrl}|${maxServices}`;
  const ttl = getCacheTtl(env) * 1000;
  const now = Date.now();
  const cached = servicesCache.get(
    cacheKey
  );

  if (
    !options.forceRefresh &&
    cached &&
    ttl > 0 &&
    now - cached.timestamp < ttl
  ) {
    return cached.services;
  }

  const data = await request(
    env,
    {
      action: "services"
    },
    {
      timeoutMs:
        options.timeoutMs
    }
  );

  const services = extractServices(data)
    .map(normalizeService)
    .filter(Boolean)
    .slice(0, maxServices);

  servicesCache.set(
    cacheKey,
    {
      timestamp: now,
      services
    }
  );

  return services;
}

function extractOrder(data) {
  if (!isObject(data)) {
    return null;
  }

  const nested = unwrapData(data);

  if (isObject(nested)) {
    const id =
      nested.order ??
      nested.order_id ??
      nested.id ??
      null;

    if (
      id !== null &&
      id !== "" &&
      String(id).trim()
    ) {
      return {
        ...nested,
        id: String(id).trim(),
        order: String(
          nested.order ?? id
        ).trim(),
        raw: data
      };
    }
  }

  const id =
    data.order ??
    data.order_id ??
    data.id ??
    null;

  if (
    id !== null &&
    id !== "" &&
    String(id).trim()
  ) {
    return {
      ...data,
      id: String(id).trim(),
      order: String(
        data.order ?? id
      ).trim(),
      raw: data
    };
  }

  return null;
}

function extractStatus(data) {
  if (!isObject(data)) {
    return null;
  }

  const nested = unwrapData(data);

  if (isObject(nested)) {
    const status =
      nested.status ??
      nested.order_status ??
      null;

    if (
      status !== null &&
      status !== ""
    ) {
      return {
        ...nested,
        status: clean(
          status,
          128
        ),
        raw: data
      };
    }
  }

  if (
    data.status !== undefined &&
    data.status !== null &&
    String(data.status).trim()
  ) {
    return {
      ...data,
      status: clean(
        data.status,
        128
      ),
      raw: data
    };
  }

  return null;
}

function requireText(
  value,
  message,
  code,
  maxLength
) {
  if (
    value === undefined ||
    value === null ||
    !String(value).trim()
  ) {
    throw new BuzzerPanelError(
      message,
      {
        status: 400,
        code
      }
    );
  }

  const normalized = String(
    value
  ).trim();

  if (
    normalized.length > maxLength
  ) {
    throw new BuzzerPanelError(
      `${message} terlalu panjang.`,
      {
        status: 400,
        code: `${code}_TOO_LONG`
      }
    );
  }

  return normalized;
}

function normalizeOptional(
  value,
  maxLength = MAX_OPTION_LENGTH
) {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const normalized = String(
    value
  ).trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

export async function createOrder(
  env,
  params = {}
) {
  const service = requireText(
    params.service ??
      params.serviceId ??
      params.service_id,
    "Service BuzzerPanel wajib diisi.",
    "BUZZERPANEL_SERVICE_MISSING",
    MAX_ID_LENGTH
  );

  const link = requireText(
    params.link ??
      params.data ??
      params.target,
    "Target BuzzerPanel wajib diisi.",
    "BUZZERPANEL_TARGET_MISSING",
    MAX_LINK_LENGTH
  );

  const quantity = requireText(
    params.quantity,
    "Quantity BuzzerPanel wajib diisi.",
    "BUZZERPANEL_QUANTITY_MISSING",
    MAX_QUANTITY_LENGTH
  );

  const numericQuantity = Number(
    quantity
  );

  if (
    !Number.isFinite(numericQuantity) ||
    numericQuantity <= 0 ||
    !Number.isInteger(numericQuantity)
  ) {
    throw new BuzzerPanelError(
      "Quantity BuzzerPanel tidak valid.",
      {
        status: 400,
        code: "BUZZERPANEL_QUANTITY_INVALID"
      }
    );
  }

  const payload = {
    action: "order",
    service,
    data: link,
    quantity: String(
      Math.floor(numericQuantity)
    )
  };

  const optionalFields = [
    "komen",
    "comments",
    "usernames",
    "runs",
    "interval"
  ];

  for (
    const field of optionalFields
  ) {
    const value = normalizeOptional(
      params[field]
    );

    if (
      value !== undefined
    ) {
      payload[field] = value;
    }
  }

  const data = await request(
    env,
    payload
  );

  const order = extractOrder(
    data
  );

  if (!order) {
    throw new BuzzerPanelError(
      "BuzzerPanel tidak mengembalikan ID order.",
      {
        status: 502,
        code: "BUZZERPANEL_ORDER_ID_MISSING",
        details: data
      }
    );
  }

  return order;
}

export async function getOrder(
  env,
  orderId
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
    }
  );

  const order = extractStatus(
    data
  );

  if (!order) {
    throw new BuzzerPanelError(
      "Respons status order BuzzerPanel tidak valid.",
      {
        status: 502,
        code: "BUZZERPANEL_STATUS_INVALID",
        details: data
      }
    );
  }

  return order;
}

export async function requestRefill(
  env,
  orderId
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
    }
  );
}

export async function refillStatus(
  env,
  refillId
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
    }
  );
}

export async function getBalance(
  env
) {
  return request(
    env,
    {
      action: "balance"
    }
  );
}

export function mapStatus(status) {
  const value = clean(
    status,
    128
  )
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) {
    return "UNKNOWN";
  }

  if (
    [
      "PENDING",
      "WAITING",
      "QUEUED",
      "QUEUE",
      "IN QUEUE",
      "AWAITING"
    ].includes(value)
  ) {
    return "PENDING";
  }

  if (
    [
      "PROCESSING",
      "IN PROGRESS",
      "INPROGRESS",
      "RUNNING",
      "STARTED",
      "WORKING"
    ].includes(value)
  ) {
    return "PROCESSING";
  }

  if (
    [
      "COMPLETED",
      "COMPLETE",
      "DONE",
      "SUCCESS",
      "SUCCESSFUL"
    ].includes(value)
  ) {
    return "COMPLETED";
  }

  if (
    [
      "PARTIAL",
      "PARTIALLY COMPLETED",
      "PARTIALLY"
    ].includes(value)
  ) {
    return "PROCESSING";
  }

  if (
    [
      "CANCELED",
      "CANCELLED",
      "CANCEL",
      "STOPPED"
    ].includes(value)
  ) {
    return "CANCELLED";
  }

  if (
    [
      "REFUNDED",
      "REFUND"
    ].includes(value)
  ) {
    return "REFUNDED";
  }

  if (
    [
      "FAILED",
      "FAIL",
      "ERROR",
      "REJECTED",
      "REJECT",
      "FAILURE"
    ].includes(value)
  ) {
    return "FAILED";
  }

  return "UNKNOWN";
}
