import {
  cleanString,
  parsePositiveInteger,
  nowUnix,
  generateOrderNumber,
  jsonResponse,
  errorResponse,
  successResponse
} from "./utils.js";

import {
  requireAuth,
  requireAdmin
} from "./auth.js";

import {
  debitBalance,
  refundBalance
} from "./wallet.js";

const ORDER_TYPES = new Set([
  "NOKOS",
  "SOCIAL"
]);

const PROVIDERS = new Set([
  "SMSCODE",
  "BUZZERPANEL"
]);

const RATE_UNITS = new Set([
  "FIXED",
  "PER_1000"
]);

const ORDER_STATUSES = new Set([
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED",
  "COMPLETED",
  "PARTIAL",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
  "UNKNOWN"
]);

const FINAL_STATUSES = new Set([
  "COMPLETED",
  "PARTIAL",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

const STATUS_TRANSITIONS = {
  CREATING: new Set([
    "PENDING",
    "PROCESSING",
    "FAILED",
    "CANCELLED",
    "UNKNOWN"
  ]),
  PENDING: new Set([
    "PROCESSING",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ]),
  PROCESSING: new Set([
    "OTP_RECEIVED",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ]),
  OTP_RECEIVED: new Set([
    "PROCESSING",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ]),
  COMPLETED: new Set([
    "REFUNDED"
  ]),
  PARTIAL: new Set(),
  CANCELLED: new Set(),
  EXPIRED: new Set(),
  REFUNDED: new Set(),
  FAILED: new Set(),
  UNKNOWN: new Set([
    "PENDING",
    "PROCESSING",
    "OTP_RECEIVED",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED"
  ])
};

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeType(value) {
  const type = String(value || "")
    .trim()
    .toUpperCase();

  return ORDER_TYPES.has(type) ? type : null;
}

function normalizeProvider(value) {
  const provider = String(value || "")
    .trim()
    .toUpperCase();

  return PROVIDERS.has(provider) ? provider : null;
}

function normalizeRateUnit(value) {
  const rateUnit = String(value || "FIXED")
    .trim()
    .toUpperCase();

  return RATE_UNITS.has(rateUnit) ? rateUnit : null;
}

function isValidStatus(value) {
  return ORDER_STATUSES.has(
    normalizeStatus(value)
  );
}

function isFinalStatus(value) {
  return FINAL_STATUSES.has(
    normalizeStatus(value)
  );
}

function safeMoney(value, allowZero = true) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount)) {
    return null;
  }

  if (amount < 0) {
    return null;
  }

  if (!allowZero && amount === 0) {
    return null;
  }

  return amount;
}

function safeQuantity(value) {
  const quantity = parsePositiveInteger(value);

  if (!quantity || quantity > 100000) {
    return null;
  }

  return quantity;
}

function serializeData(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseStoredData(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    user_id: row.user_id == null
      ? null
      : Number(row.user_id),
    order_number: row.order_number,
    type: row.type,
    provider: row.provider,
    external_order_id: row.external_order_id,
    service_id: row.service_id,
    service_name: row.service_name,
    target: row.target,
    quantity: Number(row.quantity || 0),
    rate_unit: row.rate_unit,
    provider_rate: Number(row.provider_rate || 0),
    selling_rate: Number(row.selling_rate || 0),
    provider_amount: Number(row.provider_amount || 0),
    customer_amount: Number(row.customer_amount || 0),
    provider_charge: row.provider_charge == null
      ? null
      : Number(row.provider_charge),
    provider_currency: row.provider_currency,
    status: row.status,
    provider_status: row.provider_status,
    provider_data: parseStoredData(row.provider_data),
    request_data: parseStoredData(row.request_data),
    idempotency_key: row.idempotency_key,
    failure_reason: row.failure_reason,
    phone_number: row.phone_number,
    otp_code: row.otp_code,
    otp_message: row.otp_message,
    otp_received_at: row.otp_received_at == null
      ? null
      : Number(row.otp_received_at),
    provider_expires_at: row.provider_expires_at == null
      ? null
      : Number(row.provider_expires_at),
    start_count: row.start_count == null
      ? null
      : Number(row.start_count),
    remains: row.remains == null
      ? null
      : Number(row.remains),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    completed_at: row.completed_at == null
      ? null
      : Number(row.completed_at),
    cancelled_at: row.cancelled_at == null
      ? null
      : Number(row.cancelled_at)
  };
}

function formatEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    order_id: Number(row.order_id),
    status: row.status,
    provider_status: row.provider_status,
    message: row.message,
    provider_data: parseStoredData(row.provider_data),
    created_at: Number(row.created_at)
  };
}

async function getOrderRowById(env, orderId) {
  const id = parsePositiveInteger(orderId);

  if (!id) {
    return null;
  }

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

async function getOrderRowByNumber(env, orderNumber) {
  const number = cleanString(orderNumber, 120);

  if (!number) {
    return null;
  }

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE order_number = ?
      LIMIT 1
    `)
    .bind(number)
    .first();
}

async function getOrderByIdempotency(
  env,
  userId,
  idempotencyKey
) {
  const key = cleanString(idempotencyKey, 255);

  if (!key) {
    return null;
  }

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE user_id = ?
        AND idempotency_key = ?
      LIMIT 1
    `)
    .bind(userId, key)
    .first();
}

