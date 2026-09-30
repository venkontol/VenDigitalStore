import {
  requireAuth
} from "./auth.js";

import {
  getServices as getProviderServices,
  createOrder as createProviderOrder,
  getOrderStatus as getProviderOrderStatus,
  requestRefill as requestProviderRefill,
  getRefillStatus as getProviderRefillStatus,
  mapStatus as mapProviderStatus
} from "./buzzerpanel.js";

import {
  debitBalance,
  refundBalance
} from "./wallet.js";

import {
  cleanString,
  errorResponse,
  formatRupiah,
  nowUnix,
  parseInteger,
  readJson,
  successResponse
} from "./utils.js";

const ORDER_TYPE = "SOCIAL";
const PROVIDER = "BUZZERPANEL";
const RATE_UNIT = "PER_1000";
const DEFAULT_MARKUP_PERCENT = 20;
const DEFAULT_SERVICE_CACHE_TTL = 120;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const MAX_TARGET_LENGTH = 4096;
const MAX_IDEMPOTENCY_LENGTH = 128;
const MAX_SERVICE_LIMIT = 1000;
const FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "FAILED",
  "REFUNDED"
]);

function dbRequired(env) {
  if (!env?.DB) {
    throw new Error("Database tidak tersedia.");
  }

  return env.DB;
}

function normalizeId(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  return text;
}

function normalizeTarget(value) {
  const target = cleanString(
    value,
    MAX_TARGET_LENGTH
  );

  if (!target) {
    return null;
  }

  if (!/^https?:\/\//i.test(target)) {
    return null;
  }

  return target;
}

function normalizePlatform(value) {
  const text = cleanString(
    value,
    64
  ).toLowerCase();

  if (!text) {
    return null;
  }

  return text;
}

function normalizeCategory(value) {
  return cleanString(
    value,
    256
  ) || null;
}

function normalizeQuantity(value, service) {
  const maximum =
    Number(service?.max_quantity ?? service?.max ?? 0) ||
    100000000;

  const minimum =
    Number(service?.min_quantity ?? service?.min ?? 1) || 1;

  const quantity = parseInteger(
    value,
    {
      min: minimum,
      max: maximum
    }
  );

  return quantity || null;
}

function getMarkupPercent(env) {
  const value = Number(
    env?.MARKUP_PERCENT ??
      env?.SOSMED_MARKUP_PERCENT ??
      DEFAULT_MARKUP_PERCENT
  );

  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_MARKUP_PERCENT;
  }

  return value;
}

function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(number)
  );
}

function calculateCustomerAmount(
  providerRatePer1000,
  quantity,
  markupPercent
) {
  const providerRate =
    Number(providerRatePer1000);

  const qty =
    Number(quantity);

  if (
    !Number.isFinite(providerRate) ||
    providerRate < 0 ||
    !Number.isFinite(qty) ||
    qty <= 0
  ) {
    return 0;
  }

  const providerAmount =
    providerRate * qty / 1000;

  return roundMoney(
    providerAmount *
      (1 + markupPercent / 100)
  );
}

function calculateProviderAmount(
  providerRatePer1000,
  quantity
) {
  const providerRate =
    Number(providerRatePer1000);

  const qty =
    Number(quantity);

  if (
    !Number.isFinite(providerRate) ||
    providerRate < 0 ||
    !Number.isFinite(qty) ||
    qty <= 0
  ) {
    return 0;
  }

  return roundMoney(
    providerRate * qty / 1000
  );
}

