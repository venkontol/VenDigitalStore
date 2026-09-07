import {
  createOrder,
  getOrderById,
  getOrderByIdempotencyKey,
  getUserOrder,
  isFinalOrderStatus,
  listAdminOrders,
  listUserOrders,
  updateOrder,
  updateOrderStatus
} from "./orders.js";

import {
  debitBalance,
  refundBalance
} from "./wallet.js";

import {
  requireAdmin,
  requireAuth
} from "./auth.js";

import {
  createOrder as createProviderOrder,
  getOrder as getProviderOrder,
  getServices as getProviderServices,
  mapStatus as mapProviderStatus,
  normalizeService
} from "./buzzerpanel.js";

import {
  cleanString,
  errorResponse,
  generateOrderNumber,
  jsonResponse,
  parseInteger,
  readJson,
  successResponse
} from "./utils.js";

const SOCIAL_TYPE = "SOCIAL";
const SOCIAL_PROVIDER = "BUZZERPANEL";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const RATE_UNIT = "PER_1000";

const FINAL_STATUSES = new Set([
  "COMPLETED",
  "PARTIAL",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

function normalizePlatform(value) {
  return cleanString(
    value,
    64
  ).toUpperCase();
}

function normalizeServiceData(service) {
  const normalized =
    normalizeService(service);

  if (!normalized) {
    return null;
  }

  return {
    id:
      normalized.id ??
      normalized.service_id ??
      null,

    name:
      normalized.name ??
      normalized.service_name ??
      "",

    category:
      normalized.category ??
      null,

    type:
      normalized.type ??
      null,

    rate:
      Number(
        normalized.rate || 0
      ),

    min:
      Number(
        normalized.min || 0
      ),

    max:
      Number(
        normalized.max || 0
      ),

    refill:
      Boolean(
        normalized.refill
      ),

    dripfeed:
      Boolean(
        normalized.dripfeed
      ),

    currency:
      normalized.currency ||
      "IDR",

    raw:
      normalized
  };
}

function serviceMatches(
  service,
  filters
) {
  if (!service) {
    return false;
  }

  if (
    filters.serviceId !==
      undefined &&
    String(service.id) !==
      String(filters.serviceId)
  ) {
    return false;
  }

  if (
    filters.platform
  ) {
    const platform =
      String(
        filters.platform
      ).toLowerCase();

    const name =
      String(
        service.name || ""
      ).toLowerCase();

    const category =
      String(
        service.category || ""
      ).toLowerCase();

    if (
      !name.includes(platform) &&
      !category.includes(platform)
    ) {
      return false;
    }
  }

  if (
    filters.category
  ) {
    if (
      String(
        service.category || ""
      ).toLowerCase() !==
      String(
        filters.category
      ).toLowerCase()
    ) {
      return false;
    }
  }

  return true;
}

function getMarkupPercent(env) {
  const value =
    Number(
      env?.MARKUP_PERCENT ??
      0
    );

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1000
  ) {
    return 0;
  }

  return value;
}

function calculateProviderAmount(
  ratePer1000,
  quantity
) {
  const rate =
    Number(
      ratePer1000 || 0
    );

  const amount =
    Number(
      quantity || 0
    );

  if (
    !Number.isFinite(rate) ||
    !Number.isFinite(amount) ||
    rate < 0 ||
    amount <= 0
  ) {
    return 0;
  }

  return Math.ceil(
    (rate * amount) /
    1000
  );
}

function calculateCustomerAmount(
  providerAmount,
  markupPercent
) {
  const amount =
    Number(
      providerAmount || 0
    );

  const markup =
    Number(
      markupPercent || 0
    );

  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(markup) ||
    amount < 0 ||
    markup < 0
  ) {
    return 0;
  }

  return Math.ceil(
    amount +
    (
      amount *
      markup
    ) /
    100
  );
}

function calculateSellingRate(
  providerRate,
  markupPercent
) {
  const rate =
    Number(
      providerRate || 0
    );

  const markup =
    Number(
      markupPercent || 0
    );

  if (
    !Number.isFinite(rate) ||
    !Number.isFinite(markup) ||
    rate < 0 ||
    markup < 0
  ) {
    return 0;
  }

  return Math.ceil(
    rate *
    (
      1 +
      markup / 100
    )
  );
}