async function addOrderEvent(
  env,
  {
    orderId,
    status,
    providerStatus = null,
    message = null,
    providerData = null
  }
) {
  const normalized = normalizeStatus(status);

  if (!isValidStatus(normalized)) {
    throw new Error("Status event order tidak valid.");
  }

  return env.DB
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
      orderId,
      normalized,
      providerStatus == null
        ? null
        : String(providerStatus),
      message == null
        ? null
        : String(message),
      serializeData(providerData),
      nowUnix()
    )
    .run();
}

function normalizeAdapterResult(result) {
  if (!result || typeof result !== "object") {
    return {
      externalOrderId: null,
      status: "UNKNOWN",
      providerStatus: null,
      providerData: result ?? null,
      providerCharge: null,
      fields: {},
      failureReason: "Response provider tidak valid.",
      uncertain: true
    };
  }

  const fields =
    result.fields &&
    typeof result.fields === "object"
      ? result.fields
      : {};

  const providerCharge =
    result.providerCharge == null
      ? null
      : safeMoney(result.providerCharge);

  return {
    externalOrderId:
      result.externalOrderId == null ||
      result.externalOrderId === ""
        ? null
        : String(result.externalOrderId),

    status: isValidStatus(result.status)
      ? normalizeStatus(result.status)
      : "UNKNOWN",

    providerStatus:
      result.providerStatus == null
        ? null
        : String(result.providerStatus),

    providerData:
      result.providerData ?? null,

    providerCharge,

    fields,

    failureReason:
      result.failureReason == null
        ? null
        : String(result.failureReason),

    uncertain:
      result.uncertain === true
  };
}

function getField(fields, ...names) {
  for (const name of names) {
    if (
      fields[name] !== undefined &&
      fields[name] !== null &&
      fields[name] !== ""
    ) {
      return fields[name];
    }
  }

  return null;
}

function providerErrorIsUncertain(error) {
  return (
    error?.uncertain === true ||
    Number(error?.status) >= 500 ||
    Number(error?.status) === 429
  );
}

function providerErrorMessage(error) {
  return cleanString(
    error?.message || "Provider order gagal.",
    500
  ) || "Provider order gagal.";
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("Provider adapter wajib diisi.");
  }

  if (typeof adapter.createOrder !== "function") {
    throw new Error(
      "Provider adapter tidak memiliki createOrder."
    );
  }

  return adapter;
}

function validateCreateInput(input) {
  const userId =
    input?.userId ??
    input?.user_id;

  const numericUserId =
    parsePositiveInteger(userId);

  if (!numericUserId) {
    throw new Error("User order wajib diisi.");
  }

  const type =
    normalizeType(input?.type);

  if (!type) {
    throw new Error("Tipe order tidak valid.");
  }

  const provider =
    normalizeProvider(input?.provider);

  if (!provider) {
    throw new Error("Provider order tidak valid.");
  }

  const rateUnit =
    normalizeRateUnit(
      input?.rateUnit ??
      input?.rate_unit
    );

  if (!rateUnit) {
    throw new Error("Rate unit order tidak valid.");
  }

  const quantity =
    safeQuantity(input?.quantity);

  if (!quantity) {
    throw new Error("Quantity order tidak valid.");
  }

  const providerRate =
    safeMoney(
      input?.providerRate ??
      input?.provider_rate
    );

  const sellingRate =
    safeMoney(
      input?.sellingRate ??
      input?.selling_rate
    );

  const providerAmount =
    safeMoney(
      input?.providerAmount ??
      input?.provider_amount
    );

  const customerAmount =
    safeMoney(
      input?.customerAmount ??
      input?.customer_amount
    );

  if (
    providerRate === null ||
    sellingRate === null ||
    providerAmount === null ||
    customerAmount === null
  ) {
    throw new Error("Nilai harga order tidak valid.");
  }

  if (customerAmount <= 0) {
    throw new Error("Nominal order tidak valid.");
  }

  const providerCharge =
    input?.providerCharge ??
    input?.provider_charge;

  const parsedProviderCharge =
    providerCharge == null ||
    providerCharge === ""
      ? null
      : safeMoney(providerCharge);

  if (
    providerCharge != null &&
    providerCharge !== "" &&
    parsedProviderCharge === null
  ) {
    throw new Error("Provider charge tidak valid.");
  }

  const orderNumber =
    cleanString(
      input?.orderNumber ??
      input?.order_number,
      120
    ) || null;

  const serviceId =
    input?.serviceId ??
    input?.service_id ??
    null;

  const serviceName =
    cleanString(
      input?.serviceName ??
      input?.service_name,
      255
    ) || null;

  const target =
    input?.target == null
      ? null
      : cleanString(input.target, 2000);

  const idempotencyKey =
    cleanString(
      input?.idempotencyKey ??
      input?.idempotency_key,
      255
    ) || null;

  return {
    userId: numericUserId,
    orderNumber,
    type,
    provider,
    externalOrderId:
      input?.externalOrderId ??
      input?.external_order_id ??
      null,
    serviceId:
      serviceId == null
        ? null
        : String(serviceId),
    serviceName,
    target,
    quantity,
    rateUnit,
    providerRate,
    sellingRate,
    providerAmount,
    customerAmount,
    providerCharge: parsedProviderCharge,
    providerCurrency:
      cleanString(
        input?.providerCurrency ??
        input?.provider_currency ??
        "IDR",
        20
      ).toUpperCase() || "IDR",
    requestData:
      input?.requestData ??
      input?.request_data ??
      null,
    idempotencyKey
  };
}

