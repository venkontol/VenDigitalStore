import {
  cleanString,
  generateOrderNumber,
  getPagination,
  jsonText,
  nowUnix,
  parseInteger,
  parseJson,
  successResponse,
  errorResponse
} from "./utils.js";

const ORDER_TYPES = Object.freeze({
  NOKOS: "NOKOS",
  SOCIAL: "SOCIAL"
});

const ORDER_PROVIDERS = Object.freeze({
  SMSCODE: "SMSCODE",
  BUZZERPANEL: "BUZZERPANEL"
});

const ORDER_STATUSES = Object.freeze({
  CREATING: "CREATING",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  OTP_RECEIVED: "OTP_RECEIVED",
  COMPLETED: "COMPLETED",
  PARTIAL: "PARTIAL",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN"
});

const FINAL_STATUSES = new Set([
  ORDER_STATUSES.COMPLETED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.EXPIRED,
  ORDER_STATUSES.REFUNDED,
  ORDER_STATUSES.FAILED
]);

const ACTIVE_STATUSES = new Set([
  ORDER_STATUSES.CREATING,
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.PROCESSING,
  ORDER_STATUSES.OTP_RECEIVED,
  ORDER_STATUSES.PARTIAL,
  ORDER_STATUSES.UNKNOWN
]);

const RATE_UNITS = Object.freeze({
  FIXED: "FIXED",
  PER_1000: "PER_1000"
});

const ALLOWED_ORDER_TYPES =
  new Set(Object.values(ORDER_TYPES));

const ALLOWED_PROVIDERS =
  new Set(Object.values(ORDER_PROVIDERS));

const ALLOWED_STATUSES =
  new Set(Object.values(ORDER_STATUSES));

const ALLOWED_RATE_UNITS =
  new Set(Object.values(RATE_UNITS));

const ORDER_SELECT = `
  SELECT
    id,
    user_id,
    order_number,
    type,
    provider,
    external_order_id,
    service_id,
    service_name,
    target,
    quantity,
    rate_unit,
    provider_rate,
    selling_rate,
    provider_amount,
    customer_amount,
    provider_charge,
    provider_currency,
    status,
    provider_status,
    provider_data,
    request_data,
    idempotency_key,
    failure_reason,
    phone_number,
    otp_code,
    otp_message,
    otp_received_at,
    provider_expires_at,
    start_count,
    remains,
    created_at,
    updated_at,
    completed_at,
    cancelled_at
  FROM orders
`;

const EVENT_SELECT = `
  SELECT
    id,
    order_id,
    status,
    provider_status,
    message,
    provider_data,
    created_at
  FROM order_events
`;

function validEnum(
  value,
  allowed
) {
  return allowed.has(
    String(value || "").toUpperCase()
  );
}

function normalizeOrderRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    order_number: row.order_number,
    type: row.type,
    provider: row.provider,
    external_order_id:
      row.external_order_id ?? null,
    service_id:
      row.service_id ?? null,
    service_name:
      row.service_name ?? null,
    target:
      row.target ?? null,
    quantity:
      Number(row.quantity || 0),
    rate_unit:
      row.rate_unit,
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
      row.provider_currency ?? "IDR",
    status:
      row.status,
    provider_status:
      row.provider_status ?? null,
    provider_data:
      parseJson(row.provider_data, null),
    request_data:
      parseJson(row.request_data, null),
    idempotency_key:
      row.idempotency_key ?? null,
    failure_reason:
      row.failure_reason ?? null,
    phone_number:
      row.phone_number ?? null,
    otp_code:
      row.otp_code ?? null,
    otp_message:
      row.otp_message ?? null,
    otp_received_at:
      row.otp_received_at ?? null,
    provider_expires_at:
      row.provider_expires_at ?? null,
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
    created_at:
      row.created_at,
    updated_at:
      row.updated_at,
    completed_at:
      row.completed_at ?? null,
    cancelled_at:
      row.cancelled_at ?? null
  };
}

function normalizeEventRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    order_id: row.order_id,
    status: row.status,
    provider_status:
      row.provider_status ?? null,
    message:
      row.message ?? null,
    provider_data:
      parseJson(row.provider_data, null),
    created_at:
      row.created_at
  };
}

function normalizeOrderInput(input = {}) {
  const userId =
    parseInteger(input.userId, {
      min: 1
    });

  if (!userId) {
    return {
      error: "User tidak valid."
    };
  }

  const type =
    String(input.type || "")
      .trim()
      .toUpperCase();

  if (!validEnum(type, ALLOWED_ORDER_TYPES)) {
    return {
      error: "Tipe order tidak valid."
    };
  }

  const provider =
    String(input.provider || "")
      .trim()
      .toUpperCase();

  if (!validEnum(provider, ALLOWED_PROVIDERS)) {
    return {
      error: "Provider order tidak valid."
    };
  }

  const quantity =
    parseInteger(
      input.quantity ?? 1,
      {
        min: 1
      }
    );

  if (!quantity) {
    return {
      error: "Quantity tidak valid."
    };
  }

  const providerRate =
    parseInteger(
      input.providerRate ?? 0,
      {
        min: 0
      }
    );

  const sellingRate =
    parseInteger(
      input.sellingRate ?? 0,
      {
        min: 0
      }
    );

  const providerAmount =
    parseInteger(
      input.providerAmount ?? 0,
      {
        min: 0
      }
    );

  const customerAmount =
    parseInteger(
      input.customerAmount ?? 0,
      {
        min: 0
      }
    );

  if (
    providerRate === null ||
    sellingRate === null ||
    providerAmount === null ||
    customerAmount === null
  ) {
    return {
      error: "Nilai harga order tidak valid."
    };
  }

  const rateUnit =
    String(
      input.rateUnit || RATE_UNITS.FIXED
    )
      .trim()
      .toUpperCase();

  if (
    !validEnum(
      rateUnit,
      ALLOWED_RATE_UNITS
    )
  ) {
    return {
      error: "Satuan harga order tidak valid."
    };
  }

  const idempotencyKey =
    input.idempotencyKey
      ? cleanString(
          input.idempotencyKey,
          128
        )
      : null;

  return {
    value: {
      userId,
      type,
      provider,
      externalOrderId:
        input.externalOrderId
          ? cleanString(
              input.externalOrderId,
              128
            )
          : null,
      serviceId:
        input.serviceId
          ? cleanString(
              input.serviceId,
              128
            )
          : null,
      serviceName:
        input.serviceName
          ? cleanString(
              input.serviceName,
              255
            )
          : null,
      target:
        input.target
          ? cleanString(
              input.target,
              2048
            )
          : null,
      quantity,
      rateUnit,
      providerRate,
      sellingRate,
      providerAmount,
      customerAmount,
      providerCharge:
        input.providerCharge === null ||
        input.providerCharge === undefined
          ? null
          : parseInteger(
              input.providerCharge,
              {
                min: 0
              }
            ),
      providerCurrency:
        cleanString(
          input.providerCurrency || "IDR",
          16
        ).toUpperCase(),
      status:
        String(
          input.status ||
          ORDER_STATUSES.CREATING
        )
          .trim()
          .toUpperCase(),
      providerStatus:
        input.providerStatus
          ? cleanString(
              input.providerStatus,
              128
            )
          : null,
      providerData:
        input.providerData ?? null,
      requestData:
        input.requestData ?? null,
      idempotencyKey,
      failureReason:
        input.failureReason
          ? cleanString(
              input.failureReason,
              1000
            )
          : null,
      phoneNumber:
        input.phoneNumber
          ? cleanString(
              input.phoneNumber,
              64
            )
          : null,
      otpCode:
        input.otpCode
          ? cleanString(
              input.otpCode,
              128
            )
          : null,
      otpMessage:
        input.otpMessage
          ? cleanString(
              input.otpMessage,
              2048
            )
          : null,
      otpReceivedAt:
        input.otpReceivedAt ?? null,
      providerExpiresAt:
        input.providerExpiresAt ?? null,
      startCount:
        input.startCount ?? null,
      remains:
        input.remains ?? null
    }
  };
}

