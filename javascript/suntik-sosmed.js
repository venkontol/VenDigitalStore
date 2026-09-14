import {
  createOrder as createCoreOrder,
  getOrderById,
  getUserOrder,
  syncOrder,
  cancelOrder as cancelCoreOrder,
  listOrdersByUser,
  adminGetOrders,
  formatOrder
} from "./order-core.js";

import {
  requireAdmin,
  requireAuth
} from "./auth.js";

import {
  getServices as getProviderServices,
  normalizeService
} from "./buzzerpanel.js";

import {
  cleanString,
  errorResponse,
  parseInteger,
  readJson,
  successResponse
} from "./utils.js";

const SOCIAL_TYPE = "SOCIAL";
const SOCIAL_PROVIDER = "BUZZERPANEL";
const RATE_UNIT = "PER_1000";

function normalizePlatform(value) {
  return cleanString(value, 64).toUpperCase();
}

function normalizeServiceData(service) {
  const normalized = normalizeService(service);

  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id ?? normalized.service_id ?? null,
    name: normalized.name ?? normalized.service_name ?? "",
    category: normalized.category ?? null,
    type: normalized.type ?? null,
    rate: Number(normalized.rate || 0),
    min: Number(normalized.min || 0),
    max: Number(normalized.max || 0),
    refill: Boolean(normalized.refill),
    dripfeed: Boolean(normalized.dripfeed),
    currency: normalized.currency || "IDR",
    raw: normalized
  };
}

function serviceMatches(service, filters) {
  if (!service) {
    return false;
  }

  if (
    filters.serviceId !== undefined &&
    String(service.id) !== String(filters.serviceId)
  ) {
    return false;
  }

  if (filters.platform) {
    const platform = String(filters.platform).toLowerCase();
    const name = String(service.name || "").toLowerCase();
    const category = String(service.category || "").toLowerCase();

    if (
      !name.includes(platform) &&
      !category.includes(platform)
    ) {
      return false;
    }
  }

  if (filters.category) {
    if (
      String(service.category || "").toLowerCase() !==
      String(filters.category).toLowerCase()
    ) {
      return false;
    }
  }

  return true;
}

function validateTarget(value) {
  const target = cleanString(value, 2048);

  if (!target) {
    return null;
  }

  if (!/^https?:\/\//i.test(target)) {
    return null;
  }

  return target;
}

function validateQuantity(value, service) {
  const maximum =
    Number(service?.max || 0) || 100000000;

  const quantity = parseInteger(value, {
    min: 1,
    max: maximum
  });

  if (!quantity) {
    return null;
  }

  const minimum = Number(service?.min || 0);

  if (minimum > 0 && quantity < minimum) {
    return null;
  }

  return quantity;
}

async function findService(env, serviceId) {
  const services = await getProviderServices(env);

  const normalized = Array.isArray(services)
    ? services.map(normalizeServiceData).filter(Boolean)
    : [];

  return (
    normalized.find(
      service => String(service.id) === String(serviceId)
    ) || null
  );
}

function buildOrderRequest({
  service,
  target,
  quantity,
  idempotencyKey
}) {
  return {
    type: SOCIAL_TYPE,
    provider: SOCIAL_PROVIDER,
    serviceId: String(service.id),
    serviceName: service.name,
    target,
    quantity,
    rateUnit: RATE_UNIT,
    providerRate: service.rate,
    providerCurrency: service.currency || "IDR",
    requestData: {
      service_id: String(service.id),
      link: target,
      quantity
    },
    idempotencyKey
  };
}

async function loadSocialOrder(request, env) {
  const user = await requireAuth(request, env);

  if (user instanceof Response) {
    return {
      response: user
    };
  }

  const url = new URL(request.url);

  const orderId = parseInteger(
    url.searchParams.get("id"),
    {
      min: 1
    }
  );

  if (!orderId) {
    return {
      response: errorResponse(
        "ID order tidak valid.",
        400
      )
    };
  }

  const order = await getUserOrder(
    env,
    user.id,
    {
      id: orderId
    }
  );

  if (!order) {
    return {
      response: errorResponse(
        "Order tidak ditemukan.",
        404
      )
    };
  }

  if (
    order.type !== SOCIAL_TYPE ||
    order.provider !== SOCIAL_PROVIDER
  ) {
    return {
      response: errorResponse(
        "Order bukan order Suntik Sosmed.",
        400
      )
    };
  }

  return {
    user,
    order
  };
}

function getOrderOutput(order) {
  return formatOrder
    ? formatOrder(order)
    : order;
}

