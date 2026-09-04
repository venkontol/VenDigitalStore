import {
  json,
  now,
  getUserById,
  getSessionUser,
  getCookie,
  getBearerToken,
  money,
  randomId,
  randomReference
} from "./utils.js";

const SESSION_COOKIE = "vds_session";

const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 10000000;
const DEFAULT_EXPIRY_MINUTES = 30;

function getToken(request) {
  return (
    getCookie(request, SESSION_COOKIE) ||
    getBearerToken(request) ||
    null
  );
}

async function requireUser(request, env) {
  const token = getToken(request);

  if (!token) {
    return null;
  }

  return await getSessionUser(env, token);
}

function success(data = {}, status = 200) {
  return json(
    {
      success: true,
      ...data
    },
    status
  );
}

function error(message, status = 400, extra = {}) {
  return json(
    {
      success: false,
      error: message,
      ...extra
    },
    status
  );
}

function methodNotAllowed() {
  return error(
    "Method tidak diizinkan.",
    405
  );
}

async function readBody(request) {
  try {
    const contentType =
      request.headers.get("content-type") || "";

    if (
      contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return await request.json();
    }

    const form =
      await request.formData();

    return Object.fromEntries(
      form.entries()
    );
  } catch {
    return {};
  }
}

function addMinutes(date, minutes) {
  return new Date(
    date.getTime() +
      minutes * 60 * 1000
  ).toISOString();
}

function createMerchantOrderId() {
  return [
    "VDS",
    Date.now().toString(36).toUpperCase(),
    randomId(8).toUpperCase()
  ].join("-");
}

function createDepositReference() {
  return [
    "DEP",
    Date.now().toString(36).toUpperCase(),
    randomReference(8).toUpperCase()
  ].join("-");
}

function normalizeAmount(value) {
  const raw =
    typeof value === "string"
      ? value.replace(/[^\d]/g, "")
      : value;

  const amount = Number(raw);

  if (
    !Number.isSafeInteger(amount)
  ) {
    return null;
  }

  return amount;
}

function isDepositExpired(deposit) {
  if (!deposit?.expired_at) {
    return false;
  }

  const timestamp =
    Date.parse(deposit.expired_at);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return timestamp <= Date.now();
}

function publicDeposit(row) {
  if (!row) {
    return null;
  }

  const amount =
    Number(row.amount || 0);

  let status =
    String(
      row.status || "PENDING"
    ).toUpperCase();

  if (
    status === "PENDING" &&
    isDepositExpired(row)
  ) {
    status = "EXPIRED";
  }

  return {
    id: row.id,
    reference_id:
      row.reference_id,
    merchant_order_id:
      row.merchant_order_id,
    amount,
    formatted_amount:
      money(amount),
    provider:
      row.provider || "DUITKU",
    payment_method:
      row.payment_method || null,
    status,
    provider_reference:
      row.provider_reference || null,
    signature_verified:
      Boolean(
        Number(
          row.signature_verified || 0
        )
      ),
    paid_at:
      row.paid_at || null,
    expired_at:
      row.expired_at || null,
    created_at:
      row.created_at,
    updated_at:
      row.updated_at
  };
}

async function getDepositById(
  env,
  userId,
  id
) {
  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM deposits
         WHERE id = ?
           AND user_id = ?
         LIMIT 1`
      )
      .bind(
        id,
        userId
      )
      .first();

  return result || null;
}

async function getDepositByReference(
  env,
  userId,
  referenceId
) {
  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM deposits
         WHERE reference_id = ?
           AND user_id = ?
         LIMIT 1`
      )
      .bind(
        referenceId,
        userId
      )
      .first();

  return result || null;
}

