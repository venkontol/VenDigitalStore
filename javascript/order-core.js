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
  CREATING: [
    "PENDING",
    "PROCESSING",
    "FAILED",
    "CANCELLED",
    "UNKNOWN"
  ],
  PENDING: [
    "PROCESSING",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ],
  PROCESSING: [
    "OTP_RECEIVED",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ],
  OTP_RECEIVED: [
    "PROCESSING",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN"
  ],
  COMPLETED: [
    "REFUNDED"
  ],
  PARTIAL: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  FAILED: [],
  UNKNOWN: [
    "PENDING",
    "PROCESSING",
    "OTP_RECEIVED",
    "COMPLETED",
    "PARTIAL",
    "FAILED",
    "CANCELLED",
    "EXPIRED"
  ]
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

  return ORDER_TYPES.has(type)
    ? type
    : null;
}

function normalizeProvider(value) {
  const provider = String(value || "")
    .trim()
    .toUpperCase();

  return PROVIDERS.has(provider)
    ? provider
    : null;
}

function normalizeRateUnit(value) {
  const rateUnit = String(value || "FIXED")
    .trim()
    .toUpperCase();

  return RATE_UNITS.has(rateUnit)
    ? rateUnit
    : null;
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

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0
  ) {
    return null;
  }

  if (!allowZero && amount <= 0) {
    return null;
  }

  return amount;
}

function safeQuantity(value) {
  const quantity = parsePositiveInteger(value);

  if (
    !quantity ||
    quantity > 100000
  ) {
    return null;
  }

  return quantity;
}

function serializeData(value) {
  if (
    value === null ||
    value === undefined
  ) {
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

  if (
    typeof value === "object"
  ) {
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
    user_id:
      row.user_id === null ||
      row.user_id === undefined
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
    provider_charge:
      row.provider_charge === null ||
      row.provider_charge === undefined
        ? null
        : Number(row.provider_charge),
    provider_currency: row.provider_currency,
    status: row.status,
    provider_status: row.provider_status,
    provider_data: parseStoredData(
      row.provider_data
    ),
    request_data: parseStoredData(
      row.request_data
    ),
    idempotency_key: row.idempotency_key,
    failure_reason: row.failure_reason,
    phone_number: row.phone_number,
    otp_code: row.otp_code,
    otp_message: row.otp_message,
    otp_received_at:
      row.otp_received_at === null ||
      row.otp_received_at === undefined
        ? null
        : Number(row.otp_received_at),
    provider_expires_at:
      row.provider_expires_at === null ||
      row.provider_expires_at === undefined
        ? null
        : Number(row.provider_expires_at),
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
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    completed_at:
      row.completed_at === null ||
      row.completed_at === undefined
        ? null
        : Number(row.completed_at),
    cancelled_at:
      row.cancelled_at === null ||
      row.cancelled_at === undefined
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
    provider_data: parseStoredData(
      row.provider_data
    ),
    created_at: Number(row.created_at)
  };
}

async function getOrderRowById(env, orderId) {
  if (!orderId) {
    return null;
  }

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `)
    .bind(orderId)
    .first();
}

async function getOrderRowByNumber(
  env,
  orderNumber
) {
  if (!orderNumber) {
    return null;
  }

  return env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE order_number = ?
      LIMIT 1
    `)
    .bind(orderNumber)
    .first();
}

async function getOrderByIdempotency(
  env,
  userId,
  idempotencyKey
) {
  if (!idempotencyKey) {
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
    .bind(
      userId,
      idempotencyKey
    )
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
  const normalizedStatus =
    normalizeStatus(status);

  if (
    !isValidStatus(
      normalizedStatus
    )
  ) {
    throw new Error(
      "Status event order tidak valid."
    );
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
      normalizedStatus,
      providerStatus === null
        ? null
        : String(providerStatus),
      message === null
        ? null
        : String(message),
      serializeData(providerData),
      nowUnix()
    )
    .run();
}

function normalizeAdapterResult(
  result
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      externalOrderId: null,
      status: "UNKNOWN",
      providerStatus: null,
      providerData: result ?? null,
      providerCharge: null,
      fields: {},
      failureReason:
        "Response provider tidak valid.",
      uncertain: true
    };
  }

  const fields =
    result.fields &&
    typeof result.fields === "object"
      ? result.fields
      : {};

  const providerCharge =
    result.providerCharge === null ||
    result.providerCharge === undefined
      ? null
      : safeMoney(
          result.providerCharge
        );

  return {
    externalOrderId:
      result.externalOrderId === null ||
      result.externalOrderId === undefined ||
      result.externalOrderId === ""
        ? null
        : String(result.externalOrderId),
    status:
      isValidStatus(result.status)
        ? normalizeStatus(result.status)
        : "UNKNOWN",
    providerStatus:
      result.providerStatus === null ||
      result.providerStatus === undefined
        ? null
        : String(result.providerStatus),
    providerData:
      result.providerData ?? null,
    providerCharge,
    fields,
    failureReason:
      result.failureReason === null ||
      result.failureReason === undefined
        ? null
        : String(result.failureReason),
    uncertain:
      result.uncertain === true
  };
}