function normalizeProviderService(service) {
  if (!service || typeof service !== "object") {
    return null;
  }

  const externalId = normalizeId(
    service.id ??
      service.service_id ??
      service.service
  );

  if (!externalId) {
    return null;
  }

  const rate = Number(
    service.rate ??
      service.price ??
      0
  );

  const min = Number(
    service.min ??
      service.minimum ??
      1
  );

  const max = Number(
    service.max ??
      service.maximum ??
      0
  );

  const name = cleanString(
    service.name ??
      service.service_name ??
      "",
    512
  );

  if (!name || !Number.isFinite(rate) || rate < 0) {
    return null;
  }

  return {
    externalServiceId: externalId,
    serviceName: name,
    platform:
      normalizePlatform(
        service.platform
      ) ||
      normalizePlatform(
        service.category
      ) ||
      "other",
    category:
      normalizeCategory(
        service.category
      ),
    serviceType:
      cleanString(
        service.type ??
          service.service_type ??
          "",
        128
      ) || null,
    providerRatePer1000:
      roundMoney(rate),
    providerRateRaw:
      String(
        service.rate ??
          service.price ??
          rate
      ),
    currency:
      cleanString(
        service.currency ??
          "IDR",
        16
      ) || "IDR",
    refill:
      Boolean(service.refill),
    dripfeed:
      Boolean(service.dripfeed),
    minQuantity:
      Number.isInteger(min) && min > 0
        ? min
        : 1,
    maxQuantity:
      Number.isInteger(max) && max >= min
        ? max
        : Math.max(min, 100000000),
    raw: service
  };
}

async function upsertServices(
  env,
  providerServices
) {
  const db = dbRequired(env);
  const services = Array.isArray(providerServices)
    ? providerServices
        .map(normalizeProviderService)
        .filter(Boolean)
        .slice(0, MAX_SERVICE_LIMIT)
    : [];

  if (!services.length) {
    return [];
  }

  const now = nowUnix();
  const markup = getMarkupPercent(env);
  const statements = services.map(service => {
    const sellingRate =
      roundMoney(
        Number(service.providerRatePer1000) *
          (1 + markup / 100)
      );

    return db
      .prepare(
        `
          INSERT INTO social_services (
            external_service_id,
            platform,
            category,
            service_name,
            service_type,
            provider_rate_per_1000,
            selling_rate_per_1000,
            provider_rate_raw,
            currency,
            refill,
            dripfeed,
            min_quantity,
            max_quantity,
            available,
            active,
            metadata,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
          ON CONFLICT(external_service_id)
          DO UPDATE SET
            platform = excluded.platform,
            category = excluded.category,
            service_name = excluded.service_name,
            service_type = excluded.service_type,
            provider_rate_per_1000 = excluded.provider_rate_per_1000,
            selling_rate_per_1000 = excluded.selling_rate_per_1000,
            provider_rate_raw = excluded.provider_rate_raw,
            currency = excluded.currency,
            refill = excluded.refill,
            dripfeed = excluded.dripfeed,
            min_quantity = excluded.min_quantity,
            max_quantity = excluded.max_quantity,
            available = excluded.available,
            active = excluded.active,
            metadata = excluded.metadata,
            updated_at = excluded.updated_at
        `
      )
      .bind(
        service.externalServiceId,
        service.platform,
        service.category,
        service.serviceName,
        service.serviceType,
        service.providerRatePer1000,
        sellingRate,
        service.providerRateRaw,
        service.currency,
        service.refill ? 1 : 0,
        service.dripfeed ? 1 : 0,
        service.minQuantity,
        service.maxQuantity,
        JSON.stringify(service.raw),
        now,
        now
      );
  });

  await db.batch(statements);

  return services;
}

async function getLocalService(
  env,
  serviceId
) {
  const db = dbRequired(env);

  return db
    .prepare(
      `
        SELECT
          id,
          external_service_id,
          platform,
          category,
          service_name,
          service_type,
          provider_rate_per_1000,
          selling_rate_per_1000,
          provider_rate_raw,
          currency,
          refill,
          dripfeed,
          min_quantity,
          max_quantity,
          available,
          active,
          metadata,
          created_at,
          updated_at
        FROM social_services
        WHERE external_service_id = ?
        LIMIT 1
      `
    )
    .bind(String(serviceId))
    .first();
}

async function refreshServicesIfNeeded(
  env
) {
  const db = dbRequired(env);

  const row = await db
    .prepare(
      `
        SELECT
          MAX(updated_at) AS updated_at
        FROM social_services
      `
    )
    .first();

  const lastUpdated =
    Number(row?.updated_at || 0);

  const ttl =
    Number(
      env?.SOCIAL_SERVICE_CACHE_TTL ??
        DEFAULT_SERVICE_CACHE_TTL
    );

  if (
    lastUpdated > 0 &&
    Number.isFinite(ttl) &&
    ttl > 0 &&
    nowUnix() - lastUpdated < ttl
  ) {
    return;
  }

  const providerServices =
    await getProviderServices(env);

  await upsertServices(
    env,
    providerServices
  );
}

