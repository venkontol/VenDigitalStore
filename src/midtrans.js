import {
  json,
  getSessionFromRequest,
  getActiveUserById,
  addBalance,
  now,
  randomOrderCode
} from "./utils.js";

const MIDTRANS_SANDBOX = "https://api.sandbox.midtrans.com";
const MIDTRANS_PRODUCTION = "https://api.midtrans.com";

function getMidtransBase(env) {
  return String(env.MIDTRANS_MODE || "sandbox").toLowerCase() === "production"
    ? MIDTRANS_PRODUCTION
    : MIDTRANS_SANDBOX;
}

function getServerKey(env) {
  const key = String(env.MIDTRANS_SERVER_KEY || "").trim();

  if (!key) {
    throw new Error("MIDTRANS_SERVER_KEY is not configured");
  }

  return key;
}

function getAuthorization(env) {
  const serverKey = getServerKey(env);
  return `Basic ${btoa(`${serverKey}:`)}`;
}

async function midtransRequest(env, path, options = {}) {
  const response = await fetch(`${getMidtransBase(env)}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: getAuthorization(env),
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const message =
      data?.status_message ||
      data?.message ||
      data?.error_messages?.[0] ||
      `Midtrans HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function positiveAmount(value) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

function createMerchantOrderId(userId) {
  return `VDS-${String(userId)}-${Date.now()}-${randomOrderCode(8)}`;
}

async function createQrisPayment(env, user, amount) {
  const grossAmount = positiveAmount(amount);

  if (!grossAmount) {
    throw new Error("Invalid deposit amount");
  }

  const orderId = createMerchantOrderId(user.id);

  const payload = {
    payment_type: "qris",
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount
    },
    customer_details: {
      first_name: user.first_name || user.username,
      email: `${user.username}@vendigitalstore.local`
    },
    qris: {
      acquirer: "gopay"
    },
    custom_expiry: {
      expiry_duration: 60,
      unit: "minute"
    }
  };

  const result = await midtransRequest(env, "/v2/charge", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const actions = Array.isArray(result.actions)
    ? result.actions
    : [];

  const qrAction =
    actions.find(
      item => item?.name === "generate-qr-code-v2"
    ) ||
    actions.find(
      item => item?.name === "generate-qr-code"
    );

  return {
    orderId,
    transactionId: result.transaction_id || null,
    grossAmount,
    transactionStatus: result.transaction_status || "pending",
    qrUrl: qrAction?.url || null,
    expiryTime: result.expiry_time || null,
    raw: result
  };
}

async function saveDeposit(env, userId, payment) {
  const timestamp = now();

  const referenceId = `MIDTRANS-${payment.transactionId || payment.orderId}`;

  await env.DB.prepare(`
    INSERT INTO deposits (
      user_id,
      reference_id,
      merchant_order_id,
      amount,
      provider,
      payment_method,
      status,
      provider_reference,
      signature_verified,
      expired_at,
      callback_data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'MIDTRANS', 'QRIS', 'PENDING', ?, 0, ?, ?, ?, ?)
  `)
    .bind(
      userId,
      referenceId,
      payment.orderId,
      payment.grossAmount,
      payment.transactionId,
      payment.expiryTime,
      JSON.stringify(payment.raw || {}),
      timestamp,
      timestamp
    )
    .run();

  return referenceId;
}

async function createDeposit(request, env) {
  const session = await getSessionFromRequest(request, env);

  if (!session?.user_id) {
    return json(
      {
        success: false,
        message: "Unauthorized"
      },
      401
    );
  }

  const user = await getActiveUserById(env, session.user_id);

  if (!user) {
    return json(
      {
        success: false,
        message: "User not found"
      },
      404
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        message: "Invalid JSON body"
      },
      400
    );
  }

  const amount = positiveAmount(
    body?.amount ?? body?.nominal
  );

  if (!amount) {
    return json(
      {
        success: false,
        message: "Invalid deposit amount"
      },
      400
    );
  }

  if (amount < 1000) {
    return json(
      {
        success: false,
        message: "Minimum deposit is Rp1.000"
      },
      400
    );
  }

  if (amount > 10000000) {
    return json(
      {
        success: false,
        message: "Maximum deposit is Rp10.000.000"
      },
      400
    );
  }

  try {
    const payment = await createQrisPayment(
      env,
      user,
      amount
    );

    await saveDeposit(
      env,
      user.id,
      payment
    );

    return json({
      success: true,
      provider: "MIDTRANS",
      payment_method: "QRIS",
      order_id: payment.orderId,
      transaction_id: payment.transactionId,
      amount: payment.grossAmount,
      status: payment.transactionStatus,
      qr_url: payment.qrUrl,
      expiry_time: payment.expiryTime
    });
  } catch (error) {
    console.error("MIDTRANS CREATE ERROR", error);

    return json(
      {
        success: false,
        message: error.message || "Failed to create payment"
      },
      error.status && error.status >= 400
        ? error.status
        : 500
    );
  }
}

async function verifySignature(env, notification) {
  const orderId = String(notification?.order_id || "");
  const statusCode = String(notification?.status_code || "");
  const grossAmount = String(notification?.gross_amount || "");
  const signatureKey = String(notification?.signature_key || "");

  if (
    !orderId ||
    !statusCode ||
    !grossAmount ||
    !signatureKey
  ) {
    return false;
  }

  const serverKey = getServerKey(env);

  const input =
    `${orderId}${statusCode}${grossAmount}${serverKey}`;

  const data = new TextEncoder().encode(input);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-512",
    data
  );

  const hashArray = Array.from(
    new Uint8Array(hashBuffer)
  );

  const calculated = hashArray
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");

  return calculated.toLowerCase() ===
    signatureKey.toLowerCase();
}

