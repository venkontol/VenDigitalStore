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
"OTP_RECEIVED",
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
PARTIAL: [
"REFUNDED"
],
CANCELLED: [],
EXPIRED: [
"REFUNDED"
],
REFUNDED: [],
FAILED: [
"REFUNDED"
],
UNKNOWN: [
"PENDING",
"PROCESSING",
"OTP_RECEIVED",
"COMPLETED",
"PARTIAL",
"FAILED",
"CANCELLED",
"EXPIRED",
"REFUNDED"
]
};

const FIELD_COLUMNS = {
phoneNumber: "phone_number",
otpCode: "otp_code",
otpMessage: "otp_message",
otpReceivedAt: "otp_received_at",
providerExpiresAt: "provider_expires_at",
startCount: "start_count",
remains: "remains"
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
const unit = String(value || "")
.trim()
.toUpperCase();

return RATE_UNITS.has(unit)
? unit
: null;
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
if (
value === null ||
value === undefined ||
value === ""
) {
return null;
}

const number = Number(value);

if (
!Number.isSafeInteger(number) ||
number < 0
) {
return null;
}

return number;
}

function safeQuantity(value) {
const number =
Number(value);

if (
!Number.isSafeInteger(number) ||
number <= 0
) {
return null;
}

return number;
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
throw new Error(
"Data order tidak dapat disimpan."
);
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
user_id:
row.user_id === null ||
row.user_id === undefined
? null
: Number(row.user_id),
order_number: row.order_number,
type: row.type,
provider: row.provider,
external_order_id:
row.external_order_id,
service_id: row.service_id,
service_name: row.service_name,
target: row.target,
quantity:
Number(row.quantity || 0),
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
row.provider_currency,
status: row.status,
provider_status:
row.provider_status,
provider_data:
parseStoredData(
row.provider_data
),
request_data:
parseStoredData(
row.request_data
),
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
id: Number(row.id),
order_id:
Number(row.order_id),
status:
row.status,
provider_status:
row.provider_status,
message:
row.message,
provider_data:
parseStoredData(
row.provider_data
),
created_at:
row.created_at
};
}

