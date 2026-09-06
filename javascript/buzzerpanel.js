const BASE_URL = "https://buzzerpanel.id/api/v2";

const DEFAULT_TIMEOUT = 15000;

class BuzzerPanelError extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name = "BuzzerPanelError";
    this.status = details.status || 502;
    this.code = details.code || null;
    this.providerData =
      details.providerData || null;
  }
}

function getApiKey(env) {
  const key =
    String(
      env?.BUZZERPANEL_API_KEY || ""
    ).trim();

  if (!key) {
    throw new BuzzerPanelError(
      "BuzzerPanel API key belum dikonfigurasi.",
      {
        status: 500,
        code: "BUZZERPANEL_API_KEY_MISSING"
      }
    );
  }

  return key;
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

function buildForm(data = {}) {
  const form =
    new URLSearchParams();

  for (
    const [key, value]
    of Object.entries(data)
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    form.set(
      key,
      String(value)
    );
  }

  return form;
}

async function request(
  env,
  payload,
  options = {}
) {
  const apiKey =
    getApiKey(env);

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      options.timeout ||
        DEFAULT_TIMEOUT
    );

  try {
    const form =
      buildForm({
        key: apiKey,
        ...payload
      });

    const response =
      await fetch(
        BASE_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            "Accept":
              "application/json"
          },
          body:
            form.toString(),
          signal:
            controller.signal
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      const text =
        await response.text();

      data = {
        raw: text
      };
    }

    if (!response.ok) {
      throw new BuzzerPanelError(
        data?.error ||
          data?.message ||
          `BuzzerPanel API gagal (${response.status}).`,
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

    if (
      data &&
      typeof data === "object" &&
      (
        data.error ||
        data.success === false
      )
    ) {
      throw new BuzzerPanelError(
        String(
          data.error ||
            data.message ||
            "BuzzerPanel API menolak permintaan."
        ),
        {
          status: 502,
          code:
            data.code ||
            data.error_code ||
            "PROVIDER_ERROR",
          providerData:
            data
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
        "BuzzerPanel API timeout.",
        {
          status: 504,
          code:
            "BUZZERPANEL_TIMEOUT"
        }
      );
    }

    throw new BuzzerPanelError(
      "Tidak dapat terhubung ke BuzzerPanel API.",
      {
        status: 502,
        code:
          "BUZZERPANEL_NETWORK_ERROR"
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function getServices(
  env
) {
  const response =
    await request(
      env,
      {
        action: "services"
      }
    );

  const data =
    normalizeData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(data?.services)
  ) {
    return data.services;
  }

  return [];
}

export async function getService(
  env,
  serviceId
) {
  if (!serviceId) {
    throw new BuzzerPanelError(
      "Service ID BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "SERVICE_ID_REQUIRED"
      }
    );
  }

  const services =
    await getServices(env);

  return (
    services.find(
      service =>
        String(
          service.service ??
            service.id
        ) ===
        String(serviceId)
    ) || null
  );
}

export async function getBalance(
  env
) {
  const response =
    await request(
      env,
      {
        action: "balance"
      }
    );

  const data =
    normalizeData(response);

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
    serviceId,
    link,
    quantity
  } = {}
) {
  if (!serviceId) {
    throw new BuzzerPanelError(
      "Service ID BuzzerPanel wajib diisi.",
      {
        status: 400,
        code:
          "SERVICE_ID_REQUIRED"
      }
    );
  }

  const target =
    String(
      link || ""
    ).trim();

  if (!target) {
    throw new BuzzerPanelError(
      "Link target wajib diisi.",
      {
        status: 400,
        code:
          "TARGET_REQUIRED"
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
    throw new BuzzerPanelError(
      "Quantity BuzzerPanel tidak valid.",
      {
        status: 400,
        code:
          "INVALID_QUANTITY"
      }
    );
  }

  const response =
    await request(
      env,
      {
        action: "add",
        service:
          String(serviceId),
        link: target,
        quantity:
          parsedQuantity
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
  if (!orderId) {
    throw new BuzzerPanelError(
      "Order ID BuzzerPanel wajib diisi.",
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
      {
        action: "status",
        order:
          String(orderId)
      }
    );

  return normalizeData(
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
    case "PENDING":
      return "PENDING";

    case "PROCESSING":
    case "IN PROGRESS":
    case "IN_PROGRESS":
      return "PROCESSING";

    case "COMPLETED":
    case "COMPLETE":
      return "COMPLETED";

    case "PARTIAL":
      return "PARTIAL";

    case "CANCELED":
    case "CANCELLED":
      return "CANCELLED";

    case "EXPIRED":
      return "EXPIRED";

    case "REFUNDED":
      return "REFUNDED";

    case "FAIL":
    case "FAILED":
      return "FAILED";

    default:
      return "UNKNOWN";
  }
}

export function normalizeService(
  service
) {
  if (!service) {
    return null;
  }

  const serviceId =
    service.service ??
    service.id ??
    null;

  const rate =
    Number(
      service.rate ??
        service.price ??
        0
    );

  const min =
    Number(
      service.min ??
        service.minimum ??
        1
    );

  const max =
    Number(
      service.max ??
        service.maximum ??
        min
    );

  return {
    id:
      serviceId !== null
        ? String(serviceId)
        : null,

    name:
      String(
        service.name ||
          service.service_name ||
          ""
      ),

    category:
      String(
        service.category || ""
      ),

    type:
      String(
        service.type || ""
      ),

    rate_per_1000:
      Number.isFinite(rate)
        ? rate
        : 0,

    min:
      Number.isInteger(min)
        ? min
        : 1,

    max:
      Number.isInteger(max)
        ? max
        : 1,

    refill:
      Boolean(
        service.refill
      ),

    dripfeed:
      Boolean(
        service.dripfeed
      ),

    raw:
      service
  };
}

export function normalizeOrder(
  data
) {
  if (!data) {
    return null;
  }

  const charge =
    Number(
      data.charge ??
        data.amount ??
        0
    );

  const startCount =
    Number(
      data.start_count ??
        data.start ??
        0
    );

  const remains =
    Number(
      data.remains ??
        data.remaining ??
        0
    );

  return {
    id:
      data.order ??
      data.order_id ??
      data.id ??
      null,

    status:
      mapStatus(
        data.status
      ),

    provider_status:
      data.status ??
      null,

    charge:
      Number.isFinite(charge)
        ? charge
        : 0,

    start_count:
      Number.isFinite(
        startCount
      )
        ? startCount
        : null,

    remains:
      Number.isFinite(
        remains
      )
        ? remains
        : null,

    currency:
      String(
        data.currency ||
          "IDR"
      ).toUpperCase(),

    raw:
      data
  };
}

export {
  BuzzerPanelError
};
