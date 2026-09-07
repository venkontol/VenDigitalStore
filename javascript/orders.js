import {
  cleanString,
  parsePositiveInteger,
  nowUnix,
  readJson,
  successResponse,
  errorResponse,
  generateOrderNumber
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
  "SOSMED",
  "DEPOSIT",
  "PRODUCT",
  "OTHER"
]);

const ORDER_STATUSES = new Set([
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED",
  "UNKNOWN"
]);

const FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

function normalizeStatus(value) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}

function normalizeOrderType(value) {
  const type =
    String(
      value || "OTHER"
    )
      .trim()
      .toUpperCase();

  return ORDER_TYPES.has(type)
    ? type
    : "OTHER";
}

function validStatus(value) {
  return ORDER_STATUSES.has(
    normalizeStatus(value)
  );
}

function isFinalStatus(value) {
  return FINAL_STATUSES.has(
    normalizeStatus(value)
  );
}

function safeMoney(value) {
  const amount =
    Number(value);

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount < 0
  ) {
    return null;
  }

  return amount;
}

function safeQuantity(value) {
  const quantity =
    parsePositiveInteger(
      value
    );

  if (
    !quantity ||
    quantity > 100000
  ) {
    return null;
  }

  return quantity;
}

function formatOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),
    user_id:
      row.user_id === null ||
      row.user_id === undefined
        ? null
        : Number(row.user_id),
    order_number:
      row.order_number,
    type:
      row.type,
    provider:
      row.provider,
    external_order_id:
      row.external_order_id,
    service_id:
      row.service_id,
    service_name:
      row.service_name,
    target:
      row.target,
    quantity:
      Number(
        row.quantity || 0
      ),
    rate_unit:
      row.rate_unit,
    provider_rate:
      Number(
        row.provider_rate || 0
      ),
    selling_rate:
      Number(
        row.selling_rate || 0
      ),
    provider_amount:
      Number(
        row.provider_amount || 0
      ),
    customer_amount:
      Number(
        row.customer_amount || 0
      ),
    provider_charge:
      row.provider_charge === null ||
      row.provider_charge === undefined
        ? null
        : Number(
            row.provider_charge
          ),
    provider_currency:
      row.provider_currency,
    status:
      row.status,
    provider_status:
      row.provider_status,
    provider_data:
      row.provider_data,
    request_data:
      row.request_data,
    idempotency_key:
      row.idempotency_key,
    failure_reason:
      row.failure_reason,
    phone_number:
      row.phone_number,
    otp_code:
      row.otp_code,
    otp_message:
      row.otp_message,
    otp_received_at:
      row.otp_received_at,
    provider_expires_at:
      row.provider_expires_at,
    start_count:
      row.start_count,
    remains:
      row.remains,
    created_at:
      row.created_at,
    updated_at:
      row.updated_at,
    completed_at:
      row.completed_at,
    cancelled_at:
      row.cancelled_at
  };
}

function formatEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),
    order_id:
      Number(row.order_id),
    status:
      row.status,
    provider_status:
      row.provider_status,
    message:
      row.message,
    provider_data:
      row.provider_data,
    created_at:
      row.created_at
  };
}

function getOrderIdentifier(
  request,
  body = null
) {
  const url =
    new URL(
      request.url
    );

  const path =
    url.pathname
      .split("/")
      .filter(Boolean);

  const queryId =
    parsePositiveInteger(
      url.searchParams.get(
        "id"
      )
    );

  const bodyId =
    parsePositiveInteger(
      body?.id ??
      body?.order_id ??
      body?.orderId
    );

  const queryNumber =
    cleanString(
      url.searchParams.get(
        "order_number"
      ),
      120
    );

  const bodyNumber =
    cleanString(
      body?.order_number ??
      body?.orderNumber,
      120
    );

  let pathIdentifier =
    null;

  if (
    path[0] === "api" &&
    path[1] === "orders" &&
    path[2]
  ) {
    pathIdentifier =
      path[2];
  }

  const pathId =
    pathIdentifier &&
    /^\d+$/.test(
      pathIdentifier
    )
      ? parsePositiveInteger(
          pathIdentifier
        )
      : null;

  const pathNumber =
    pathIdentifier &&
    !/^\d+$/.test(
      pathIdentifier
    )
      ? cleanString(
          pathIdentifier,
          120
        )
      : "";

  return {
    id:
      queryId ||
      bodyId ||
      pathId ||
      null,
    orderNumber:
      queryNumber ||
      bodyNumber ||
      pathNumber ||
      ""
  };
}