function normalizeStatus(status) {
  return String(
    status || ""
  )
    .trim()
    .toUpperCase();
}

function normalizeProviderStatus(status) {
  if (
    status === null ||
    status === undefined
  ) {
    return null;
  }

  return cleanString(
    status,
    128
  );
}

function orderIsFinal(status) {
  return FINAL_STATUSES.has(
    normalizeStatus(status)
  );
}

function orderIsActive(status) {
  return ACTIVE_STATUSES.has(
    normalizeStatus(status)
  );
}

export function isFinalOrderStatus(status) {
  return orderIsFinal(status);
}

export function isActiveOrderStatus(status) {
  return orderIsActive(status);
}

export function getOrderStatuses() {
  return Object.freeze({
    ...ORDER_STATUSES
  });
}

export function getOrderTypes() {
  return Object.freeze({
    ...ORDER_TYPES
  });
}

export function getOrderProviders() {
  return Object.freeze({
    ...ORDER_PROVIDERS
  });
}

export async function getOrderById(
  db,
  orderId
) {
  const id =
    parseInteger(orderId, {
      min: 1
    });

  if (!id) {
    return null;
  }

  const row =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE id = ?
        LIMIT 1
      `)
      .bind(id)
      .first();

  return normalizeOrderRow(row);
}

export async function getOrderByNumber(
  db,
  orderNumber
) {
  const value =
    cleanString(
      orderNumber,
      128
    );

  if (!value) {
    return null;
  }

  const row =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE order_number = ?
        LIMIT 1
      `)
      .bind(value)
      .first();

  return normalizeOrderRow(row);
}

export async function getOrderByExternalId(
  db,
  provider,
  externalOrderId
) {
  const normalizedProvider =
    String(provider || "")
      .trim()
      .toUpperCase();

  const externalId =
    cleanString(
      externalOrderId,
      128
    );

  if (
    !validEnum(
      normalizedProvider,
      ALLOWED_PROVIDERS
    ) ||
    !externalId
  ) {
    return null;
  }

  const row =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE provider = ?
          AND external_order_id = ?
        LIMIT 1
      `)
      .bind(
        normalizedProvider,
        externalId
      )
      .first();

  return normalizeOrderRow(row);
}

export async function getOrderByIdempotencyKey(
  db,
  userId,
  idempotencyKey
) {
  const normalizedUserId =
    parseInteger(userId, {
      min: 1
    });

  const key =
    cleanString(
      idempotencyKey,
      128
    );

  if (
    !normalizedUserId ||
    !key
  ) {
    return null;
  }

  const row =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE user_id = ?
          AND idempotency_key = ?
        LIMIT 1
      `)
      .bind(
        normalizedUserId,
        key
      )
      .first();

  return normalizeOrderRow(row);
}