async function getServicesFromProvider(
  env
) {
  const providerServices =
    await getProviderServices(env);

  return upsertServices(
    env,
    providerServices
  );
}

function serializeService(row, env) {
  if (!row) {
    return null;
  }

  const markup = getMarkupPercent(env);
  const providerRate =
    Number(
      row.provider_rate_per_1000 || 0
    );

  const sellingRate =
    Number(
      row.selling_rate_per_1000 || 0
    );

  return {
    id: row.external_service_id,
    service_id: row.external_service_id,
    platform: row.platform,
    category: row.category,
    name: row.service_name,
    type: row.service_type,
    provider_rate_per_1000: providerRate,
    selling_rate_per_1000: sellingRate,
    markup_percent: markup,
    currency: row.currency || "IDR",
    refill: Boolean(row.refill),
    dripfeed: Boolean(row.dripfeed),
    min: Number(row.min_quantity),
    max: Number(row.max_quantity),
    available: Boolean(row.available),
    active: Boolean(row.active)
  };
}

function serializeOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    order_number: row.order_number,
    type: row.type,
    provider: row.provider,
    external_order_id:
      row.external_order_id,
    service_id: row.service_id,
    service_name: row.service_name,
    target: row.target,
    quantity: Number(row.quantity),
    rate_unit: row.rate_unit,
    provider_rate:
      Number(row.provider_rate || 0),
    selling_rate:
      Number(row.selling_rate || 0),
    provider_amount:
      Number(row.provider_amount || 0),
    customer_amount:
      Number(row.customer_amount || 0),
    provider_charge:
      row.provider_charge === null ||
      row.provider_charge === undefined
        ? null
        : Number(row.provider_charge),
    provider_currency:
      row.provider_currency || "IDR",
    status: row.status,
    provider_status:
      row.provider_status,
    failure_reason:
      row.failure_reason,
    start_count:
      row.start_count === null ||
      row.start_count === undefined
        ? null
        : Number(row.start_count),
    remains:
      row.remains === null ||
      row.remains === undefined
        ? null
        : Number(row.remains),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at
  };
}

async function getOrderById(
  env,
  userId,
  orderId
) {
  const db = dbRequired(env);

  return db
    .prepare(
      `
        SELECT *
        FROM orders
        WHERE id = ?
          AND user_id = ?
          AND type = ?
          AND provider = ?
        LIMIT 1
      `
    )
    .bind(
      orderId,
      userId,
      ORDER_TYPE,
      PROVIDER
    )
    .first();
}

async function getOrderByIdempotency(
  env,
  userId,
  key
) {
  if (!key) {
    return null;
  }

  const db = dbRequired(env);

  return db
    .prepare(
      `
        SELECT *
        FROM orders
        WHERE user_id = ?
          AND idempotency_key = ?
          AND type = ?
          AND provider = ?
        LIMIT 1
      `
    )
    .bind(
      userId,
      key,
      ORDER_TYPE,
      PROVIDER
    )
    .first();
}

async function getOrderByExternalId(
  env,
  externalOrderId
) {
  const db = dbRequired(env);

  return db
    .prepare(
      `
        SELECT *
        FROM orders
        WHERE provider = ?
          AND external_order_id = ?
          AND type = ?
        LIMIT 1
      `
    )
    .bind(
      PROVIDER,
      externalOrderId,
      ORDER_TYPE
    )
    .first();
}