function getOrderIdentifier(
request,
body = null
) {
const url =
new URL(request.url);

const queryId =
parsePositiveInteger(
url.searchParams.get("id")
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

const path =
url.pathname
.split("/")
.filter(Boolean);

let pathIdentifier = null;

const last =
path[path.length - 1];

if (
last &&
![
"orders",
"order",
"admin"
].includes(
last.toLowerCase()
)
) {
if (/^\d+$/.test(last)) {
pathIdentifier =
parsePositiveInteger(
last
);
} else if (
/^[A-Za-z0-9_-]+$/.test(last)
) {
pathIdentifier =
last.length <= 120
? last
: null;
}
}

if (
queryId ||
bodyId
) {
return {
id:
queryId ||
bodyId,
orderNumber:
null
};
}

const orderNumber =
queryNumber ||
bodyNumber ||
(
typeof pathIdentifier ===
"string"
? pathIdentifier
: null
);

if (
orderNumber
) {
return {
id: null,
orderNumber
};
}

if (
typeof pathIdentifier ===
"number"
) {
return {
id: pathIdentifier,
orderNumber: null
};
}

return {
id: null,
orderNumber: null
};
}

async function getOrderRowById(
env,
orderId
) {
return env.DB
.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1")
.bind(orderId)
.first();
}

async function getOrderRowByNumber(
env,
orderNumber
) {
return env.DB
.prepare("SELECT * FROM orders WHERE order_number = ? LIMIT 1")
.bind(orderNumber)
.first();
}

async function getUserOrderRow(
env,
userId,
identifier
) {
if (
identifier?.id
) {
return env.DB
.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1")
.bind(
identifier.id,
userId
)
.first();
}

if (
identifier?.orderNumber
) {
return env.DB
.prepare("SELECT * FROM orders WHERE order_number = ? AND user_id = ? LIMIT 1")
.bind(
identifier.orderNumber,
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
if (!idempotencyKey) {
return null;
}

return env.DB
.prepare("SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1")
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
const normalized =
normalizeStatus(status);

if (
!validStatus(normalized)
) {
throw new Error(
"Status event order tidak valid."
);
}

return env.DB
.prepare("INSERT INTO order_events ( order_id, status, provider_status, message, provider_data, created_at ) VALUES (?, ?, ?, ?, ?, ?)")
.bind(
orderId,
normalized,
providerStatus ===
null ||
providerStatus ===
undefined
? null
: String(
providerStatus
),
message === null ||
message === undefined
? null
: String(message),
serializeData(
providerData
),
nowUnix()
)
.run();
}

function validateTransition(
currentStatus,
nextStatus
) {
const current =
normalizeStatus(
currentStatus
);

const next =
normalizeStatus(
nextStatus
);

if (
current === next
) {
return true;
}

return Boolean(
STATUS_TRANSITIONS[
current
]?.includes(next)
);
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
fields = {},
completedAt,
cancelledAt,
eventMessage,
writeEvent = true
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

const currentStatus =
normalizeStatus(
current.status
);

const nextStatus =
status === undefined
? currentStatus
: normalizeStatus(status);

if (
!validStatus(nextStatus)
) {
throw new Error(
"Status order tidak valid."
);
}

if (
!validateTransition(
currentStatus,
nextStatus
)
) {
throw new Error(
"Perubahan status ${currentStatus} ke ${nextStatus} tidak diizinkan."
);
}

const allowedFields = {
phoneNumber:
current.phone_number,
otpCode:
current.otp_code,
otpMessage:
current.otp_message,
otpReceivedAt:
current.otp_received_at,
providerExpiresAt:
current.provider_expires_at,
startCount:
current.start_count,
remains:
current.remains
};

for (
const key of Object.keys(
FIELD_COLUMNS
)
) {
if (
Object.prototype.hasOwnProperty.call(
fields,
key
)
) {
allowedFields[key] =
fields[key];
}
}

const finalCompletedAt =
completedAt !== undefined
? completedAt
: (
nextStatus ===
"COMPLETED"
? (
current.completed_at ||
nowUnix()
)
: current.completed_at
);

const finalCancelledAt =
cancelledAt !== undefined
? cancelledAt
: (
nextStatus ===
"CANCELLED"
? (
current.cancelled_at ||
nowUnix()
)
: current.cancelled_at
);

const values = [
externalOrderId !== undefined
? externalOrderId
: current.external_order_id,

nextStatus,

providerStatus !== undefined
  ? providerStatus
  : current.provider_status,

providerData !== undefined
  ? serializeData(
      providerData
    )
  : current.provider_data,

failureReason !== undefined
  ? failureReason
  : current.failure_reason,

providerAmount !== undefined
  ? providerAmount
  : current.provider_amount,

providerCharge !== undefined
  ? providerCharge
  : current.provider_charge,

allowedFields.phoneNumber,
allowedFields.otpCode,
allowedFields.otpMessage,
allowedFields.otpReceivedAt,
allowedFields.providerExpiresAt,
allowedFields.startCount,
allowedFields.remains,

finalCompletedAt,
finalCancelledAt,
nowUnix(),
orderId

];

await env.DB
.prepare("UPDATE orders SET external_order_id = ?, status = ?, provider_status = ?, provider_data = ?, failure_reason = ?, provider_amount = ?, provider_charge = ?, phone_number = ?, otp_code = ?, otp_message = ?, otp_received_at = ?, provider_expires_at = ?, start_count = ?, remains = ?, completed_at = ?, cancelled_at = ?, updated_at = ? WHERE id = ?")
.bind(...values)
.run();

const updated =
await getOrderRowById(
env,
orderId
);

if (
writeEvent &&
(
nextStatus !==
currentStatus ||
providerStatus !==
undefined ||
providerData !==
undefined ||
failureReason !==
undefined ||
Object.keys(fields).length
)
) {
await addOrderEvent(
env,
{
orderId,
status:
nextStatus,
providerStatus:
updated.provider_status,
message:
eventMessage ||
null,
providerData:
providerData !==
undefined
? providerData
: parseStoredData(
updated.provider_data
)
}
);
}

return updated;
}

async function createOrderRecord(
env,
input
) {
const {
userId,
orderNumber,
type,
provider,
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
requestData = null,
idempotencyKey = null,
metadata = null
} = input;

if (
!Number.isSafeInteger(
Number(userId)
) ||
Number(userId) <= 0
) {
throw new Error(
"userId tidak valid."
);
}

const normalizedType =
normalizeType(type);

const normalizedProvider =
normalizeProvider(provider);

const normalizedRateUnit =
normalizeRateUnit(
rateUnit
);

if (
!normalizedType
) {
throw new Error(
"Tipe order tidak valid."
);
}

if (
!normalizedProvider
) {
throw new Error(
"Provider order tidak valid."
);
}

if (
!normalizedRateUnit
) {
throw new Error(
"Rate unit order tidak valid."
);
}

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
!parsedQuantity
) {
throw new Error(
"Quantity order tidak valid."
);
}

if (
parsedProviderRate ===
null ||
parsedSellingRate ===
null ||
parsedProviderAmount ===
null ||
parsedCustomerAmount ===
null
) {
throw new Error(
"Nilai harga order tidak valid."
);
}

const parsedProviderCharge =
providerCharge ===
null ||
providerCharge ===
undefined ||
providerCharge ===
""
? null
: safeMoney(
providerCharge
);

if (
providerCharge !==
null &&
providerCharge !==
undefined &&
providerCharge !==
"" &&
parsedProviderCharge ===
null
) {
throw new Error(
"Provider charge tidak valid."
);
}

const finalOrderNumber =
cleanString(
orderNumber,
120
) ||
generateOrderNumber(
normalizedType ===
"NOKOS"
? "NK"
: "SOSMED"
);

const timestamp =
nowUnix();

const requestValue =
requestData ===
undefined
? null
: serializeData(
requestData
);

const metadataValue =
metadata ===
undefined
? null
: serializeData(
metadata
);

let result;

try {
result =
await env.DB
.prepare("INSERT INTO orders ( user_id, order_number, type, provider, external_order_id, service_id, service_name, target, quantity, rate_unit, provider_rate, selling_rate, provider_amount, customer_amount, provider_charge, provider_currency, status, provider_status, provider_data, request_data, idempotency_key, failure_reason, phone_number, otp_code, otp_message, otp_received_at, provider_expires_at, start_count, remains, created_at, updated_at, completed_at, cancelled_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATING', NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL )")
.bind(
Number(userId),
finalOrderNumber,
normalizedType,
normalizedProvider,
externalOrderId ===
null
? null
: String(
externalOrderId
),
serviceId ===
null
? null
: String(
serviceId
),
serviceName ===
null
? null
: String(
serviceName
),
target === null
? null
: String(target),
parsedQuantity,
normalizedRateUnit,
parsedProviderRate,
parsedSellingRate,
parsedProviderAmount,
parsedCustomerAmount,
parsedProviderCharge,
providerCurrency
? String(
providerCurrency
).toUpperCase()
: "IDR",
requestValue,
idempotencyKey ===
null
? null
: String(
idempotencyKey
),
timestamp,
timestamp
)
.run();
} catch (error) {
if (
idempotencyKey
) {
const existing =
await getOrderByIdempotencyKey(
env,
userId,
idempotencyKey
);

  if (existing) {
    return {
      order: existing,
      created: false,
      idempotent: true
    };
  }
}

throw error;

}

const orderId =
Number(
result?.meta?.last_row_id ||
0
);

if (!orderId) {
throw new Error(
"Gagal membuat order."
);
}

await addOrderEvent(
env,
{
orderId,
status:
"CREATING",
message:
metadataValue
? "Order berhasil dibuat."
: "Order berhasil dibuat."
}
);

const order =
await getOrderRowById(
env,
orderId
);

return {
order,
created: true,
idempotent: false
};
}

function validateInput(
input
) {
if (
!input ||
typeof input !==
"object"
) {
throw new Error(
"Data order tidak valid."
);
}

const type =
normalizeType(
input.type
);

const provider =
normalizeProvider(
input.provider
);

if (!type) {
throw new Error(
"Tipe order tidak valid."
);
}

if (!provider) {
throw new Error(
"Provider order tidak valid."
);
}

if (
type === "NOKOS" &&
provider !== "SMSCODE"
) {
throw new Error(
"Order NOKOS harus menggunakan provider SMSCODE."
);
}

if (
type === "SOCIAL" &&
provider !== "BUZZERPANEL"
) {
throw new Error(
"Order SOCIAL harus menggunakan provider BUZZERPANEL."
);
}

const quantity =
safeQuantity(
input.quantity
);

if (!quantity) {
throw new Error(
"Quantity order tidak valid."
);
}

const customerAmount =
safeMoney(
input.customerAmount
);

const providerAmount =
safeMoney(
input.providerAmount
);

const providerRate =
safeMoney(
input.providerRate
);

const sellingRate =
safeMoney(
input.sellingRate
);

if (
customerAmount ===
null ||
customerAmount <= 0
) {
throw new Error(
"Customer amount tidak valid."
);
}

if (
providerAmount ===
null ||
providerAmount < 0
) {
throw new Error(
"Provider amount tidak valid."
);
}

if (
providerRate ===
null ||
providerRate < 0
) {
throw new Error(
"Provider rate tidak valid."
);
}

if (
sellingRate ===
null ||
sellingRate < 0
) {
throw new Error(
"Selling rate tidak valid."
);
}

const rateUnit =
normalizeRateUnit(
input.rateUnit ||
"FIXED"
);

if (!rateUnit) {
throw new Error(
"Rate unit tidak valid."
);
}

const idempotencyKey =
cleanString(
input.idempotencyKey ||
input.idempotency_key ||
"",
128
);

if (
!idempotencyKey
) {
throw new Error(
"Idempotency-Key wajib diisi."
);
}

return {
...input,
type,
provider,
quantity,
customerAmount,
providerAmount,
providerRate,
sellingRate,
rateUnit,
idempotencyKey
};
}

function normalizeProviderResult(
result
) {
if (
!result ||
typeof result !==
"object"
) {
return {
externalOrderId:
null,
status:
"UNKNOWN",
providerStatus:
null,
providerData:
null,
providerCharge:
null,
fields: {},
failureReason:
"Provider tidak memberikan respons yang dapat diproses.",
uncertain: true
};
}

const status =
validStatus(
result.status
)
? normalizeStatus(
result.status
)
: "UNKNOWN";

const fields =
result.fields &&
typeof result.fields ===
"object"
? result.fields
: {};

return {
externalOrderId:
result.externalOrderId ??
result.external_order_id ??
result.id ??
null,

status,

providerStatus:
  result.providerStatus ??
  result.provider_status ??
  null,

providerData:
  result.providerData ??
  result.provider_data ??
  result.data ??
  null,

providerCharge:
  result.providerCharge ??
  result.provider_charge ??
  null,

fields,

failureReason:
  result.failureReason ??
  result.failure_reason ??
  null,

uncertain:
  Boolean(
    result.uncertain
  )

};
}

function providerHasDefiniteFailure(
result
) {
if (
!result
) {
return false;
}

if (
result.uncertain
) {
return false;
}

const status =
normalizeStatus(
result.status
);

if (
status ===
"FAILED" ||
status ===
"CANCELLED" ||
status ===
"EXPIRED"
) {
return true;
}

if (
result.failureReason &&
!result.externalOrderId
) {
return true;
}

return false;
}

async function refundOrder(
env,
order,
message =
"Refund order"
) {
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
status ===
"REFUNDED"
) {
return {
order,
refunded: false,
alreadyRefunded: true
};
}

const amount =
safeMoney(
order.customer_amount
);

if (
amount ===
null ||
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
Number(
order.user_id
),
amount,
reference:
"REFUND:${order.order_number}",
description:
message ||
"Refund ${order.order_number}",
orderId:
Number(order.id)
}
);

if (
refund?.success ===
false
) {
throw new Error(
refund.error ||
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
null,
eventMessage:
message ||
"Saldo order dikembalikan."
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

async function markProviderResult(
env,
order,
providerResult
) {
const result =
normalizeProviderResult(
providerResult
);

let nextStatus =
result.status;

if (
result.uncertain
) {
nextStatus =
"UNKNOWN";
}

const updated =
await updateOrderRow(
env,
order.id,
{
status:
nextStatus,
externalOrderId:
result.externalOrderId,
providerStatus:
result.providerStatus,
providerData:
result.providerData,
providerCharge:
result.providerCharge,
failureReason:
result.failureReason,
fields:
result.fields,
eventMessage:
result.failureReason ||
"Provider menghasilkan status ${nextStatus}."
}
);

return {
order:
updated,
provider:
result
};
}

async function resolveAdapter(
adapter
) {
if (
!adapter ||
typeof adapter !==
"object"
) {
throw new Error(
"Provider adapter wajib disediakan."
);
}

if (
typeof adapter.createOrder !==
"function" &&
typeof adapter.create !==
"function"
) {
throw new Error(
"Provider adapter tidak memiliki createOrder."
);
}

return adapter;
}

async function callCreateAdapter(
adapter,
env,
context
) {
if (
typeof adapter.createOrder ===
"function"
) {
return adapter.createOrder(
env,
context
);
}

return adapter.create(
env,
context
);
}

async function callStatusAdapter(
adapter,
env,
context
) {
if (
typeof adapter.getOrder ===
"function"
) {
return adapter.getOrder(
env,
context
);
}

if (
typeof adapter.getStatus ===
"function"
) {
return adapter.getStatus(
env,
context
);
}

throw new Error(
"Provider adapter tidak memiliki getOrder atau getStatus."
);
}

async function callCancelAdapter(
adapter,
env,
context
) {
if (
typeof adapter.cancelOrder ===
"function"
) {
return adapter.cancelOrder(
env,
context
);
}

if (
typeof adapter.cancel ===
"function"
) {
return adapter.cancel(
env,
context
);
}

return {
supported:
false
};
}

export async function createOrder(
env,
input,
adapter
) {
const normalized =
validateInput(
input
);

await resolveAdapter(
adapter
);

const existing =
await getOrderByIdempotencyKey(
env,
normalized.userId,
normalized.idempotencyKey
);

if (
existing
) {
return {
success:
true,
created:
false,
idempotent:
true,
order:
formatOrder(
existing
)
};
}

const created =
await createOrderRecord(
env,
normalized
);

if (
!created.created
) {
return {
success:
true,
created:
false,
idempotent:
true,
order:
formatOrder(
created.order
)
};
}

let order =
created.order;

let debit;

try {
debit =
await debitBalance(
env,
{
userId:
normalized.userId,
amount:
normalized.customerAmount,
type:
"PURCHASE",
reference:
"ORDER:${order.id}",
description:
"Pembelian ${order.order_number}",
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
"Gagal melakukan debit saldo.",
eventMessage:
"Debit saldo order gagal."
}
);

throw error;

}

if (
debit?.success ===
false
) {
order =
await updateOrderRow(
env,
order.id,
{
status:
"FAILED",
failureReason:
debit.error ||
"Saldo tidak mencukupi.",
eventMessage:
"Order gagal karena saldo tidak mencukupi."
}
);

return {
  success:
    false,
  created:
    true,
  idempotent:
    false,
  insufficient:
    true,
  order:
    formatOrder(
      order
    )
};

}

try {
const providerResult =
await callCreateAdapter(
adapter,
env,
{
order:
formatOrder(
order
),
requestData:
normalized.requestData,
metadata:
normalized.metadata
}
);

const saved =
  await markProviderResult(
    env,
    order,
    providerResult
  );

order =
  saved.order;

if (
  providerHasDefiniteFailure(
    saved.provider
  )
) {
  const refunded =
    await refundOrder(
      env,
      order,
      saved.provider.failureReason ||
      "Provider gagal."
    );

  return {
    success:
      true,
    created:
      true,
    idempotent:
      false,
    charged:
      false,
    refunded:
      true,
    order:
      formatOrder(
        refunded.order
      )
  };
}

return {
  success:
    true,
  created:
    true,
  idempotent:
    false,
  charged:
    true,
  refunded:
    false,
  order:
    formatOrder(
      order
    )
};

} catch (error) {
const message =
error?.message ||
"Provider tidak dapat dipastikan.";

try {
  order =
    await updateOrderRow(
      env,
      order.id,
      {
        status:
          "UNKNOWN",
        failureReason:
          message,
        eventMessage:
          "Status provider belum dapat dipastikan."
      }
    );
} catch {
  order =
    await getOrderRowById(
      env,
      order.id
    );
}

return {
  success:
    false,
  created:
    true,
  idempotent:
    false,
  charged:
    true,
  refunded:
    false,
  uncertain:
    true,
  error:
    "Order sudah dibuat tetapi status provider belum dapat dipastikan.",
  order:
    formatOrder(
      order
    )
};

}
}

export async function syncOrder(
env,
order,
adapter
) {
if (!order) {
throw new Error(
"Order tidak ditemukan."
);
}

if (
!order.external_order_id
) {
throw new Error(
"Order belum memiliki external order ID."
);
}

await resolveAdapter(
adapter
);

const providerResult =
await callStatusAdapter(
adapter,
env,
{
order:
formatOrder(
order
),
externalOrderId:
order.external_order_id
}
);

const saved =
await markProviderResult(
env,
order,
providerResult
);

let current =
saved.order;

if (
providerHasDefiniteFailure(
saved.provider
)
) {
const refunded =
await refundOrder(
env,
current,
saved.provider.failureReason ||
"Provider gagal."
);

current =
  refunded.order;

}

return {
success:
true,
order:
formatOrder(
current
)
};
}

export async function cancelOrderById(
env,
order,
adapter
) {
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
status ===
"REFUNDED"
) {
return {
success:
true,
order:
formatOrder(
order
),
refunded:
true
};
}

if (
isFinalStatus(
status
)
) {
throw new Error(
"Order sudah berada pada status akhir."
);
}

if (
!order.external_order_id
) {
const updated =
await updateOrderRow(
env,
order.id,
{
status:
"CANCELLED",
cancelledAt:
nowUnix(),
eventMessage:
"Order dibatalkan sebelum memiliki external order ID."
}
);

const refunded =
  await refundOrder(
    env,
    updated,
    "Refund order yang dibatalkan."
  );

return {
  success:
    true,
  order:
    formatOrder(
      refunded.order
    ),
  refunded:
    true
};

}

await resolveAdapter(
adapter
);

const providerResult =
await callCancelAdapter(
adapter,
env,
{
order:
formatOrder(
order
),
externalOrderId:
order.external_order_id
}
);

if (
providerResult?.supported ===
false
) {
throw new Error(
"Provider tidak mendukung pembatalan order."
);
}

const normalized =
normalizeProviderResult(
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
status:
"UNKNOWN",
providerStatus:
normalized.providerStatus,
providerData:
normalized.providerData,
failureReason:
normalized.failureReason ||
"Pembatalan provider belum dapat dipastikan.",
fields:
normalized.fields,
eventMessage:
"Pembatalan provider belum dapat dipastikan."
}
);

return {
  success:
    false,
  uncertain:
    true,
  refunded:
    false,
  order:
    formatOrder(
      updated
    )
};

}

const cancelled =
await updateOrderRow(
env,
order.id,
{
status:
"CANCELLED",
providerStatus:
normalized.providerStatus,
providerData:
normalized.providerData,
fields:
normalized.fields,
failureReason:
normalized.failureReason,
cancelledAt:
nowUnix(),
eventMessage:
"Order berhasil dibatalkan."
}
);

const refunded =
await refundOrder(
env,
cancelled,
"Refund order yang dibatalkan."
);

return {
success:
true,
order:
formatOrder(
refunded.order
),
refunded:
true
};
}