export async function getUserOrder(
  db,
  userId,
  orderId
) {
  const normalizedUserId =
    parseInteger(userId, {
      min: 1
    });

  const normalizedOrderId =
    parseInteger(orderId, {
      min: 1
    });

  if (
    !normalizedUserId ||
    !normalizedOrderId
  ) {
    return null;
  }

  const row =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `)
      .bind(
        normalizedOrderId,
        normalizedUserId
      )
      .first();

  return normalizeOrderRow(row);
}

export async function listUserOrders(
  db,
  userId,
  options = {}
) {
  const normalizedUserId =
    parseInteger(userId, {
      min: 1
    });

  if (!normalizedUserId) {
    return {
      success: false,
      error: "User tidak valid."
    };
  }

  const url =
    options.url instanceof URL
      ? options.url
      : new URL(
          options.url ||
          "https://local.invalid/orders"
        );

  const pagination =
    getPagination(
      url,
      options.defaultLimit || 20,
      options.maxLimit || 100
    );

  const filters = [
    "user_id = ?"
  ];

  const binds = [
    normalizedUserId
  ];

  if (options.type) {
    const type =
      String(options.type)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        type,
        ALLOWED_ORDER_TYPES
      )
    ) {
      filters.push(
        "type = ?"
      );

      binds.push(type);
    }
  }

  if (options.status) {
    const status =
      normalizeStatus(
        options.status
      );

    if (
      validEnum(
        status,
        ALLOWED_STATUSES
      )
    ) {
      filters.push(
        "status = ?"
      );

      binds.push(status);
    }
  }

  const where =
    filters.join(" AND ");

  const countRow =
    await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM orders
        WHERE ${where}
      `)
      .bind(...binds)
      .first();

  const rows =
    await db
      .prepare(`
        ${ORDER_SELECT}
        WHERE ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        OFFSET ?
      `)
      .bind(
        ...binds,
        pagination.limit,
        pagination.offset
      )
      .all();

  const total =
    Number(
      countRow?.total || 0
    );

  return {
    success: true,
    orders:
      (rows.results || [])
        .map(normalizeOrderRow),
    pagination: {
      page:
        pagination.page,
      limit:
        pagination.limit,
      total,
      totalPages:
        Math.ceil(
          total /
          pagination.limit
        )
    }
  };
}

