import {
  requireAuth,
  requireAdmin
} from "./auth.js";

import {
  createOrder as createCoreOrder,
  getOrderById,
  getOrderByNumber,
  getUserOrder,
  syncOrder,
  cancelOrder as cancelCoreOrder,
  updateOrderStatus,
  getOrderEvents,
  listOrdersByUser,
  adminGetOrders,
  refundExistingOrder,
  formatOrder
} from "./order-core.js";

import {
  getProduct,
  getProducts,
  getOrder as getProviderOrder,
  finishOrder as finishProviderOrder,
  resendOrder as resendProviderOrder,
  mapStatus
} from "./smscode.js";

import {
  errorResponse,
  successResponse,
  readJson,
  getUrl,
  cleanString,
  parsePositiveInteger,
  nowUnix
} from "./utils.js";

const NOKOS_PROVIDER = "SMSCODE";
const ORDER_TYPE = "NOKOS";
const RATE_UNIT = "FIXED";

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

function normalizeProductId(value) {
  return parsePositiveInteger(value) || null;
}

function normalizeCatalogProductId(value) {
  return parsePositiveInteger(value) || null;
}

function normalizeOperatorId(value) {
  return parsePositiveInteger(value) || null;
}

function normalizeQuantity(value) {
  const quantity =
    parsePositiveInteger(value);

  if (
    !quantity ||
    quantity > 100
  ) {
    return null;
  }

  return quantity;
}

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    !Number.isSafeInteger(
      Math.round(number)
    )
  ) {
    return null;
  }

  return Math.round(number);
}

function normalizeIdempotencyKey(value) {
  return (
    cleanString(
      value,
      255
    ) || null
  );
}

function normalizeTarget(value) {
  return (
    cleanString(
      value,
      500
    ) || null
  );
}

function getProductId(product) {
  return (
    product?.id ??
    product?.product_id ??
    null
  );
}

function getCatalogProductId(product) {
  return (
    product?.catalog_product_id ??
    product?.catalogProductId ??
    product?.catalog_id ??
    null
  );
}

function getProductPrice(product) {
  const value =
    product?.price ??
    product?.amount ??
    product?.cost ??
    product?.rate ??
    product?.selling_price ??
    product?.provider_price ??
    null;

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(number)
  );
}

function getProductName(product) {
  return (
    product?.name ||
    product?.product_name ||
    product?.service_name ||
    product?.title ||
    `NOKOS ${getProductId(product) || ""}`.trim()
  );
}

function getProductCountry(product) {
  return (
    product?.country_name ||
    product?.country ||
    null
  );
}

function getProductPlatform(product) {
  return (
    product?.platform_name ||
    product?.platform ||
    null
  );
}

function getProductOperator(product) {
  return (
    product?.operator_name ||
    product?.operator ||
    null
  );
}

function getProductCountryId(product) {
  return (
    normalizeProductId(
      product?.country_id
    )
  );
}

function getProductPlatformId(product) {
  return (
    normalizeProductId(
      product?.platform_id
    )
  );
}

function getProductOperatorId(product) {
  return (
    normalizeOperatorId(
      product?.operator_id
    )
  );
}

function serializeProviderData(product) {
  try {
    return JSON.stringify(
      product ?? null
    );
  } catch {
    return null;
  }
}

async function saveNokosService(
  env,
  product
) {
  const productId =
    normalizeProductId(
      getProductId(product)
    );

  if (!productId) {
    return null;
  }

  const catalogProductId =
    normalizeCatalogProductId(
      getCatalogProductId(product)
    ) ||
    productId;

  const providerPrice =
    getProductPrice(
      product
    );

  const sellingPrice =
    providerPrice;

  const available =
    product?.available === false
      ? 0
      : 1;

  const active =
    product?.active === false
      ? 0
      : 1;

  const timestamp =
    nowUnix();

  await env.DB
    .prepare(`
      INSERT INTO nokos_services (
        product_id,
        catalog_product_id,
        country_id,
        country_name,
        platform_id,
        platform_name,
        operator_id,
        operator_name,
        service_name,
        provider_price,
        selling_price,
        available,
        active,
        metadata,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id)
      DO UPDATE SET
        catalog_product_id = excluded.catalog_product_id,
        country_id = excluded.country_id,
        country_name = excluded.country_name,
        platform_id = excluded.platform_id,
        platform_name = excluded.platform_name,
        operator_id = excluded.operator_id,
        operator_name = excluded.operator_name,
        service_name = excluded.service_name,
        provider_price = excluded.provider_price,
        selling_price = excluded.selling_price,
        available = excluded.available,
        active = excluded.active,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `)
    .bind(
      productId,
      catalogProductId,
      getProductCountryId(
        product
      ),
      getProductCountry(
        product
      ),
      getProductPlatformId(
        product
      ),
      getProductPlatform(
        product
      ),
      getProductOperatorId(
        product
      ),
      getProductOperator(
        product
      ),
      getProductName(
        product
      ),
      providerPrice,
      sellingPrice,
      available,
      active,
      serializeProviderData(
        product
      ),
      timestamp,
      timestamp
    )
    .run();

  return true;
}

