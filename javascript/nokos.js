import { requireAuth } from "./auth.js";
import {
  getCountries,
  getServices,
  getOperators,
  getProducts,
  getProduct,
  getOrder as getProviderOrder,
  getActiveOrders,
  createOrder as createProviderOrder,
  cancelOrder as cancelProviderOrder,
  finishOrder as finishProviderOrder,
  resendOrder as resendProviderOrder,
  mapStatus
} from "./smscode.js";
import {
  debitBalance,
  refundBalance
} from "./wallet.js";
import {
  errorResponse,
  successResponse,
  readJson,
  getUrl,
  cleanString,
  parsePositiveInteger,
  nowUnix,
  generateOrderNumber,
} from "./utils.js";

const ORDER_TYPE = "NOKOS";
const PROVIDER = "SMSCODE";
const PROVIDER_CURRENCY = "IDR";
const MAX_ORDER_LIMIT = 100;
const MAX_TARGET_LENGTH = 2000;
const CATALOG_CACHE_TTL = 300;
const CATALOG_CACHE_KEY = "/__internal/nokos-smscode-catalog-v1";
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
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "FAILED"
]);

function integer(value, min = 0) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < min) {
    return null;
  }

  return number;
}

function positiveInteger(value) {
  return integer(value, 1);
}

function normalizeProductId(value) {
  return positiveInteger(value);
}

function normalizeCatalogProductId(value) {
  return positiveInteger(value);
}

function normalizeCountryId(value) {
  return positiveInteger(value);
}

function normalizePlatformId(value) {
  return positiveInteger(value);
}

function normalizeServiceId(value) {
  return positiveInteger(value);
}

function normalizeOperatorId(value) {
  return positiveInteger(value);
}

function normalizeQuantity(value) {
  const quantity = positiveInteger(value ?? 1);

  if (!quantity || quantity !== 1) {
    return null;
  }

  return quantity;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return number;
}

function normalizeTarget(value) {
  const target = cleanString(value || "", MAX_TARGET_LENGTH);
  return target || null;
}

function normalizeIdempotencyKey(value) {
  const key = cleanString(value || "", 128);

  if (!key) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) {
    return null;
  }

  return key;
}

function getProductId(product) {
  return normalizeProductId(
    product?.id ?? product?.product_id ?? product?.productId
  );
}

function getCatalogProductId(product) {
  return normalizeCatalogProductId(
    product?.catalog_product_id ?? product?.catalogProductId
  );
}

function getCountryId(product) {
  return normalizeCountryId(product?.country_id ?? product?.countryId);
}

function getPlatformId(product) {
  return normalizePlatformId(product?.platform_id ?? product?.platformId);
}

function getServiceId(product) {
  return normalizeServiceId(product?.service_id ?? product?.serviceId);
}

function getOperatorId(product) {
  return normalizeOperatorId(product?.operator_id ?? product?.operatorId);
}

function firstText(values, maxLength = 255) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = cleanString(String(value), maxLength);
    if (text) return text;
  }
  return null;
}

function getProductName(product) {
  return firstText([
    product?.service_name,
    product?.serviceName,
    product?.platform_name,
    product?.platformName,
    product?.name,
    product?.product_name,
    product?.productName,
    product?.title,
    product?.service,
    product?.product
  ]) || "NOKOS";
}

function getProductPrice(product) {
  const candidates = [
    product?.price,
    product?.provider_price,
    product?.providerPrice,
    product?.selling_price,
    product?.sellingPrice,
    product?.amount,
    product?.cost,
    product?.retail_price,
    product?.unit_price
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const price = Number(candidate);
    if (Number.isSafeInteger(price) && price > 0) return price;
  }

  return 0;
}

function isExplicitlyFalse(value) {
  return value === false || value === 0 || value === "0" || String(value).toLowerCase() === "false";
}

function isProductAvailable(product) {
  const status = String(product?.status ?? "").trim().toLowerCase();
  if (["inactive", "disabled", "unavailable", "sold_out", "sold out"].includes(status)) return false;
  return !isExplicitlyFalse(product?.available) &&
    !isExplicitlyFalse(product?.active) &&
    !isExplicitlyFalse(product?.is_available) &&
    !isExplicitlyFalse(product?.is_active);
}

function getCountryName(product) {
  return firstText([product?.country_name, product?.countryName, product?.country, product?.country_title]);
}

function getPlatformName(product) {
  return firstText([product?.platform_name, product?.platformName, product?.platform, product?.service_name]);
}