async function insertOrder(env, input) {
  const data =
    validateCreateInput(input);

  let orderNumber =
    data.orderNumber;

  if (!orderNumber) {
    orderNumber =
      generateOrderNumber();
  }

  const now =
    nowUnix();

  const result =
    await env.DB
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
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'CREATING', NULL, NULL, ?, ?, NULL, ?, ?
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
        serializeData(data.requestData),
        data.idempotencyKey,
        now,
        now
      )
      .run();

  if (
    Number(result?.meta?.changes || 0) !== 1
  ) {
    throw new Error("Order gagal dibuat.");
  }

  const id =
    Number(result.meta?.last_row_id || 0);

  if (!id) {
    throw new Error(
      "Order berhasil dibuat tetapi ID tidak ditemukan."
    );
  }

  await addOrderEvent(
    env,
    {
      orderId: id,
      status: "CREATING",
      message: "Order dibuat."
    }
  );

  return getOrderRowById(
    env,
    id
  );
}

function canTransition(current, next) {
  const from =
    normalizeStatus(current);

  const to =
    normalizeStatus(next);

  if (from === to) {
    return true;
  }

  return (
    STATUS_TRANSITIONS[from]?.has(to) === true
  );
}

async function updateOrderRow(
  env,
  orderId,
  patch = {}
) {
  const current =
    await getOrderRowById(
      env,
      orderId
    );

  if (!current) {
    throw new Error("Order tidak ditemukan.");
  }

  const nextStatus =
    patch.status == null
      ? normalizeStatus(current.status)
      : normalizeStatus(patch.status);

  if (!isValidStatus(nextStatus)) {
    throw new Error("Status order tidak valid.");
  }

  const currentStatus =
    normalizeStatus(current.status);

  if (
    !canTransition(
      currentStatus,
      nextStatus
    )
  ) {
    throw new Error(
      `Transisi status ${currentStatus} ke ${nextStatus} tidak diizinkan.`
    );
  }

  const values = [];
  const sets = [];

  const add = (column, value) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.status !== undefined) {
    add("status", nextStatus);
  }

  if (patch.externalOrderId !== undefined) {
    add(
      "external_order_id",
      patch.externalOrderId == null
        ? null
        : String(patch.externalOrderId)
    );
  }

  if (patch.providerStatus !== undefined) {
    add(
      "provider_status",
      patch.providerStatus == null
        ? null
        : String(patch.providerStatus)
    );
  }

  if (patch.providerData !== undefined) {
    add(
      "provider_data",
      serializeData(patch.providerData)
    );
  }

  if (patch.failureReason !== undefined) {
    add(
      "failure_reason",
      patch.failureReason == null
        ? null
        : String(patch.failureReason)
    );
  }

  if (patch.providerCharge !== undefined) {
    const charge =
      patch.providerCharge == null
        ? null
        : safeMoney(patch.providerCharge);

    if (
      patch.providerCharge != null &&
      charge === null
    ) {
      throw new Error("Provider charge tidak valid.");
    }

    add("provider_charge", charge);
  }

  const fields = [
    ["phoneNumber", "phone_number"],
    ["otpCode", "otp_code"],
    ["otpMessage", "otp_message"],
    ["otpReceivedAt", "otp_received_at"],
    ["providerExpiresAt", "provider_expires_at"],
    ["startCount", "start_count"],
    ["remains", "remains"]
  ];

  for (const [key, column] of fields) {
    if (patch[key] !== undefined) {
      add(column, patch[key]);
    }
  }

  if (nextStatus === "COMPLETED") {
    if (!current.completed_at) {
      add("completed_at", nowUnix());
    }
  }

  if (nextStatus === "CANCELLED") {
    if (!current.cancelled_at) {
      add("cancelled_at", nowUnix());
    }
  }

  add("updated_at", nowUnix());

  if (!sets.length) {
    return current;
  }

  values.push(orderId);

  const result =
    await env.DB
      .prepare(`
        UPDATE orders
        SET ${sets.join(", ")}
        WHERE id = ?
      `)
      .bind(...values)
      .run();

  if (
    Number(result?.meta?.changes || 0) !== 1
  ) {
    throw new Error("Order gagal diperbarui.");
  }

  if (nextStatus !== currentStatus) {
    await addOrderEvent(
      env,
      {
        orderId,
        status: nextStatus,
        providerStatus:
          patch.providerStatus ??
          current.provider_status,
        providerData:
          patch.providerData ??
          current.provider_data,
        message:
          patch.failureReason ||
          `Status order menjadi ${nextStatus}.`
      }
    );
  }

  return getOrderRowById(
    env,
    orderId
  );
}