async function insertOrder(
  env,
  {
    userId,
    orderNumber,
    service,
    target,
    quantity,
    providerAmount,
    customerAmount,
    idempotencyKey,
    requestData
  }
) {
  const db = dbRequired(env);
  const now = nowUnix();

  const result = await db
    .prepare(
      `
        INSERT INTO orders (
          user_id,
          order_number,
          type,
          provider,
          service_id,
          service_name,
          target,
          quantity,
          rate_unit,
          provider_rate,
          selling_rate,
          provider_amount,
          customer_amount,
          provider_currency,
          status,
          request_data,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATING', ?, ?, ?, ?)
      `
    )
    .bind(
      userId,
      orderNumber,
      ORDER_TYPE,
      PROVIDER,
      service.external_service_id,
      service.service_name,
      target,
      quantity,
      RATE_UNIT,
      Number(service.provider_rate_per_1000 || 0),
      Number(service.selling_rate_per_1000 || 0),
      providerAmount,
      customerAmount,
      service.currency || "IDR",
      JSON.stringify(requestData),
      idempotencyKey,
      now,
      now
    )
    .run();

  const orderId =
    Number(result?.meta?.last_row_id || 0);

  if (!orderId) {
    throw new Error(
      "Order tidak berhasil dibuat."
    );
  }

  return getOrderById(
    env,
    userId,
    orderId
  );
}

async function updateOrder(
  env,
  orderId,
  fields
) {
  const db = dbRequired(env);
  const entries = Object.entries(fields);

  if (!entries.length) {
    return null;
  }

  const allowed = new Set([
    "external_order_id",
    "provider_charge",
    "status",
    "provider_status",
    "provider_data",
    "failure_reason",
    "provider_expires_at",
    "start_count",
    "remains",
    "completed_at",
    "cancelled_at",
    "updated_at"
  ]);

  for (const [key] of entries) {
    if (!allowed.has(key)) {
      throw new Error(
        `Field order tidak diizinkan: ${key}`
      );
    }
  }

  const setClause = entries
    .map(([key]) => `${key} = ?`)
    .join(", ");

  const values = entries.map(
    ([, value]) => value
  );

  await db
    .prepare(
      `
        UPDATE orders
        SET ${setClause}
        WHERE id = ?
          AND type = ?
          AND provider = ?
      `
    )
    .bind(
      ...values,
      orderId,
      ORDER_TYPE,
      PROVIDER
    )
    .run();

  return db
    .prepare(
      `
        SELECT *
        FROM orders
        WHERE id = ?
          AND type = ?
          AND provider = ?
        LIMIT 1
      `
    )
    .bind(
      orderId,
      ORDER_TYPE,
      PROVIDER
    )
    .first();
}

