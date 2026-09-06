import {
  createOrder,
  getOrderByExternalId,
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
  getCurrentUser,
  requireAdmin,
  requireAuth
} from "./auth.js";

import {
  cancelOrder as cancelProviderOrder,
  createOrder as createProviderOrder,
  finishOrder as finishProviderOrder,
  getOrder as getProviderOrder,
  getProducts,
  resendOrder as resendProviderOrder,
  mapStatus as mapProviderStatus
} from "./smscode.js";

import {
  cleanString,
  errorResponse,
  generateOrderNumber,
  getPagination,
  jsonResponse,
  nowUnix,
  parseInteger,
  parseJson,
  readJson,
  successResponse
} from "./utils.js";

const NOKOS_TYPE = "NOKOS";
const NOKOS_PROVIDER = "SMSCODE";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ACTIVE_STATUSES = new Set([
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED",
  "PARTIAL",
  "UNKNOWN
]);

const ACTIONABLE_STATUSES = new Set([
  "CREATING",
  "PENDING",
  "PROCESSING",
  "OTP_RECEIVED",
  "PARTIAL",
  "UNKNOWN"
]);

const FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

const PROVIDER_FINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "EXPIRED"
]);

function normalizeProduct(product) {
  if (!product) {
    return null;
  }

  return {
    id:
      product.id ??
      product.product_id ??
      null,
    name:
      product.name ??
      null,
    country_id:
      product.country_id ??
      null,
    platform_id:
      product.platform_id ??
      null,
    catalog_product_id:
      product.catalog_product_id ??
      null,
    operator_id:
      product.operator_id ??
      null,
    operator_name:
      product.operator_name ??
      null,
    available:
      Boolean(product.available),
    active:
      product.active === undefined
        ? true
        : Boolean(product.active),
    price:
      Number(product.price || 0)
  };
}

function normalizeProducts(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map(normalizeProduct)
    .filter(Boolean);
}

function productMatches(product, filters) {
  if (!product) {
    return false;
  }

  if (
    filters.countryId !== undefined &&
    Number(product.country_id) !==
      Number(filters.countryId)
  ) {
    return false;
  }

  if (
    filters.platformId !== undefined &&
    Number(product.platform_id) !==
      Number(filters.platformId)
  ) {
    return false;
  }

  if (
    filters.serviceId !== undefined &&
    Number(product.catalog_product_id) !==
      Number(filters.serviceId)
  ) {
    return false;
  }

  if (
    filters.operatorId !== undefined &&
    Number(product.operator_id) !==
      Number(filters.operatorId)
  ) {
    return false;
  }

  if (
    filters.productId !== undefined &&
    String(product.id) !==
      String(filters.productId)
  ) {
    return false;
  }

  if (
    filters.catalogProductId !== undefined &&
    String(product.catalog_product_id) !==
      String(filters.catalogProductId)
  ) {
    return false;
  }

  if (
    filters.available !== undefined &&
    Boolean(product.available) !==
      Boolean(filters.available)
  ) {
    return false;
  }

  if (
    filters.active !== undefined &&
    Boolean(product.active) !==
      Boolean(filters.active)
  ) {
    return false;
  }

  return true;
}

function filterProducts(products, filters = {}) {
  return products.filter(
    product =>
      productMatches(
        product,
        filters
      )
  );
}

function calculateCustomerAmount(
  product,
  quantity = 1
) {
  const price =
    Number(product?.price || 0);

  const safeQuantity =
    Number(quantity || 1);

  return Math.max(
    0,
    Math.round(
      price * safeQuantity
    )
  );
}

function buildProviderData(data) {
  return {
    id:
      data?.id ??
      null,
    status:
      data?.status ??
      null,
    product_id:
      data?.product_id ??
      null,
    catalog_product_id:
      data?.catalog_product_id ??
      null,
    phone_number:
      data?.phone_number ??
      null,
    amount:
      data?.amount ??
      null,
    otp_code:
      data?.otp_code ??
      null,
    otp_received_at:
      data?.otp_received_at ??
      null,
    expires_at:
      data?.expires_at ??
      null,
    canceled_at:
      data?.canceled_at ??
      null,
    failed_reason:
      data?.failed_reason ??
      null
  };
}