export async function listAdminOrders(
  db,
  options = {}
) {
  const url =
    options.url instanceof URL
      ? options.url
      : new URL(
          options.url ||
          "https://local.invalid/orders"
        );

  const pagination =
    getPagination(
      url,
      options.defaultLimit || 30,
      options.maxLimit || 100
    );

  const filters = [];
  const binds = [];

  if (options.userId) {
    const userId =
      parseInteger(
        options.userId,
        {
          min: 1
        }
      );

    if (userId) {
      filters.push(
        "o.user_id = ?"
      );

      binds.push(userId);
    }
  }

  if (options.type) {
    const type =
      String(options.type)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        type,
        ALLOWED_ORDER_TYPES
      )
    ) {
      filters.push(
        "o.type = ?"
      );

      binds.push(type);
    }
  }

  if (options.provider) {
    const provider =
      String(options.provider)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        provider,
        ALLOWED_PROVIDERS
      )
    ) {
      filters.push(
        "o.provider = ?"
      );

      binds.push(provider);
    }
  }

  if (options.status) {
    const status =
      normalizeStatus(
        options.status
      );

    if (
      validEnum(
        status,
        ALLOWED_STATUSES
      )
    ) {
      filters.push(
        "o.status = ?"
      );

      binds.push(status);
    }
  }

  const where =
    filters.length
      ? `WHERE ${filters.join(" AND ")}`
      : "";

  const countRow =
    await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM orders o
        ${where}
      `)
      .bind(...binds)
      .first();

  const rows =
    await db
      .prepare(`
        ${ORDER_SELECT.replace(
          "  FROM orders",
          "  FROM orders o"
        )}
        ${where}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ?
        OFFSET ?
      `)
      .bind(
        ...binds,
        pagination.limit,
        pagination.offset
      )
      .all();

  const total =
    Number(
      countRow?.total || 0
    );

  return {
    success: true,
    orders:
      (rows.results || [])
        .map(normalizeOrderRow),
    pagination: {
      page:
        pagination.page,
      limit:
        pagination.limit,
      total,
      totalPages:
        Math.ceil(
          total /
          pagination.limit
        )
    }
  };
}

export async function createOrder(
  db,
  input = {}
) {
  const normalized =
    normalizeOrderInput(input);

  if (normalized.error) {
    return errorResponse(
      normalized.error,
      400
    );
  }

  const data =
    normalized.value;

  if (
    !validEnum(
      data.status,
      ALLOWED_STATUSES
    )
  ) {
    return errorResponse(
      "Status order tidak valid.",
      400
    );
  }

  if (
    data.providerCharge !== null &&
    data.providerCharge === null
  ) {
    return errorResponse(
      "Provider charge tidak valid.",
      400
    );
  }

  const now =
    nowUnix();

  const orderNumber =
    cleanString(
      input.orderNumber,
      128
    ) ||
    generateOrderNumber(
      "VDS"
    );

  if (
    data.idempotencyKey
  ) {
    const existing =
      await getOrderByIdempotencyKey(
        db,
        data.userId,
        data.idempotencyKey
      );

    if (existing) {
      return successResponse({
        order: existing,
        created: false,
        idempotent: true
      });
    }
  }

  if (
    data.externalOrderId
  ) {
    const existing =
      await getOrderByExternalId(
        db,
        data.provider,
        data.externalOrderId
      );

    if (existing) {
      return successResponse({
        order: existing,
        created: false,
        idempotent: true
      });
    }
  }

  const statements = [
    db
      .prepare(`
        INSERT INTO orders (
          user_id,
          order_number,
          type,
          provider,
          external_order_id,
          service_id,
          service_name,
          target,
          quantity,
          rate_unit,
          provider_rate,
          selling_rate,
          provider_amount,
          customer_amount,
          provider_charge,
          provider_currency,
          status,
          provider_status,
          provider_data,
          request_data,
          idempotency_key,
          failure_reason,
          phone_number,
          otp_code,
          otp_message,
          otp_received_at,
          provider_expires_at,
          start_count,
          remains,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `)
      .bind(
        data.userId,
        orderNumber,
        data.type,
        data.provider,
        data.externalOrderId,
        data.serviceId,
        data.serviceName,
        data.target,
        data.quantity,
        data.rateUnit,
        data.providerRate,
        data.sellingRate,
        data.providerAmount,
        data.customerAmount,
        data.providerCharge,
        data.providerCurrency,
        data.status,
        data.providerStatus,
        jsonText(data.providerData),
        jsonText(data.requestData),
        data.idempotencyKey,
        data.failureReason,
        data.phoneNumber,
        data.otpCode,
        data.otpMessage,
        data.otpReceivedAt,
        data.providerExpiresAt,
        data.startCount,
        data.remains,
        now,
        now
      ),
    db
      .prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        )
        SELECT
          id,
          ?,
          ?,
          ?,
          ?,
          ?
        FROM orders
        WHERE order_number = ?
        LIMIT 1
      `)
      .bind(
        data.status,
        data.providerStatus,
        "Order dibuat.",
        jsonText(
          data.providerData
        ),
        now,
        orderNumber
      )
  ];

  try {
    await db.batch(
      statements
    );
  } catch (error) {
    if (
      data.idempotencyKey
    ) {
      const existing =
        await getOrderByIdempotencyKey(
          db,
          data.userId,
          data.idempotencyKey
        );

      if (existing) {
        return successResponse({
          order: existing,
          created: false,
          idempotent: true
        });
      }
    }

    if (
      data.externalOrderId
    ) {
      const existing =
        await getOrderByExternalId(
          db,
          data.provider,
          data.externalOrderId
        );

      if (existing) {
        return successResponse({
          order: existing,
          created: false,
          idempotent: true
        });
      }
    }

    return errorResponse(
      error?.message ||
        "Gagal membuat order.",
      500
    );
  }

  const order =
    await getOrderByNumber(
      db,
      orderNumber
    );

  if (!order) {
    return errorResponse(
      "Order berhasil dibuat tetapi tidak dapat dibaca kembali.",
      500
    );
  }

  return successResponse({
    order,
    created: true,
    idempotent: false
  }, 201);
}