async function handleNotification(request, env) {
  let notification;

  try {
    notification = await request.json();
  } catch {
    return json(
      {
        success: false,
        message: "Invalid notification"
      },
      400
    );
  }

  const valid = await verifySignature(
    env,
    notification
  );

  if (!valid) {
    return json(
      {
        success: false,
        message: "Invalid signature"
      },
      401
    );
  }

  const orderId = String(
    notification.order_id || ""
  );

  const transactionStatus = String(
    notification.transaction_status || ""
  ).toLowerCase();

  const fraudStatus = String(
    notification.fraud_status || ""
  ).toLowerCase();

  const grossAmount = Number(
    notification.gross_amount
  );

  if (!orderId || !Number.isSafeInteger(grossAmount)) {
    return json(
      {
        success: false,
        message: "Invalid notification data"
      },
      400
    );
  }

  const deposit = await env.DB.prepare(`
    SELECT *
    FROM deposits
    WHERE merchant_order_id = ?
    LIMIT 1
  `)
    .bind(orderId)
    .first();

  if (!deposit) {
    return json({
      success: true,
      message: "Deposit not found"
    });
  }

  if (Number(deposit.amount) !== grossAmount) {
    console.error(
      "MIDTRANS AMOUNT MISMATCH",
      orderId
    );

    return json(
      {
        success: false,
        message: "Amount mismatch"
      },
      400
    );
  }

  const notificationData =
    JSON.stringify(notification);

  const timestamp = now();

  if (
    transactionStatus === "settlement" &&
    (
      fraudStatus === "accept" ||
      fraudStatus === ""
    )
  ) {
    if (deposit.status === "PAID") {
      return json({
        success: true,
        message: "Already processed"
      });
    }

    const referenceId =
      `DEPOSIT:${deposit.id}`;

    await addBalance(
      env,
      deposit.user_id,
      grossAmount,
      referenceId,
      `Midtrans QRIS deposit ${orderId}`
    );

    await env.DB.prepare(`
      UPDATE deposits
      SET
        status = 'PAID',
        provider_reference = ?,
        signature_verified = 1,
        paid_at = ?,
        callback_data = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        notification.transaction_id || null,
        notification.settlement_time || timestamp,
        notificationData,
        timestamp,
        deposit.id
      )
      .run();

    return json({
      success: true,
      message: "Payment processed"
    });
  }

  if (
    transactionStatus === "expire" ||
    transactionStatus === "cancel"
  ) {
    await env.DB.prepare(`
      UPDATE deposits
      SET
        status = ?,
        signature_verified = 1,
        callback_data = ?,
        updated_at = ?
      WHERE id = ?
      AND status = 'PENDING'
    `)
      .bind(
        transactionStatus === "expire"
          ? "EXPIRED"
          : "CANCELLED",
        notificationData,
        timestamp,
        deposit.id
      )
      .run();
  }

  return json({
    success: true,
    message: "Notification received"
  });
}

async function getDeposit(request, env) {
  const session = await getSessionFromRequest(
    request,
    env
  );

  if (!session?.user_id) {
    return json(
      {
        success: false,
        message: "Unauthorized"
      },
      401
    );
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");

  if (!orderId) {
    return json(
      {
        success: false,
        message: "order_id is required"
      },
      400
    );
  }

  const deposit = await env.DB.prepare(`
    SELECT
      id,
      reference_id,
      merchant_order_id,
      amount,
      provider,
      payment_method,
      status,
      provider_reference,
      paid_at,
      expired_at,
      created_at,
      updated_at
    FROM deposits
    WHERE merchant_order_id = ?
    AND user_id = ?
    LIMIT 1
  `)
    .bind(orderId, session.user_id)
    .first();

  if (!deposit) {
    return json(
      {
        success: false,
        message: "Deposit not found"
      },
      404
    );
  }

  return json({
    success: true,
    deposit
  });
}

export async function handleMidtrans(
  request,
  env,
  pathname
) {
  if (
    request.method === "POST" &&
    pathname === "/api/midtrans/deposit"
  ) {
    return createDeposit(request, env);
  }

  if (
    request.method === "POST" &&
    pathname === "/api/midtrans/webhook"
  ) {
    return handleNotification(request, env);
  }

  if (
    request.method === "GET" &&
    pathname === "/api/midtrans/deposit"
  ) {
    return getDeposit(request, env);
  }

  return json(
    {
      success: false,
      message: "Midtrans route not found"
    },
    404
  );
      }