export async function getOrderById(
env,
orderId
) {
return formatOrder(
await getOrderRowById(
env,
orderId
)
);
}

export async function getOrderByNumber(
env,
orderNumber
) {
return formatOrder(
await getOrderRowByNumber(
env,
orderNumber
)
);
}

export async function getUserOrder(
env,
userId,
identifier
) {
return formatOrder(
await getUserOrderRow(
env,
userId,
identifier
)
);
}

export async function findOrderByIdempotency(
env,
userId,
idempotencyKey
) {
return formatOrder(
await getOrderByIdempotencyKey(
env,
userId,
idempotencyKey
)
);
}

export async function listOrdersByUser(
env,
userId,
{
limit = 50,
offset = 0,
type = null,
status = null
} = {}
) {
const safeLimit =
Math.min(
Math.max(
Number(limit) || 50,
1
),
100
);

const safeOffset =
Math.max(
Number(offset) || 0,
0
);

const conditions = [
"user_id = ?"
];

const bindings = [
Number(userId)
];

if (type) {
const normalizedType =
normalizeType(
type
);

if (
  normalizedType
) {
  conditions.push(
    "type = ?"
  );
  bindings.push(
    normalizedType
  );
}

}

if (status) {
const normalizedStatus =
normalizeStatus(
status
);

if (
  validStatus(
    normalizedStatus
  )
) {
  conditions.push(
    "status = ?"
  );
  bindings.push(
    normalizedStatus
  );
}

}

bindings.push(
safeLimit,
safeOffset
);

const result =
await env.DB
.prepare("SELECT * FROM orders WHERE ${conditions.join( " AND " )} ORDER BY id DESC LIMIT ? OFFSET ?")
.bind(
...bindings
)
.all();

return (
result?.results ||
[]
).map(
formatOrder
);
}