async function applyProviderResult(
  env,
  order,
  result
) {
  const normalized =
    normalizeAdapterResult(result);

  const fields =
    normalized.fields;

  let status =
    normalized.status;

  if (status === "UNKNOWN" && normalized.externalOrderId) {
    status = "PENDING";
  }

  const next =
    await updateOrderRow(
      env,
      order.id,
      {
        status,
        externalOrderId:
          normalized.externalOrderId ??
          order.external_order_id,
        providerStatus:
          normalized.providerStatus,
        providerData:
          normalized.providerData,
        providerCharge:
          normalized.providerCharge ??
          order.provider_charge,
        failureReason:
          normalized.failureReason,
        phoneNumber:
          getField(
            fields,
            "phoneNumber",
            "phone_number"
          ),
        otpCode:
          getField(
            fields,
            "otpCode",
            "otp_code"
          ),
        otpMessage:
          getField(
            fields,
            "otpMessage",
            "otp_message"
          ),
        otpReceivedAt:
          getField(
            fields,
            "otpReceivedAt",
            "otp_received_at"
          ),
        providerExpiresAt:
          getField(
            fields,
            "providerExpiresAt",
            "provider_expires_at"
          ),
        startCount:
          getField(
            fields,
            "startCount",
            "start_count"
          ),
        remains:
          getField(
            fields,
            "remains"
          )
      }
    );

  return next;
}

async function refundOrder(
  env,
  order,
  message = "Refund pesanan."
) {
  const current =
    await getOrderRowById(
      env,
      order.id
    );

  if (!current) {
    throw new Error("Order tidak ditemukan.");
  }

  if (
    normalizeStatus(current.status) ===
    "REFUNDED"
  ) {
    return {
      order: current,
      refunded: false,
      alreadyRefunded: true
    };
  }

  const amount =
    safeMoney(
      current.customer_amount,
      false
    );

  if (amount === null) {
    throw new Error("Nominal refund tidak valid.");
  }

  const refund =
    await refundBalance(
      env,
      {
        userId: current.user_id,
        amount,
        reference:
          `REFUND:${current.order_number}`,
        description:
          message,
        orderId:
          current.id
      }
    );

  if (refund?.success === false) {
    throw new Error("Refund saldo gagal.");
  }

  const refunded =
    await updateOrderRow(
      env,
      current.id,
      {
        status: "REFUNDED",
        failureReason: null
      }
    );

  return {
    order: refunded,
    refunded: true,
    alreadyRefunded: false
  };
}

async function failAndRefund(
  env,
  order,
  message
) {
  const failed =
    await updateOrderRow(
      env,
      order.id,
      {
        status: "FAILED",
        failureReason: message
      }
    );

  try {
    return await refundOrder(
      env,
      failed,
      `Refund otomatis: ${message}`
    );
  } catch (refundError) {
    const updated =
      await updateOrderRow(
        env,
        failed.id,
        {
          status: "FAILED",
          failureReason:
            `${message} Refund gagal: ${providerErrorMessage(refundError)}`
        }
      );

    return {
      order: updated,
      refunded: false,
      refundFailed: true
    };
  }
}