async function getDepositByMerchantOrderId(
  env,
  merchantOrderId
) {
  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM deposits
         WHERE merchant_order_id = ?
         LIMIT 1`
      )
      .bind(
        merchantOrderId
      )
      .first();

  return result || null;
}

async function handleCreateDeposit(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const user =
    await requireUser(
      request,
      env
    );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const body =
    await readBody(request);

  const amount =
    normalizeAmount(
      body.amount
    );

  if (amount === null) {
    return error(
      "Nominal deposit tidak valid."
    );
  }

  if (amount < MIN_DEPOSIT) {
    return error(
      `Minimal deposit ${money(
        MIN_DEPOSIT
      )}.`
    );
  }

  if (amount > MAX_DEPOSIT) {
    return error(
      `Maksimal deposit ${money(
        MAX_DEPOSIT
      )}.`
    );
  }

  const currentUser =
    await getUserById(
      env,
      user.id
    );

  if (!currentUser) {
    return error(
      "User tidak ditemukan.",
      404
    );
  }

  if (
    String(
      currentUser.status || ""
    ).toUpperCase() !==
    "ACTIVE"
  ) {
    return error(
      "Akun tidak aktif.",
      403
    );
  }

  const referenceId =
    createDepositReference();

  const merchantOrderId =
    createMerchantOrderId();

  const createdAt =
    now();

  const expiredAt =
    addMinutes(
      new Date(),
      DEFAULT_EXPIRY_MINUTES
    );

  const duplicate =
    await env.DB
      .prepare(
        `SELECT id
         FROM deposits
         WHERE reference_id = ?
            OR merchant_order_id = ?
         LIMIT 1`
      )
      .bind(
        referenceId,
        merchantOrderId
      )
      .first();

  if (duplicate) {
    return error(
      "Gagal membuat nomor transaksi unik. Silakan coba lagi.",
      500
    );
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO deposits (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        currentUser.id,
        referenceId,
        merchantOrderId,
        amount,
        "DUITKU",
        null,
        "PENDING",
        null,
        0,
        null,
        expiredAt,
        "{}",
        createdAt,
        createdAt
      )
      .run();
  } catch (err) {
    console.error(
      "DEPOSIT_INSERT_ERROR",
      err
    );

    return error(
      "Gagal membuat deposit.",
      500
    );
  }

  const deposit =
    await getDepositByMerchantOrderId(
      env,
      merchantOrderId
    );

  if (!deposit) {
    return error(
      "Deposit berhasil dibuat tetapi data tidak dapat dibaca kembali.",
      500
    );
  }

  return success(
    {
      message:
        "Deposit berhasil dibuat.",
      deposit:
        publicDeposit(deposit),
      payment: {
        provider: "DUITKU",
        status: "PENDING",
        merchant_order_id:
          merchantOrderId,
        reference_id:
          referenceId,
        amount,
        formatted_amount:
          money(amount),
        expired_at:
          expiredAt
      }
    },
    201
  );
}

async function handleGetDeposit(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user =
    await requireUser(
      request,
      env
    );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const url =
    new URL(request.url);

  const id =
    Number(
      url.searchParams.get("id")
    );

  const referenceId =
    String(
      url.searchParams.get(
        "reference_id"
      ) || ""
    ).trim();

  if (
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    const deposit =
      await getDepositById(
        env,
        user.id,
        id
      );

    if (!deposit) {
      return error(
        "Deposit tidak ditemukan.",
        404
      );
    }

    return success({
      deposit:
        publicDeposit(deposit)
    });
  }

  if (referenceId) {
    const deposit =
      await getDepositByReference(
        env,
        user.id,
        referenceId
      );

    if (!deposit) {
      return error(
        "Deposit tidak ditemukan.",
        404
      );
    }

    return success({
      deposit:
        publicDeposit(deposit)
    });
  }

  return error(
    "ID atau reference_id wajib diisi."
  );
}

async function handleDepositList(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user =
    await requireUser(
      request,
      env
    );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const url =
    new URL(request.url);

  let limit =
    Number(
      url.searchParams.get(
        "limit"
      ) || 20
    );

  let offset =
    Number(
      url.searchParams.get(
        "offset"
      ) || 0
    );

  const status =
    String(
      url.searchParams.get(
        "status"
      ) || ""
    )
      .trim()
      .toUpperCase();

  if (
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    limit = 20;
  }

  if (limit > 100) {
    limit = 100;
  }

  if (
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    offset = 0;
  }

  const params = [
    user.id
  ];

  let where = `
    WHERE user_id = ?
  `;

  if (status) {
    where += `
      AND status = ?
    `;

    params.push(status);
  }

  params.push(
    limit,
    offset
  );

  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM deposits
         ${where}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params)
      .all();

  const rows =
    result?.results || [];

  return success({
    deposits:
      rows.map(
        publicDeposit
      ),
    pagination: {
      limit,
      offset,
      count:
        rows.length
    }
  });
}

async function handlePendingDeposit(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user =
    await requireUser(
      request,
      env
    );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const result =
    await env.DB
      .prepare(
        `SELECT *
         FROM deposits
         WHERE user_id = ?
           AND status = 'PENDING'
         ORDER BY id DESC
         LIMIT 20`
      )
      .bind(user.id)
      .all();

  const rows =
    result?.results || [];

  const active = [];

  for (const row of rows) {
    if (
      isDepositExpired(row)
    ) {
      await env.DB
        .prepare(
          `UPDATE deposits
           SET status = 'EXPIRED',
               updated_at = ?
           WHERE id = ?
             AND user_id = ?
             AND status = 'PENDING'`
        )
        .bind(
          now(),
          row.id,
          user.id
        )
        .run();

      continue;
    }

    active.push(
      publicDeposit(row)
    );
  }

  return success({
    deposits: active
  });
}

async function handleCancelDeposit(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const user =
    await requireUser(
      request,
      env
    );

  if (!user) {
    return error(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  const body =
    await readBody(request);

  const id =
    Number(body.id);

  const referenceId =
    String(
      body.reference_id ||
      body.referenceId ||
      ""
    ).trim();

  let deposit = null;

  if (
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    deposit =
      await getDepositById(
        env,
        user.id,
        id
      );
  } else if (referenceId) {
    deposit =
      await getDepositByReference(
        env,
        user.id,
        referenceId
      );
  }

  if (!deposit) {
    return error(
      "Deposit tidak ditemukan.",
      404
    );
  }

  const status =
    String(
      deposit.status || ""
    ).toUpperCase();

  if (status === "PAID") {
    return error(
      "Deposit yang sudah dibayar tidak dapat dibatalkan.",
      409
    );
  }

  if (status === "FAILED") {
    return error(
      "Deposit sudah gagal.",
      409
    );
  }

  if (status === "CANCELLED") {
    return success({
      message:
        "Deposit sudah dibatalkan.",
      deposit:
        publicDeposit(deposit)
    });
  }

  if (status === "EXPIRED") {
    return success({
      message:
        "Deposit sudah kedaluwarsa.",
      deposit:
        publicDeposit(deposit)
    });
  }

  const updatedAt =
    now();

  await env.DB
    .prepare(
      `UPDATE deposits
       SET status = 'CANCELLED',
           updated_at = ?
       WHERE id = ?
         AND user_id = ?
         AND status = 'PENDING'`
    )
    .bind(
      updatedAt,
      deposit.id,
      user.id
    )
    .run();

  const updated =
    await getDepositById(
      env,
      user.id,
      deposit.id
    );

  return success({
    message:
      "Deposit berhasil dibatalkan.",
    deposit:
      publicDeposit(updated)
  });
}

async function handleDepositRoutes(
  request,
  env,
  pathname
) {
  switch (pathname) {
    case "/api/deposit":
    case "/api/deposit/create":
      if (
        request.method === "POST"
      ) {
        return await handleCreateDeposit(
          request,
          env
        );
      }

      if (
        request.method === "GET"
      ) {
        return await handleGetDeposit(
          request,
          env
        );
      }

      return methodNotAllowed();

    case "/api/deposit/list":
      return await handleDepositList(
        request,
        env
      );

    case "/api/deposit/pending":
      return await handlePendingDeposit(
        request,
        env
      );

    case "/api/deposit/cancel":
      return await handleCancelDeposit(
        request,
        env
      );

    default:
      return null;
  }
}

export async function depositHandler(
  request,
  env,
  pathname
) {
  try {
    const response =
      await handleDepositRoutes(
        request,
        env,
        pathname
      );

    if (response) {
      return response;
    }

    return error(
      "Endpoint deposit tidak ditemukan.",
      404
    );
  } catch (err) {
    console.error(
      "DEPOSIT_ERROR",
      err
    );

    return error(
      "Terjadi kesalahan pada sistem deposit.",
      500
    );
  }
}

export default depositHandler;