function mapProviderOrder(data) {
  if (!data) {
    return null;
  }

  const status =
    String(
      data.status || ""
    ).toUpperCase();

  return {
    externalOrderId:
      data.id ??
      null,
    providerStatus:
      status || null,
    status:
      mapProviderStatus(
        status
      ),
    phoneNumber:
      data.phone_number ??
      null,
    otpCode:
      data.otp_code ??
      null,
    otpReceivedAt:
      data.otp_received_at ??
      null,
    providerExpiresAt:
      data.expires_at ??
      null,
    providerData:
      buildProviderData(data),
    failureReason:
      data.failed_reason ??
      null
  };
}

async function loadOrder(
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

  const orderNumber =
    cleanString(
      url.searchParams.get(
        "order"
      ),
      128
    );

  let order = null;

  if (orderId) {
    order =
      await getUserOrder(
        env.DB,
        user.id,
        orderId
      );
  } else if (orderNumber) {
    const found =
      await import("./orders.js")
        .then(module =>
          module.getOrderByNumber(
            env.DB,
            orderNumber
          )
        );

    order =
      found?.user_id === user.id
        ? found
        : null;
  }

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
    order.type !== NOKOS_TYPE ||
    order.provider !== NOKOS_PROVIDER
  ) {
    return {
      response:
        errorResponse(
          "Order bukan order NOKOS.",
          400
        )
    };
  }

  return {
    user,
    order
  };
}