function getOperatorName(product) {
  return firstText([product?.operator_name, product?.operatorName, product?.operator]);
}

function isValidCatalogProduct(product) {
  return Boolean(product && getProductPrice(product) > 0 &&
    (getProductId(product) || getCatalogProductId(product)) &&
    isProductAvailable(product));
}

async function getCachedCatalogProducts(request, env) {
  const cache = globalThis.caches?.default;
  if (!cache) return getProducts(env);

  const origin = new URL(request.url).origin;
  const cacheRequest = new Request(new URL(CATALOG_CACHE_KEY, origin).toString(), { method: "GET" });

  try {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      const data = await cached.json();
      if (Array.isArray(data?.products)) return data.products;
    }
  } catch {}

  const products = await getProducts(env);
  const validProducts = Array.isArray(products) ? products : [];

  try {
    const response = new Response(JSON.stringify({ products: validProducts }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CATALOG_CACHE_TTL}`
      }
    });
    await cache.put(cacheRequest, response);
  } catch {}

  return validProducts;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return value > 100000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function serializeProduct(product) {
  if (!product) {
    return null;
  }

  const price = getProductPrice(product);

  return {
    id: getProductId(product),
    product_id: getProductId(product),
    catalog_product_id: getCatalogProductId(product),
    country_id: getCountryId(product),
    country_name: getCountryName(product),
    platform_id: getPlatformId(product),
    platform_name: getPlatformName(product),
    service_id: getServiceId(product),
    service_name: getProductName(product),
    operator_id: getOperatorId(product),
    operator_name: getOperatorName(product),
    name: getProductName(product),
    price,
    provider_price: price,
    available: isProductAvailable(product),
    active: !isExplicitlyFalse(product?.active) && !isExplicitlyFalse(product?.is_active),
    metadata: product?.metadata ?? product?.raw ?? null
  };
}

function normalizeProviderStatus(value) {
  const status = String(value || "").trim().toUpperCase();

  if (status === "CANCELED") {
    return "CANCELLED";
  }

  return mapStatus(status);
}

function providerOrderData(data) {
  const normalized = data?.order && typeof data.order === "object" ? data.order : data;

  if (!normalized || typeof normalized !== "object") {
    return null;
  }

  return normalized;
}

function normalizeProviderOrder(data) {
  const order = providerOrderData(data);

  if (!order) {
    return null;
  }

  const id = positiveInteger(order.id ?? order.order_id);
  const status = normalizeProviderStatus(order.status);

  if (!id && !status) {
    return null;
  }

  return {
    id,
    status,
    provider_status: order.status ? String(order.status).toUpperCase() : null,
    phone_number: order.phone_number ?? null,
    otp_code: order.otp_code ?? null,
    otp_message: order.otp_message ?? null,
    otp_received_at: parseTimestamp(order.otp_received_at),
    expires_at: parseTimestamp(order.expires_at),
    canceled_at: parseTimestamp(order.canceled_at),
    failed_reason: order.failed_reason ?? order.failure_reason ?? null,
    amount: normalizePrice(order.amount),
    product_id: positiveInteger(order.product_id),
    catalog_product_id: positiveInteger(order.catalog_product_id),
    operator_id: positiveInteger(order.operator_id),
    operator_name: order.operator_name ?? null,
    can_cancel: order.can_cancel,
    can_resend: order.can_resend,
    resend_available_at: parseTimestamp(order.resend_available_at),
    can_reactivate: order.can_reactivate
  };
}

function normalizeOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
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
    provider_charge: row.provider_charge == null ? null : Number(row.provider_charge),
    provider_currency: row.provider_currency,
    status: row.status,
    provider_status: row.provider_status,
    failure_reason: row.failure_reason,
    phone_number: row.phone_number,
    otp_code: row.otp_code,
    otp_message: row.otp_message,
    otp_received_at: row.otp_received_at == null ? null : Number(row.otp_received_at),
    provider_expires_at: row.provider_expires_at == null ? null : Number(row.provider_expires_at),
    created_at: row.created_at == null ? null : Number(row.created_at),
    updated_at: row.updated_at == null ? null : Number(row.updated_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
    cancelled_at: row.cancelled_at == null ? null : Number(row.cancelled_at)
  };
}

async function getOrderRow(env, orderId) {
  return env.DB.prepare(`
    SELECT *
    FROM orders
    WHERE id = ? AND type = ?
    LIMIT 1
  `).bind(orderId, ORDER_TYPE).first();
}

async function getUserOrderRow(env, userId, { id = null, orderNumber = null } = {}) {
  if (id) {
    return env.DB.prepare(`
      SELECT *
      FROM orders
      WHERE id = ? AND user_id = ? AND type = ?
      LIMIT 1
    `).bind(id, userId, ORDER_TYPE).first();
  }

  if (orderNumber) {
    return env.DB.prepare(`
      SELECT *
      FROM orders
      WHERE order_number = ? AND user_id = ? AND type = ?
      LIMIT 1
    `).bind(orderNumber, userId, ORDER_TYPE).first();
  }

  return null;
}

async function getOrderByIdempotency(env, userId, key) {
  if (!key) {
    return null;
  }

  return env.DB.prepare(`
    SELECT *
    FROM orders
    WHERE user_id = ? AND type = ? AND idempotency_key = ?
    LIMIT 1
  `).bind(userId, ORDER_TYPE, key).first();
}

async function insertOrder(env, data) {
  const now = nowUnix();
  const orderNumber = generateOrderNumber("NOKOS");

  const result = await env.DB.prepare(`
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
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 'FIXED', ?, ?, ?, ?, NULL, ?, 'CREATING', NULL, NULL, ?, ?, NULL, ?, ?)
  `).bind(
    data.userId,
    orderNumber,
    ORDER_TYPE,
    PROVIDER,
    String(data.productId),
    data.serviceName,
    data.target,
    1,
    data.providerPrice,
    data.sellingPrice,
    data.providerAmount,
    data.customerAmount,
    PROVIDER_CURRENCY,
    safeJson(data.requestData),
    data.idempotencyKey,
    now,
    now
  ).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    throw new Error("Order NOKOS gagal dibuat.");
  }

  return getOrderRow(env, result.meta.last_row_id);
}

async function addOrderEvent(env, order, status, message = null, providerData = null) {
  if (!order?.id) {
    return;
  }

  await env.DB.prepare(`
    INSERT INTO order_events (
      order_id,
      status,
      provider_status,
      message,
      provider_data,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    order.id,
    status,
    order.provider_status ?? null,
    message,
    safeJson(providerData),
    nowUnix()
  ).run();
}