export async function listSosmedServices(request, env) {
  const user = await requireAuth(request, env);

  if (user instanceof Response) {
    return user;
  }

  const url = new URL(request.url);

  const serviceId =
    url.searchParams.get("service_id");

  const platform = normalizePlatform(
    url.searchParams.get("platform")
  );

  const category = cleanString(
    url.searchParams.get("category"),
    128
  );

  let services;

  try {
    services = await getProviderServices(env);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan Suntik Sosmed.",
      502
    );
  }

  const normalized = Array.isArray(services)
    ? services.map(normalizeServiceData).filter(Boolean)
    : [];

  const filtered = normalized.filter(
    service =>
      serviceMatches(service, {
        serviceId: serviceId || undefined,
        platform: platform || undefined,
        category: category || undefined
      })
  );

  return successResponse({
    services: filtered
  });
}

export async function getSosmedService(request, env) {
  const user = await requireAuth(request, env);

  if (user instanceof Response) {
    return user;
  }

  const url = new URL(request.url);

  const serviceId =
    url.searchParams.get("service_id");

  if (!serviceId) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  try {
    const service = await findService(
      env,
      serviceId
    );

    if (!service) {
      return errorResponse(
        "Layanan tidak ditemukan.",
        404
      );
    }

    return successResponse({
      service
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan.",
      502
    );
  }
}

export async function createSosmedOrder(request, env) {
  const user = await requireAuth(request, env);

  if (user instanceof Response) {
    return user;
  }

  const data = await readJson(request);

  if (!data) {
    return errorResponse(
      "Data order tidak valid.",
      400
    );
  }

  const serviceId =
    data.serviceId ??
    data.service_id;

  if (
    serviceId === undefined ||
    serviceId === null ||
    String(serviceId).trim() === ""
  ) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  const target = validateTarget(
    data.link ??
    data.target ??
    data.url
  );

  if (!target) {
    return errorResponse(
      "Link target tidak valid.",
      400
    );
  }

  const idempotencyKey = cleanString(
    request.headers.get("Idempotency-Key") ||
      data.idempotencyKey ||
      data.idempotency_key ||
      "",
    128
  );

  if (!idempotencyKey) {
    return errorResponse(
      "Idempotency-Key wajib diisi.",
      400
    );
  }

  let service;

  try {
    service = await findService(
      env,
      serviceId
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan.",
      502
    );
  }

  if (!service) {
    return errorResponse(
      "Layanan tidak ditemukan.",
      404
    );
  }

  const quantity = validateQuantity(
    data.quantity,
    service
  );

  if (!quantity) {
    return errorResponse(
      "Quantity berada di luar batas layanan.",
      400
    );
  }

  if (service.rate <= 0) {
    return errorResponse(
      "Harga layanan tidak valid.",
      400
    );
  }

  const orderRequest = buildOrderRequest({
    service,
    target,
    quantity,
    idempotencyKey
  });

  try {
    const result = await createCoreOrder(
      env,
      {
        userId: user.id,
        ...orderRequest
      }
    );

    return successResponse(
      {
        order: getOrderOutput(
          result?.order || result
        ),
        created:
          result?.created !== false,
        idempotent:
          Boolean(result?.idempotent),
        charged:
          result?.charged !== false,
        refunded:
          Boolean(result?.refunded),
        pricing:
          result?.pricing || undefined
      },
      result?.created === false ? 200 : 201
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membuat order Suntik Sosmed.",
      error?.status ||
        500,
      error?.details
        ? {
            details: error.details
          }
        : undefined
    );
  }
}

export async function getSosmedOrder(request, env) {
  const loaded = await loadSocialOrder(
    request,
    env
  );

  if (loaded.response) {
    return loaded.response;
  }

  return successResponse({
    order: getOrderOutput(
      loaded.order
    )
  });
}

export async function syncSosmedOrder(request, env) {
  const loaded = await loadSocialOrder(
    request,
    env
  );

  if (loaded.response) {
    return loaded.response;
  }

  const order = loaded.order;

  if (!order.external_order_id) {
    return errorResponse(
      "Order provider belum tersedia.",
      409
    );
  }

  try {
    const result = await syncOrder(
      env,
      {
        orderId: order.id,
        userId: loaded.user.id
      }
    );

    return successResponse({
      order: getOrderOutput(
        result?.order || result
      ),
      refunded:
        Boolean(result?.refunded)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal melakukan sinkronisasi order.",
      error?.status ||
        502
    );
  }
}

export async function listMySosmedOrders(request, env) {
  const user = await requireAuth(
    request,
    env
  );

  if (user instanceof Response) {
    return user;
  }

  const url = new URL(request.url);

  const limit = parseInteger(
    url.searchParams.get("limit"),
    {
      min: 1,
      max: 100
    }
  ) || 20;

  const page = parseInteger(
    url.searchParams.get("page"),
    {
      min: 1
    }
  ) || 1;

  const status =
    cleanString(
      url.searchParams.get("status"),
      64
    ) || undefined;

  const result = await listOrdersByUser(
    env,
    {
      userId: user.id,
      type: SOCIAL_TYPE,
      provider: SOCIAL_PROVIDER,
      status,
      limit,
      page
    }
  );

  return successResponse({
    orders:
      Array.isArray(result?.orders)
        ? result.orders.map(getOrderOutput)
        : [],
    total:
      result?.total ?? 0,
    page,
    limit
  });
}

export async function cancelSosmedOrder(request, env) {
  const loaded = await loadSocialOrder(
    request,
    env
  );

  if (loaded.response) {
    return loaded.response;
  }

  const order = loaded.order;

  try {
    const result = await cancelCoreOrder(
      env,
      {
        orderId: order.id,
        userId: loaded.user.id,
        reason: "Dibatalkan oleh pengguna."
      }
    );

    return successResponse({
      order: getOrderOutput(
        result?.order || result
      ),
      cancelled: true,
      refunded:
        Boolean(result?.refunded),
      refundPending:
        Boolean(result?.refundPending)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Order tidak dapat dibatalkan.",
      error?.status ||
        409,
      error?.details
        ? {
            details: error.details
          }
        : undefined
    );
  }
}

export async function adminListSosmedOrders(
  request,
  env
) {
  const admin = await requireAdmin(
    request,
    env
  );

  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(request.url);

  const limit = parseInteger(
    url.searchParams.get("limit"),
    {
      min: 1,
      max: 100
    }
  ) || 20;

  const page = parseInteger(
    url.searchParams.get("page"),
    {
      min: 1
    }
  ) || 1;

  const status =
    cleanString(
      url.searchParams.get("status"),
      64
    ) || undefined;

  const result = await adminGetOrders(
    env,
    {
      type: SOCIAL_TYPE,
      provider: SOCIAL_PROVIDER,
      status,
      limit,
      page
    }
  );

  return successResponse({
    orders:
      Array.isArray(result?.orders)
        ? result.orders.map(getOrderOutput)
        : [],
    total:
      result?.total ?? 0,
    page,
    limit
  });
}

export async function adminGetSosmedOrder(
  request,
  env
) {
  const admin = await requireAdmin(
    request,
    env
  );

  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(request.url);

  const orderId = parseInteger(
    url.searchParams.get("id"),
    {
      min: 1
    }
  );

  if (!orderId) {
    return errorResponse(
      "ID order tidak valid.",
      400
    );
  }

  const order = await getOrderById(
    env,
    orderId
  );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    order.type !== SOCIAL_TYPE ||
    order.provider !== SOCIAL_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order Suntik Sosmed.",
      400
    );
  }

  return successResponse({
    order: getOrderOutput(order)
  });
}

export async function adminSyncSosmedOrder(
  request,
  env
) {
  const admin = await requireAdmin(
    request,
    env
  );

  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(request.url);

  const orderId = parseInteger(
    url.searchParams.get("id"),
    {
      min: 1
    }
  );

  if (!orderId) {
    return errorResponse(
      "ID order tidak valid.",
      400
    );
  }

  const order = await getOrderById(
    env,
    orderId
  );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    order.type !== SOCIAL_TYPE ||
    order.provider !== SOCIAL_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order Suntik Sosmed.",
      400
    );
  }

  if (!order.external_order_id) {
    return errorResponse(
      "Order provider belum tersedia.",
      409
    );
  }

  try {
    const result = await syncOrder(
      env,
      {
        orderId: order.id,
        admin: true
      }
    );

    return successResponse({
      order: getOrderOutput(
        result?.order || result
      ),
      refunded:
        Boolean(result?.refunded)
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal melakukan sinkronisasi order.",
      error?.status ||
        502
    );
  }
}

export const listSocialServices =
  listSosmedServices;

export const createSocialOrder =
  createSosmedOrder;

export const getSocialOrder =
  getSosmedOrder;

export const syncSocialOrder =
  syncSosmedOrder;

export const listSocialOrders =
  listMySosmedOrders;

export const cancelSocialOrder =
  cancelSosmedOrder;

export default {
  listSosmedServices,
  getSosmedService,
  createSosmedOrder,
  getSosmedOrder,
  syncSosmedOrder,
  listMySosmedOrders,
  cancelSosmedOrder,
  adminListSosmedOrders,
  adminGetSosmedOrder,
  adminSyncSosmedOrder,
  listSocialServices,
  createSocialOrder,
  getSocialOrder,
  syncSocialOrder,
  listSocialOrders,
  cancelSocialOrder
};