async function loadActionableOrder(
  request,
  env
) {
  const loaded =
    await loadOrder(
      request,
      env
    );

  if (loaded.response) {
    return loaded;
  }

  if (
    !ACTIONABLE_STATUSES.has(
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

async function createLocalOrder(
  env,
  {
    userId,
    product,
    quantity,
    target,
    idempotencyKey,
    requestData
  }
) {
  const customerAmount =
    calculateCustomerAmount(
      product,
      quantity
    );

  const orderNumber =
    generateOrderNumber(
      "NOKOS"
    );

  const created =
    await createOrder(
      env.DB,
      {
        userId,
        orderNumber,
        type: NOKOS_TYPE,
        provider: NOKOS_PROVIDER,
        externalOrderId: null,
        serviceId:
          product.id
            ? String(product.id)
            : null,
        serviceName:
          product.name ||
          "NOKOS",
        target:
          target || null,
        quantity,
        rateUnit: "FIXED",
        providerRate:
          Number(
            product.price || 0
          ),
        sellingRate:
          customerAmount,
        providerAmount:
          Number(
            product.price || 0
          ),
        customerAmount,
        providerCharge: null,
        providerCurrency: "IDR",
        status: "CREATING",
        providerStatus: null,
        providerData: null,
        requestData,
        idempotencyKey,
        failureReason: null
      }
    );

  if (
    !created?.success ||
    !created.order
  ) {
    return {
      success: false,
      response:
        errorResponse(
          created?.error ||
            "Gagal membuat order.",
          500
        )
    };
  }

  return {
    success: true,
    order:
      created.order,
    customerAmount
  };
}

async function markCreationFailed(
  env,
  orderId,
  reason
) {
  await updateOrderStatus(
    env.DB,
    orderId,
    {
      status: "FAILED",
      providerStatus: null,
      message:
        reason ||
        "Order gagal dibuat.",
      providerData: null,
      failureReason:
        reason ||
        "Order gagal dibuat."
    }
  );
}

async function saveProviderOrder(
  env,
  localOrder,
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

  const updates = {
    externalOrderId:
      mapped.externalOrderId
        ? String(
            mapped.externalOrderId
          )
        : null,
    status:
      mapped.status,
    providerStatus:
      mapped.providerStatus,
    providerData:
      mapped.providerData,
    failureReason:
      mapped.failureReason,
    phoneNumber:
      mapped.phoneNumber,
    otpCode:
      mapped.otpCode,
    otpReceivedAt:
      mapped.otpReceivedAt,
    providerExpiresAt:
      mapped.providerExpiresAt
  };

  const updated =
    await updateOrder(
      env.DB,
      localOrder.id,
      updates
    );

  if (
    !updated?.success
  ) {
    return errorResponse(
      updated?.error ||
        "Gagal menyimpan order provider.",
      500
    );
  }

  return successResponse({
    order:
      updated.order
  });
}

export async function listNokosProducts(
  request,
  env
) {
  const auth =
    await requireAuth(
      request,
      env
    );

  if (
    auth instanceof Response
  ) {
    return auth;
  }

  const url =
    new URL(
      request.url
    );

  const countryId =
    url.searchParams.has(
      "country_id"
    )
      ? parseInteger(
          url.searchParams.get(
            "country_id"
          ),
          {
            min: 1
          }
        )
      : undefined;

  const platformId =
    url.searchParams.has(
      "platform_id"
    )
      ? parseInteger(
          url.searchParams.get(
            "platform_id"
          ),
          {
            min: 1
          }
        )
      : undefined;

  const serviceId =
    url.searchParams.has(
      "service_id"
    )
      ? parseInteger(
          url.searchParams.get(
            "service_id"
          ),
          {
            min: 1
          }
        )
      : undefined;

  const operatorId =
    url.searchParams.has(
      "operator_id"
    )
      ? parseInteger(
          url.searchParams.get(
            "operator_id"
          ),
          {
            min: 1
          }
        )
      : undefined;

  const productId =
    url.searchParams.get(
      "product_id"
    );

  const catalogProductId =
    url.searchParams.get(
      "catalog_product_id"
    );

  let products;

  try {
    products =
      normalizeProducts(
        await getProducts(
          env.SMSCODE_TOKEN
            ? env
            : env,
          {
            countryId,
            platformId,
            serviceId,
            operatorId,
            available: true,
            active: true
          }
        )
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil produk NOKOS.",
      502
    );
  }

  products =
    filterProducts(
      products,
      {
        countryId,
        platformId,
        serviceId,
        operatorId,
        productId:
          productId ||
          undefined,
        catalogProductId:
          catalogProductId ||
          undefined,
        available: true,
        active: true
      }
    );

  return successResponse({
    products
  });
}

export async function getNokosOrder(
  request,
  env
) {
  const loaded =
    await loadOrder(
      request,
      env
    );

  if (loaded.response) {
    return loaded.response;
  }

  return successResponse({
    order:
      loaded.order
  });
}

export async function createNokosOrder(
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

  const productId =
    data.productId ??
    data.product_id;

  const catalogProductId =
    data.catalogProductId ??
    data.catalog_product_id;

  const countryId =
    parseInteger(
      data.countryId ??
        data.country_id,
      {
        min: 1
      }
    );

  const platformId =
    parseInteger(
      data.platformId ??
        data.platform_id,
      {
        min: 1
      }
    );

  const serviceId =
    parseInteger(
      data.serviceId ??
        data.service_id,
      {
        min: 1
      }
    );

  const operatorId =
    parseInteger(
      data.operatorId ??
        data.operator_id,
      {
        min: 1
      }
    );

  const quantity =
    parseInteger(
      data.quantity ?? 1,
      {
        min: 1,
        max: 1
      }
    );

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

  let products;

  try {
    products =
      normalizeProducts(
        await getProducts(
          env,
          {
            countryId,
            platformId,
            serviceId,
            operatorId,
            available: true,
            active: true
          }
        )
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil produk NOKOS.",
      502
    );
  }

  const matching =
    filterProducts(
      products,
      {
        productId:
          productId !== undefined &&
          productId !== null
            ? String(productId)
            : undefined,
        catalogProductId:
          catalogProductId !== undefined &&
          catalogProductId !== null
            ? String(catalogProductId)
            : undefined,
        countryId,
        platformId,
        serviceId,
        operatorId,
        available: true,
        active: true
      }
    );

  if (!matching.length) {
    return errorResponse(
      "Produk NOKOS tidak ditemukan atau sedang tidak tersedia.",
      404
    );
  }

  const product =
    matching[0];

  const customerAmount =
    calculateCustomerAmount(
      product,
      quantity
    );

  if (
    customerAmount <= 0
  ) {
    return errorResponse(
      "Harga produk tidak valid.",
      400
    );
  }

  const local =
    await createLocalOrder(
      env,
      {
        userId:
          user.id,
        product,
        quantity,
        target:
          data.target ||
          data.phoneNumber ||
          data.phone_number ||
          null,
        idempotencyKey,
        requestData:
          data
      }
    );

  if (!local.success) {
    return local.response;
  }

  const debit =
    await debitBalance(
      env.DB,
      user.id,
      customerAmount,
      `ORDER:${local.order.id}`,
      `Pembelian NOKOS ${local.order.order_number}`,
      local.order.id
    );

  if (
    debit?.success !== true
  ) {
    await markCreationFailed(
      env,
      local.order.id,
      debit?.error ||
        "Saldo tidak mencukupi."
    );

    return errorResponse(
      debit?.error ||
        "Saldo tidak mencukupi.",
      400,
      {
        order:
          await getOrderById(
            env.DB,
            local.order.id
          )
      }
    );
  }

  let providerResult;

  try {
    providerResult =
      await createProviderOrder(
        env,
        {
          productId:
            product.id,
          catalogProductId:
            product.catalog_product_id,
          operatorId:
            product.operator_id,
          quantity,
          idempotencyKey:
            `VDS-${local.order.id}-${idempotencyKey}`
        }
      );
  } catch (error) {
    await updateOrderStatus(
      env.DB,
      local.order.id,
      {
        status: "UNKNOWN",
        message:
          error?.message ||
          "Status pembuatan order provider tidak dapat dipastikan.",
        failureReason:
          error?.message ||
          "Provider request tidak dapat dipastikan."
      }
    );

    return errorResponse(
      "Order sedang diproses tetapi status provider belum dapat dipastikan.",
      502,
      {
        order:
          await getOrderById(
            env.DB,
            local.order.id
          )
      }
    );
  }

  if (
    !providerResult
  ) {
    await updateOrderStatus(
      env.DB,
      local.order.id,
      {
        status: "UNKNOWN",
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
            local.order.id
          )
      }
    );
  }

  const saved =
    await saveProviderOrder(
      env,
      local.order,
      providerResult
    );

  if (
    saved?.success !== true
  ) {
    await updateOrderStatus(
      env.DB,
      local.order.id,
      {
        status: "UNKNOWN",
        message:
          saved?.error ||
          "Gagal menyimpan status provider.",
        failureReason:
          saved?.error ||
          "Gagal menyimpan status provider."
      }
    );

    return errorResponse(
      saved?.error ||
        "Status order belum dapat dipastikan.",
      500
    );
  }

  return successResponse(
    {
      order:
        saved.order,
      charged:
        true
    },
    201
  );
}

export async function cancelNokosOrder(
  request,
  env
) {
  const loaded =
    await loadActionableOrder(
      request,
      env
    );

  if (loaded.response) {
    return loaded.response;
  }

  const {
    order
  } = loaded;

  if (
    isFinalOrderStatus(
      order.status
    ) ||
    FINAL_STATUSES.has(
      order.status
    )
  ) {
    return errorResponse(
      "Order sudah selesai.",
      409,
      {
        order
      }
    );
  }

  if (
    !order.external_order_id
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "CANCELLED",
        message:
          "Order dibatalkan sebelum memiliki order provider."
      }
    );

    const refund =
      await refundBalance(
        env.DB,
        order.user_id,
        order.customer_amount,
        `ORDER:${order.id}`,
        `Refund NOKOS ${order.order_number}`,
        order.id
      );

    if (
      refund?.success === true
    ) {
      const updated =
        await updateOrderStatus(
          env.DB,
          order.id,
          {
            status: "REFUNDED",
            message:
              "Order dibatalkan dan saldo dikembalikan."
          }
        );

      return successResponse({
        order:
          updated.order,
        refunded: true
      });
    }

    return successResponse({
      order:
        await getOrderById(
          env.DB,
          order.id
        ),
      refunded: false,
      refund_pending: true
    });
  }

  let providerResult;

  try {
    providerResult =
      await cancelProviderOrder(
        env,
        order.external_order_id
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membatalkan order provider.",
      502
    );
  }

  const mapped =
    mapProviderOrder(
      providerResult
    );

  const providerStatus =
    String(
      mapped?.providerStatus ||
      ""
    ).toUpperCase();

  if (
    PROVIDER_FINAL_STATUSES.has(
      providerStatus
    )
  ) {
    const localStatus =
      mapped.status ===
      "COMPLETED"
        ? "COMPLETED"
        : mapped.status ===
          "EXPIRED"
          ? "EXPIRED"
          : "CANCELLED";

    await updateOrder(
      env.DB,
      order.id,
      {
        externalOrderId:
          mapped.externalOrderId
            ? String(
                mapped.externalOrderId
              )
            : order.external_order_id,
        status:
          localStatus,
        providerStatus:
          mapped.providerStatus,
        providerData:
          mapped.providerData,
        phoneNumber:
          mapped.phoneNumber,
        otpCode:
          mapped.otpCode,
        otpReceivedAt:
          mapped.otpReceivedAt,
        providerExpiresAt:
          mapped.providerExpiresAt
      }
    );

    if (
      localStatus !==
      "CANCELLED"
    ) {
      return successResponse({
        order:
          await getOrderById(
            env.DB,
            order.id
          ),
        refunded: false
      });
    }
  }

  await updateOrderStatus(
    env.DB,
    order.id,
    {
      status: "CANCELLED",
      providerStatus:
        mapped?.providerStatus ||
        null,
      providerData:
        mapped?.providerData ||
        providerResult,
      message:
        "Order berhasil dibatalkan di provider."
    }
  );

  const refund =
    await refundBalance(
      env.DB,
      order.user_id,
      order.customer_amount,
      `ORDER:${order.id}`,
      `Refund NOKOS ${order.order_number}`,
      order.id
    );

  const refunded =
    refund?.success === true;

  if (refunded) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "REFUNDED",
        providerStatus:
          mapped?.providerStatus ||
          null,
        providerData:
          mapped?.providerData ||
          providerResult,
        message:
          "Order dibatalkan dan saldo berhasil dikembalikan."
      }
    );
  }

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      ),
    refunded,
    refund_pending:
      !refunded
  });
}