async function updateOrder(env, orderId, changes = {}) {
  const fields = [];
  const values = [];

  const mapping = {
    external_order_id: "external_order_id",
    provider_status: "provider_status",
    provider_data: "provider_data",
    status: "status",
    failure_reason: "failure_reason",
    phone_number: "phone_number",
    otp_code: "otp_code",
    otp_message: "otp_message",
    otp_received_at: "otp_received_at",
    provider_expires_at: "provider_expires_at",
    provider_charge: "provider_charge",
    completed_at: "completed_at",
    cancelled_at: "cancelled_at"
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      fields.push(`${column} = ?`);
      values.push(changes[key]);
    }
  }

  if (!fields.length) {
    return getOrderRow(env, orderId);
  }

  fields.push("updated_at = ?");
  values.push(nowUnix());
  values.push(orderId);
  values.push(ORDER_TYPE);

  await env.DB.prepare(`
    UPDATE orders
    SET ${fields.join(", ")}
    WHERE id = ? AND type = ?
  `).bind(...values).run();

  return getOrderRow(env, orderId);
}

async function setProviderState(env, order, providerResult, fallbackStatus = "UNKNOWN") {
  const normalized = normalizeProviderOrder(providerResult) || {};
  const status = normalized.status || fallbackStatus;
  const completedAt = status === "COMPLETED" ? nowUnix() : null;
  const cancelledAt = status === "CANCELLED" ? nowUnix() : null;

  const saved = await updateOrder(env, order.id, {
    external_order_id: normalized.id ? String(normalized.id) : order.external_order_id,
    provider_status: normalized.provider_status,
    provider_data: safeJson(providerResult),
    status,
    failure_reason: normalized.failed_reason,
    phone_number: normalized.phone_number,
    otp_code: normalized.otp_code,
    otp_message: normalized.otp_message,
    otp_received_at: normalized.otp_received_at,
    provider_expires_at: normalized.expires_at,
    provider_charge: normalized.amount,
    completed_at: completedAt,
    cancelled_at: cancelledAt
  });

  await addOrderEvent(env, saved, status, normalized.failed_reason, providerResult);
  return saved;
}