async function getProductForOrder(
  env,
  {
    productId,
    catalogProductId,
    operatorId,
    minPrice,
    maxPrice
  }
) {
  if (productId) {
    return getProduct(
      env,
      productId
    );
  }

  const products =
    await getProducts(
      env,
      {
        operatorId,
        minPrice,
        maxPrice
      }
    );

  if (
    !Array.isArray(products) ||
    !products.length
  ) {
    return null;
  }

  if (
    catalogProductId
  ) {
    const matched =
      products.find(
        product =>
          String(
            getCatalogProductId(
              product
            ) ?? ""
          ) ===
          String(
            catalogProductId
          )
      );

    if (matched) {
      return matched;
    }
  }

  return products[0];
}

function getMarkupPercent(env) {
  const value =
    Number(
      env?.MARKUP_PERCENT ??
      20
    );

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
}

function calculateCustomerAmount(
  providerAmount,
  markupPercent
) {
  const amount =
    Number(
      providerAmount
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  const multiplier =
    1 +
    (
      Number(markupPercent) /
      100
    );

  const result =
    Math.ceil(
      amount *
      multiplier
    );

  return Number.isSafeInteger(
    result
  ) && result > 0
    ? result
    : null;
}

function calculateSellingRate(
  providerRate,
  markupPercent
) {
  const rate =
    Number(
      providerRate
    );

  if (
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return null;
  }

  const result =
    Math.ceil(
      rate *
      (
        1 +
        Number(markupPercent) /
        100
      )
    );

  return Number.isSafeInteger(
    result
  ) && result > 0
    ? result
    : null;
}

function validateCreatePayload(
  payload
) {
  const productId =
    normalizeProductId(
      payload?.product_id ??
      payload?.productId
    );

  const catalogProductId =
    normalizeCatalogProductId(
      payload?.catalog_product_id ??
      payload?.catalogProductId
    );

  const operatorId =
    normalizeOperatorId(
      payload?.operator_id ??
      payload?.operatorId
    );

  const quantity =
    normalizeQuantity(
      payload?.quantity ??
      1
    );

  const minPrice =
    normalizePrice(
      payload?.min_price ??
      payload?.minPrice
    );

  const maxPrice =
    normalizePrice(
      payload?.max_price ??
      payload?.maxPrice
    );

  const target =
    normalizeTarget(
      payload?.target ??
      payload?.phone_number ??
      payload?.phone
    );

  const idempotencyKey =
    normalizeIdempotencyKey(
      payload?.idempotency_key ??
      payload?.idempotencyKey
    );

  if (
    !productId &&
    !catalogProductId
  ) {
    return {
      error:
        "product_id atau catalog_product_id wajib diisi."
    };
  }

  if (!quantity) {
    return {
      error:
        "Quantity NOKOS tidak valid."
    };
  }

  if (
    minPrice !== null &&
    maxPrice !== null &&
    minPrice > maxPrice
  ) {
    return {
      error:
        "min_price tidak boleh lebih besar dari max_price."
    };
  }

  if (!idempotencyKey) {
    return {
      error:
        "Idempotency-Key wajib diisi."
    };
  }

  return {
    value: {
      productId,
      catalogProductId,
      operatorId,
      quantity,
      minPrice,
      maxPrice,
      target,
      idempotencyKey
    }
  };
}

async function resolveOrder(
  request,
  env,
  userId,
  payload = null
) {
  const body =
    payload || {};

  const url =
    getUrl(request);

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

  if (id) {
    return getUserOrder(
      env,
      userId,
      {
        id
      }
    );
  }

  if (orderNumber) {
    return getUserOrder(
      env,
      userId,
      {
        orderNumber
      }
    );
  }

  return null;
}

async function resolveAdapter() {
  return {
    createOrder: async (
      env,
      context
    ) => {
      const {
        createOrder
      } = await import(
        "./smscode.js"
      );

      return createOrder(
        env,
        context
      );
    },

    getStatus: async (
      env,
      context
    ) => {
      const {
        getStatus
      } = await import(
        "./smscode.js"
      );

      return getStatus(
        env,
        context
      );
    },

    cancelOrder: async (
      env,
      context
    ) => {
      const {
        cancelOrder
      } = await import(
        "./smscode.js"
      );

      return cancelOrder(
        env,
        context
      );
    }
  };
}

const SMSCODE_ADAPTER = {
  createOrder: async (
    env,
    context
  ) => {
    const {
      createOrder
    } = await import(
      "./smscode.js"
    );

    return createOrder(
      env,
      context
    );
  },

  getStatus: async (
    env,
    context
  ) => {
    const {
      getStatus
    } = await import(
      "./smscode.js"
    );

    return getStatus(
      env,
      context
    );
  },

  cancelOrder: async (
    env,
    context
  ) => {
    const {
      cancelOrder
    } = await import(
      "./smscode.js"
    );

    return cancelOrder(
      env,
      context
    );
  }
};

export async function listNokosProducts(
  request,
  env
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
      getUrl(request);

    const productId =
      normalizeProductId(
        url.searchParams.get(
          "product_id"
        )
      );

    const catalogProductId =
      normalizeCatalogProductId(
        url.searchParams.get(
          "catalog_product_id"
        )
      );

    const operatorId =
      normalizeOperatorId(
        url.searchParams.get(
          "operator_id"
        )
      );

    const minPrice =
      normalizePrice(
        url.searchParams.get(
          "min_price"
        )
      );

    const maxPrice =
      normalizePrice(
        url.searchParams.get(
          "max_price"
        )
      );

    if (
      minPrice !== null &&
      maxPrice !== null &&
      minPrice > maxPrice
    ) {
      return errorResponse(
        "min_price tidak boleh lebih besar dari max_price.",
        400
      );
    }

    const products =
      productId
        ? [
            await getProduct(
              env,
              productId
            )
          ].filter(Boolean)
        : await getProducts(
            env,
            {
              operatorId,
              minPrice,
              maxPrice
            }
          );

    const filtered =
      catalogProductId
        ? products.filter(
            product =>
              String(
                getCatalogProductId(
                  product
                ) ?? ""
              ) ===
              String(
                catalogProductId
              )
          )
        : products;

    for (
      const product
      of filtered
    ) {
      try {
        await saveNokosService(
          env,
          product
        );
      } catch {}
    }

    const markup =
      getMarkupPercent(
        env
      );

    const result =
      filtered.map(
        product => {
          const providerPrice =
            getProductPrice(
              product
            );

          return {
            ...product,
            provider_price:
              providerPrice,
            selling_price:
              calculateSellingRate(
                providerPrice,
                markup
              )
          };
        }
      );

    return successResponse({
      products: result
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil produk NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function createNokosOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const validation =
      validateCreatePayload(
        payload
      );

    if (
      validation.error
    ) {
      return errorResponse(
        validation.error,
        400
      );
    }

    const {
      productId,
      catalogProductId,
      operatorId,
      quantity,
      minPrice,
      maxPrice,
      target,
      idempotencyKey
    } =
      validation.value;

    const product =
      await getProductForOrder(
        env,
        {
          productId,
          catalogProductId,
          operatorId,
          minPrice,
          maxPrice
        }
      );

    if (!product) {
      return errorResponse(
        "Produk NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      product?.available === false ||
      product?.active === false
    ) {
      return errorResponse(
        "Produk NOKOS sedang tidak tersedia.",
        409
      );
    }

    await saveNokosService(
      env,
      product
    );

    const providerRate =
      getProductPrice(
        product
      );

    if (
      !Number.isSafeInteger(
        providerRate
      ) ||
      providerRate <= 0
    ) {
      return errorResponse(
        "Harga produk NOKOS tidak valid.",
        409
      );
    }

    const providerAmount =
      providerRate *
      quantity;

    if (
      !Number.isSafeInteger(
        providerAmount
      ) ||
      providerAmount <= 0
    ) {
      return errorResponse(
        "Total harga provider NOKOS tidak valid.",
        409
      );
    }

    const markup =
      getMarkupPercent(
        env
      );

    const sellingRate =
      calculateSellingRate(
        providerRate,
        markup
      );

    const customerAmount =
      calculateCustomerAmount(
        providerAmount,
        markup
      );

    if (
      !sellingRate ||
      !customerAmount
    ) {
      return errorResponse(
        "Harga jual NOKOS tidak valid.",
        409
      );
    }

    const productServiceId =
      getProductId(
        product
      );

    const productCatalogId =
      getCatalogProductId(
        product
      );

    const productOperatorId =
      getProductOperatorId(
        product
      );

    const requestData = {
      product_id:
        productServiceId ??
        productId,
      catalog_product_id:
        productCatalogId ??
        catalogProductId,
      operator_id:
        productOperatorId ??
        operatorId,
      quantity,
      min_price:
        minPrice,
      max_price:
        maxPrice,
      target:
        target || null
    };

    const result =
      await createCoreOrder(
        env,
        {
          adapter:
            SMSCODE_ADAPTER,
          requestData,
          description:
            `Pembelian NOKOS`,
          order: {
            userId:
              auth.user.id,
            type:
              ORDER_TYPE,
            provider:
              NOKOS_PROVIDER,
            serviceId:
              String(
                productServiceId ??
                productId
              ),
            serviceName:
              getProductName(
                product
              ),
            target:
              target,
            quantity,
            rateUnit:
              RATE_UNIT,
            providerRate,
            sellingRate,
            providerAmount,
            customerAmount,
            providerCurrency:
              "IDR",
            idempotencyKey
          }
        }
      );

    const responseOrder =
      formatOrder(
        result.order
      );

    return successResponse(
      {
        order:
          responseOrder,
        created:
          result.created,
        idempotent:
          result.idempotent,
        providerCalled:
          result.providerCalled,
        uncertain:
          result.uncertain || false
      },
      result.insufficient
        ? 402
        : 201
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membuat order NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function getNokosOrder(
  request,
  env
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

    const order =
      await resolveOrder(
        request,
        env,
        auth.user.id
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
    ) {
      return errorResponse(
        "Order bukan order NOKOS.",
        400
      );
    }

    let current =
      order;

    if (
      ![
        "COMPLETED",
        "PARTIAL",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
        "FAILED"
      ].includes(
        current.status
      ) &&
      current.external_order_id
    ) {
      try {
        const synced =
          await syncOrder(
            env,
            {
              orderId:
                current.id,
              adapter:
                SMSCODE_ADAPTER
            }
          );

        current =
          synced.order;
      } catch {}
    }

    const events =
      await getOrderEvents(
        env,
        current.id
      );

    return successResponse({
      order:
        formatOrder(
          current
        ),
      events
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil order NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function cancelNokosOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const order =
      await resolveOrder(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
    ) {
      return errorResponse(
        "Order bukan order NOKOS.",
        400
      );
    }

    const result =
      await cancelCoreOrder(
        env,
        {
          orderId:
            order.id,
          adapter:
            SMSCODE_ADAPTER,
          reason:
            "Order NOKOS dibatalkan."
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
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal membatalkan order NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function finishNokosOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const order =
      await resolveOrder(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
    ) {
      return errorResponse(
        "Order bukan order NOKOS.",
        400
      );
    }

    if (
      order.status ===
      "COMPLETED"
    ) {
      return successResponse({
        order:
          formatOrder(
            order
          )
      });
    }

    if (
      !order.external_order_id
    ) {
      return errorResponse(
        "Order belum memiliki ID provider.",
        409
      );
    }

    const providerOrder =
      await finishProviderOrder(
        env,
        {
          order:
            order
        }
      );

    const normalizedStatus =
      mapStatus(
        providerOrder?.providerStatus ||
        providerOrder?.status
      );

    const updated =
      await updateOrderStatus(
        env,
        order.id,
        normalizedStatus,
        {
          externalOrderId:
            providerOrder.externalOrderId ??
            order.external_order_id,
          providerStatus:
            providerOrder.providerStatus,
          providerData:
            providerOrder.providerData,
          providerCharge:
            providerOrder.providerCharge,
          phoneNumber:
            providerOrder.fields?.phoneNumber,
          otpCode:
            providerOrder.fields?.otpCode,
          otpMessage:
            providerOrder.fields?.otpMessage,
          otpReceivedAt:
            providerOrder.fields?.otpReceivedAt,
          providerExpiresAt:
            providerOrder.fields?.providerExpiresAt,
          failureReason:
            providerOrder.failureReason
        }
      );

    return successResponse({
      order:
        formatOrder(
          updated
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal menyelesaikan order NOKOS.",
      error?.status ||
        502
    );
  }
}

export async function resendNokosOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const order =
      await resolveOrder(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
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
        "Order belum memiliki ID provider.",
        409
      );
    }

    const providerOrder =
      await resendProviderOrder(
        env,
        {
          order
        }
      );

    const normalizedStatus =
      mapStatus(
        providerOrder?.providerStatus ||
        providerOrder?.status
      );

    const updated =
      await updateOrderStatus(
        env,
        order.id,
        normalizedStatus,
        {
          externalOrderId:
            providerOrder.externalOrderId ??
            order.external_order_id,
          providerStatus:
            providerOrder.providerStatus,
          providerData:
            providerOrder.providerData,
          providerCharge:
            providerOrder.providerCharge,
          phoneNumber:
            providerOrder.fields?.phoneNumber,
          otpCode:
            providerOrder.fields?.otpCode,
          otpMessage:
            providerOrder.fields?.otpMessage,
          otpReceivedAt:
            providerOrder.fields?.otpReceivedAt,
          providerExpiresAt:
            providerOrder.fields?.providerExpiresAt,
          failureReason:
            providerOrder.failureReason
        }
      );

    return successResponse({
      order:
        formatOrder(
          updated
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal meminta OTP ulang.",
      error?.status ||
        502
    );
  }
}

export async function syncNokosOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const order =
      await resolveOrder(
        request,
        env,
        auth.user.id,
        payload
      );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
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
        "Order belum memiliki ID provider.",
        409
      );
    }

    const result =
      await syncOrder(
        env,
        {
          orderId:
            order.id,
          adapter:
            SMSCODE_ADAPTER
        }
      );

    return successResponse({
      order:
        formatOrder(
          result.order
        ),
      synced:
        result.synced,
      uncertain:
        result.uncertain || false,
      refundFailed:
        result.refundFailed || false
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal sinkronisasi order NOKOS.",
      error?.status ||
        502
    );
  }
}

export async function listMyNokosOrders(
  request,
  env
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
      getUrl(request);

    const status =
      cleanString(
        url.searchParams.get(
          "status"
        ) || "",
        40
      ).toUpperCase();

    if (
      status &&
      !ORDER_STATUSES.has(
        status
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    const result =
      await listOrdersByUser(
        env,
        auth.user.id,
        {
          type:
            ORDER_TYPE,
          status,
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
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil daftar order NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function adminListNokosOrders(
  request,
  env
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

    const url =
      getUrl(request);

    const status =
      cleanString(
        url.searchParams.get(
          "status"
        ) || "",
        40
      ).toUpperCase();

    if (
      status &&
      !ORDER_STATUSES.has(
        status
      )
    ) {
      return errorResponse(
        "Status order tidak valid.",
        400
      );
    }

    const userId =
      parsePositiveInteger(
        url.searchParams.get(
          "user_id"
        )
      );

    const result =
      await adminGetOrders(
        env,
        {
          type:
            ORDER_TYPE,
          provider:
            NOKOS_PROVIDER,
          status,
          userId,
          limit:
            url.searchParams.get(
              "limit"
            ) || 50,
          offset:
            url.searchParams.get(
              "offset"
            ) || 0
        }
      );

    return successResponse({
      orders:
        result.orders.map(
          row => ({
            ...formatOrder(
              row
            ),
            username:
              row.username ||
              null,
            first_name:
              row.first_name ||
              null
          })
        ),
      pagination:
        result.pagination
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil order NOKOS admin.",
      error?.status ||
        500
    );
  }
}

export async function adminGetNokosOrder(
  request,
  env
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

    const url =
      getUrl(request);

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
        ) || "",
        120
      );

    const order =
      id
        ? await getOrderById(
            env,
            id
          )
        : await getOrderByNumber(
            env,
            orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE
    ) {
      return errorResponse(
        "Order bukan order NOKOS.",
        400
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
      events
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil detail order NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function syncNokosProviderOrder(
  request,
  env
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

    const payload =
      await readJson(
        request
      );

    const id =
      parsePositiveInteger(
        payload.id ??
        payload.order_id
      );

    const orderNumber =
      cleanString(
        payload.order_number ??
        payload.orderNumber,
        120
      );

    const order =
      id
        ? await getOrderById(
            env,
            id
          )
        : await getOrderByNumber(
            env,
            orderNumber
          );

    if (!order) {
      return errorResponse(
        "Order NOKOS tidak ditemukan.",
        404
      );
    }

    if (
      order.type !==
      ORDER_TYPE ||
      order.provider !==
      NOKOS_PROVIDER
    ) {
      return errorResponse(
        "Order bukan order NOKOS SMSCode.",
        400
      );
    }

    const result =
      await syncOrder(
        env,
        {
          orderId:
            order.id,
          adapter:
            SMSCODE_ADAPTER
        }
      );

    return successResponse({
      order:
        formatOrder(
          result.order
        ),
      synced:
        result.synced,
      uncertain:
        result.uncertain || false
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal sinkronisasi order provider NOKOS.",
      error?.status ||
        502
    );
  }
}

export async function getNokosStats(
  request,
  env
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

    const total =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM orders
          WHERE type = ?
            AND provider = ?
        `)
        .bind(
          ORDER_TYPE,
          NOKOS_PROVIDER
        )
        .first();

    const completed =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM orders
          WHERE type = ?
            AND provider = ?
            AND status = 'COMPLETED'
        `)
        .bind(
          ORDER_TYPE,
          NOKOS_PROVIDER
        )
        .first();

    const processing =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM orders
          WHERE type = ?
            AND provider = ?
            AND status IN (
              'CREATING',
              'PENDING',
              'PROCESSING',
              'OTP_RECEIVED',
              'UNKNOWN'
            )
        `)
        .bind(
          ORDER_TYPE,
          NOKOS_PROVIDER
        )
        .first();

    const failed =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM orders
          WHERE type = ?
            AND provider = ?
            AND status IN (
              'FAILED',
              'CANCELLED',
              'EXPIRED',
              'REFUNDED'
            )
        `)
        .bind(
          ORDER_TYPE,
          NOKOS_PROVIDER
        )
        .first();

    const revenue =
      await env.DB
        .prepare(`
          SELECT
            COALESCE(
              SUM(customer_amount),
              0
            ) AS total
          FROM orders
          WHERE type = ?
            AND provider = ?
        `)
        .bind(
          ORDER_TYPE,
          NOKOS_PROVIDER
        )
        .first();

    return successResponse({
      total:
        Number(
          total?.total || 0
        ),
      completed:
        Number(
          completed?.total || 0
        ),
      processing:
        Number(
          processing?.total || 0
        ),
      failed:
        Number(
          failed?.total || 0
        ),
      customer_amount:
        Number(
          revenue?.total || 0
        )
    });
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Gagal mengambil statistik NOKOS.",
      error?.status ||
        500
    );
  }
}

export async function handleNokos(
  request,
  env
) {
  const url =
    getUrl(request);

  const path =
    url.pathname.replace(
      /\/+$/,
      ""
    ) || "/";

  if (
    request.method ===
      "GET" &&
    (
      path ===
        "/api/nokos/products" ||
      path ===
        "/api/nokos/services"
    )
  ) {
    return listNokosProducts(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/orders"
  ) {
    return createNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/nokos/orders"
  ) {
    return listMyNokosOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/nokos/order"
  ) {
    return getNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/sync"
  ) {
    return syncNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/cancel"
  ) {
    return cancelNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/finish"
  ) {
    return finishNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/nokos/order/resend"
  ) {
    return resendNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/orders"
  ) {
    return adminListNokosOrders(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/order"
  ) {
    return adminGetNokosOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "POST" &&
    path ===
      "/api/admin/nokos/order/sync"
  ) {
    return syncNokosProviderOrder(
      request,
      env
    );
  }

  if (
    request.method ===
      "GET" &&
    path ===
      "/api/admin/nokos/stats"
  ) {
    return getNokosStats(
      request,
      env
    );
  }

  return errorResponse(
    "Endpoint NOKOS tidak ditemukan.",
    404
  );
}

export default {
  handleNokos,
  listNokosProducts,
  createNokosOrder,
  getNokosOrder,
  listMyNokosOrders,
  syncNokosOrder,
  cancelNokosOrder,
  finishNokosOrder,
  resendNokosOrder,
  adminListNokosOrders,
  adminGetNokosOrder,
  getNokosStats,
  syncNokosProviderOrder
};