function getField(
  fields,
  ...names
) {
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
    error?.status >= 500 ||
    error?.status === 429
  );
}

function getProviderErrorMessage(error) {
  return cleanString(
    error?.message ||
      "Provider order gagal.",
    500
  ) || "Provider order gagal.";
}

function validateAdapter(adapter) {
  if (
    !adapter ||
    typeof adapter !== "object"
  ) {
    throw new Error(
      "Provider adapter wajib diisi."
    );
  }

  if (
    typeof adapter.createOrder !==
    "function"
  ) {
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

  if (
    userId === null ||
    userId === undefined ||
    userId === ""
  ) {
    throw new Error(
      "User order wajib diisi."
    );
  }

  const type = normalizeType(
    input?.type
  );

  if (!type) {
    throw new Error(
      "Tipe order tidak valid."
    );
  }

  const provider =
    normalizeProvider(
      input?.provider
    );

  if (!provider) {
    throw new Error(
      "Provider order tidak valid."
    );
  }

  const rateUnit =
    normalizeRateUnit(
      input?.rateUnit ??
      input?.rate_unit
    );

  if (!rateUnit) {
    throw new Error(
      "Rate unit order tidak valid."
    );
  }

  const quantity =
    safeQuantity(
      input?.quantity
    );

  if (!quantity) {
    throw new Error(
      "Quantity order tidak valid."
    );
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
    throw new Error(
      "Nilai harga order tidak valid."
    );
  }

  const providerCharge =
    input?.providerCharge ??
    input?.provider_charge;

  const parsedProviderCharge =
    providerCharge === null ||
    providerCharge === undefined ||
    providerCharge === ""
      ? null
      : safeMoney(
          providerCharge
        );

  if (
    providerCharge !== null &&
    providerCharge !== undefined &&
    providerCharge !== "" &&
    parsedProviderCharge === null
  ) {
    throw new Error(
      "Provider charge tidak valid."
    );
  }

  return {
    userId: Number(userId),
    orderNumber:
      cleanString(
        input?.orderNumber ??
          input?.order_number,
        120
      ) || null,
    type,
    provider,
    externalOrderId:
      input?.externalOrderId ??
      input?.external_order_id ??
      null,
    serviceId:
      input?.serviceId ??
      input?.service_id ??
      null,
    serviceName:
      input?.serviceName ??
      input?.service_name ??
      null,
    target:
      input?.target ?? null,
    quantity,
    rateUnit,
    providerRate,
    sellingRate,
    providerAmount,
    customerAmount,
    providerCharge:
      parsedProviderCharge,
    providerCurrency:
      cleanString(
        input?.providerCurrency ??
          input?.provider_currency ??
          "IDR",
        20
      ).toUpperCase() || "IDR",
    status:
      normalizeStatus(
        input?.status ||
          "CREATING"
      ),
    providerStatus:
      input?.providerStatus ??
      input?.provider_status ??
      null,
    providerData:
      input?.providerData ??
      input?.provider_data ??
      null,
    requestData:
      input?.requestData ??
      input?.request_data ??
      null,
    idempotencyKey:
      cleanString(
        input?.idempotencyKey ??
          input?.idempotency_key,
        255
      ) || null
  };
}

async function insertOrder(
  env,
  input
) {
  const data =
    validateCreateInput(input);

  if (
    !isValidStatus(data.status)
  ) {
    throw new Error(
      "Status awal order tidak valid."
    );
  }

  const orderNumber =
    data.orderNumber ||
    generateOrderNumber("ORD");

  const timestamp = nowUnix();

  try {
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
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL,
            NULL, NULL, NULL, ?, ?, NULL, NULL
          )
        `)
        .bind(
          data.userId,
          orderNumber,
          data.type,
          data.provider,
          data.externalOrderId === null
            ? null
            : String(
                data.externalOrderId
              ),
          data.serviceId === null
            ? null
            : String(data.serviceId),
          data.serviceName === null
            ? null
            : String(data.serviceName),
          data.target === null
            ? null
            : String(data.target),
          data.quantity,
          data.rateUnit,
          data.providerRate,
          data.sellingRate,
          data.providerAmount,
          data.customerAmount,
          data.providerCharge,
          data.providerCurrency,
          data.status,
          data.providerStatus === null
            ? null
            : String(
                data.providerStatus
              ),
          serializeData(
            data.providerData
          ),
          serializeData(
            data.requestData
          ),
          data.idempotencyKey,
          timestamp,
          timestamp
        )
        .run();

    const id = Number(
      result?.meta?.last_row_id
    );

    if (!id) {
      throw new Error(
        "Gagal membuat order."
      );
    }

    await addOrderEvent(
      env,
      {
        orderId: id,
        status: data.status,
        providerStatus:
          data.providerStatus,
        providerData:
          data.providerData,
        message:
          "Order berhasil dibuat."
      }
    );

    return getOrderRowById(
      env,
      id
    );
  } catch (error) {
    if (
      data.idempotencyKey
    ) {
      const existing =
        await getOrderByIdempotency(
          env,
          data.userId,
          data.idempotencyKey
        );

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

async function updateOrderRow(
  env,
  orderId,
  changes = {}
) {
  const current =
    await getOrderRowById(
      env,
      orderId
    );

  if (!current) {
    throw new Error(
      "Order tidak ditemukan."
    );
  }

  const currentStatus =
    normalizeStatus(
      current.status
    );

  const nextStatus =
    normalizeStatus(
      changes.status ??
        currentStatus
    );

  if (
    !isValidStatus(
      nextStatus
    )
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  if (
    nextStatus !== currentStatus
  ) {
    const allowed =
      STATUS_TRANSITIONS[
        currentStatus
      ] || [];

    if (
      !allowed.includes(
        nextStatus
      )
    ) {
      throw new Error(
        `Perubahan status ${currentStatus} ke ${nextStatus} tidak diizinkan.`
      );
    }
  }

  const fields = {
    externalOrderId:
      changes.externalOrderId ??
      changes.external_order_id ??
      current.external_order_id,
    providerStatus:
      changes.providerStatus ??
      changes.provider_status ??
      current.provider_status,
    providerData:
      changes.providerData ??
      changes.provider_data ??
      current.provider_data,
    failureReason:
      changes.failureReason ??
      changes.failure_reason ??
      current.failure_reason,
    providerAmount:
      changes.providerAmount ??
      changes.provider_amount ??
      current.provider_amount,
    providerCharge:
      changes.providerCharge ??
      changes.provider_charge ??
      current.provider_charge,
    phoneNumber:
      changes.phoneNumber ??
      changes.phone_number ??
      current.phone_number,
    otpCode:
      changes.otpCode ??
      changes.otp_code ??
      current.otp_code,
    otpMessage:
      changes.otpMessage ??
      changes.otp_message ??
      current.otp_message,
    otpReceivedAt:
      changes.otpReceivedAt ??
      changes.otp_received_at ??
      current.otp_received_at,
    providerExpiresAt:
      changes.providerExpiresAt ??
      changes.provider_expires_at ??
      current.provider_expires_at,
    startCount:
      changes.startCount ??
      changes.start_count ??
      current.start_count,
    remains:
      changes.remains ??
      current.remains,
    completedAt:
      changes.completedAt ??
      changes.completed_at ??
      (
        nextStatus === "COMPLETED"
          ? (
              current.completed_at ||
              nowUnix()
            )
          : current.completed_at
      ),
    cancelledAt:
      changes.cancelledAt ??
      changes.cancelled_at ??
      (
        nextStatus === "CANCELLED"
          ? (
              current.cancelled_at ||
              nowUnix()
            )
          : current.cancelled_at
      )
  };

  const timestamp = nowUnix();

  const result =
    await env.DB
      .prepare(`
        UPDATE orders
        SET
          external_order_id = ?,
          status = ?,
          provider_status = ?,
          provider_data = ?,
          failure_reason = ?,
          provider_amount = ?,
          provider_charge = ?,
          phone_number = ?,
          otp_code = ?,
          otp_message = ?,
          otp_received_at = ?,
          provider_expires_at = ?,
          start_count = ?,
          remains = ?,
          completed_at = ?,
          cancelled_at = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        fields.externalOrderId === null
          ? null
          : String(
              fields.externalOrderId
            ),
        nextStatus,
        fields.providerStatus === null
          ? null
          : String(
              fields.providerStatus
            ),
        serializeData(
          fields.providerData
        ),
        fields.failureReason === null
          ? null
          : String(
              fields.failureReason
            ),
        safeMoney(
          fields.providerAmount
        ),
        fields.providerCharge === null ||
        fields.providerCharge === undefined
          ? null
          : safeMoney(
              fields.providerCharge
            ),
        fields.phoneNumber === null
          ? null
          : String(
              fields.phoneNumber
            ),
        fields.otpCode === null
          ? null
          : String(
              fields.otpCode
            ),
        fields.otpMessage === null
          ? null
          : String(
              fields.otpMessage
            ),
        fields.otpReceivedAt === null
          ? null
          : Number(
              fields.otpReceivedAt
            ),
        fields.providerExpiresAt === null
          ? null
          : Number(
              fields.providerExpiresAt
            ),
        fields.startCount === null
          ? null
          : Number(
              fields.startCount
            ),
        fields.remains === null
          ? null
          : Number(
              fields.remains
            ),
        fields.completedAt === null
          ? null
          : Number(
              fields.completedAt
            ),
        fields.cancelledAt === null
          ? null
          : Number(
              fields.cancelledAt
            ),
        timestamp,
        orderId
      )
      .run();

  if (
    Number(result?.meta?.changes || 0) !== 1
  ) {
    throw new Error(
      "Order gagal diperbarui."
    );
  }

  if (
    nextStatus !== currentStatus
  ) {
    await addOrderEvent(
      env,
      {
        orderId,
        status: nextStatus,
        providerStatus:
          fields.providerStatus,
        providerData:
          fields.providerData,
        message:
          fields.failureReason ||
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
  adapterResult,
  options = {}
) {
  const normalized =
    normalizeAdapterResult(
      adapterResult
    );

  const fields =
    normalized.fields;

  const nextStatus =
    normalized.status;

  return updateOrderRow(
    env,
    order.id,
    {
      status: nextStatus,
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
        ),
      completedAt:
        nextStatus === "COMPLETED"
          ? (
              order.completed_at ||
              nowUnix()
            )
          : order.completed_at,
      cancelledAt:
        nextStatus === "CANCELLED"
          ? (
              order.cancelled_at ||
              nowUnix()
            )
          : order.cancelled_at
    }
  );
}

async function refundOrder(
  env,
  order,
  message = "Refund pesanan"
) {
  const current =
    await getOrderRowById(
      env,
      order.id
    );

  if (!current) {
    throw new Error(
      "Order tidak ditemukan."
    );
  }

  if (
    normalizeStatus(
      current.status
    ) === "REFUNDED"
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
    throw new Error(
      "Nominal refund order tidak valid."
    );
  }

  const refund =
    await refundBalance(
      env,
      {
        userId:
          current.user_id,
        amount,
        reference:
          `REFUND:${current.order_number}`,
        description:
          message ||
          `Refund ${current.order_number}`,
        orderId:
          current.id
      }
    );

  if (
    refund?.success === false
  ) {
    throw new Error(
      "Refund saldo gagal."
    );
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

async function markProviderFailure(
  env,
  order,
  error,
  uncertain
) {
  const message =
    getProviderErrorMessage(
      error
    );

  if (uncertain) {
    return updateOrderRow(
      env,
      order.id,
      {
        status: "UNKNOWN",
        failureReason: message,
        providerData:
          error?.details ??
          null
      }
    );
  }

  const failed =
    await updateOrderRow(
      env,
      order.id,
      {
        status: "FAILED",
        failureReason: message,
        providerData:
          error?.details ??
          null
      }
    );

  try {
    await refundOrder(
      env,
      failed,
      `Refund order gagal: ${message}`
    );
  } catch (refundError) {
    return updateOrderRow(
      env,
      failed.id,
      {
        status: "FAILED",
        failureReason:
          `${message} Refund gagal: ${getProviderErrorMessage(refundError)}`
      }
    );
  }

  return getOrderRowById(
    env,
    failed.id
  );
}

export async function createOrder(
  env,
  {
    order,
    adapter,
    requestData = null,
    description = null
  } = {}
) {
  const providerAdapter =
    validateAdapter(
      adapter
    );

  const input = {
    ...order,
    requestData:
      requestData ??
      order?.requestData ??
      order?.request_data ??
      null,
    status: "CREATING"
  };

  const normalized =
    validateCreateInput(
      input
    );

  if (
    normalized.idempotencyKey
  ) {
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
        idempotent: true
      };
    }
  }

  const localOrder =
    await insertOrder(
      env,
      normalized
    );

  const debit =
    await debitBalance(
      env,
      {
        userId:
          localOrder.user_id,
        amount:
          localOrder.customer_amount,
        type: "PURCHASE",
        reference:
          `ORDER:${localOrder.order_number}`,
        description:
          description ||
          `Pembelian ${localOrder.order_number}`,
        orderId:
          localOrder.id
      }
    );

  if (
    debit?.success === false
  ) {
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
          order:
            localOrder,
          requestData:
            normalized.requestData,
          idempotencyKey:
            normalized.idempotencyKey
        }
      );
  } catch (error) {
    const failed =
      await markProviderFailure(
        env,
        localOrder,
        error,
        providerErrorIsUncertain(
          error
        )
      );

    return {
      order: failed,
      created: true,
      idempotent: false,
      providerCalled: true,
      uncertain:
        providerErrorIsUncertain(
          error
        )
    };
  }

  const normalizedProvider =
    normalizeAdapterResult(
      providerResult
    );

  if (
    normalizedProvider.uncertain
  ) {
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
      idempotent: false,
      providerCalled: true,
      uncertain: true
    };
  }

  if (
    !normalizedProvider.externalOrderId
  ) {
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
      idempotent: false,
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
      {
        ...normalizedProvider,
        status:
          normalizedProvider.status === "UNKNOWN"
            ? "PENDING"
            : normalizedProvider.status
      }
    );

  return {
    order: applied,
    created: true,
    idempotent: false,
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
        userId
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
        userId
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
    validateAdapter(
      adapter
    );

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
    throw new Error(
      "Order tidak ditemukan."
    );
  }

  if (
    !order.external_order_id
  ) {
    return {
      order,
      synced: false,
      reason:
        "External order ID belum tersedia."
    };
  }

  if (
    isFinalStatus(
      order.status
    )
  ) {
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
    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            getProviderErrorMessage(
              error
            ),
          providerData:
            error?.details ??
            null
        }
      );

    return {
      order: updated,
      synced: false,
      uncertain:
        providerErrorIsUncertain(
          error
        )
    };
  }

  const normalized =
    normalizeAdapterResult(
      providerResult
    );

  if (
    normalized.uncertain
  ) {
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

  if (
    normalizeStatus(
      updated.status
    ) === "FAILED"
  ) {
    try {
      await refundOrder(
        env,
        updated,
        "Refund otomatis karena order gagal."
      );
    } catch {
      return {
        order: updated,
        synced: true,
        refundFailed: true
      };
    }
  }

  if (
    [
      "CANCELLED",
      "EXPIRED"
    ].includes(
      normalizeStatus(
        updated.status
      )
    )
  ) {
    try {
      const current =
        await getOrderRowById(
          env,
          updated.id
        );

      if (
        current &&
        normalizeStatus(
          current.status
        ) !== "REFUNDED"
      ) {
        await refundOrder(
          env,
          current,
          "Refund otomatis karena order berakhir."
        );
      }
    } catch {
      return {
        order: updated,
        synced: true,
        refundFailed: true
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
    validateAdapter(
      adapter
    );

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
    throw new Error(
      "Order tidak ditemukan."
    );
  }

  const status =
    normalizeStatus(
      order.status
    );

  if (
    status === "REFUNDED"
  ) {
    return {
      order,
      cancelled: false,
      refunded: true
    };
  }

  if (
    FINAL_STATUSES.has(
      status
    )
  ) {
    throw new Error(
      `Order ${status} tidak dapat dibatalkan.`
    );
  }

  if (
    !order.external_order_id
  ) {
    const cancelled =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "CANCELLED",
          failureReason:
            reason
        }
      );

    const refund =
      await refundOrder(
        env,
        cancelled,
        "Refund order yang dibatalkan."
      );

    return {
      order:
        refund.order,
      cancelled: true,
      refunded:
        refund.refunded
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
    const uncertain =
      providerErrorIsUncertain(
        error
      );

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status: "UNKNOWN",
          failureReason:
            getProviderErrorMessage(
              error
            ),
          providerData:
            error?.details ??
            null
        }
      );

    return {
      order: updated,
      cancelled: false,
      uncertain
    };
  }

  const normalized =
    normalizeAdapterResult(
      providerResult
    );

  if (
    normalized.uncertain
  ) {
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
            normalized.status === "UNKNOWN"
              ? "UNKNOWN"
              : normalized.status,
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
    order:
      refund.order,
    cancelled: true,
    refunded:
      refund.refunded,
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
    throw new Error(
      "Order tidak ditemukan."
    );
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

  return (
    result?.results || []
  ).map(
    formatEvent
  );
}