function validateTarget(
  value
) {
  const target =
    cleanString(
      value,
      2048
    );

  if (!target) {
    return null;
  }

  if (
    !/^https?:\/\//i.test(
      target
    )
  ) {
    return null;
  }

  return target;
}

function validateQuantity(
  value,
  service
) {
  const maximum =
    Number(
      service?.max || 0
    ) || 100000000;

  const quantity =
    parseInteger(
      value,
      {
        min: 1,
        max: maximum
      }
    );

  if (!quantity) {
    return null;
  }

  const minimum =
    Number(
      service?.min || 0
    );

  if (
    minimum > 0 &&
    quantity < minimum
  ) {
    return null;
  }

  return quantity;
}

function mapProviderOrder(
  providerOrder
) {
  if (!providerOrder) {
    return null;
  }

  const providerStatus =
    cleanString(
      providerOrder.status,
      128
    );

  const externalOrderId =
    providerOrder.order ??
    providerOrder.id ??
    null;

  let status =
    mapProviderStatus(
      providerStatus
    );

  if (
    (
      !providerStatus ||
      status === "UNKNOWN"
    ) &&
    externalOrderId
  ) {
    status = "PENDING";
  }

  return {
    externalOrderId,

    status,

    providerStatus:
      providerStatus ||
      null,

    providerData:
      providerOrder,

    providerCharge:
      providerOrder.charge !==
      undefined
        ? Number(
            providerOrder.charge ||
            0
          )
        : null,

    startCount:
      providerOrder.start_count !==
      undefined
        ? Number(
            providerOrder.start_count ||
            0
          )
        : null,

    remains:
      providerOrder.remains !==
      undefined
        ? Number(
            providerOrder.remains ||
            0
          )
        : null,

    failureReason:
      providerOrder.error ||
      providerOrder.message ||
      null
  };
}