export async function createOrder(
  env,
  input = {}
) {
  const adapter =
    input.adapter;

  const orderInput =
    input.order &&
    typeof input.order === "object"
      ? {
          ...input.order,
          requestData:
            input.requestData ??
            input.order.requestData
        }
      : input;

  const providerAdapter =
    validateAdapter(adapter);

  const normalized =
    validateCreateInput(
      orderInput
    );

  if (normalized.idempotencyKey) {
    const existing =
      await getOrderByIdempotency(
        env,
        normalized.userId,
        normalized.idempotencyKey
      );

    if (existing) {
      return {
        order: existing,
        created: false,
        idempotent: true,
        providerCalled: false
      };
    }
  }

  let localOrder;

  try {
    localOrder =
      await insertOrder(
        env,
        normalized
      );
  } catch (error) {
    if (normalized.idempotencyKey) {
      const existing =
        await getOrderByIdempotency(
          env,
          normalized.userId,
          normalized.idempotencyKey
        );

      if (existing) {
        return {
          order: existing,
          created: false,
          idempotent: true,
          providerCalled: false
        };
      }
    }

    throw error;
  }

  const debit =
    await debitBalance(
      env,
      {
        userId:
          localOrder.user_id,
        amount:
          localOrder.customer_amount,
        type:
          "PURCHASE",
        reference:
          `ORDER:${localOrder.order_number}`,
        description:
          input.description ||
          `Pembelian ${localOrder.order_number}`,
        orderId:
          localOrder.id
      }
    );

  if (debit?.success === false) {
    const failed =
      await updateOrderRow(
        env,
        localOrder.id,
        {
          status: "FAILED",
          failureReason:
            debit.insufficient
              ? "Saldo tidak mencukupi."
              : "Debit saldo gagal."
        }
      );

    return {
      order: failed,
      created: true,
      idempotent: false,
      providerCalled: false,
      insufficient:
        debit.insufficient === true
    };
  }

  let providerResult;

  try {
    providerResult =
      await providerAdapter.createOrder(
        env,
        {
          order: localOrder,
          requestData:
            normalized.requestData,
          idempotencyKey:
            normalized.idempotencyKey
        }
      );
  } catch (error) {
    const uncertain =
      providerErrorIsUncertain(error);

    if (uncertain) {
      const unknown =
        await updateOrderRow(
          env,
          localOrder.id,
          {
            status: "UNKNOWN",
            failureReason:
              providerErrorMessage(error),
            providerData:
              error?.details ??
              null
          }
        );

      return {
        order: unknown,
        created: true,
        providerCalled: true,
        uncertain: true
      };
    }

    const result =
      await failAndRefund(
        env,
        localOrder,
        providerErrorMessage(error)
      );

    return {
      order: result.order,
      created: true,
      providerCalled: true,
      refunded:
        result.refunded || false,
      refundFailed:
        result.refundFailed || false,
      uncertain: false
    };
  }

  const normalizedProvider =
    normalizeAdapterResult(
      providerResult
    );

  if (normalizedProvider.uncertain) {
    const unknown =
      await updateOrderRow(
        env,
        localOrder.id,
        {
          status: "UNKNOWN",
          externalOrderId:
            normalizedProvider.externalOrderId,
          providerStatus:
            normalizedProvider.providerStatus,
          providerData:
            normalizedProvider.providerData,
          providerCharge:
            normalizedProvider.providerCharge,
          failureReason:
            normalizedProvider.failureReason ||
            "Hasil provider tidak dapat dipastikan."
        }
      );

    return {
      order: unknown,
      created: true,
      providerCalled: true,
      uncertain: true
    };
  }

  if (!normalizedProvider.externalOrderId) {
    const unknown =
      await updateOrderRow(
        env,
        localOrder.id,
        {
          status: "UNKNOWN",
          providerStatus:
            normalizedProvider.providerStatus,
          providerData:
            normalizedProvider.providerData,
          providerCharge:
            normalizedProvider.providerCharge,
          failureReason:
            normalizedProvider.failureReason ||
            "Provider tidak mengembalikan external order ID."
        }
      );

    return {
      order: unknown,
      created: true,
      providerCalled: true,
      uncertain: true
    };
  }

  const current =
    await getOrderRowById(
      env,
      localOrder.id
    );

  const applied =
    await applyProviderResult(
      env,
      current,
      normalizedProvider
    );

  if (
    normalizeStatus(applied.status) ===
    "FAILED"
  ) {
    const refund =
      await refundOrder(
        env,
        applied,
        "Refund otomatis karena order gagal."
      );

    return {
      order: refund.order,
      created: true,
      providerCalled: true,
      refunded:
        refund.refunded
    };
  }

  return {
    order: applied,
    created: true,
    providerCalled: true,
    uncertain: false
  };
}

export async function getOrderById(
  env,
  orderId
) {
  return getOrderRowById(
    env,
    orderId
  );
}

export async function getOrderByNumber(
  env,
  orderNumber
) {
  return getOrderRowByNumber(
    env,
    orderNumber
  );
}

export async function getUserOrder(
  env,
  userId,
  {
    id = null,
    orderNumber = ""
  } = {}
) {
  const numericUserId =
    parsePositiveInteger(userId);

  if (!numericUserId) {
    return null;
  }

  if (id) {
    return env.DB
      .prepare(`
        SELECT *
        FROM orders
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `)
      .bind(
        id,
        numericUserId
      )
      .first();
  }

  if (orderNumber) {
    return env.DB
      .prepare(`
        SELECT *
        FROM orders
        WHERE order_number = ?
          AND user_id = ?
        LIMIT 1
      `)
      .bind(
        orderNumber,
        numericUserId
      )
      .first();
  }

  return null;
}

export async function findOrderByIdempotency(
  env,
  userId,
  idempotencyKey
) {
  return getOrderByIdempotency(
    env,
    userId,
    idempotencyKey
  );
}

export async function updateOrderStatus(
  env,
  orderId,
  status,
  options = {}
) {
  return updateOrderRow(
    env,
    orderId,
    {
      ...options,
      status
    }
  );
}