export async function finishNokosOrder(
  request,
  env
) {
  const loaded =
    await loadActionableOrder(
      request,
      env
    );

  if (loaded.response) {
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
    return errorResponse(
      "Order sudah berada pada status akhir.",
      409,
      {
        order
      }
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

  let providerResult;

  try {
    providerResult =
      await finishProviderOrder(
        env,
        order.external_order_id
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyelesaikan order.",
      502
    );
  }

  const mapped =
    mapProviderOrder(
      providerResult
    );

  if (
    mapped?.status ===
    "COMPLETED"
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "COMPLETED",
        providerStatus:
          mapped.providerStatus,
        providerData:
          mapped.providerData,
        phoneNumber:
          mapped.phoneNumber,
        otpCode:
          mapped.otpCode,
        otpReceivedAt:
          mapped.otpReceivedAt,
        providerExpiresAt:
          mapped.providerExpiresAt,
        message:
          "Order selesai."
      }
    );
  } else {
    await updateOrder(
      env.DB,
      order.id,
      {
        status:
          mapped?.status ||
          order.status,
        providerStatus:
          mapped?.providerStatus ||
          null,
        providerData:
          mapped?.providerData ||
          providerResult,
        phoneNumber:
          mapped?.phoneNumber ||
          order.phone_number,
        otpCode:
          mapped?.otpCode ||
          order.otp_code,
        otpReceivedAt:
          mapped?.otpReceivedAt ||
          order.otp_received_at,
        providerExpiresAt:
          mapped?.providerExpiresAt ||
          order.provider_expires_at
      }
    );
  }

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      )
  });
}