async function getOrderRowById(
  env,
  orderId
) {
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
    .bind(
      orderId
    )
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
    .bind(
      orderNumber
    )
    .first();
}

async function getUserOrderRow(
  env,
  userId,
  {
    id = null,
    orderNumber = ""
  } = {}
) {
  if (
    id
  ) {
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

  if (
    orderNumber
  ) {
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

async function getOrderByIdempotencyKey(
  env,
  userId,
  idempotencyKey
) {
  if (
    !idempotencyKey
  ) {
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

async function getOrderEvents(
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
      .bind(
        orderId
      )
      .all();

  return Array.isArray(
    result?.results
  )
    ? result.results
    : [];
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
  const normalized =
    normalizeStatus(
      status
    );

  if (
    !normalized
  ) {
    return null;
  }

  const result =
    await env.DB
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
        providerStatus
          ? String(
              providerStatus
            )
          : null,
        message
          ? String(
              message
            )
          : null,
        providerData
          ? String(
              providerData
            )
          : null,
        nowUnix()
      )
      .run();

  return result;
}

async function updateOrderRow(
  env,
  orderId,
  {
    status,
    providerStatus,
    providerData,
    failureReason,
    externalOrderId,
    providerAmount,
    providerCharge,
    phoneNumber,
    otpCode,
    otpMessage,
    otpReceivedAt,
    providerExpiresAt,
    startCount,
    remains,
    completedAt,
    cancelledAt
  } = {}
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

  const nextStatus =
    status !== undefined
      ? normalizeStatus(
          status
        )
      : normalizeStatus(
          current.status
        );

  if (
    !validStatus(
      nextStatus
    )
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  const values = {
    externalOrderId:
      externalOrderId !== undefined
        ? externalOrderId
        : current.external_order_id,

    providerStatus:
      providerStatus !== undefined
        ? providerStatus
        : current.provider_status,

    providerData:
      providerData !== undefined
        ? providerData
        : current.provider_data,

    failureReason:
      failureReason !== undefined
        ? failureReason
        : current.failure_reason,

    providerAmount:
      providerAmount !== undefined
        ? providerAmount
        : current.provider_amount,

    providerCharge:
      providerCharge !== undefined
        ? providerCharge
        : current.provider_charge,

    phoneNumber:
      phoneNumber !== undefined
        ? phoneNumber
        : current.phone_number,

    otpCode:
      otpCode !== undefined
        ? otpCode
        : current.otp_code,

    otpMessage:
      otpMessage !== undefined
        ? otpMessage
        : current.otp_message,

    otpReceivedAt:
      otpReceivedAt !== undefined
        ? otpReceivedAt
        : current.otp_received_at,

    providerExpiresAt:
      providerExpiresAt !== undefined
        ? providerExpiresAt
        : current.provider_expires_at,

    startCount:
      startCount !== undefined
        ? startCount
        : current.start_count,

    remains:
      remains !== undefined
        ? remains
        : current.remains,

    completedAt:
      completedAt !== undefined
        ? completedAt
        : current.completed_at,

    cancelledAt:
      cancelledAt !== undefined
        ? cancelledAt
        : current.cancelled_at
  };

  const timestamp =
    nowUnix();

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
        values.externalOrderId,
        nextStatus,
        values.providerStatus,
        values.providerData,
        values.failureReason,
        values.providerAmount,
        values.providerCharge,
        values.phoneNumber,
        values.otpCode,
        values.otpMessage,
        values.otpReceivedAt,
        values.providerExpiresAt,
        values.startCount,
        values.remains,
        values.completedAt,
        values.cancelledAt,
        timestamp,
        orderId
      )
      .run();

  if (
    Number(
      result?.meta?.changes || 0
    ) !== 1
  ) {
    throw new Error(
      "Order gagal diperbarui."
    );
  }

  await addOrderEvent(
    env,
    {
      orderId,
      status:
        nextStatus,
      providerStatus:
        values.providerStatus,
      message:
        values.failureReason ||
        `Status order menjadi ${nextStatus}.`,
      providerData:
        values.providerData
    }
  );

  return getOrderRowById(
    env,
    orderId
  );
}

async function createOrderRecord(
  env,
  {
    userId,
    orderNumber = null,
    type = "OTHER",
    provider = null,
    externalOrderId = null,
    serviceId = null,
    serviceName = null,
    target = null,
    quantity = 1,
    rateUnit = "FIXED",
    providerRate = 0,
    sellingRate = 0,
    providerAmount = 0,
    customerAmount = 0,
    providerCharge = null,
    providerCurrency = "IDR",
    status = "PENDING",
    providerStatus = null,
    providerData = null,
    requestData = null,
    idempotencyKey = null
  }
) {
  const normalizedType =
    normalizeOrderType(
      type
    );

  const normalizedStatus =
    normalizeStatus(
      status
    );

  const parsedQuantity =
    safeQuantity(
      quantity
    );

  const parsedProviderRate =
    safeMoney(
      providerRate
    );

  const parsedSellingRate =
    safeMoney(
      sellingRate
    );

  const parsedProviderAmount =
    safeMoney(
      providerAmount
    );

  const parsedCustomerAmount =
    safeMoney(
      customerAmount
    );

  if (
    !userId
  ) {
    throw new Error(
      "userId wajib diisi."
    );
  }

  if (
    !parsedQuantity
  ) {
    throw new Error(
      "Quantity order tidak valid."
    );
  }

  if (
    parsedProviderRate === null ||
    parsedSellingRate === null ||
    parsedProviderAmount === null ||
    parsedCustomerAmount === null
  ) {
    throw new Error(
      "Nilai harga order tidak valid."
    );
  }

  if (
    !validStatus(
      normalizedStatus
    )
  ) {
    throw new Error(
      "Status order tidak valid."
    );
  }

  const finalOrderNumber =
    cleanString(
      orderNumber,
      120
    ) ||
    generateOrderNumber(
      "ORD"
    );

  const timestamp =
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
          ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, ?, ?, NULL, NULL
        )
      `)
      .bind(
        Number(userId),
        finalOrderNumber,
        normalizedType,
        provider
          ? String(
              provider
            )
          : null,
        externalOrderId !== null
          ? String(
              externalOrderId
            )
          : null,
        serviceId !== null
          ? String(
              serviceId
            )
          : null,
        serviceName !== null
          ? String(
              serviceName
            )
          : null,
        target !== null
          ? String(
              target
            )
          : null,
        parsedQuantity,
        rateUnit
          ? String(
              rateUnit
            )
          : "FIXED",
        parsedProviderRate,
        parsedSellingRate,
        parsedProviderAmount,
        parsedCustomerAmount,
        providerCharge === null ||
        providerCharge === undefined
          ? null
          : safeMoney(
              providerCharge
            ),
        providerCurrency
          ? String(
              providerCurrency
            ).toUpperCase()
          : "IDR",
        normalizedStatus,
        providerStatus !== null
          ? String(
              providerStatus
            )
          : null,
        providerData !== null
          ? String(
              providerData
            )
          : null,
        requestData !== null
          ? String(
              requestData
            )
          : null,
        idempotencyKey !== null
          ? String(
              idempotencyKey
            )
          : null,
        timestamp,
        timestamp
      )
      .run();

  const id =
    Number(
      result?.meta?.last_row_id
    );

  if (
    !id
  ) {
    throw new Error(
      "Gagal membuat order."
    );
  }

  await addOrderEvent(
    env,
    {
      orderId:
        id,
      status:
        normalizedStatus,
      message:
        "Order berhasil dibuat."
    }
  );

  return getOrderRowById(
    env,
    id
  );
}

export async function createOrderRecordPublic(
  env,
  options
) {
  return createOrderRecord(
    env,
    options
  );
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
  return getUserOrderRow(
    env,
    userId,
    {
      id,
      orderNumber
    }
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
      Number(
        offset
      ) || 0,
      0
    );

  let query = `
    SELECT *
    FROM orders
    WHERE user_id = ?
  `;

  const params = [
    userId
  ];

  const normalizedStatus =
    normalizeStatus(
      status
    );

  if (
    normalizedStatus
  ) {
    if (
      !validStatus(
        normalizedStatus
      )
    ) {
      throw new Error(
        "Status order tidak valid."
      );
    }

    query +=
      " AND status = ?";

    params.push(
      normalizedStatus
    );
  }

  const normalizedType =
    String(
      type || ""
    )
      .trim()
      .toUpperCase();

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
      .bind(
        ...params
      )
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
      .prepare(
        countQuery
      )
      .bind(
        ...countParams
      )
      .first();

  return {
    orders:
      Array.isArray(
        rows?.results
      )
        ? rows.results
        : [],
    pagination: {
      limit:
        safeLimit,
      offset:
        safeOffset,
      total:
        Number(
          count?.total || 0
        )
    }
  };
}

export async function getOrders(
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

    const limit =
      Math.min(
        Math.max(
          parsePositiveInteger(
            url.searchParams.get(
              "limit"
            )
          ) || 20,
          1
        ),
        100
      );

    const offset =
      Math.max(
        Number(
          url.searchParams.get(
            "offset"
          )
        ) || 0,
        0
      );

    const result =
      await listOrdersByUser(
        env,
        auth.user.id,
        {
          status:
            url.searchParams.get(
              "status"
            ),
          type:
            url.searchParams.get(
              "type"
            ),
          limit,
          offset
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
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil order.",
      error?.status || 500
    );
  }
}

export async function getOrder(
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

    const identifier =
      getOrderIdentifier(
        request
      );

    if (
      !identifier.id &&
      !identifier.orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const order =
      await getUserOrderRow(
        env,
        auth.user.id,
        identifier
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const events =
      await getOrderEvents(
        env,
        order.id
      );

    return successResponse({
      order:
        formatOrder(
          order
        ),
      events:
        events.map(
          formatEvent
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil detail order.",
      error?.status || 500
    );
  }
}

export async function createOrder(
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

    const body =
      await readJson(
        request
      );

    const type =
      normalizeOrderType(
        body?.type ??
        body?.order_type
      );

    const provider =
      cleanString(
        body?.provider,
        100
      ) || null;

    const serviceId =
      body?.service_id ??
      body?.serviceId ??
      body?.product_id ??
      null;

    const serviceName =
      cleanString(
        body?.service_name ??
        body?.serviceName ??
        body?.name ??
        "",
        255
      ) || null;

    const target =
      cleanString(
        body?.target ??
        body?.data ??
        "",
        1000
      ) || null;

    const quantity =
      safeQuantity(
        body?.quantity ??
        1
      );

    if (
      !quantity
    ) {
      return errorResponse(
        "Quantity order tidak valid.",
        400
      );
    }

    const providerRate =
      safeMoney(
        body?.provider_rate ??
        body?.providerRate ??
        body?.provider_cost ??
        0
      );

    const sellingRate =
      safeMoney(
        body?.selling_rate ??
        body?.sellingRate ??
        body?.price ??
        body?.unit_price ??
        0
      );

    if (
      providerRate === null ||
      sellingRate === null
    ) {
      return errorResponse(
        "Harga order tidak valid.",
        400
      );
    }

    const providerAmount =
      safeMoney(
        body?.provider_amount ??
        body?.providerAmount ??
        providerRate *
          quantity
      );

    const customerAmount =
      safeMoney(
        body?.customer_amount ??
        body?.customerAmount ??
        sellingRate *
          quantity
      );

    if (
      providerAmount === null ||
      customerAmount === null ||
      customerAmount <= 0
    ) {
      return errorResponse(
        "Total order tidak valid.",
        400
      );
    }

    const idempotencyKey =
      cleanString(
        body?.idempotency_key ??
        body?.idempotencyKey ??
        "",
        150
      ) || null;

    if (
      idempotencyKey
    ) {
      const existing =
        await getOrderByIdempotencyKey(
          env,
          auth.user.id,
          idempotencyKey
        );

      if (
        existing
      ) {
        return successResponse({
          idempotent:
            true,
          order:
            formatOrder(
              existing
            )
        });
      }
    }

    const order =
      await createOrderRecord(
        env,
        {
          userId:
            auth.user.id,
          type,
          provider,
          externalOrderId:
            body?.external_order_id ??
            null,
          serviceId,
          serviceName,
          target,
          quantity,
          rateUnit:
            cleanString(
              body?.rate_unit ??
              body?.rateUnit ??
              "FIXED",
              50
            ),
          providerRate,
          sellingRate,
          providerAmount,
          customerAmount,
          providerCharge:
            body?.provider_charge ??
            body?.providerCharge ??
            null,
          providerCurrency:
            body?.provider_currency ??
            body?.providerCurrency ??
            "IDR",
          status:
            normalizeStatus(
              body?.status ||
              "PENDING"
            ),
          providerStatus:
            body?.provider_status ??
            body?.providerStatus ??
            null,
          providerData:
            body?.provider_data ??
            body?.providerData ??
            null,
          requestData:
            JSON.stringify(
              body
            ),
          idempotencyKey
        }
      );

    let debit;

    try {
      debit =
        await debitBalance(
          env,
          {
            userId:
              auth.user.id,
            amount:
              customerAmount,
            type:
              "PURCHASE",
            reference:
              `ORDER:${order.order_number}`,
            description:
              `Pembelian ${order.order_number}`,
            orderId:
              order.id
          }
        );
    } catch (error) {
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            "FAILED",
          failureReason:
            error?.message ||
            "Pembayaran order gagal."
        }
      );

      throw error;
    }

    if (
      debit?.insufficient ||
      debit?.success === false
    ) {
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            "FAILED",
          failureReason:
            "Saldo tidak mencukupi."
        }
      );

      return errorResponse(
        "Saldo tidak mencukupi.",
        402
      );
    }

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            "PROCESSING"
        }
      );

    return successResponse({
      order:
        formatOrder(
          updated
        )
    }, 201);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membuat order.",
      error?.status || 500
    );
  }
}

export async function cancelOrder(
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

    const body =
      await readJson(
        request
      );

    const identifier =
      getOrderIdentifier(
        request,
        body
      );

    if (
      !identifier.id &&
      !identifier.orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const order =
      await getUserOrderRow(
        env,
        auth.user.id,
        identifier
      );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const currentStatus =
      normalizeStatus(
        order.status
      );

    if (
      currentStatus ===
      "CANCELLED"
    ) {
      return successResponse({
        order:
          formatOrder(
            order
          ),
        message:
          "Order sudah dibatalkan."
      });
    }

    if (
      isFinalStatus(
        currentStatus
      )
    ) {
      return errorResponse(
        "Order sudah berada pada status akhir.",
        400
      );
    }

    const amount =
      Number(
        order.customer_amount || 0
      );

    const refund =
      await refundBalance(
        env,
        {
          userId:
            auth.user.id,
          amount,
          reference:
            `REFUND:${order.order_number}`,
          description:
            `Refund ${order.order_number}`,
          orderId:
            order.id
        }
      );

    if (
      refund?.success === false
    ) {
      return errorResponse(
        "Order belum dibatalkan karena refund saldo gagal.",
        500
      );
    }

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            "CANCELLED",
          failureReason:
            null,
          cancelledAt:
            nowUnix()
        }
      );

    return successResponse({
      order:
        formatOrder(
          updated
        ),
      refunded:
        true,
      message:
        "Order berhasil dibatalkan dan saldo dikembalikan."
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membatalkan order.",
      error?.status || 500
    );
  }
}

async function refundOrderRow(
  env,
  order,
  message
) {
  const status =
    normalizeStatus(
      order.status
    );

  if (
    status ===
    "REFUNDED"
  ) {
    return {
      order,
      refunded:
        false,
      alreadyRefunded:
        true
    };
  }

  if (
    status !==
    "COMPLETED"
  ) {
    throw new Error(
      "Hanya order COMPLETED yang dapat direfund."
    );
  }

  const amount =
    Number(
      order.customer_amount || 0
    );

  if (
    !Number.isSafeInteger(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Nominal refund tidak valid."
    );
  }

  const refund =
    await refundBalance(
      env,
      {
        userId:
          order.user_id,
        amount,
        reference:
          `REFUND:${order.order_number}`,
        description:
          message ||
          `Refund ${order.order_number}`,
        orderId:
          order.id
      }
    );

  if (
    refund?.success === false
  ) {
    throw new Error(
      "Refund saldo gagal."
    );
  }

  const updated =
    await updateOrderRow(
      env,
      order.id,
      {
        status:
          "REFUNDED",
        failureReason:
          null
      }
    );

  return {
    order:
      updated,
    refunded:
      true,
    alreadyRefunded:
      false
  };
}

const STATUS_TRANSITIONS = {
  CREATING: [
    "PENDING",
    "PROCESSING",
    "FAILED",
    "CANCELLED"
  ],
  PENDING: [
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED"
  ],
  PROCESSING: [
    "OTP_RECEIVED",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "EXPIRED"
  ],
  OTP_RECEIVED: [
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "EXPIRED"
  ],
  COMPLETED: [
    "REFUNDED"
  ],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  FAILED: [],
  UNKNOWN: [
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "EXPIRED"
  ]
};

export async function adminGetOrders(
  request,
  env
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

    const url =
      new URL(
        request.url
      );

    const limit =
      Math.min(
        Math.max(
          parsePositiveInteger(
            url.searchParams.get(
              "limit"
            )
          ) || 50,
          1
        ),
        200
      );

    const offset =
      Math.max(
        Number(
          url.searchParams.get(
            "offset"
          )
        ) || 0,
        0
      );

    const status =
      normalizeStatus(
        url.searchParams.get(
          "status"
        )
      );

    const type =
      String(
        url.searchParams.get(
          "type"
        ) || ""
      )
        .trim()
        .toUpperCase();

    if (
      status &&
      !validStatus(
        status
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    let query = `
      SELECT
        o.*,
        u.username,
        u.first_name
      FROM orders o
      LEFT JOIN users u
        ON u.id = o.user_id
      WHERE 1 = 1
    `;

    const params = [];

    if (
      status
    ) {
      query +=
        " AND o.status = ?";

      params.push(
        status
      );
    }

    if (
      type
    ) {
      query +=
        " AND o.type = ?";

      params.push(
        type
      );
    }

    query += `
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `;

    params.push(
      limit,
      offset
    );

    const rows =
      await env.DB
        .prepare(
          query
        )
        .bind(
          ...params
        )
        .all();

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM orders
      WHERE 1 = 1
    `;

    const countParams = [];

    if (
      status
    ) {
      countQuery +=
        " AND status = ?";

      countParams.push(
        status
      );
    }

    if (
      type
    ) {
      countQuery +=
        " AND type = ?";

      countParams.push(
        type
      );
    }

    const total =
      await env.DB
        .prepare(
          countQuery
        )
        .bind(
          ...countParams
        )
        .first();

    return successResponse({
      orders:
        (
          rows?.results ||
          []
        ).map(
          row => ({
            ...formatOrder(
              row
            ),
            username:
              row.username,
            first_name:
              row.first_name
          })
        ),
      pagination: {
        limit,
        offset,
        total:
          Number(
            total?.total || 0
          )
      }
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil daftar order.",
      error?.status || 500
    );
  }
}

export async function adminUpdateOrderStatus(
  request,
  env
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

    const body =
      await readJson(
        request
      );

    const identifier =
      getOrderIdentifier(
        request,
        body
      );

    if (
      !identifier.id &&
      !identifier.orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const order =
      identifier.id
        ? await getOrderRowById(
            env,
            identifier.id
          )
        : await getOrderRowByNumber(
            env,
            identifier.orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const currentStatus =
      normalizeStatus(
        order.status
      );

    const nextStatus =
      normalizeStatus(
        body?.status
      );

    if (
      !validStatus(
        nextStatus
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    if (
      currentStatus ===
      nextStatus
    ) {
      return successResponse({
        order:
          formatOrder(
            order
          ),
        message:
          "Status order sudah sesuai."
      });
    }

    if (
      !STATUS_TRANSITIONS[
        currentStatus
      ]?.includes(
        nextStatus
      )
    ) {
      return errorResponse(
        `Perubahan status ${currentStatus} ke ${nextStatus} tidak diizinkan.`,
        400
      );
    }

    if (
      nextStatus ===
      "REFUNDED"
    ) {
      const result =
        await refundOrderRow(
          env,
          order,
          cleanString(
            body?.message ||
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
          result.refunded
      });
    }

    const timestamp =
      nowUnix();

    const updated =
      await updateOrderRow(
        env,
        order.id,
        {
          status:
            nextStatus,
          completedAt:
            nextStatus ===
            "COMPLETED"
              ? (
                  order.completed_at ||
                  timestamp
                )
              : order.completed_at,
          cancelledAt:
            nextStatus ===
            "CANCELLED"
              ? (
                  order.cancelled_at ||
                  timestamp
                )
              : order.cancelled_at,
          failureReason:
            body?.failure_reason ??
            body?.failureReason ??
            (
              nextStatus ===
              "FAILED"
                ? (
                    cleanString(
                      body?.message,
                      500
                    ) ||
                    "Order gagal."
                  )
                : order.failure_reason
            )
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
      error?.status || 500
    );
  }
}

export async function adminRefundOrder(
  request,
  env
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

    const body =
      await readJson(
        request
      );

    const identifier =
      getOrderIdentifier(
        request,
        body
      );

    if (
      !identifier.id &&
      !identifier.orderNumber
    ) {
      return errorResponse(
        "ID atau nomor order wajib diisi.",
        400
      );
    }

    const order =
      identifier.id
        ? await getOrderRowById(
            env,
            identifier.id
          )
        : await getOrderRowByNumber(
            env,
            identifier.orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order tidak ditemukan.",
        404
      );
    }

    const result =
      await refundOrderRow(
        env,
        order,
        cleanString(
          body?.message ||
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
      error?.status || 500
    );
  }
}

export async function getOrderEvents(
  env,
  orderId
) {
  return getOrderEventsInternal(
    env,
    orderId
  );
}

async function getOrderEventsInternal(
  env,
  orderId
) {
  return getOrderEvents(
    env,
    orderId
  );
}

export async function findOrderByIdempotency(
  env,
  userId,
  idempotencyKey
) {
  return getOrderByIdempotencyKey(
    env,
    userId,
    idempotencyKey
  );
}

export async function handleOrders(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const path =
    url.pathname
      .replace(
        /\/+$/,
        ""
      ) || "/";

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/orders"
  ) {
    return getOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/orders"
  ) {
    return createOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/orders/order"
  ) {
    return getOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/orders/cancel"
  ) {
    return cancelOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/orders"
  ) {
    return adminGetOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/admin/orders/status"
  ) {
    return adminUpdateOrderStatus(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/admin/orders/refund"
  ) {
    return adminRefundOrder(
      request,
      env
    );
  }

  return errorResponse(
    "Endpoint order tidak ditemukan.",
    404
  );
}

export default {
  handleOrders,
  getOrders,
  getOrder,
  createOrder,
  cancelOrder,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminRefundOrder,
  createOrderRecordPublic,
  getOrderById,
  getOrderByNumber,
  getUserOrder,
  updateOrderStatus,
  listOrdersByUser,
  getOrderEvents,
  findOrderByIdempotency
};