export async function getOrderEvents(
env,
orderId
) {
const result =
await env.DB
.prepare("SELECT id, order_id, status, provider_status, message, provider_data, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC")
.bind(
orderId
)
.all();

return (
result?.results ||
[]
).map(
formatEvent
);
}

export async function cancelOrder(
request,
env,
adapter
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

const data =
  await readJson(
    request
  );

const identifier =
  getOrderIdentifier(
    request,
    data
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

const result =
  await cancelOrderById(
    env,
    order,
    adapter
  );

if (
  result.uncertain
) {
  return errorResponse(
    "Pembatalan provider belum dapat dipastikan.",
    502,
    {
      order:
        result.order
    }
  );
}

return successResponse({
  order:
    result.order,
  refunded:
    result.refunded
});

} catch (error) {
return errorResponse(
error?.message ||
"Gagal membatalkan order.",
error?.status ||
500
);
}
}

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
  new URL(request.url);

const limit =
  Math.min(
    Math.max(
      Number(
        url.searchParams.get(
          "limit"
        )
      ) || 50,
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

const type =
  normalizeType(
    url.searchParams.get(
      "type"
    )
  );

const status =
  normalizeStatus(
    url.searchParams.get(
      "status"
    )
  );

const conditions = [];
const bindings = [];

if (type) {
  conditions.push(
    "o.type = ?"
  );
  bindings.push(
    type
  );
}

if (
  validStatus(status)
) {
  conditions.push(
    "o.status = ?"
  );
  bindings.push(
    status
  );
}

bindings.push(
  limit,
  offset
);

const result =
  await env.DB
    .prepare(`
      SELECT
        o.*,
        u.username,
        u.email
      FROM orders o
      LEFT JOIN users u
        ON u.id = o.user_id
      ${
        conditions.length
          ? `WHERE ${conditions.join(
              " AND "
            )}`
          : ""
      }
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `)
    .bind(
      ...bindings
    )
    .all();

const orders =
  (
    result?.results ||
    []
  ).map(
    row => ({
      ...formatOrder(
        row
      ),
      username:
        row.username,
      email:
        row.email
    })
  );

return successResponse({
  orders,
  limit,
  offset
});

} catch (error) {
return errorResponse(
error?.message ||
"Gagal mengambil daftar order.",
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
    ? await readJson(
        request
      )
    : body;

const identifier =
  getOrderIdentifier(
    request,
    data
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

const nextStatus =
  normalizeStatus(
    data?.status
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

const currentStatus =
  normalizeStatus(
    order.status
  );

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
  nextStatus ===
    "REFUNDED"
) {
  const result =
    await refundOrder(
      env,
      order,
      cleanString(
        data?.message ||
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
        data?.failure_reason ??
        data?.failureReason ??
        (
          nextStatus ===
            "FAILED"
            ? (
                cleanString(
                  data?.message,
                  500
                ) ||
                "Order gagal."
              )
            : order.failure_reason
        ),
      eventMessage:
        cleanString(
          data?.message ||
          `Status order diubah admin menjadi ${nextStatus}.`,
          500
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
    ? await readJson(
        request
      )
    : body;

const identifier =
  getOrderIdentifier(
    request,
    data
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
  await refundOrder(
    env,
    order,
    cleanString(
      data?.message ||
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

const data =
  await readJson(
    request
  );

const identifier =
  getOrderIdentifier(
    request,
    data
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

return successResponse({
  order:
    formatOrder(
      order
    ),
  events:
    await getOrderEvents(
      env,
      order.id
    )
});

} catch (error) {
return errorResponse(
error?.message ||
"Gagal mengambil detail order.",
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
validStatus,
isFinalStatus,
formatOrder,
formatEvent,
addOrderEvent,
updateOrderRow,
createOrderRecord,
refundOrder,
normalizeProviderResult,
providerHasDefiniteFailure
};

export default {
createOrder,
syncOrder,
cancelOrder,
cancelOrderById,
getOrder,
getOrderById,
getOrderByNumber,
getUserOrder,
findOrderByIdempotency,
listOrdersByUser,
getOrderEvents,
adminGetOrders,
adminUpdateOrderStatus,
adminRefundOrder
};
