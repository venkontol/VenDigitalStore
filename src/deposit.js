import {
  json,
  now,
  money,
  number,
  randomReference,
  getSessionFromRequest,
  getUserById,
  dbFirst,
  dbRun
} from "./utils.js";

const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 10000000;

function validAmount(value) {
  const amount = Math.round(number(value));

  if (!Number.isSafeInteger(amount)) {
    return false;
  }

  return amount >= MIN_DEPOSIT && amount <= MAX_DEPOSIT;
}

function generateMerchantOrderId() {
  return randomReference("VDS", 16);
}

export async function createDeposit(request, env) {
  const session = await getSessionFromRequest(env, request);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  const user = await getUserById(env, session.user_id);

  if (!user || user.status !== "ACTIVE") {
    return json(
      {
        success: false,
        error: "Akun tidak aktif."
      },
      403
    );
  }

  let data;

  try {
    data = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const amount = Math.round(number(data?.amount));

  if (!validAmount(amount)) {
    return json(
      {
        success: false,
        error: `Nominal deposit minimal ${money(MIN_DEPOSIT)} dan maksimal ${money(MAX_DEPOSIT)}.`
      },
      400
    );
  }

  const referenceId = randomReference("DEP", 16);
  const merchantOrderId = generateMerchantOrderId();
  const createdAt = now();

  const expiredAt = new Date(
    Date.now() + 60 * 60 * 1000
  ).toISOString();

  try {
    await dbRun(
      env,
      `
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
        paid_at,
        expired_at,
        callback_data,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'DUITKU', ?, 'PENDING', NULL, 0, NULL, ?, '{}', ?, ?)
      `,
      Number(user.id),
      referenceId,
      merchantOrderId,
      amount,
      data?.payment_method
        ? String(data.payment_method).trim()
        : null,
      expiredAt,
      createdAt,
      createdAt
    );

    const deposit = await dbFirst(
      env,
      `
      SELECT
        id,
        user_id,
        reference_id,
        merchant_order_id,
        amount,
        provider,
        payment_method,
        status,
        provider_reference,
        signature_verified,
        paid_at,
        expired_at,
        created_at,
        updated_at
      FROM deposits
      WHERE reference_id = ?
      LIMIT 1
      `,
      referenceId
    );

    if (!deposit) {
      return json(
        {
          success: false,
          error: "Deposit gagal dibuat."
        },
        500
      );
    }

    return json(
      {
        success: true,
        message: "Deposit berhasil dibuat.",
        deposit: {
          id: Number(deposit.id),
          reference_id: deposit.reference_id,
          merchant_order_id: deposit.merchant_order_id,
          amount: Number(deposit.amount),
          amount_formatted: money(deposit.amount),
          provider: deposit.provider,
          payment_method: deposit.payment_method,
          status: deposit.status,
          expired_at: deposit.expired_at,
          created_at: deposit.created_at
        }
      },
      201
    );
  } catch (error) {
    console.error("CREATE_DEPOSIT_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal membuat deposit."
      },
      500
    );
  }
}

export async function getDeposit(request, env) {
  const session = await getSessionFromRequest(env, request);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  const url = new URL(request.url);

  const referenceId =
    String(
      url.searchParams.get("reference_id") || ""
    ).trim();

  const merchantOrderId =
    String(
      url.searchParams.get("merchant_order_id") || ""
    ).trim();

  if (!referenceId && !merchantOrderId) {
    return json(
      {
        success: false,
        error: "Reference deposit wajib."
      },
      400
    );
  }

  let deposit;

  if (referenceId) {
    deposit = await dbFirst(
      env,
      `
      SELECT
        id,
        user_id,
        reference_id,
        merchant_order_id,
        amount,
        provider,
        payment_method,
        status,
        provider_reference,
        signature_verified,
        paid_at,
        expired_at,
        created_at,
        updated_at
      FROM deposits
      WHERE user_id = ?
        AND reference_id = ?
      LIMIT 1
      `,
      Number(session.user_id),
      referenceId
    );
  } else {
    deposit = await dbFirst(
      env,
      `
      SELECT
        id,
        user_id,
        reference_id,
        merchant_order_id,
        amount,
        provider,
        payment_method,
        status,
        provider_reference,
        signature_verified,
        paid_at,
        expired_at,
        created_at,
        updated_at
      FROM deposits
      WHERE user_id = ?
        AND merchant_order_id = ?
      LIMIT 1
      `,
      Number(session.user_id),
      merchantOrderId
    );
  }

  if (!deposit) {
    return json(
      {
        success: false,
        error: "Deposit tidak ditemukan."
      },
      404
    );
  }

  return json({
    success: true,
    deposit: {
      id: Number(deposit.id),
      reference_id: deposit.reference_id,
      merchant_order_id: deposit.merchant_order_id,
      amount: Number(deposit.amount),
      amount_formatted: money(deposit.amount),
      provider: deposit.provider,
      payment_method: deposit.payment_method,
      status: deposit.status,
      provider_reference: deposit.provider_reference,
      signature_verified:
        Number(deposit.signature_verified) === 1,
      paid_at: deposit.paid_at,
      expired_at: deposit.expired_at,
      created_at: deposit.created_at,
      updated_at: deposit.updated_at
    }
  });
}

export async function listDeposits(request, env) {
  const session = await getSessionFromRequest(env, request);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  const url = new URL(request.url);

  const limitRaw =
    Number(url.searchParams.get("limit") || 20);

  const limit = Math.min(
    50,
    Math.max(
      1,
      Number.isSafeInteger(limitRaw)
        ? limitRaw
        : 20
    )
  );

  const rows = await env.DB.prepare(
    `
    SELECT
      id,
      reference_id,
      merchant_order_id,
      amount,
      provider,
      payment_method,
      status,
      provider_reference,
      signature_verified,
      paid_at,
      expired_at,
      created_at,
      updated_at
    FROM deposits
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
    `
  )
    .bind(Number(session.user_id), limit)
    .all();

  const deposits = (rows.results || []).map(
    (deposit) => ({
      id: Number(deposit.id),
      reference_id: deposit.reference_id,
      merchant_order_id: deposit.merchant_order_id,
      amount: Number(deposit.amount),
      amount_formatted: money(deposit.amount),
      provider: deposit.provider,
      payment_method: deposit.payment_method,
      status: deposit.status,
      provider_reference:
        deposit.provider_reference,
      signature_verified:
        Number(deposit.signature_verified) === 1,
      paid_at: deposit.paid_at,
      expired_at: deposit.expired_at,
      created_at: deposit.created_at,
      updated_at: deposit.updated_at
    })
  );

  return json({
    success: true,
    deposits
  });
}

export async function depositHandler(request, env) {
  const url = new URL(request.url);

  const pathname =
    url.pathname.replace(/\/+$/, "") || "/";

  if (
    request.method === "POST" &&
    pathname === "/api/deposit"
  ) {
    return createDeposit(request, env);
  }

  if (
    request.method === "GET" &&
    pathname === "/api/deposit"
  ) {
    return getDeposit(request, env);
  }

  if (
    request.method === "GET" &&
    pathname === "/api/deposits"
  ) {
    return listDeposits(request, env);
  }

  return json(
    {
      success: false,
      error: "Deposit endpoint tidak ditemukan."
    },
    404
  );
}

export default depositHandler;