export async function resendNokosOrder(
  request,
  env
) {
  const loaded =
    await loadActionableOrder(
      request,
      env
    );

  if (loaded.response) {
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
    return errorResponse(
      "Order sudah berada pada status akhir.",
      409,
      {
        order
      }
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

  let providerResult;

  try {
    providerResult =
      await resendProviderOrder(
        env,
        order.external_order_id
      );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal meminta resend OTP.",
      502
    );
  }

  const mapped =
    mapProviderOrder(
      providerResult
    );

  if (
    mapped?.status
  ) {
    await updateOrder(
      env.DB,
      order.id,
      {
        status:
          mapped.status,
        providerStatus:
          mapped.providerStatus,
        providerData:
          mapped.providerData,
        phoneNumber:
          mapped.phoneNumber ||
          order.phone_number,
        otpCode:
          mapped.otpCode ||
          order.otp_code,
        otpReceivedAt:
          mapped.otpReceivedAt ||
          order.otp_received_at,
        providerExpiresAt:
          mapped.providerExpiresAt ||
          order.provider_expires_at,
        failureReason:
          mapped.failureReason
      }
    );
  }

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      )
  });
}

export async function syncNokosOrder(
  request,
  env
) {
  const loaded =
    await loadActionableOrder(
      request,
      env
    );

  if (loaded.response) {
    return loaded.response;
  }

  const {
    order
  } = loaded;

  if (
    !order.external_order_id
  ) {
    return errorResponse(
      "Order provider belum tersedia.",
      409
    );
  }

  let providerResult;

  try {
    providerResult =
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

  const mapped =
    mapProviderOrder(
      providerResult
    );

  if (!mapped) {
    return errorResponse(
      "Respons provider tidak valid.",
      502
    );
  }

  await updateOrder(
    env.DB,
    order.id,
    {
      status:
        mapped.status,
      providerStatus:
        mapped.providerStatus,
      providerData:
        mapped.providerData,
      phoneNumber:
        mapped.phoneNumber,
      otpCode:
        mapped.otpCode,
      otpReceivedAt:
        mapped.otpReceivedAt,
      providerExpiresAt:
        mapped.providerExpiresAt,
      failureReason:
        mapped.failureReason
    }
  );

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      )
  });
}