async function refundOrder(env, order, reason = "Refund order NOKOS") {
  const current = await getOrderRow(env, order.id);

  if (!current) {
    throw new Error("Order NOKOS tidak ditemukan.");
  }

  if (current.status === "REFUNDED") {
    return { order: current, refunded: false, alreadyRefunded: true };
  }

  if (!current.customer_amount || current.customer_amount <= 0) {
    throw new Error("Nominal refund NOKOS tidak valid.");
  }

  const reference = `REFUND:${current.order_number}`;
  const refund = await refundBalance(env, {
    userId: current.user_id,
    amount: Number(current.customer_amount),
    reference,
    description: reason,
    orderId: current.id
  });

  if (refund?.success === false) {
    throw new Error("Refund saldo NOKOS gagal.");
  }

  const saved = await updateOrder(env, current.id, {
    status: "REFUNDED",
    failure_reason: null
  });

  await addOrderEvent(env, saved, "REFUNDED", reason, null);

  return { order: saved, refunded: true, alreadyRefunded: false };
}

async function failAndRefund(env, order, reason) {
  const failed = await updateOrder(env, order.id, {
    status: "FAILED",
    failure_reason: reason
  });

  await addOrderEvent(env, failed, "FAILED", reason, null);

  try {
    return await refundOrder(env, failed, `Refund otomatis NOKOS: ${reason}`);
  } catch (error) {
    const saved = await updateOrder(env, failed.id, {
      status: "FAILED",
      failure_reason: `${reason} Refund gagal: ${String(error?.message || error)}`
    });

    return {
      order: saved,
      refunded: false,
      refundFailed: true
    };
  }
}

function validateCreatePayload(payload) {
  const productId = normalizeProductId(payload?.product_id ?? payload?.productId);
  const catalogProductId = normalizeCatalogProductId(payload?.catalog_product_id ?? payload?.catalogProductId);
  const countryId = normalizeCountryId(payload?.country_id ?? payload?.countryId);
  const platformId = normalizePlatformId(payload?.platform_id ?? payload?.platformId);
  const serviceId = normalizeServiceId(payload?.service_id ?? payload?.serviceId);
  const operatorId = normalizeOperatorId(payload?.operator_id ?? payload?.operatorId);
  const quantity = normalizeQuantity(payload?.quantity);
  const minPrice = normalizePrice(payload?.min_price ?? payload?.minPrice);
  const maxPrice = normalizePrice(payload?.max_price ?? payload?.maxPrice);
  const target = normalizeTarget(payload?.target ?? payload?.phone_number);
  const idempotencyKey = normalizeIdempotencyKey(payload?.idempotency_key ?? payload?.idempotencyKey);

  if (!productId && !catalogProductId) {
    return { error: "product_id atau catalog_product_id wajib diisi." };
  }

  if (productId && catalogProductId) {
    return { error: "Gunakan product_id atau catalog_product_id, bukan keduanya." };
  }

  if (!quantity) {
    return { error: "quantity NOKOS harus 1 karena satu order lokal mewakili satu nomor SMSCode." };
  }

  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    return { error: "min_price tidak boleh lebih besar dari max_price." };
  }

  if (payload?.idempotency_key != null && !idempotencyKey) {
    return { error: "idempotency_key hanya boleh berisi huruf, angka, underscore, atau hyphen dengan panjang maksimal 128 karakter." };
  }

  return {
    value: {
      productId,
      catalogProductId,
      countryId,
      platformId,
      serviceId,
      operatorId,
      quantity,
      minPrice,
      maxPrice,
      target,
      idempotencyKey
    }
  };
}

async function findProduct(env, input) {
  if (input.productId) {
    const product = await getProduct(env, input.productId);

    if (!product) {
      throw new Error("Produk NOKOS tidak ditemukan.");
    }

    return product;
  }

  const products = await getProducts(env, {
    countryId: input.countryId,
    platformId: input.platformId,
    serviceId: input.serviceId,
    operatorId: input.operatorId,
    available: true,
    active: true,
    limit: 10000,
    page: 1
  });

  if (!Array.isArray(products) || !products.length) {
    throw new Error("Produk NOKOS tidak tersedia.");
  }

  const filtered = products.filter(product => {
    if (input.catalogProductId && getCatalogProductId(product) !== input.catalogProductId) {
      return false;
    }

    const price = getProductPrice(product);

    if (input.minPrice !== null && price < input.minPrice) {
      return false;
    }

    if (input.maxPrice !== null && price > input.maxPrice) {
      return false;
    }

    return isProductAvailable(product) && price > 0;
  });

  filtered.sort((a, b) => getProductPrice(a) - getProductPrice(b));

  if (!filtered.length) {
    throw new Error("Produk NOKOS tidak tersedia.");
  }

  return filtered[0];
}