const ORDER_UPDATE_FIELDS =
  Object.freeze({
    externalOrderId:
      "external_order_id",
    serviceId:
      "service_id",
    serviceName:
      "service_name",
    target:
      "target",
    quantity:
      "quantity",
    rateUnit:
      "rate_unit",
    providerRate:
      "provider_rate",
    sellingRate:
      "selling_rate",
    providerAmount:
      "provider_amount",
    customerAmount:
      "customer_amount",
    providerCharge:
      "provider_charge",
    providerCurrency:
      "provider_currency",
    status:
      "status",
    providerStatus:
      "provider_status",
    providerData:
      "provider_data",
    requestData:
      "request_data",
    failureReason:
      "failure_reason",
    phoneNumber:
      "phone_number",
    otpCode:
      "otp_code",
    otpMessage:
      "otp_message",
    otpReceivedAt:
      "otp_received_at",
    providerExpiresAt:
      "provider_expires_at",
    startCount:
      "start_count",
    remains:
      "remains",
    completedAt:
      "completed_at",
    cancelledAt:
      "cancelled_at"
  });

function normalizeUpdateValue(
  key,
  value
) {
  if (
    key === "status"
  ) {
    const status =
      normalizeStatus(value);

    return validEnum(
      status,
      ALLOWED_STATUSES
    )
      ? status
      : null;
  }

  if (
    key === "rateUnit"
  ) {
    const rateUnit =
      String(value || "")
        .trim()
        .toUpperCase();

    return validEnum(
      rateUnit,
      ALLOWED_RATE_UNITS
    )
      ? rateUnit
      : null;
  }

  if (
    key === "quantity" ||
    key === "providerRate" ||
    key === "sellingRate" ||
    key === "providerAmount" ||
    key === "customerAmount" ||
    key === "providerCharge" ||
    key === "otpReceivedAt" ||
    key === "providerExpiresAt" ||
    key === "startCount" ||
    key === "remains" ||
    key === "completedAt" ||
    key === "cancelledAt"
  ) {
    if (
      value === null &&
      key !== "quantity"
    ) {
      return null;
    }

    const minimum =
      key === "quantity"
        ? 1
        : 0;

    return parseInteger(
      value,
      {
        min: minimum
      }
    );
  }

  if (
    key === "providerData" ||
    key === "requestData"
  ) {
    return jsonText(value);
  }

  if (
    key === "externalOrderId" ||
    key === "serviceId" ||
    key === "serviceName" ||
    key === "target" ||
    key === "providerStatus" ||
    key === "providerCurrency" ||
    key === "failureReason" ||
    key === "phoneNumber" ||
    key === "otpCode" ||
    key === "otpMessage"
  ) {
    if (value === null) {
      return null;
    }

    return cleanString(
      value,
      key === "target"
        ? 2048
        : key === "failureReason"
          ? 1000
          : key === "otpMessage"
            ? 2048
            : 255
    );
  }

  return undefined;
}

export async function updateOrder(
  db,
  orderId,
  updates = {}
) {
  const normalizedOrderId =
    parseInteger(orderId, {
      min: 1
    });

  if (!normalizedOrderId) {
    return errorResponse(
      "Order tidak valid.",
      400
    );
  }

  const current =
    await getOrderById(
      db,
      normalizedOrderId
    );

  if (!current) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  const assignments = [];
  const values = [];

  for (
    const [
      key,
      column
    ] of Object.entries(
      ORDER_UPDATE_FIELDS
    )
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(
        updates,
        key
      )
    ) {
      continue;
    }

    const value =
      normalizeUpdateValue(
        key,
        updates[key]
      );

    if (
      value === undefined
    ) {
      continue;
    }

    if (
      value === null &&
      key === "quantity"
    ) {
      return errorResponse(
        "Quantity tidak valid.",
        400
      );
    }

    if (
      (
        key === "status" ||
        key === "rateUnit"
      ) &&
      value === null
    ) {
      return errorResponse(
        "Nilai order tidak valid.",
        400
      );
    }

    assignments.push(
      `${column} = ?`
    );

    values.push(value);
  }

  if (!assignments.length) {
    return successResponse({
      order: current,
      updated: false
    });
  }

  assignments.push(
    "updated_at = ?"
  );

  values.push(
    nowUnix()
  );

  values.push(
    normalizedOrderId
  );

  try {
    await db
      .prepare(`
        UPDATE orders
        SET ${assignments.join(", ")}
        WHERE id = ?
      `)
      .bind(...values)
      .run();
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memperbarui order.",
      500
    );
  }

  const updated =
    await getOrderById(
      db,
      normalizedOrderId
    );

  return successResponse({
    order: updated,
    updated: true
  });
}