export async function syncOrder(
  env,
  {
    orderId,
    adapter
  } = {}
) {
  const providerAdapter =
    validateAdapter(adapter);

  if (
    typeof providerAdapter.getStatus !==
    "function"
  ) {
    throw new Error(
      "Provider adapter tidak memiliki getStatus."
    );
  }

  const order =
    await getOrderRowById(
      env,
      orderId
    );

  if (!order) {
    throw new Error("Order tidak ditemukan.");
  }

  if (!order.external_order_id) {
    return {
      order,
      synced: false,
      reason:
        "External order ID belum tersedia."
    };
  }

  if (isFinalStatus(order.status)) {
    return {
      order,
      synced: false,
      final: true
    };
  }

  let providerResult;

  try {
    providerResult =
      await providerAdapter.getStatus(
        env,
        {
          order
        }
      );
  } catch (error) {
    const uncertain =
      providerErrorIsUncertain(error);

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            providerErrorMessage(error),
          providerData:
            error?.details ??
            null
        }
      );

    return {
      order: updated,
      synced: false,
      uncertain
    };
  }

  const normalized =
    normalizeAdapterResult(
      providerResult
    );

  if (normalized.uncertain) {
    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          providerStatus:
            normalized.providerStatus,
          providerData:
            normalized.providerData,
          providerCharge:
            normalized.providerCharge,
          failureReason:
            normalized.failureReason ||
            "Status provider tidak dapat dipastikan."
        }
      );

    return {
      order: updated,
      synced: true,
      uncertain: true
    };
  }

  const updated =
    await applyProviderResult(
      env,
      order,
      normalized
    );

  const status =
    normalizeStatus(updated.status);

  if (
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  ) {
    try {
      const refund =
        await refundOrder(
          env,
          updated,
          `Refund otomatis karena status ${status}.`
        );

      return {
        order: refund.order,
        synced: true,
        refunded:
          refund.refunded,
        uncertain: false
      };
    } catch (error) {
      return {
        order: updated,
        synced: true,
        refundFailed: true,
        uncertain: false
      };
    }
  }

  return {
    order:
      await getOrderRowById(
        env,
        updated.id
      ),
    synced: true,
    uncertain: false
  };
}

export async function cancelOrder(
  env,
  {
    orderId,
    adapter,
    reason = "Order dibatalkan."
  } = {}
) {
  const providerAdapter =
    validateAdapter(adapter);

  if (
    typeof providerAdapter.cancelOrder !==
    "function"
  ) {
    throw new Error(
      "Provider adapter tidak memiliki cancelOrder."
    );
  }

  const order =
    await getOrderRowById(
      env,
      orderId
    );

  if (!order) {
    throw new Error("Order tidak ditemukan.");
  }

  const status =
    normalizeStatus(order.status);

  if (status === "REFUNDED") {
    return {
      order,
      cancelled: false,
      refunded: true
    };
  }

  if (isFinalStatus(status)) {
    throw new Error(
      `Order ${status} tidak dapat dibatalkan.`
    );
  }

  if (!order.external_order_id) {
    const cancelled =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "CANCELLED",
          failureReason: reason
        }
      );

    const refund =
      await refundOrder(
        env,
        cancelled,
        "Refund order yang dibatalkan."
      );

    return {
      order: refund.order,
      cancelled: true,
      refunded: refund.refunded
    };
  }

  let providerResult;

  try {
    providerResult =
      await providerAdapter.cancelOrder(
        env,
        {
          order
        }
      );
  } catch (error) {
    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            providerErrorMessage(error),
          providerData:
            error?.details ??
            null
        }
      );

    return {
      order: updated,
      cancelled: false,
      uncertain:
        providerErrorIsUncertain(error)
    };
  }

  const normalized =
    normalizeAdapterResult(
      providerResult
    );

  if (normalized.uncertain) {
    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          providerStatus:
            normalized.providerStatus,
          providerData:
            normalized.providerData,
          providerCharge:
            normalized.providerCharge,
          failureReason:
            normalized.failureReason ||
            "Cancel provider tidak dapat dipastikan."
        }
      );

    return {
      order: updated,
      cancelled: false,
      uncertain: true
    };
  }

  if (
    normalized.status !==
    "CANCELLED"
  ) {
    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            normalized.status,
          providerStatus:
            normalized.providerStatus,
          providerData:
            normalized.providerData,
          providerCharge:
            normalized.providerCharge,
          failureReason:
            normalized.failureReason ||
            "Provider tidak mengonfirmasi pembatalan."
        }
      );

    return {
      order: updated,
      cancelled: false,
      uncertain:
        normalized.status === "UNKNOWN"
    };
  }

  const cancelled =
    await updateOrderRow(
      env,
      order.id,
      {
        status: "CANCELLED",
        externalOrderId:
          normalized.externalOrderId ??
          order.external_order_id,
        providerStatus:
          normalized.providerStatus,
        providerData:
          normalized.providerData,
        providerCharge:
          normalized.providerCharge,
        failureReason:
          normalized.failureReason ||
          reason
      }
    );

  const refund =
    await refundOrder(
      env,
      cancelled,
      "Refund order yang berhasil dibatalkan."
    );

  return {
    order: refund.order,
    cancelled: true,
    refunded: refund.refunded,
    uncertain: false
  };
}

export async function refundExistingOrder(
  env,
  orderId,
  message = "Order direfund."
) {
  const order =
    await getOrderRowById(
      env,
      orderId
    );

  if (!order) {
    throw new Error("Order tidak ditemukan.");
  }

  return refundOrder(
    env,
    order,
    message
  );
}