async function loadSocialOrder(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return {
      response: user
    };
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
      url.searchParams.get(
        "id"
      ),
      {
        min: 1
      }
    );

  if (!orderId) {
    return {
      response:
        errorResponse(
          "ID order tidak valid.",
          400
        )
    };
  }

  const order =
    await getUserOrder(
      env.DB,
      user.id,
      orderId
    );

  if (!order) {
    return {
      response:
        errorResponse(
          "Order tidak ditemukan.",
          404
        )
    };
  }

  if (
    order.type !==
      SOCIAL_TYPE ||
    order.provider !==
      SOCIAL_PROVIDER
  ) {
    return {
      response:
        errorResponse(
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

async function loadActionableSocialOrder(
  request,
  env
) {
  const loaded =
    await loadSocialOrder(
      request,
      env
    );

  if (
    loaded.response
  ) {
    return loaded;
  }

  if (
    FINAL_STATUSES.has(
      loaded.order.status
    ) ||
    isFinalOrderStatus(
      loaded.order.status
    )
  ) {
    return {
      ...loaded,
      response:
        errorResponse(
          "Order sudah berada pada status akhir.",
          409,
          {
            order:
              loaded.order
          }
        )
    };
  }

  return loaded;
}

async function saveProviderState(
  env,
  order,
  providerOrder
) {
  const mapped =
    mapProviderOrder(
      providerOrder
    );

  if (!mapped) {
    return errorResponse(
      "Respons provider tidak valid.",
      502
    );
  }

  const nextStatus =
    mapped.status &&
    mapped.status !==
      "UNKNOWN"
      ? mapped.status
      : (
          mapped.externalOrderId ||
          order.external_order_id
        )
        ? (
            order.status ===
            "CREATING"
              ? "PENDING"
              : order.status
          )
        : "UNKNOWN";

  const updates = {
    externalOrderId:
      mapped.externalOrderId
        ? String(
            mapped.externalOrderId
          )
        : order.external_order_id,

    status:
      nextStatus,

    providerStatus:
      mapped.providerStatus,

    providerData:
      mapped.providerData,

    providerCharge:
      mapped.providerCharge,

    startCount:
      mapped.startCount,

    remains:
      mapped.remains,

    failureReason:
      mapped.failureReason
  };

  const saved =
    await updateOrder(
      env.DB,
      order.id,
      updates
    );

  if (
    saved?.success !== true
  ) {
    return errorResponse(
      saved?.error ||
        "Gagal menyimpan status provider.",
      500
    );
  }

  return successResponse({
    order:
      saved.order
  });
}

async function findService(
  env,
  serviceId
) {
  let services;

  try {
    services =
      await getProviderServices(
        env
      );
  } catch (error) {
    throw error;
  }

  const normalized =
    Array.isArray(
      services
    )
      ? services
          .map(
            normalizeServiceData
          )
          .filter(Boolean)
      : [];

  return normalized.find(
    service =>
      String(
        service.id
      ) ===
      String(
        serviceId
      )
  ) || null;
}

export async function listSosmedServices(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const url =
    new URL(
      request.url
    );

  const serviceId =
    url.searchParams.get(
      "service_id"
    );

  const platform =
    normalizePlatform(
      url.searchParams.get(
        "platform"
      )
    );

  const category =
    cleanString(
      url.searchParams.get(
        "category"
      ),
      128
    );

  let services;

  try {
    services =
      await getProviderServices(
        env
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan Suntik Sosmed.",
      502
    );
  }

  const normalized =
    Array.isArray(
      services
    )
      ? services
          .map(
            normalizeServiceData
          )
          .filter(Boolean)
      : [];

  const filtered =
    normalized.filter(
      service =>
        serviceMatches(
          service,
          {
            serviceId:
              serviceId ||
              undefined,

            platform:
              platform ||
              undefined,

            category:
              category ||
              undefined
          }
        )
    );

  return successResponse({
    services:
      filtered
  });
}

export async function getSosmedService(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const url =
    new URL(
      request.url
    );

  const serviceId =
    url.searchParams.get(
      "service_id"
    );

  if (!serviceId) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  try {
    const service =
      await findService(
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

export async function createSosmedOrder(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const data =
    await readJson(
      request
    );

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
    serviceId ===
      undefined ||
    serviceId ===
      null ||
    String(
      serviceId
    ).trim() === ""
  ) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  const target =
    validateTarget(
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

  const idempotencyKey =
    cleanString(
      request.headers.get(
        "Idempotency-Key"
      ) ||
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

  const existing =
    await getOrderByIdempotencyKey(
      env.DB,
      user.id,
      idempotencyKey
    );

  if (existing) {
    return successResponse({
      order:
        existing,
      created: false,
      idempotent: true
    });
  }

  let service;

  try {
    service =
      await findService(
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

  const quantity =
    validateQuantity(
      data.quantity,
      service
    );

  if (!quantity) {
    return errorResponse(
      "Quantity berada di luar batas layanan.",
      400
    );
  }

  if (
    service.rate <= 0
  ) {
    return errorResponse(
      "Harga layanan tidak valid.",
      400
    );
  }

  const markupPercent =
    getMarkupPercent(
      env
    );

  const providerAmount =
    calculateProviderAmount(
      service.rate,
      quantity
    );

  const customerAmount =
    calculateCustomerAmount(
      providerAmount,
      markupPercent
    );

  const sellingRate =
    calculateSellingRate(
      service.rate,
      markupPercent
    );

  if (
    providerAmount <= 0 ||
    customerAmount <= 0 ||
    sellingRate <= 0
  ) {
    return errorResponse(
      "Total harga tidak valid.",
      400
    );
  }

  const orderNumber =
    generateOrderNumber(
      "SOSMED"
    );

  const created =
    await createOrder(
      env.DB,
      {
        userId:
          user.id,

        orderNumber,

        type:
          SOCIAL_TYPE,

        provider:
          SOCIAL_PROVIDER,

        externalOrderId:
          null,

        serviceId:
          String(
            service.id
          ),

        serviceName:
          service.name,

        target,

        quantity,

        rateUnit:
          RATE_UNIT,

        providerRate:
          service.rate,

        sellingRate,

        providerAmount,

        customerAmount,

        providerCharge:
          null,

        providerCurrency:
          service.currency ||
          "IDR",

        status:
          "CREATING",

        providerStatus:
          null,

        providerData:
          null,

        requestData:
          data,

        idempotencyKey,

        failureReason:
          null
      }
    );

  if (
    created?.success !== true ||
    !created.order
  ) {
    return errorResponse(
      created?.error ||
        "Gagal membuat order.",
      500
    );
  }

  if (
    created.created === false ||
    created.idempotent === true
  ) {
    return successResponse({
      order:
        created.order,
      created: false,
      idempotent: true
    });
  }

  const order =
    created.order;

  let debit;

  try {
    debit =
      await debitBalance(
        env.DB,
        {
          userId:
            user.id,

          amount:
            customerAmount,

          type:
            "PURCHASE",

          reference:
            `ORDER:${order.id}`,

          description:
            `Pembelian Suntik Sosmed ${order.order_number}`,

          orderId:
            order.id
        }
      );
  } catch (error) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "FAILED",

        message:
          error?.message ||
          "Gagal melakukan debit saldo.",

        failureReason:
          error?.message ||
          "Gagal melakukan debit saldo."
      }
    );

    return errorResponse(
      error?.message ||
        "Gagal melakukan debit saldo.",
      500,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  if (
    debit?.success !== true
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "FAILED",

        message:
          debit?.error ||
          "Saldo tidak mencukupi.",

        failureReason:
          debit?.error ||
          "Saldo tidak mencukupi."
      }
    );

    return errorResponse(
      debit?.error ||
        "Saldo tidak mencukupi.",
      400,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  let providerOrder;

  try {
    providerOrder =
      await createProviderOrder(
        env,
        {
          service:
            service.id,

          link:
            target,

          quantity
        }
      );
  } catch (error) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "UNKNOWN",

        message:
          error?.message ||
          "Status order provider belum dapat dipastikan.",

        failureReason:
          error?.message ||
          "Provider request tidak dapat dipastikan."
      }
    );

    return errorResponse(
      "Order sudah dibuat dan saldo terpotong, tetapi status provider belum dapat dipastikan.",
      502,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  if (!providerOrder) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "UNKNOWN",

        message:
          "Provider tidak memberikan respons.",

        failureReason:
          "Provider tidak memberikan respons."
      }
    );

    return errorResponse(
      "Status order provider belum dapat dipastikan.",
      502,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  const saved =
    await saveProviderState(
      env,
      order,
      providerOrder
    );

  if (
    saved?.success !== true
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "UNKNOWN",

        message:
          saved?.error ||
          "Status provider gagal disimpan.",

        failureReason:
          saved?.error ||
          "Status provider gagal disimpan."
      }
    );

    return errorResponse(
      saved?.error ||
        "Status order belum dapat dipastikan.",
      500,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  return successResponse(
    {
      order:
        saved.order,

      charged:
        true,

      pricing: {
        provider_rate:
          service.rate,

        provider_amount:
          providerAmount,

        markup_percent:
          markupPercent,

        customer_amount:
          customerAmount
      }
    },
    201
  );
}

export async function getSosmedOrder(
  request,
  env
) {
  const loaded =
    await loadSocialOrder(
      request,
      env
    );

  if (
    loaded.response
  ) {
    return loaded.response;
  }

  return successResponse({
    order:
      loaded.order
  });
}

export async function syncSosmedOrder(
  request,
  env
) {
  const loaded =
    await loadSocialOrder(
      request,
      env
    );

  if (
    loaded.response
  ) {
    return loaded.response;
  }

  const {
    order
  } = loaded;

  if (
    isFinalOrderStatus(
      order.status
    )
  ) {
    return successResponse({
      order
    });
  }

  if (
    !order.external_order_id
  ) {
    return errorResponse(
      "Order provider belum tersedia.",
      409
    );
  }

  let providerOrder;

  try {
    providerOrder =
      await getProviderOrder(
        env,
        order.external_order_id
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil status provider.",
      502
    );
  }

  const saved =
    await saveProviderState(
      env,
      order,
      providerOrder
    );

  if (
    saved?.success !== true
  ) {
    return saved;
  }

  return successResponse({
    order:
      saved.order
  });
}

export async function listMySosmedOrders(
  request,
  env
) {
  const user =
    await requireAuth(
      request,
      env
    );

  if (
    user instanceof Response
  ) {
    return user;
  }

  const url =
    new URL(
      request.url
    );

  return jsonResponse(
    await listUserOrders(
      env.DB,
      user.id,
      {
        url,

        defaultLimit:
          DEFAULT_LIMIT,

        maxLimit:
          MAX_LIMIT,

        type:
          SOCIAL_TYPE
      }
    )
  );
}

export async function cancelSosmedOrder(
  request,
  env
) {
  const loaded =
    await loadActionableSocialOrder(
      request,
      env
    );

  if (
    loaded.response
  ) {
    return loaded.response;
  }

  const {
    order
  } = loaded;

  if (
    order.external_order_id
  ) {
    return errorResponse(
      "Pembatalan order Suntik Sosmed harus dilakukan melalui provider.",
      409
    );
  }

  let refund;

  try {
    refund =
      await refundBalance(
        env.DB,
        {
          userId:
            order.user_id,

          amount:
            order.customer_amount,

          reference:
            `REFUND:ORDER:${order.id}`,

          description:
            `Refund Suntik Sosmed ${order.order_number}`,

          orderId:
            order.id
        }
      );
  } catch (error) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "CANCELLED",

        message:
          "Order dibatalkan tetapi refund belum berhasil diproses.",

        failureReason:
          error?.message ||
          "Refund gagal."
      }
    );

    return errorResponse(
      error?.message ||
        "Order dibatalkan tetapi refund gagal.",
      500,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  if (
    refund?.success !== true
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status:
          "CANCELLED",

        message:
          "Order dibatalkan tetapi refund belum berhasil diproses.",

        failureReason:
          "Refund gagal."
      }
    );

    return errorResponse(
      "Order dibatalkan tetapi refund belum berhasil diproses.",
      500,
      {
        order:
          await getOrderById(
            env.DB,
            order.id
          )
      }
    );
  }

  await updateOrderStatus(
    env.DB,
    order.id,
    {
      status:
        "REFUNDED",

      message:
        "Order dibatalkan dan saldo berhasil dikembalikan.",

      failureReason:
        null
    }
  );

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      ),

    refunded:
      true,

    refund_pending:
      false
  });
}