export async function updateOrderStatus(
  db,
  orderId,
  {
    status,
    providerStatus = null,
    message = null,
    providerData = null,
    failureReason = null,
    completedAt = undefined,
    cancelledAt = undefined
  } = {}
) {
  const normalizedStatus =
    normalizeStatus(status);

  if (
    !validEnum(
      normalizedStatus,
      ALLOWED_STATUSES
    )
  ) {
    return errorResponse(
      "Status order tidak valid.",
      400
    );
  }

  const order =
    await getOrderById(
      db,
      orderId
    );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  const now =
    nowUnix();

  const finalCompletedAt =
    completedAt !== undefined
      ? completedAt
      : normalizedStatus ===
          ORDER_STATUSES.COMPLETED
        ? now
        : undefined;

  const finalCancelledAt =
    cancelledAt !== undefined
      ? cancelledAt
      : (
          normalizedStatus ===
            ORDER_STATUSES.CANCELLED ||
          normalizedStatus ===
            ORDER_STATUSES.EXPIRED
        )
          ? now
          : undefined;

  const updates = {
    status:
      normalizedStatus,
    providerStatus:
      normalizeProviderStatus(
        providerStatus
      ),
    providerData:
      providerData,
    failureReason:
      failureReason
        ? cleanString(
            failureReason,
            1000
          )
        : null
  };

  if (
    finalCompletedAt !== undefined
  ) {
    updates.completedAt =
      finalCompletedAt;
  }

  if (
    finalCancelledAt !== undefined
  ) {
    updates.cancelledAt =
      finalCancelledAt;
  }

  const statements = [
    db
      .prepare(`
        UPDATE orders
        SET
          status = ?,
          provider_status = ?,
          provider_data = ?,
          failure_reason = ?,
          ${
            finalCompletedAt !== undefined
              ? "completed_at = ?,"
              : ""
          }
          ${
            finalCancelledAt !== undefined
              ? "cancelled_at = ?,"
              : ""
          }
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        normalizedStatus,
        updates.providerStatus,
        jsonText(providerData),
        updates.failureReason,
        ...(finalCompletedAt !== undefined
          ? [finalCompletedAt]
          : []),
        ...(finalCancelledAt !== undefined
          ? [finalCancelledAt]
          : []),
        now,
        order.id
      ),
    db
      .prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        order.id,
        normalizedStatus,
        updates.providerStatus,
        message
          ? cleanString(
              message,
              2048
            )
          : null,
        jsonText(providerData),
        now
      )
  ];

  try {
    await db.batch(
      statements
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memperbarui status order.",
      500
    );
  }

  const updated =
    await getOrderById(
      db,
      order.id
    );

  return successResponse({
    order: updated,
    updated: true
  });
}

export async function addOrderEvent(
  db,
  orderId,
  {
    status,
    providerStatus = null,
    message = null,
    providerData = null
  } = {}
) {
  const normalizedOrderId =
    parseInteger(orderId, {
      min: 1
    });

  const normalizedStatus =
    normalizeStatus(status);

  if (
    !normalizedOrderId ||
    !validEnum(
      normalizedStatus,
      ALLOWED_STATUSES
    )
  ) {
    return errorResponse(
      "Data event order tidak valid.",
      400
    );
  }

  const order =
    await getOrderById(
      db,
      normalizedOrderId
    );

  if (!order) {
    return errorResponse(
      "Order tidak ditemukan.",
      404
    );
  }

  const createdAt =
    nowUnix();

  try {
    await db
      .prepare(`
        INSERT INTO order_events (
          order_id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        normalizedOrderId,
        normalizedStatus,
        normalizeProviderStatus(
          providerStatus
        ),
        message
          ? cleanString(
              message,
              2048
            )
          : null,
        jsonText(providerData),
        createdAt
      )
      .run();
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyimpan event order.",
      500
    );
  }

  return successResponse({
    created: true
  }, 201);
}