export async function getOrderEvents(
  env,
  orderId
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          order_id,
          status,
          provider_status,
          message,
          provider_data,
          created_at
        FROM order_events
        WHERE order_id = ?
        ORDER BY id ASC
      `)
      .bind(orderId)
      .all();

  return (result?.results || [])
    .map(formatEvent);
}

export async function listOrdersByUser(
  env,
  userId,
  {
    status = "",
    type = "",
    provider = "",
    limit = 20,
    page = 1,
    offset = null
  } = {}
) {
  const numericUserId =
    parsePositiveInteger(userId);

  if (!numericUserId) {
    throw new Error("User tidak valid.");
  }

  const safeLimit =
    Math.min(
      Math.max(
        parsePositiveInteger(limit) || 20,
        1
      ),
      100
    );

  const safePage =
    Math.max(
      parsePositiveInteger(page) || 1,
      1
    );

  const safeOffset =
    offset == null
      ? (safePage - 1) * safeLimit
      : Math.max(
          Number(offset) || 0,
          0
        );

  const normalizedStatus =
    normalizeStatus(status);

  const normalizedType =
    normalizeType(type);

  const normalizedProvider =
    normalizeProvider(provider);

  if (
    normalizedStatus &&
    !isValidStatus(normalizedStatus)
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  if (type && !normalizedType) {
    throw new Error(
      "Tipe order tidak valid."
    );
  }

  if (provider && !normalizedProvider) {
    throw new Error(
      "Provider order tidak valid."
    );
  }

  let where = `
    WHERE user_id = ?
  `;

  const params = [
    numericUserId
  ];

  if (normalizedStatus) {
    where += " AND status = ?";
    params.push(normalizedStatus);
  }

  if (normalizedType) {
    where += " AND type = ?";
    params.push(normalizedType);
  }

  if (normalizedProvider) {
    where += " AND provider = ?";
    params.push(normalizedProvider);
  }

  const count =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM orders
        ${where}
      `)
      .bind(...params)
      .first();

  const rows =
    await env.DB
      .prepare(`
        SELECT *
        FROM orders
        ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `)
      .bind(
        ...params,
        safeLimit,
        safeOffset
      )
      .all();

  const total =
    Number(count?.total || 0);

  return {
    orders:
      rows?.results || [],
    pagination: {
      page: safePage,
      limit: safeLimit,
      offset: safeOffset,
      total,
      total_pages:
        total === 0
          ? 0
          : Math.ceil(
              total / safeLimit
            )
    }
  };
}

