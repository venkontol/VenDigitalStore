const DEFAULT_BASE_URL = "https://buzzerpanel.id/api/json.php";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CACHE_TTL = 60;
const DEFAULT_MAX_SERVICES = 300;

const servicesCache = new Map();

export class BuzzerPanelError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "BuzzerPanelError";
    this.status = Number(options.status || 502);
    this.code = options.code || "BUZZERPANEL_ERROR";
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

  return value;
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

function getTimeout(env) {
  const value = Number(
    env?.BUZZER_API_TIMEOUT ||
      DEFAULT_TIMEOUT_MS
  );

  if (
    Number.isFinite(value) &&
    value >= 1000 &&
    value <= 120000
  ) {
    return Math.floor(value);
  }

  return DEFAULT_TIMEOUT_MS;
}

function getCacheTtl(env) {
  const value = Number(
    env?.CACHE_TTL ||
      DEFAULT_CACHE_TTL
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
    env?.MAX_SERVICES ||
      DEFAULT_MAX_SERVICES
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

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function extractApiMessage(data) {
  if (!data) {
    return "BuzzerPanel tidak memberikan respons.";
  }

  if (typeof data === "string") {
    return clean(data, 1000);
  }

  return clean(
    data.error ||
      data.message ||
      data.msg ||
      data.data?.error ||
      data.data?.message ||
      "",
    1000
  );
}

function isProviderError(data) {
  if (!isObject(data)) {
    return false;
  }

  if (data.error) {
    return true;
  }

  if (data.success === false) {
    return true;
  }

  if (data.status === false) {
    return true;
  }

  if (
    String(data.status || "")
      .toLowerCase() === "error"
  ) {
    return true;
  }

  if (
    String(data.data?.status || "")
      .toLowerCase() === "error"
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

async function request(
  env,
  payload,
  options = {}
) {
  const {
    apiKey,
    secretKey
  } = getCredentials(env);

  const timeoutMs =
    options.timeoutMs ||
    getTimeout(env);

  const controller =
    new AbortController();

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
    const response =
      await fetch(
        getBaseUrl(env),
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            Accept:
              "application/json"
          },
          body:
            form.toString(),
          signal:
            controller.signal
        }
      );

    const data =
      await parseResponse(
        response
      );

    if (!response.ok) {
      throw new BuzzerPanelError(
        extractApiMessage(data) ||
          `BuzzerPanel HTTP ${response.status}.`,
        {
          status: 502,
          code:
            "BUZZERPANEL_HTTP_ERROR",
          details: {
            httpStatus:
              response.status,
            response: data
          }
        }
      );
    }

    if (isProviderError(data)) {
      throw new BuzzerPanelError(
        extractApiMessage(data) ||
          "BuzzerPanel menolak request.",
        {
          status: 502,
          code:
            "BUZZERPANEL_API_ERROR",
          details: data
        }
      );
    }

    return data;
  } catch (error) {
    if (
      error instanceof
      BuzzerPanelError
    ) {
      throw error;
    }

    if (
      error?.name ===
      "AbortError"
    ) {
      throw new BuzzerPanelError(
        "Request ke BuzzerPanel timeout.",
        {
          status: 504,
          code:
            "BUZZERPANEL_TIMEOUT"
        }
      );
    }

    throw new BuzzerPanelError(
      error?.message ||
        "Gagal terhubung ke BuzzerPanel.",
      {
        status: 502,
        code:
          "BUZZERPANEL_NETWORK_ERROR"
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

export function normalizeService(
  service
) {
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
    id === ""
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
    id: String(id),

    service_id:
      String(id),

    name:
      clean(
        service.name ??
          service.service_name ??
          "",
        512
      ),

    category:
      clean(
        service.category ??
          "",
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
      Boolean(
        service.refill === true ||
        service.refill === 1 ||
        String(
          service.refill
        ).toLowerCase() ===
          "true" ||
        String(
          service.refill
        ).toLowerCase() ===
          "yes"
      ),

    dripfeed:
      Boolean(
        service.dripfeed === true ||
        service.dripfeed === 1 ||
        String(
          service.dripfeed
        ).toLowerCase() ===
          "true" ||
        String(
          service.dripfeed
        ).toLowerCase() ===
          "yes"
      ),

    currency:
      clean(
        service.currency ??
          "IDR",
        16
      ) || "IDR",

    raw: service
  };
}

export async function getServices(
  env,
  options = {}
) {
  const cacheKey =
    getBaseUrl(env);

  const ttl =
    getCacheTtl(env) *
    1000;

  const now =
    Date.now();

  const cached =
    servicesCache.get(
      cacheKey
    );

  if (
    !options.forceRefresh &&
    cached &&
    ttl > 0 &&
    now - cached.timestamp <
      ttl
  ) {
    return cached.services;
  }

  const data =
    await request(
      env,
      {
        action:
          options.action ||
          "services"
      }
    );

  const services =
    extractServices(data)
      .map(
        normalizeService
      )
      .filter(Boolean)
      .slice(
        0,
        getMaxServices(env)
      );

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

  const nested =
    unwrapData(data);

  if (isObject(nested)) {
    const id =
      nested.id ??
      nested.order ??
      nested.order_id ??
      null;

    if (
      id !== null &&
      id !== ""
    ) {
      return {
        ...nested,
        id: String(id),
        order: String(
          nested.order ?? id
        ),
        raw: data
      };
    }
  }

  const id =
    data.order ??
    data.id ??
    data.order_id ??
    null;

  if (
    id !== null &&
    id !== ""
  ) {
    return {
      ...data,
      id: String(id),
      order: String(
        data.order ?? id
      ),
      raw: data
    };
  }

  return null;
}

function extractStatus(data) {
  if (!isObject(data)) {
    return null;
  }

  const nested =
    unwrapData(data);

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
        status:
          clean(
            status,
            128
          ),
        raw: data
      };
    }
  }

  if (
    data.status !== undefined &&
    data.status !== null
  ) {
    return {
      ...data,
      status:
        clean(
          data.status,
          128
        ),
      raw: data
    };
  }

  return null;
}

export async function createOrder(
  env,
  params = {}
) {
  const service =
    params.service ??
    params.serviceId ??
    params.service_id;

  const link =
    params.link ??
    params.data ??
    params.target;

  const quantity =
    params.quantity;

  if (
    service === undefined ||
    service === null ||
    String(service).trim() === ""
  ) {
    throw new BuzzerPanelError(
      "Service BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_SERVICE_MISSING"
      }
    );
  }

  if (
    !link ||
    !String(link).trim()
  ) {
    throw new BuzzerPanelError(
      "Target BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_TARGET_MISSING"
      }
    );
  }

  if (
    quantity === undefined ||
    quantity === null ||
    String(quantity).trim() === ""
  ) {
    throw new BuzzerPanelError(
      "Quantity BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_QUANTITY_MISSING"
      }
    );
  }

  const payload = {
    action: "order",
    service:
      String(service),
    data:
      String(link),
    quantity:
      String(quantity)
  };

  if (
    params.komen !== undefined
  ) {
    payload.komen =
      params.komen;
  }

  if (
    params.comments !== undefined
  ) {
    payload.comments =
      params.comments;
  }

  if (
    params.usernames !== undefined
  ) {
    payload.usernames =
      params.usernames;
  }

  if (
    params.runs !== undefined
  ) {
    payload.runs =
      params.runs;
  }

  if (
    params.interval !== undefined
  ) {
    payload.interval =
      params.interval;
  }

  const data =
    await request(
      env,
      payload
    );

  const order =
    extractOrder(data);

  if (!order) {
    throw new BuzzerPanelError(
      "BuzzerPanel tidak mengembalikan ID order.",
      {
        status: 502,
        code:
          "BUZZERPANEL_ORDER_ID_MISSING",
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
  if (
    orderId === undefined ||
    orderId === null ||
    String(orderId).trim() === ""
  ) {
    throw new BuzzerPanelError(
      "ID order BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_ORDER_ID_MISSING"
      }
    );
  }

  const data =
    await request(
      env,
      {
        action: "status",
        id:
          String(orderId)
      }
    );

  const order =
    extractStatus(data);

  if (!order) {
    throw new BuzzerPanelError(
      "Respons status order BuzzerPanel tidak valid.",
      {
        status: 502,
        code:
          "BUZZERPANEL_STATUS_INVALID",
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
  if (
    orderId === undefined ||
    orderId === null ||
    String(orderId).trim() === ""
  ) {
    throw new BuzzerPanelError(
      "ID order BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_ORDER_ID_MISSING"
      }
    );
  }

  return request(
    env,
    {
      action: "refill",
      id:
        String(orderId)
    }
  );
}

export async function refillStatus(
  env,
  refillId
) {
  if (
    refillId === undefined ||
    refillId === null ||
    String(refillId).trim() === ""
  ) {
    throw new BuzzerPanelError(
      "ID refill BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "BUZZERPANEL_REFILL_ID_MISSING"
      }
    );
  }

  return request(
    env,
    {
      action:
        "status_refill",
      id:
        String(refillId)
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

export function mapStatus(
  status
) {
  const value =
    clean(
      status,
      128
    )
      .toUpperCase()
      .replace(
        /[_-]+/g,
        " "
      )
      .trim();

  if (!value) {
    return "UNKNOWN";
  }

  if (
    [
      "PENDING",
      "WAITING",
      "QUEUED",
      "QUEUE"
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
      "STARTED"
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
      "PARTIALLY COMPLETED"
    ].includes(value)
  ) {
    return "PARTIAL";
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
      "REJECT"
    ].includes(value)
  ) {
    return "FAILED";
  }

  return "UNKNOWN";
}