export async function getOrderEvents(
  db,
  orderId,
  options = {}
) {
  const normalizedOrderId =
    parseInteger(orderId, {
      min: 1
    });

  if (!normalizedOrderId) {
    return {
      success: false,
      error: "Order tidak valid."
    };
  }

  const limit =
    Math.min(
      parseInteger(
        options.limit ?? 100,
        {
          min: 1
        }
      ) || 100,
      500
    );

  const rows =
    await db
      .prepare(`
        ${EVENT_SELECT}
        WHERE order_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .bind(
        normalizedOrderId,
        limit
      )
      .all();

  return {
    success: true,
    events:
      (rows.results || [])
        .map(normalizeEventRow)
  };
}

export async function countUserOrders(
  db,
  userId,
  options = {}
) {
  const normalizedUserId =
    parseInteger(userId, {
      min: 1
    });

  if (!normalizedUserId) {
    return 0;
  }

  const filters = [
    "user_id = ?"
  ];

  const binds = [
    normalizedUserId
  ];

  if (options.type) {
    const type =
      String(options.type)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        type,
        ALLOWED_ORDER_TYPES
      )
    ) {
      filters.push(
        "type = ?"
      );

      binds.push(type);
    }
  }

  if (options.status) {
    const status =
      normalizeStatus(
        options.status
      );

    if (
      validEnum(
        status,
        ALLOWED_STATUSES
      )
    ) {
      filters.push(
        "status = ?"
      );

      binds.push(status);
    }
  }

  const row =
    await db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM orders
        WHERE ${filters.join(" AND ")}
      `)
      .bind(...binds)
      .first();

  return Number(
    row?.total || 0
  );
}

export async function getOrderStats(
  db,
  options = {}
) {
  const filters = [];
  const binds = [];

  if (options.userId) {
    const userId =
      parseInteger(
        options.userId,
        {
          min: 1
        }
      );

    if (userId) {
      filters.push(
        "user_id = ?"
      );

      binds.push(userId);
    }
  }

  if (options.type) {
    const type =
      String(options.type)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        type,
        ALLOWED_ORDER_TYPES
      )
    ) {
      filters.push(
        "type = ?"
      );

      binds.push(type);
    }
  }

  if (options.provider) {
    const provider =
      String(options.provider)
        .trim()
        .toUpperCase();

    if (
      validEnum(
        provider,
        ALLOWED_PROVIDERS
      )
    ) {
      filters.push(
        "provider = ?"
      );

      binds.push(provider);
    }
  }

  const where =
    filters.length
      ? `WHERE ${filters.join(" AND ")}`
      : "";

  const rows =
    await db
      .prepare(`
        SELECT
          status,
          COUNT(*) AS total,
          COALESCE(
            SUM(customer_amount),
            0
          ) AS customer_amount,
          COALESCE(
            SUM(provider_amount),
            0
          ) AS provider_amount
        FROM orders
        ${where}
        GROUP BY status
        ORDER BY status ASC
      `)
      .bind(...binds)
      .all();

  const stats = {};

  for (
    const row of rows.results || []
  ) {
    stats[row.status] = {
      total:
        Number(row.total || 0),
      customer_amount:
        Number(
          row.customer_amount || 0
        ),
      provider_amount:
        Number(
          row.provider_amount || 0
        )
    };
  }

  return {
    success: true,
    stats
  };
}