export async function listMyNokosOrders(
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
          NOKOS_TYPE
      }
    )
  );
}

export async function adminListNokosOrders(
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

  const userId =
    url.searchParams.get(
      "user_id"
    );

  const status =
    url.searchParams.get(
      "status"
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
          NOKOS_TYPE,
        provider:
          NOKOS_PROVIDER,
        userId,
        status
      }
    )
  );
}

export async function adminGetNokosOrder(
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
    order.type !== NOKOS_TYPE ||
    order.provider !== NOKOS_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order NOKOS.",
      400
    );
  }

  return successResponse({
    order
  });
}

export async function adminSyncNokosOrder(
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
    order.type !== NOKOS_TYPE ||
    order.provider !== NOKOS_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order NOKOS.",
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

  let providerResult;

  try {
    providerResult =
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

  const mapped =
    mapProviderOrder(
      providerResult
    );

  if (!mapped) {
    return errorResponse(
      "Respons provider tidak valid.",
      502
    );
  }

  await updateOrder(
    env.DB,
    order.id,
    {
      status:
        mapped.status,
      providerStatus:
        mapped.providerStatus,
      providerData:
        mapped.providerData,
      phoneNumber:
        mapped.phoneNumber,
      otpCode:
        mapped.otpCode,
      otpReceivedAt:
        mapped.otpReceivedAt,
      providerExpiresAt:
        mapped.providerExpiresAt,
      failureReason:
        mapped.failureReason
    }
  );

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      )
  });
}

export async function adminCancelNokosOrder(
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
    order.type !== NOKOS_TYPE ||
    order.provider !== NOKOS_PROVIDER
  ) {
    return errorResponse(
      "Order bukan order NOKOS.",
      400
    );
  }

  if (
    isFinalOrderStatus(
      order.status
    )
  ) {
    return errorResponse(
      "Order sudah berada pada status akhir.",
      409,
      {
        order
      }
    );
  }

  if (
    !order.external_order_id
  ) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "CANCELLED",
        message:
          "Order dibatalkan admin."
      }
    );
  } else {
    try {
      await cancelProviderOrder(
        env,
        order.external_order_id
      );
    } catch (error) {
      return errorResponse(
        error?.message ||
          "Gagal membatalkan order provider.",
        502
      );
    }

    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "CANCELLED",
        message:
          "Order dibatalkan admin."
      }
    );
  }

  const refund =
    await refundBalance(
      env.DB,
      order.user_id,
      order.customer_amount,
      `ORDER:${order.id}`,
      `Refund NOKOS ${order.order_number}`,
      order.id
    );

  const refunded =
    refund?.success === true;

  if (refunded) {
    await updateOrderStatus(
      env.DB,
      order.id,
      {
        status: "REFUNDED",
        message:
          "Order dibatalkan admin dan saldo dikembalikan."
      }
    );
  }

  return successResponse({
    order:
      await getOrderById(
        env.DB,
        order.id
      ),
    refunded,
    refund_pending:
      !refunded
  });
}