async function addOrderEvent(
  env,
  orderId,
  status,
  providerStatus,
  message,
  providerData
) {
  const db = dbRequired(env);

  await db
    .prepare(
      `
        INSERT INTO order_events (
          order_id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      orderId,
      status,
      providerStatus || null,
      message || null,
      providerData
        ? JSON.stringify(providerData)
        : null,
      nowUnix()
    )
    .run();
}

function createOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase();

  return `NB-SM-${timestamp}-${random}`;
}

function normalizeIdempotencyKey(
  request,
  data
) {
  const value = cleanString(
    request.headers.get("Idempotency-Key") ||
      data?.idempotencyKey ||
      data?.idempotency_key ||
      "",
    MAX_IDEMPOTENCY_LENGTH
  );

  if (!value) {
    return null;
  }

  return value;
}

function normalizeCustomContent(data) {
  const content = {};

  if (
    data?.komen !== undefined &&
    data?.komen !== null
  ) {
    content.komen = String(data.komen);
  }

  if (
    data?.comments !== undefined &&
    data?.comments !== null
  ) {
    content.comments = String(data.comments);
  }

  if (
    data?.usernames !== undefined &&
    data?.usernames !== null
  ) {
    content.usernames = String(data.usernames);
  }

  if (
    data?.runs !== undefined &&
    data?.runs !== null
  ) {
    content.runs = String(data.runs);
  }

  if (
    data?.interval !== undefined &&
    data?.interval !== null
  ) {
    content.interval = String(data.interval);
  }

  return content;
}

async function finalizeRefundIfNeeded(
  env,
  order,
  statusData
) {
  const status = mapProviderStatus(
    statusData.providerStatus
  );

  const providerCharge =
    statusData.charge === null ||
    statusData.charge === undefined
      ? null
      : roundMoney(statusData.charge);

  if (providerCharge !== null) {
    await updateOrder(
      env,
      order.id,
      {
        provider_charge: providerCharge,
        provider_data:
          JSON.stringify(statusData.raw),
        provider_status:
          statusData.providerStatus,
        updated_at: nowUnix()
      }
    );
  }

  if (
    status === "COMPLETED"
  ) {
    return {
      refunded: false,
      refundAmount: 0
    };
  }

  if (
    status === "PARTIAL" &&
    providerCharge !== null
  ) {
    const markup =
      getMarkupPercent(env);

    const actualCustomerCharge =
      roundMoney(
        providerCharge *
          (1 + markup / 100)
      );

    const refundAmount =
      Math.max(
        0,
        Number(order.customer_amount) -
          actualCustomerCharge
      );

    if (refundAmount > 0) {
      const refund =
        await refundBalance(
          env,
          {
            userId: order.user_id,
            amount: refundAmount,
            reference:
              `REFUND-SOCIAL-${order.id}`,
            description:
              "Refund selisih order Suntik Sosmed partial",
            orderId: order.id
          }
        );

      if (
        !refund?.success
      ) {
        throw new Error(
          "Refund partial gagal diproses."
        );
      }
    }

    return {
      refunded: refundAmount > 0,
      refundAmount
    };
  }

  if (
    [
      "CANCELLED",
      "EXPIRED",
      "FAILED"
    ].includes(status)
  ) {
    const refund =
      await refundBalance(
        env,
        {
          userId: order.user_id,
          amount: Number(
            order.customer_amount
          ),
          reference:
            `REFUND-SOCIAL-${order.id}`,
          description:
            "Refund order Suntik Sosmed",
          orderId: order.id
        }
      );

    if (!refund?.success) {
      throw new Error(
        "Refund order gagal diproses."
      );
    }

    return {
      refunded: true,
      refundAmount:
        Number(order.customer_amount)
    };
  }

  return {
    refunded: false,
    refundAmount: 0
  };
}

async function applyProviderStatus(
  env,
  order,
  statusData
) {
  const status =
    mapProviderStatus(
      statusData.providerStatus
    );

  const fields = {
    provider_status:
      statusData.providerStatus,
    provider_data:
      JSON.stringify(statusData.raw),
    provider_charge:
      statusData.charge === null
        ? undefined
        : statusData.charge,
    start_count:
      statusData.startCount,
    remains:
      statusData.remains,
    status,
    updated_at: nowUnix()
  };

  if (
    status === "COMPLETED"
  ) {
    fields.completed_at =
      order.completed_at ||
      nowUnix();
  }

  if (
    [
      "CANCELLED",
      "EXPIRED",
      "FAILED"
    ].includes(status)
  ) {
    fields.cancelled_at =
      order.cancelled_at ||
      nowUnix();
  }

  const cleanFields =
    Object.fromEntries(
      Object.entries(fields)
        .filter(
          ([, value]) =>
            value !== undefined
        )
    );

  const updated =
    await updateOrder(
      env,
      order.id,
      cleanFields
    );

  await addOrderEvent(
    env,
    order.id,
    status,
    statusData.providerStatus,
    null,
    statusData.raw
  );

  const refundResult =
    await finalizeRefundIfNeeded(
      env,
      updated,
      statusData
    );

  if (
    refundResult.refunded
  ) {
    const refundStatus =
      refundResult.refundAmount >=
      Number(
        updated.customer_amount
      )
        ? "REFUNDED"
        : status;

    const refundedOrder =
      await updateOrder(
        env,
        updated.id,
        {
          status: refundStatus,
          updated_at: nowUnix()
        }
      );

    await addOrderEvent(
      env,
      updated.id,
      refundStatus,
      statusData.providerStatus,
      `Refund ${formatRupiah(
        refundResult.refundAmount
      )}`,
      statusData.raw
    );

    return {
      order: refundedOrder,
      ...refundResult
    };
  }

  return {
    order: updated,
    ...refundResult
  };
}

async function syncOrderInternal(
  env,
  order
) {
  if (!order.external_order_id) {
    throw new Error(
      "Order provider belum tersedia."
    );
  }

  const statusData =
    await getProviderOrderStatus(
      env,
      order.external_order_id
    );

  return applyProviderStatus(
    env,
    order,
    statusData
  );
}

export async function listSosmedServices(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  try {
    const url = new URL(
      request.url
    );

    const serviceId =
      cleanString(
        url.searchParams.get("service_id"),
        256
      );

    const platform =
      normalizePlatform(
        url.searchParams.get("platform")
      );

    const category =
      normalizeCategory(
        url.searchParams.get("category")
      );

    await refreshServicesIfNeeded(
      env
    );

    const db = dbRequired(env);

    const conditions = [
      "active = 1",
      "available = 1"
    ];

    const binds = [];

    if (serviceId) {
      conditions.push(
        "external_service_id = ?"
      );
      binds.push(serviceId);
    }

    if (platform) {
      conditions.push(
        "LOWER(platform) = ?"
      );
      binds.push(platform);
    }

    if (category) {
      conditions.push(
        "LOWER(category) = ?"
      );
      binds.push(
        category.toLowerCase()
      );
    }

    const rows = await db
      .prepare(
        `
          SELECT *
          FROM social_services
          WHERE ${conditions.join(" AND ")}
          ORDER BY platform ASC, id ASC
        `
      )
      .bind(...binds)
      .all();

    return successResponse({
      services:
        Array.isArray(rows?.results)
          ? rows.results.map(
              row =>
                serializeService(
                  row,
                  env
                )
            )
          : []
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan Suntik Sosmed.",
      error?.status || 502
    );
  }
}

export async function getSosmedService(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(
    request.url
  );

  const serviceId =
    cleanString(
      url.searchParams.get("service_id"),
      256
    );

  if (!serviceId) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  try {
    await refreshServicesIfNeeded(
      env
    );

    const service =
      await getLocalService(
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
      service:
        serializeService(
          service,
          env
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil layanan.",
      error?.status || 502
    );
  }
}

export async function refreshSosmedServices(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  try {
    const services =
      await getServicesFromProvider(
        env
      );

    return successResponse({
      count: services.length,
      services:
        services.map(
          service =>
            serializeService(
              service,
              env
            )
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memperbarui katalog Suntik Sosmed.",
      error?.status || 502
    );
  }
}

export async function createSosmedOrder(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
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
    normalizeId(
      data.serviceId ??
        data.service_id
    );

  if (!serviceId) {
    return errorResponse(
      "Service ID wajib diisi.",
      400
    );
  }

  const target =
    normalizeTarget(
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
    normalizeIdempotencyKey(
      request,
      data
    );

  if (!idempotencyKey) {
    return errorResponse(
      "Idempotency-Key wajib diisi.",
      400
    );
  }

  try {
    const existing =
      await getOrderByIdempotency(
        env,
        auth.user.id,
        idempotencyKey
      );

    if (existing) {
      return successResponse({
        order:
          serializeOrder(
            existing
          ),
        created: false,
        idempotent: true
      });
    }

    await refreshServicesIfNeeded(
      env
    );

    const service =
      await getLocalService(
        env,
        serviceId
      );

    if (
      !service ||
      !service.active ||
      !service.available
    ) {
      return errorResponse(
        "Layanan tidak tersedia.",
        404
      );
    }

    const quantity =
      normalizeQuantity(
        data.quantity,
        service
      );

    if (!quantity) {
      return errorResponse(
        "Quantity berada di luar batas layanan.",
        400
      );
    }

    const providerAmount =
      calculateProviderAmount(
        service.provider_rate_per_1000,
        quantity
      );

    const customerAmount =
      calculateCustomerAmount(
        service.provider_rate_per_1000,
        quantity,
        getMarkupPercent(env)
      );

    if (
      customerAmount <= 0
    ) {
      return errorResponse(
        "Harga layanan tidak valid.",
        400
      );
    }

    const customContent =
      normalizeCustomContent(
        data
      );

    const requestData = {
      service:
        service.external_service_id,
      link: target,
      quantity,
      ...customContent
    };

    const order =
      await insertOrder(
        env,
        {
          userId: auth.user.id,
          orderNumber:
            createOrderNumber(),
          service,
          target,
          quantity,
          providerAmount,
          customerAmount,
          idempotencyKey,
          requestData
        }
      );

    const debit =
      await debitBalance(
        env,
        {
          userId: auth.user.id,
          amount: customerAmount,
          type: "PURCHASE",
          reference:
            `PURCHASE-SOCIAL-${order.id}`,
          description:
            `Pembelian ${service.service_name}`,
          orderId: order.id
        }
      );

    if (
      !debit?.success
    ) {
      await updateOrder(
        env,
        order.id,
        {
          status: "FAILED",
          failure_reason:
            "Saldo tidak mencukupi.",
          updated_at: nowUnix()
        }
      );

      await addOrderEvent(
        env,
        order.id,
        "FAILED",
        null,
        "Saldo tidak mencukupi.",
        null
      );

      return errorResponse(
        "Saldo tidak mencukupi.",
        400,
        {
          balance:
            debit?.balance ?? 0
        }
      );
    }

    await addOrderEvent(
      env,
      order.id,
      "CREATING",
      null,
      "Order diterima dan sedang dikirim ke provider.",
      null
    );

    let providerResult;

    try {
      providerResult =
        await createProviderOrder(
          env,
          {
            service:
              service.external_service_id,
            link: target,
            quantity,
            ...customContent
          }
        );
    } catch (error) {
      await refundBalance(
        env,
        {
          userId: auth.user.id,
          amount: customerAmount,
          reference:
            `REFUND-SOCIAL-${order.id}`,
          description:
            "Refund order provider gagal dibuat",
          orderId: order.id
        }
      );

      const failed =
        await updateOrder(
          env,
          order.id,
          {
            status: "REFUNDED",
            failure_reason:
              error?.message ||
              "Provider gagal menerima order.",
            updated_at: nowUnix()
          }
        );

      await addOrderEvent(
        env,
        order.id,
        "REFUNDED",
        null,
        "Provider gagal menerima order, saldo dikembalikan.",
        error?.details || null
      );

      return errorResponse(
        error?.message ||
          "Gagal membuat order di provider.",
        error?.status || 502,
        {
          order:
            serializeOrder(
              failed
            ),
          refunded: true
        }
      );
    }

    const externalOrderId =
      normalizeId(
        providerResult?.externalOrderId
      );

    if (!externalOrderId) {
      await refundBalance(
        env,
        {
          userId: auth.user.id,
          amount: customerAmount,
          reference:
            `REFUND-SOCIAL-${order.id}`,
          description:
            "Refund order tanpa ID provider",
          orderId: order.id
        }
      );

      const failed =
        await updateOrder(
          env,
          order.id,
          {
            status: "REFUNDED",
            failure_reason:
              "Provider tidak mengembalikan ID order.",
            provider_data:
              JSON.stringify(
                providerResult?.providerData ||
                  null
              ),
            updated_at: nowUnix()
          }
        );

      return errorResponse(
        "Provider tidak mengembalikan ID order.",
        502,
        {
          order:
            serializeOrder(
              failed
            ),
          refunded: true
        }
      );
    }

    const updated =
      await updateOrder(
        env,
        order.id,
        {
          external_order_id:
            externalOrderId,
          provider_data:
            JSON.stringify(
              providerResult.providerData ||
                null
            ),
          status: "PENDING",
          provider_status: null,
          updated_at: nowUnix()
        }
      );

    await addOrderEvent(
      env,
      order.id,
      "PENDING",
      null,
      "Order berhasil diteruskan ke provider.",
      providerResult.providerData
    );

    return successResponse(
      {
        order:
          serializeOrder(
            updated
          ),
        created: true,
        idempotent: false,
        charged: true
      },
      201
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membuat order Suntik Sosmed.",
      error?.status || 500
    );
  }
}

export async function getSosmedOrder(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
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

  try {
    const order =
      await getOrderById(
        env,
        auth.user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    return successResponse({
      order:
        serializeOrder(
          order
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil order.",
      error?.status || 500
    );
  }
}

export async function syncSosmedOrder(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
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

  try {
    const order =
      await getOrderById(
        env,
        auth.user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order provider belum tersedia.",
        409
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
        synced: false
      });
    }

    const result =
      await syncOrderInternal(
        env,
        order
      );

    return successResponse({
      order:
        serializeOrder(
          result.order
        ),
      synced: true,
      refunded:
        Boolean(
          result.refunded
        ),
      refund_amount:
        result.refundAmount || 0
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal sinkronisasi order.",
      error?.status || 502
    );
  }
}

export async function listMySosmedOrders(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const limit =
    Math.min(
      parseInteger(
        url.searchParams.get("limit"),
        {
          min: 1,
          max: MAX_LIST_LIMIT
        }
      ) || DEFAULT_LIST_LIMIT,
      MAX_LIST_LIMIT
    );

  const page =
    parseInteger(
      url.searchParams.get("page"),
      {
        min: 1
      }
    ) || 1;

  const offset =
    (page - 1) * limit;

  const status =
    cleanString(
      url.searchParams.get("status"),
      64
    );

  const db =
    dbRequired(env);

  const conditions = [
    "user_id = ?",
    "type = ?",
    "provider = ?"
  ];

  const binds = [
    auth.user.id,
    ORDER_TYPE,
    PROVIDER
  ];

  if (status) {
    conditions.push(
      "status = ?"
    );
    binds.push(status);
  }

  const rows =
    await db
      .prepare(
        `
          SELECT *
          FROM orders
          WHERE ${conditions.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .bind(
        ...binds,
        limit,
        offset
      )
      .all();

  const count =
    await db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM orders
          WHERE ${conditions.join(" AND ")}
        `
      )
      .bind(...binds)
      .first();

  return successResponse({
    orders:
      Array.isArray(
        rows?.results
      )
        ? rows.results.map(
            serializeOrder
          )
        : [],
    total:
      Number(
        count?.total || 0
      ),
    page,
    limit
  });
}

export async function requestSosmedRefill(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const orderId =
    parseInteger(
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

  try {
    const order =
      await getOrderById(
        env,
        auth.user.id,
        orderId
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    if (!order.external_order_id) {
      return errorResponse(
        "Order provider belum tersedia.",
        409
      );
    }

    const service =
      await getLocalService(
        env,
        order.service_id
      );

    if (!service?.refill) {
      return errorResponse(
        "Layanan ini tidak mendukung refill.",
        400
      );
    }

    const result =
      await requestProviderRefill(
        env,
        order.external_order_id
      );

    await addOrderEvent(
      env,
      order.id,
      order.status,
      order.provider_status,
      "Permintaan refill diteruskan ke provider.",
      result
    );

    return successResponse({
      order:
        serializeOrder(
          order
        ),
      refill:
        result
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengajukan refill.",
      error?.status || 502
    );
  }
}

export async function getSosmedRefillStatus(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (auth instanceof Response) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const refillId =
    cleanString(
      url.searchParams.get("refill_id"),
      256
    );

  if (!refillId) {
    return errorResponse(
      "Refill ID wajib diisi.",
      400
    );
  }

  try {
    const result =
      await getProviderRefillStatus(
        env,
        refillId
      );

    return successResponse({
      refill:
        result
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil status refill.",
      error?.status || 502
    );
  }
}

export const listSocialServices =
  listSosmedServices;

export const getSocialService =
  getSosmedService;

export const refreshSocialServices =
  refreshSosmedServices;

export const createSocialOrder =
  createSosmedOrder;

export const getSocialOrder =
  getSosmedOrder;

export const syncSocialOrder =
  syncSosmedOrder;

export const listSocialOrders =
  listMySosmedOrders;

export const requestSocialRefill =
  requestSosmedRefill;

export const getSocialRefillStatus =
  getSosmedRefillStatus;

export default {
  listSosmedServices,
  getSosmedService,
  refreshSosmedServices,
  createSosmedOrder,
  getSosmedOrder,
  syncSosmedOrder,
  listMySosmedOrders,
  requestSosmedRefill,
  getSosmedRefillStatus,
  listSocialServices,
  getSocialService,
  refreshSocialServices,
  createSocialOrder,
  getSocialOrder,
  syncSocialOrder,
  listSocialOrders,
  requestSocialRefill,
  getSocialRefillStatus
};