export async function adminListSosmedOrders(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  const url =
    new URL(
      request.url
    );

  return jsonResponse(
    await listAdminOrders(
      env.DB,
      {
        url,

        defaultLimit:
          DEFAULT_LIMIT,

        maxLimit:
          MAX_LIMIT,

        type:
          SOCIAL_TYPE,

        provider:
          SOCIAL_PROVIDER,

        userId:
          url.searchParams.get(
            "user_id"
          ),

        status:
          url.searchParams.get(
            "status"
          )
      }
    )
  );
}

export async function adminGetSosmedOrder(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
      url.searchParams.get(
        "id"
      ),
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

  const order =
    await getOrderById(
      env.DB,
      orderId
    );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    order.type !==
      SOCIAL_TYPE ||
    order.provider !==
      SOCIAL_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order Suntik Sosmed.",
      400
    );
  }

  return successResponse({
    order
  });
}

export async function adminSyncSosmedOrder(
  request,
  env
) {
  const admin =
    await requireAdmin(
      request,
      env
    );

  if (
    admin instanceof Response
  ) {
    return admin;
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
      url.searchParams.get(
        "id"
      ),
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

  const order =
    await getOrderById(
      env.DB,
      orderId
    );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  if (
    order.type !==
      SOCIAL_TYPE ||
    order.provider !==
      SOCIAL_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order Suntik Sosmed.",
      400
    );
  }

  if (
    !order.external_order_id
  ) {
    return errorResponse(
      "Order provider belum tersedia.",
      409
    );
  }

  let providerOrder;

  try {
    providerOrder =
      await getProviderOrder(
        env,
        order.external_order_id
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil status provider.",
      502
    );
  }

  const saved =
    await saveProviderState(
      env,
      order,
      providerOrder
    );

  if (
    saved?.success !== true
  ) {
    return saved;
  }

  return successResponse({
    order:
      saved.order
  });
}

/*
 * Router aliases.
 *
 * router.js menggunakan nama
 * listSocialServices,
 * createSocialOrder,
 * getSocialOrder,
 * syncSocialOrder,
 * listSocialOrders,
 * cancelSocialOrder.
 *
 * Alias ini menjaga kompatibilitas
 * dengan nama fungsi internal di atas.
 */

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