export async function adminGetOrders(
  env,
  {
    status = "",
    type = "",
    provider = "",
    userId = null,
    limit = 20,
    page = 1,
    offset = null
  } = {}
) {
  const safeLimit =
    Math.min(
      Math.max(
        parsePositiveInteger(limit) || 20,
        1
      ),
      100
    );

  const safePage =
    Math.max(
      parsePositiveInteger(page) || 1,
      1
    );

  const safeOffset =
    offset == null
      ? (safePage - 1) * safeLimit
      : Math.max(
          Number(offset) || 0,
          0
        );

  const normalizedStatus =
    normalizeStatus(status);

  const normalizedType =
    normalizeType(type);

  const normalizedProvider =
    normalizeProvider(provider);

  if (
    normalizedStatus &&
    !isValidStatus(normalizedStatus)
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  if (type && !normalizedType) {
    throw new Error(
      "Tipe order tidak valid."
    );
  }

  if (provider && !normalizedProvider) {
    throw new Error(
      "Provider order tidak valid."
    );
  }

  let where = "WHERE 1 = 1";
  const params = [];

  if (normalizedStatus) {
    where += " AND status = ?";
    params.push(normalizedStatus);
  }

  if (normalizedType) {
    where += " AND type = ?";
    params.push(normalizedType);
  }

  if (normalizedProvider) {
    where += " AND provider = ?";
    params.push(normalizedProvider);
  }

  const numericUserId =
    userId == null
      ? null
      : parsePositiveInteger(userId);

  if (userId != null && !numericUserId) {
    throw new Error("User ID tidak valid.");
  }

  if (numericUserId) {
    where += " AND user_id = ?";
    params.push(numericUserId);
  }

  const count =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM orders
        ${where}
      `)
      .bind(...params)
      .first();

  const rows =
    await env.DB
      .prepare(`
        SELECT *
        FROM orders
        ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `)
      .bind(
        ...params,
        safeLimit,
        safeOffset
      )
      .all();

  const total =
    Number(count?.total || 0);

  return {
    orders:
      rows?.results || [],
    pagination: {
      page: safePage,
      limit: safeLimit,
      offset: safeOffset,
      total,
      total_pages:
        total === 0
          ? 0
          : Math.ceil(
              total / safeLimit
            )
    }
  };
}

export async function getOrder(
  env,
  {
    id = null,
    orderNumber = "",
    userId = null
  } = {}
) {
  if (id) {
    if (userId != null) {
      return getUserOrder(
        env,
        userId,
        { id }
      );
    }

    return getOrderRowById(
      env,
      id
    );
  }

  if (orderNumber) {
    if (userId != null) {
      return getUserOrder(
        env,
        userId,
        { orderNumber }
      );
    }

    return getOrderRowByNumber(
      env,
      orderNumber
    );
  }

  return null;
}

export async function handleOrders(
  request,
  env,
  adapterResolver = null
) {
  try {
    const auth =
      await requireAuth(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const url =
      new URL(request.url);

    const method =
      request.method.toUpperCase();

    if (method === "GET") {
      const id =
        parsePositiveInteger(
          url.searchParams.get("id")
        );

      const orderNumber =
        cleanString(
          url.searchParams.get(
            "order_number"
          ),
          120
        );

      if (id || orderNumber) {
        const order =
          await getUserOrder(
            env,
            auth.user.id,
            {
              id,
              orderNumber
            }
          );

        if (!order) {
          return errorResponse(
            "Order tidak ditemukan.",
            404
          );
        }

        return successResponse({
          order:
            formatOrder(order)
        });
      }

      const result =
        await listOrdersByUser(
          env,
          auth.user.id,
          {
            status:
              url.searchParams.get(
                "status"
              ) || "",
            type:
              url.searchParams.get(
                "type"
              ) || "",
            provider:
              url.searchParams.get(
                "provider"
              ) || "",
            limit:
              url.searchParams.get(
                "limit"
              ) || 20,
            page:
              url.searchParams.get(
                "page"
              ) || 1
          }
        );

      return successResponse({
        orders:
          result.orders.map(
            formatOrder
          ),
        pagination:
          result.pagination
      });
    }

    if (
      method !== "POST" &&
      method !== "DELETE"
    ) {
      return errorResponse(
        "Method order tidak didukung.",
        405
      );
    }

    if (typeof adapterResolver !== "function") {
      return errorResponse(
        "Provider adapter resolver belum dikonfigurasi.",
        500
      );
    }

    const body =
      method === "POST"
        ? await request
            .json()
            .catch(() => ({}))
        : {};

    const id =
      parsePositiveInteger(
        body.id ??
        body.order_id ??
        url.searchParams.get("id")
      );

    const orderNumber =
      cleanString(
        body.order_number ??
        body.orderNumber ??
        url.searchParams.get(
          "order_number"
        ),
        120
      );

    const order =
      await getUserOrder(
        env,
        auth.user.id,
        {
          id,
          orderNumber
        }
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const adapter =
      await adapterResolver(
        order.provider
      );

    const result =
      await cancelOrder(
        env,
        {
          orderId:
            order.id,
          adapter,
          reason:
            body.reason ||
            "Order dibatalkan."
        }
      );

    return successResponse({
      order:
        formatOrder(
          result.order
        ),
      cancelled:
        result.cancelled || false,
      refunded:
        result.refunded || false,
      uncertain:
        result.uncertain || false
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal memproses order.",
      Number(error?.status) || 500
    );
  }
}

export async function adminUpdateOrderStatus(
  request,
  env,
  body = undefined
) {
  try {
    const auth =
      await requireAdmin(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const data =
      body === undefined
        ? await request
            .json()
            .catch(() => ({}))
        : body;

    const id =
      parsePositiveInteger(
        data.id ??
        data.order_id
      );

    const orderNumber =
      cleanString(
        data.order_number ??
        data.orderNumber,
        120
      );

    const order =
      id
        ? await getOrderRowById(
            env,
            id
          )
        : await getOrderRowByNumber(
            env,
            orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const status =
      normalizeStatus(
        data.status
      );

    if (!isValidStatus(status)) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    if (status === "REFUNDED") {
      const result =
        await refundOrder(
          env,
          order,
          cleanString(
            data.message ||
            "Order direfund oleh admin.",
            500
          )
        );

      return successResponse({
        order:
          formatOrder(
            result.order
          ),
        refunded:
          result.refunded,
        already_refunded:
          result.alreadyRefunded
      });
    }

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status,
          failureReason:
            data.failure_reason ??
            data.failureReason ??
            order.failure_reason
        }
      );

    return successResponse({
      order:
        formatOrder(updated),
      message:
        "Status order berhasil diperbarui."
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal memperbarui status order.",
      Number(error?.status) || 500
    );
  }
}

export async function adminRefundOrder(
  request,
  env,
  body = undefined
) {
  try {
    const auth =
      await requireAdmin(
        request,
        env
      );

    if (auth?.response) {
      return auth.response;
    }

    const data =
      body === undefined
        ? await request
            .json()
            .catch(() => ({}))
        : body;

    const id =
      parsePositiveInteger(
        data.id ??
        data.order_id
      );

    const orderNumber =
      cleanString(
        data.order_number ??
        data.orderNumber,
        120
      );

    const order =
      id
        ? await getOrderRowById(
            env,
            id
          )
        : await getOrderRowByNumber(
            env,
            orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const result =
      await refundOrder(
        env,
        order,
        cleanString(
          data.message ||
          "Order direfund oleh admin.",
          500
        )
      );

    return successResponse({
      order:
        formatOrder(
          result.order
        ),
      refunded:
        result.refunded,
      already_refunded:
        result.alreadyRefunded
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
      "Gagal melakukan refund order.",
      Number(error?.status) || 500
    );
  }
}

export {
  ORDER_TYPES,
  PROVIDERS,
  RATE_UNITS,
  ORDER_STATUSES,
  FINAL_STATUSES,
  STATUS_TRANSITIONS,
  normalizeStatus,
  normalizeType,
  normalizeProvider,
  normalizeRateUnit,
  isValidStatus,
  isFinalStatus,
  formatOrder,
  formatEvent,
  addOrderEvent,
  updateOrderRow,
  applyProviderResult,
  refundOrder
};