export async function listOrdersByUser(
  env,
  userId,
  {
    status = "",
    type = "",
    limit = 20,
    offset = 0
  } = {}
) {
  const safeLimit =
    Math.min(
      Math.max(
        parsePositiveInteger(
          limit
        ) || 20,
        1
      ),
      100
    );

  const safeOffset =
    Math.max(
      Number(offset) || 0,
      0
    );

  const normalizedStatus =
    normalizeStatus(
      status
    );

  const normalizedType =
    normalizeType(
      type
    );

  if (
    normalizedStatus &&
    !isValidStatus(
      normalizedStatus
    )
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  if (
    type &&
    !normalizedType
  ) {
    throw new Error(
      "Tipe order tidak valid."
    );
  }

  let query = `
    SELECT *
    FROM orders
    WHERE user_id = ?
  `;

  const params = [
    userId
  ];

  if (
    normalizedStatus
  ) {
    query +=
      " AND status = ?";
    params.push(
      normalizedStatus
    );
  }

  if (
    normalizedType
  ) {
    query +=
      " AND type = ?";
    params.push(
      normalizedType
    );
  }

  query += `
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(
    safeLimit,
    safeOffset
  );

  const rows =
    await env.DB
      .prepare(query)
      .bind(...params)
      .all();

  let countQuery = `
    SELECT COUNT(*) AS total
    FROM orders
    WHERE user_id = ?
  `;

  const countParams = [
    userId
  ];

  if (
    normalizedStatus
  ) {
    countQuery +=
      " AND status = ?";
    countParams.push(
      normalizedStatus
    );
  }

  if (
    normalizedType
  ) {
    countQuery +=
      " AND type = ?";
    countParams.push(
      normalizedType
    );
  }

  const count =
    await env.DB
      .prepare(countQuery)
      .bind(...countParams)
      .first();

  return {
    orders:
      rows?.results || [],
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total:
        Number(
          count?.total || 0
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
    limit = 50,
    offset = 0
  } = {}
) {
  const safeLimit =
    Math.min(
      Math.max(
        parsePositiveInteger(
          limit
        ) || 50,
        1
      ),
      200
    );

  const safeOffset =
    Math.max(
      Number(offset) || 0,
      0
    );

  const normalizedStatus =
    status
      ? normalizeStatus(status)
      : "";

  const normalizedType =
    type
      ? normalizeType(type)
      : "";

  const normalizedProvider =
    provider
      ? normalizeProvider(provider)
      : "";

  if (
    normalizedStatus &&
    !isValidStatus(
      normalizedStatus
    )
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  if (
    type &&
    !normalizedType
  ) {
    throw new Error(
      "Tipe order tidak valid."
    );
  }

  if (
    provider &&
    !normalizedProvider
  ) {
    throw new Error(
      "Provider order tidak valid."
    );
  }

  let query = `
    SELECT
      orders.*,
      users.username,
      users.first_name
    FROM orders
    INNER JOIN users
      ON users.id = orders.user_id
    WHERE 1 = 1
  `;

  const params = [];

  if (
    normalizedStatus
  ) {
    query +=
      " AND orders.status = ?";
    params.push(
      normalizedStatus
    );
  }

  if (
    normalizedType
  ) {
    query +=
      " AND orders.type = ?";
    params.push(
      normalizedType
    );
  }

  if (
    normalizedProvider
  ) {
    query +=
      " AND orders.provider = ?";
    params.push(
      normalizedProvider
    );
  }

  if (
    userId !== null &&
    userId !== undefined &&
    userId !== ""
  ) {
    query +=
      " AND orders.user_id = ?";
    params.push(
      userId
    );
  }

  query += `
    ORDER BY orders.id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(
    safeLimit,
    safeOffset
  );

  const rows =
    await env.DB
      .prepare(query)
      .bind(...params)
      .all();

  let countQuery = `
    SELECT COUNT(*) AS total
    FROM orders
    WHERE 1 = 1
  `;

  const countParams = [];

  if (
    normalizedStatus
  ) {
    countQuery +=
      " AND status = ?";
    countParams.push(
      normalizedStatus
    );
  }

  if (
    normalizedType
  ) {
    countQuery +=
      " AND type = ?";
    countParams.push(
      normalizedType
    );
  }

  if (
    normalizedProvider
  ) {
    countQuery +=
      " AND provider = ?";
    countParams.push(
      normalizedProvider
    );
  }

  if (
    userId !== null &&
    userId !== undefined &&
    userId !== ""
  ) {
    countQuery +=
      " AND user_id = ?";
    countParams.push(
      userId
    );
  }

  const total =
    await env.DB
      .prepare(countQuery)
      .bind(...countParams)
      .first();

  return {
    orders:
      rows?.results || [],
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total:
        Number(
          total?.total || 0
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
  if (
    id
  ) {
    if (
      userId !== null &&
      userId !== undefined
    ) {
      return getUserOrder(
        env,
        userId,
        {
          id
        }
      );
    }

    return getOrderRowById(
      env,
      id
    );
  }

  if (
    orderNumber
  ) {
    if (
      userId !== null &&
      userId !== undefined
    ) {
      return getUserOrder(
        env,
        userId,
        {
          orderNumber
        }
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
  env
) {
  try {
    const auth =
      await requireAuth(
        request,
        env
      );

    if (
      auth?.response
    ) {
      return auth.response;
    }

    const url =
      new URL(
        request.url
      );

    const method =
      request.method
        .toUpperCase();

    const path =
      url.pathname
        .split("/")
        .filter(Boolean);

    if (
      method === "GET"
    ) {
      const id =
        parsePositiveInteger(
          url.searchParams.get(
            "id"
          )
        );

      const orderNumber =
        cleanString(
          url.searchParams.get(
            "order_number"
          ),
          120
        );

      if (
        id ||
        orderNumber
      ) {
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
            formatOrder(
              order
            )
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
            limit:
              url.searchParams.get(
                "limit"
              ) || 20,
            offset:
              url.searchParams.get(
                "offset"
              ) || 0
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
      method === "DELETE" ||
      method === "POST"
    ) {
      const body =
        request.method === "POST"
          ? await request
              .json()
              .catch(
                () => ({})
              )
          : {};

      const id =
        parsePositiveInteger(
          body.id ??
            body.order_id ??
            url.searchParams.get(
              "id"
            )
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

      if (
        typeof env.ORDER_ADAPTER_RESOLVER !==
        "function"
      ) {
        return errorResponse(
          "Provider adapter resolver belum dikonfigurasi.",
          500
        );
      }

      const adapter =
        await env.ORDER_ADAPTER_RESOLVER(
          order.provider
        );

      const result =
        await cancelOrder(
          env,
          {
            orderId:
              order.id,
            adapter
          }
        );

      return successResponse({
        order:
          formatOrder(
            result.order
          ),
        cancelled:
          result.cancelled,
        refunded:
          result.refunded || false,
        uncertain:
          result.uncertain || false
      });
    }

    return errorResponse(
      "Method order tidak didukung.",
      405
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memproses order.",
      error?.status ||
        500
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

    if (
      auth?.response
    ) {
      return auth.response;
    }

    const data =
      body === undefined
        ? await request
            .json()
            .catch(
              () => ({})
            )
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

    if (
      !id &&
      !orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

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

    const nextStatus =
      normalizeStatus(
        data.status
      );

    if (
      !isValidStatus(
        nextStatus
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    if (
      nextStatus === "REFUNDED"
    ) {
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
          status:
            nextStatus,
          failureReason:
            data.failure_reason ??
            data.failureReason ??
            order.failure_reason
        }
      );

    return successResponse({
      order:
        formatOrder(
          updated
        ),
      message:
        "Status order berhasil diperbarui."
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal memperbarui status order.",
      error?.status ||
        500
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

    if (
      auth?.response
    ) {
      return auth.response;
    }

    const data =
      body === undefined
        ? await request
            .json()
            .catch(
              () => ({})
            )
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

    if (
      !id &&
      !orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

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
      error?.status ||
        500
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