function providerCreateInput(payload, product) {
  const productId = getProductId(product);
  const catalogProductId = getCatalogProductId(product);

  const input = {
    quantity: 1,
    idempotencyKey: payload.idempotencyKey
  };

  if (productId) {
    input.productId = productId;
    return input;
  }

  if (catalogProductId) {
    input.catalogProductId = catalogProductId;
    input.operatorId = getOperatorId(product) || payload.operatorId;
    input.minPrice = payload.minPrice;
    input.maxPrice = payload.maxPrice;
    return input;
  }

  throw new Error("Produk SMSCode tidak memiliki product_id atau catalog_product_id.");
}

async function syncOrderFromProvider(env, order, providerOrder) {
  const saved = await setProviderState(env, order, providerOrder);

  if (saved.status === "EXPIRED" && order.status !== "REFUNDED") {
    try {
      return (await refundOrder(env, saved, "Refund otomatis karena order NOKOS expired")).order;
    } catch {}
  }

  return saved;
}

export async function listNokosProducts(request, env) {
  try {
    await requireAuth(request, env);
    const url = getUrl(request);

    const products = await getCachedCatalogProducts(request, env);
    const rawProducts = Array.isArray(products) ? products : [];
    const catalogDebug = {
      raw_count: rawProducts.length,
      sample_keys: rawProducts.length && rawProducts[0] && typeof rawProducts[0] === "object"
        ? Object.keys(rawProducts[0]).slice(0, 40)
        : [],
      products_with_price: rawProducts.filter(product => getProductPrice(product) > 0).length,
      products_with_id: rawProducts.filter(product => Boolean(getProductId(product) || getCatalogProductId(product))).length,
      products_available: rawProducts.filter(product => isProductAvailable(product)).length,
      products_valid: rawProducts.filter(product => isValidCatalogProduct(product)).length
    };
    const countryId = normalizeCountryId(url.searchParams.get("country_id"));
    const platformId = normalizePlatformId(url.searchParams.get("platform_id"));
    const serviceId = normalizeServiceId(url.searchParams.get("service_id"));
    const operatorId = normalizeOperatorId(url.searchParams.get("operator_id"));
    const minPrice = normalizePrice(url.searchParams.get("min_price"));
    const maxPrice = normalizePrice(url.searchParams.get("max_price"));
    const catalogProductId = normalizeCatalogProductId(url.searchParams.get("catalog_product_id"));

    const filtered = products.filter(product => {
      if (!isValidCatalogProduct(product)) return false;
      if (countryId && getCountryId(product) !== countryId) return false;
      if (platformId && getPlatformId(product) !== platformId) return false;
      if (serviceId && getServiceId(product) !== serviceId) return false;
      if (operatorId && getOperatorId(product) !== operatorId) return false;
      if (catalogProductId && getCatalogProductId(product) !== catalogProductId) return false;

      const price = getProductPrice(product);
      if (minPrice !== null && price < minPrice) return false;
      if (maxPrice !== null && price > maxPrice) return false;
      return true;
    });

    filtered.sort((a, b) => getProductPrice(a) - getProductPrice(b));

    return successResponse({
      products: filtered.map(serializeProduct),
      count: filtered.length,
      catalog_debug: catalogDebug,
      cached_for_seconds: CATALOG_CACHE_TTL
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil produk NOKOS.", error?.status || 500);
  }
}

export async function getNokosCountries(request, env) {
  try {
    await requireAuth(request, env);
    return successResponse({ countries: await getCountries(env) });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil negara NOKOS.", error?.status || 500);
  }
}

export async function getNokosServices(request, env) {
  try {
    await requireAuth(request, env);
    const url = getUrl(request);
    const countryId = normalizeCountryId(url.searchParams.get("country_id"));

    if (!countryId) {
      return errorResponse("country_id wajib diisi.", 400);
    }

    return successResponse({ services: await getServices(env, countryId) });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil layanan NOKOS.", error?.status || 500);
  }
}

export async function getNokosOperators(request, env) {
  try {
    await requireAuth(request, env);
    const url = getUrl(request);
    const countryId = normalizeCountryId(url.searchParams.get("country_id"));
    const platformId = normalizePlatformId(url.searchParams.get("platform_id"));

    return successResponse({
      operators: await getOperators(env, { countryId, platformId })
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil operator NOKOS.", error?.status || 500);
  }
}

export async function createNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const payload = await readJson(request);

    if (!payload) {
      return errorResponse("Payload JSON tidak valid.", 400);
    }

    const validation = validateCreatePayload(payload);

    if (validation.error) {
      return errorResponse(validation.error, 400);
    }

    const input = validation.value;

    if (input.idempotencyKey) {
      const existing = await getOrderByIdempotency(env, user.id, input.idempotencyKey);

      if (existing) {
        return successResponse({
          idempotent: true,
          order: normalizeOrder(existing)
        });
      }
    }

    const product = await findProduct(env, input);

    if (!isValidCatalogProduct(product)) {
      return errorResponse("Produk NOKOS sudah tidak tersedia atau harga tidak valid.", 409);
    }

    const providerPrice = getProductPrice(product);

    if (!providerPrice) {
      return errorResponse("Harga produk NOKOS tidak valid.", 409);
    }

    const customerAmount = providerPrice;
    const localOrder = await insertOrder(env, {
      userId: user.id,
      productId: getProductId(product) || getCatalogProductId(product),
      serviceName: getProductName(product),
      target: input.target,
      providerPrice,
      sellingPrice: customerAmount,
      providerAmount: providerPrice,
      customerAmount,
      requestData: {
        product_id: input.productId,
        catalog_product_id: input.catalogProductId,
        country_id: input.countryId,
        platform_id: input.platformId,
        service_id: input.serviceId,
        operator_id: input.operatorId,
        quantity: 1,
        min_price: input.minPrice,
        max_price: input.maxPrice,
        target: input.target
      },
      idempotencyKey: input.idempotencyKey
    });

    const debit = await debitBalance(env, {
      userId: user.id,
      amount: customerAmount,
      type: "PURCHASE",
      reference: `ORDER:${localOrder.order_number}`,
      description: `Pembelian NOKOS ${localOrder.order_number}`,
      orderId: localOrder.id
    });

    if (debit?.success === false) {
      const failed = await updateOrder(env, localOrder.id, {
        status: "FAILED",
        failure_reason: debit.insufficient ? "Saldo tidak mencukupi." : "Debit saldo gagal."
      });

      await addOrderEvent(env, failed, "FAILED", failed.failure_reason, null);

      return successResponse({
        created: true,
        providerCalled: false,
        insufficient: debit.insufficient === true,
        order: normalizeOrder(failed)
      }, 200);
    }

    let providerResult;

    try {
      providerResult = await createProviderOrder(env, providerCreateInput(input, product));
    } catch (error) {
      const result = await failAndRefund(env, localOrder, error?.message || "Provider SMSCode gagal membuat order.");

      return successResponse({
        created: true,
        providerCalled: true,
        refunded: result.refunded === true,
        refundFailed: result.refundFailed === true,
        order: normalizeOrder(result.order)
      }, 200);
    }

    const providerOrder = normalizeProviderOrder(providerResult);

    if (!providerOrder?.id) {
      const result = await failAndRefund(env, localOrder, "Response create order SMSCode tidak valid.");

      return successResponse({
        created: true,
        providerCalled: true,
        refunded: result.refunded === true,
        refundFailed: result.refundFailed === true,
        order: normalizeOrder(result.order)
      }, 200);
    }

    const saved = await setProviderState(env, localOrder, providerResult);

    return successResponse({
      created: true,
      providerCalled: true,
      refunded: false,
      order: normalizeOrder(saved)
    }, 201);
  } catch (error) {
    return errorResponse(error?.message || "Gagal membuat order NOKOS.", error?.status || 500);
  }
}

export async function getNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const url = getUrl(request);
    const id = positiveInteger(url.searchParams.get("id"));
    const orderNumber = cleanString(url.searchParams.get("order_number") || "", 120);

    const order = await getUserOrderRow(env, user.id, {
      id,
      orderNumber: id ? null : orderNumber
    });

    if (!order) {
      return errorResponse("Order NOKOS tidak ditemukan.", 404);
    }

    let saved = order;

    if (order.external_order_id && !TERMINAL_STATUSES.has(order.status)) {
      try {
        const provider = await getProviderOrder(env, order.external_order_id);
        saved = await syncOrderFromProvider(env, order, provider);
      } catch {}
    }

    const events = await env.DB.prepare(`
      SELECT id, status, provider_status, message, provider_data, created_at
      FROM order_events
      WHERE order_id = ?
      ORDER BY id ASC
    `).bind(saved.id).all();

    return successResponse({
      order: normalizeOrder(saved),
      events: events?.results || []
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil order NOKOS.", error?.status || 500);
  }
}

export async function listMyNokosOrders(request, env) {
  try {
    const user = await requireAuth(request, env);
    const url = getUrl(request);
    const limit = Math.min(positiveInteger(url.searchParams.get("limit")) || 20, MAX_ORDER_LIMIT);
    const offset = Math.max(integer(url.searchParams.get("offset"), 0) || 0, 0);
    const status = cleanString(url.searchParams.get("status") || "", 40).toUpperCase();

    const rows = await env.DB.prepare(`
      SELECT *
      FROM orders
      WHERE user_id = ? AND type = ?
      ${ORDER_STATUSES.has(status) ? "AND status = ?" : ""}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).bind(
      ...(ORDER_STATUSES.has(status) ? [user.id, ORDER_TYPE, status, limit, offset] : [user.id, ORDER_TYPE, limit, offset])
    ).all();

    return successResponse({
      orders: (rows?.results || []).map(normalizeOrder),
      limit,
      offset
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal mengambil daftar order NOKOS.", error?.status || 500);
  }
}

export async function syncNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const payload = await readJson(request);
    const orderId = positiveInteger(payload?.order_id ?? payload?.orderId);

    if (!orderId) {
      return errorResponse("order_id wajib diisi.", 400);
    }

    const order = await getUserOrderRow(env, user.id, { id: orderId });

    if (!order) {
      return errorResponse("Order NOKOS tidak ditemukan.", 404);
    }

    if (!order.external_order_id) {
      return errorResponse("Order belum memiliki ID provider.", 409);
    }

    const provider = await getProviderOrder(env, order.external_order_id);
    const saved = await syncOrderFromProvider(env, order, provider);

    return successResponse({ order: normalizeOrder(saved), synced: true });
  } catch (error) {
    return errorResponse(error?.message || "Gagal sinkronisasi order NOKOS.", error?.status || 502);
  }
}

export async function cancelNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const payload = await readJson(request);
    const orderId = positiveInteger(payload?.order_id ?? payload?.orderId);

    if (!orderId) {
      return errorResponse("order_id wajib diisi.", 400);
    }

    const order = await getUserOrderRow(env, user.id, { id: orderId });

    if (!order) {
      return errorResponse("Order NOKOS tidak ditemukan.", 404);
    }

    if (!order.external_order_id) {
      return errorResponse("Order belum memiliki ID provider.", 409);
    }

    if (order.status === "REFUNDED" || order.status === "CANCELLED") {
      return successResponse({ order: normalizeOrder(order), cancelled: false, alreadyCancelled: true });
    }

    const providerResult = await cancelProviderOrder(env, order.external_order_id);
    let saved = await setProviderState(env, order, providerResult, "CANCELLED");

    if (saved.status !== "REFUNDED") {
      const refund = await refundOrder(env, saved, "Refund order NOKOS dibatalkan.");
      saved = refund.order;
    }

    return successResponse({
      order: normalizeOrder(saved),
      cancelled: true,
      refunded: saved.status === "REFUNDED"
    });
  } catch (error) {
    return errorResponse(error?.message || "Gagal membatalkan order NOKOS.", error?.status || 502);
  }
}

export async function finishNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const payload = await readJson(request);
    const orderId = positiveInteger(payload?.order_id ?? payload?.orderId);

    if (!orderId) {
      return errorResponse("order_id wajib diisi.", 400);
    }

    const order = await getUserOrderRow(env, user.id, { id: orderId });

    if (!order) {
      return errorResponse("Order NOKOS tidak ditemukan.", 404);
    }

    if (!order.external_order_id) {
      return errorResponse("Order belum memiliki ID provider.", 409);
    }

    const providerResult = await finishProviderOrder(env, order.external_order_id);
    const saved = await setProviderState(env, order, providerResult, "COMPLETED");

    return successResponse({ order: normalizeOrder(saved) });
  } catch (error) {
    return errorResponse(error?.message || "Gagal menyelesaikan order NOKOS.", error?.status || 502);
  }
}

export async function resendNokosOrder(request, env) {
  try {
    const user = await requireAuth(request, env);
    const payload = await readJson(request);
    const orderId = positiveInteger(payload?.order_id ?? payload?.orderId);

    if (!orderId) {
      return errorResponse("order_id wajib diisi.", 400);
    }

    const order = await getUserOrderRow(env, user.id, { id: orderId });

    if (!order) {
      return errorResponse("Order NOKOS tidak ditemukan.", 404);
    }

    if (!order.external_order_id) {
      return errorResponse("Order belum memiliki ID provider.", 409);
    }

    const providerResult = await resendProviderOrder(env, order.external_order_id);
    const saved = await setProviderState(env, order, providerResult, order.status || "PROCESSING");

    return successResponse({ order: normalizeOrder(saved) });
  } catch (error) {
    return errorResponse(error?.message || "Gagal meminta OTP ulang.", error?.status || 502);
  }
}

export async function getNokosActiveProviderOrders(env) {
  return getActiveOrders(env);
}

export async function syncNokosActiveOrders(env) {
  const active = await getActiveOrders(env);
  const rows = Array.isArray(active) ? active : [];
  const results = [];

  for (const providerOrder of rows) {
    const normalized = normalizeProviderOrder(providerOrder);

    if (!normalized?.id) {
      continue;
    }

    const local = await env.DB.prepare(`
      SELECT *
      FROM orders
      WHERE type = ? AND provider = ? AND external_order_id = ?
      LIMIT 1
    `).bind(ORDER_TYPE, PROVIDER, String(normalized.id)).first();

    if (!local) {
      continue;
    }

    const saved = await syncOrderFromProvider(env, local, providerOrder);
    results.push(normalizeOrder(saved));
  }

  return results;
}

export async function getNokosStats(env) {
  const result = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'CREATING' THEN 1 ELSE 0 END) AS creating,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN status = 'OTP_RECEIVED' THEN 1 ELSE 0 END) AS otp_received,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired,
      SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunded,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
      COALESCE(SUM(customer_amount), 0) AS customer_amount
    FROM orders
    WHERE type = ?
  `).bind(ORDER_TYPE).first();

  return {
    total: Number(result?.total || 0),
    creating: Number(result?.creating || 0),
    pending: Number(result?.pending || 0),
    processing: Number(result?.processing || 0),
    otp_received: Number(result?.otp_received || 0),
    completed: Number(result?.completed || 0),
    cancelled: Number(result?.cancelled || 0),
    expired: Number(result?.expired || 0),
    refunded: Number(result?.refunded || 0),
    failed: Number(result?.failed || 0),
    customer_amount: Number(result?.customer_amount || 0)
  };
}

export async function handleNokos(request, env) {
  const url = getUrl(request);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && path === "/api/nokos/products") {
    return listNokosProducts(request, env);
  }

  if (request.method === "GET" && path === "/api/nokos/services") {
    return getNokosServices(request, env);
  }

  if (request.method === "GET" && path === "/api/nokos/countries") {
    return getNokosCountries(request, env);
  }

  if (request.method === "GET" && path === "/api/nokos/operators") {
    return getNokosOperators(request, env);
  }

  if (request.method === "POST" && path === "/api/nokos/orders") {
    return createNokosOrder(request, env);
  }

  if (request.method === "GET" && path === "/api/nokos/orders") {
    return listMyNokosOrders(request, env);
  }

  if (request.method === "GET" && path === "/api/nokos/order") {
    return getNokosOrder(request, env);
  }

  if (request.method === "POST" && path === "/api/nokos/order/sync") {
    return syncNokosOrder(request, env);
  }

  if (request.method === "POST" && path === "/api/nokos/order/cancel") {
    return cancelNokosOrder(request, env);
  }

  if (request.method === "POST" && path === "/api/nokos/order/finish") {
    return finishNokosOrder(request, env);
  }

  if (request.method === "POST" && path === "/api/nokos/order/resend") {
    return resendNokosOrder(request, env);
  }

  return errorResponse("Endpoint NOKOS tidak ditemukan.", 404);
}

export default {
  handleNokos,
  listNokosProducts,
  getNokosCountries,
  getNokosServices,
  getNokosOperators,
  createNokosOrder,
  getNokosOrder,
  listMyNokosOrders,
  syncNokosOrder,
  cancelNokosOrder,
  finishNokosOrder,
  resendNokosOrder,
  getNokosActiveProviderOrders,
  syncNokosActiveOrders,
  getNokosStats
};
