import {
  json,
  now,
  money,
  number,
  randomId,
  randomReference,
  getSessionFromRequest,
  getUserById,
  dbFirst,
  dbRun,
  setting
} from "./utils.js";

import {
  sendDepositNotification
} from "./telegram.js";

const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 10000000;
const DEPOSIT_EXPIRE_MINUTES = 60;
const CHECK_COOLDOWN_SECONDS = 30;

function validAmount(value) {
  const amount = Math.round(number(value));

  return (
    Number.isSafeInteger(amount) &&
    amount >= MIN_DEPOSIT &&
    amount <= MAX_DEPOSIT
  );
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function validDepositCode(value) {
  return /^[A-Z2-9]{4}$/.test(
    normalizeCode(value)
  );
}

function generateMerchantOrderId() {
  return randomReference("MANUAL", 16);
}

function publicDeposit(deposit) {
  return {
    id: Number(deposit.id),
    reference_id: deposit.reference_id,
    code: deposit.reference_id,
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
  };
}

async function getCurrentUser(
  request,
  env
) {
  const session =
    await getSessionFromRequest(
      env,
      request
    );

  if (!session) {
    return {
      session: null,
      user: null,
      response: json(
        {
          success: false,
          error: "Unauthorized."
        },
        401
      )
    };
  }

  const user =
    await getUserById(
      env,
      session.user_id
    );

  if (
    !user ||
    String(user.status).toUpperCase() !== "ACTIVE"
  ) {
    return {
      session,
      user: null,
      response: json(
        {
          success: false,
          error: "Akun tidak aktif."
        },
        403
      )
    };
  }

  return {
    session,
    user,
    response: null
  };
}

async function findAvailableDepositCode(env) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomId(4);

    const existing =
      await dbFirst(
        env,
        `
          SELECT id
          FROM deposits
          WHERE reference_id = ?
          LIMIT 1
        `,
        code
      );

    if (!existing) {
      return code;
    }
  }

  throw new Error(
    "Gagal membuat ID deposit unik."
  );
}

async function getDepositByCode(
  env,
  userId,
  code
) {
  return dbFirst(
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
        callback_data,
        created_at,
        updated_at
      FROM deposits
      WHERE user_id = ?
        AND reference_id = ?
      LIMIT 1
    `,
    Number(userId),
    normalizeCode(code)
  );
}

async function getDepositByMerchantOrderId(
  env,
  userId,
  merchantOrderId
) {
  return dbFirst(
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
        callback_data,
        created_at,
        updated_at
      FROM deposits
      WHERE user_id = ?
        AND merchant_order_id = ?
      LIMIT 1
    `,
    Number(userId),
    String(merchantOrderId || "").trim()
  );
}

async function getDepositById(
  env,
  depositId
) {
  return dbFirst(
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
        callback_data,
        created_at,
        updated_at
      FROM deposits
      WHERE id = ?
      LIMIT 1
    `,
    Number(depositId)
  );
}

function depositExpired(deposit) {
  if (!deposit?.expired_at) {
    return false;
  }

  const timestamp =
    Date.parse(
      String(deposit.expired_at)
    );

  return (
    Number.isFinite(timestamp) &&
    timestamp <= Date.now()
  );
}

async function expireDeposit(
  env,
  deposit
) {
  if (
    !deposit ||
    String(deposit.status).toUpperCase() !== "PENDING"
  ) {
    return deposit;
  }

  if (!depositExpired(deposit)) {
    return deposit;
  }

  await dbRun(
    env,
    `
      UPDATE deposits
      SET
        status = 'EXPIRED',
        updated_at = ?
      WHERE id = ?
        AND status = 'PENDING'
    `,
    now(),
    Number(deposit.id)
  );

  return getDepositById(
    env,
    deposit.id
  );
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function createDeposit(
  request,
  env
) {
  const auth =
    await getCurrentUser(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const data =
    await parseJson(request);

  if (!data) {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const amount =
    Math.round(
      number(data.amount)
    );

  if (!validAmount(amount)) {
    return json(
      {
        success: false,
        error:
          `Nominal deposit minimal ${money(MIN_DEPOSIT)} dan maksimal ${money(MAX_DEPOSIT)}.`
      },
      400
    );
  }

  const paymentMethod =
    String(
      data.payment_method || "QRIS"
    )
      .trim()
      .toUpperCase();

  if (paymentMethod !== "QRIS") {
    return json(
      {
        success: false,
        error:
          "Metode pembayaran yang tersedia adalah QRIS."
      },
      400
    );
  }

  const qrisFileId =
    String(
      await setting(
        env,
        "qris_file_id"
      ) || ""
    ).trim();

  if (!qrisFileId) {
    return json(
      {
        success: false,
        error:
          "QRIS belum tersedia. Silakan hubungi admin."
      },
      503
    );
  }

  const depositCode =
    await findAvailableDepositCode(
      env
    );

  const merchantOrderId =
    generateMerchantOrderId();

  const createdAt =
    now();

  const expiredAt =
    new Date(
      Date.now() +
      DEPOSIT_EXPIRE_MINUTES *
        60 *
        1000
    ).toISOString();

  try {
    const result =
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
          VALUES (
            ?,
            ?,
            ?,
            ?,
            'MANUAL',
            'QRIS',
            'PENDING',
            NULL,
            0,
            NULL,
            ?,
            '{}',
            ?,
            ?
          )
        `,
        Number(auth.user.id),
        depositCode,
        merchantOrderId,
        amount,
        expiredAt,
        createdAt,
        createdAt
      );

    if (!result?.success) {
      throw new Error(
        "Database gagal membuat deposit."
      );
    }
  } catch (error) {
    console.error(
      "CREATE_DEPOSIT_ERROR",
      error
    );

    return json(
      {
        success: false,
        error:
          "Gagal membuat deposit."
      },
      500
    );
  }

  const deposit =
    await getDepositById(
      env,
      (
        await dbFirst(
          env,
          `
            SELECT id
            FROM deposits
            WHERE reference_id = ?
            LIMIT 1
          `,
          depositCode
        )
      )?.id
    );

  if (!deposit) {
    return json(
      {
        success: false,
        error:
          "Deposit gagal dibuat."
      },
      500
    );
  }

  return json(
    {
      success: true,
      message:
        "Deposit berhasil dibuat.",
      deposit: {
        ...publicDeposit(
          deposit
        ),
        qr_url:
          "/api/deposit/qr",
        check_url:
          "/api/deposit/check"
      }
    },
    201
  );
}

async function getDeposit(
  request,
  env
) {
  const auth =
    await getCurrentUser(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const url =
    new URL(request.url);

  const code =
    normalizeCode(
      url.searchParams.get(
        "code"
      )
    );

  const referenceId =
    normalizeCode(
      url.searchParams.get(
        "reference_id"
      )
    );

  const merchantOrderId =
    String(
      url.searchParams.get(
        "merchant_order_id"
      ) || ""
    ).trim();

  const identifier =
    code || referenceId;

  if (
    !identifier &&
    !merchantOrderId
  ) {
    return json(
      {
        success: false,
        error:
          "ID deposit wajib."
      },
      400
    );
  }

  let deposit;

  if (identifier) {
    deposit =
      await getDepositByCode(
        env,
        auth.user.id,
        identifier
      );
  } else {
    deposit =
      await getDepositByMerchantOrderId(
        env,
        auth.user.id,
        merchantOrderId
      );
  }

  if (!deposit) {
    return json(
      {
        success: false,
        error:
          "Deposit tidak ditemukan."
      },
      404
    );
  }

  deposit =
    await expireDeposit(
      env,
      deposit
    );

  return json({
    success: true,
    deposit: {
      ...publicDeposit(
        deposit
      ),
      qr_url:
        String(
          deposit.status
        ).toUpperCase() === "PENDING"
          ? "/api/deposit/qr"
          : null
    }
  });
}

async function listDeposits(
  request,
  env
) {
  const auth =
    await getCurrentUser(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const url =
    new URL(request.url);

  const limitRaw =
    Number(
      url.searchParams.get(
        "limit"
      ) || 20
    );

  const limit =
    Math.min(
      50,
      Math.max(
        1,
        Number.isSafeInteger(
          limitRaw
        )
          ? limitRaw
          : 20
      )
    );

  const rows =
    await env.DB
      .prepare(
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
      .bind(
        Number(auth.user.id),
        limit
      )
      .all();

  const deposits =
    (
      rows?.results || []
    ).map(
      deposit => ({
        ...publicDeposit(
          deposit
        ),
        qr_url:
          String(
            deposit.status
          ).toUpperCase() ===
          "PENDING"
            ? "/api/deposit/qr"
            : null
      })
    );

  return json({
    success: true,
    deposits
  });
}

async function checkPayment(
  request,
  env
) {
  const auth =
    await getCurrentUser(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const data =
    await parseJson(request);

  if (!data) {
    return json(
      {
        success: false,
        error:
          "Body JSON tidak valid."
      },
      400
    );
  }

  const code =
    normalizeCode(
      data.code ||
      data.reference_id ||
      data.id
    );

  if (!validDepositCode(code)) {
    return json(
      {
        success: false,
        error:
          "ID deposit harus 4 karakter."
      },
      400
    );
  }

  let deposit =
    await getDepositByCode(
      env,
      auth.user.id,
      code
    );

  if (!deposit) {
    return json(
      {
        success: false,
        error:
          "Deposit tidak ditemukan."
      },
      404
    );
  }

  deposit =
    await expireDeposit(
      env,
      deposit
    );

  if (
    String(
      deposit.status
    ).toUpperCase() !==
    "PENDING"
  ) {
    return json({
      success: true,
      message:
        "Deposit sudah tidak berstatus PENDING.",
      deposit:
        publicDeposit(
          deposit
        )
    });
  }

  let callbackData = {};

  try {
    callbackData =
      JSON.parse(
        String(
          deposit.callback_data ||
          "{}"
        )
      );

    if (
      !callbackData ||
      typeof callbackData !==
        "object"
    ) {
      callbackData = {};
    }
  } catch {
    callbackData = {};
  }

  const lastCheck =
    Date.parse(
      String(
        callbackData.check_requested_at ||
        ""
      )
    );

  if (
    Number.isFinite(lastCheck) &&
    Date.now() - lastCheck <
      CHECK_COOLDOWN_SECONDS *
        1000
  ) {
    const remaining =
      Math.ceil(
        (
          CHECK_COOLDOWN_SECONDS *
            1000 -
          (
            Date.now() -
            lastCheck
          )
        ) /
        1000
      );

    return json(
      {
        success: false,
        error:
          `Tunggu ${remaining} detik sebelum melakukan pengecekan lagi.`
      },
      429
    );
  }

  callbackData.check_requested_at =
    now();

  callbackData.check_requested_by =
    Number(auth.user.id);

  await dbRun(
    env,
    `
      UPDATE deposits
      SET
        callback_data = ?,
        updated_at = ?
      WHERE id = ?
        AND user_id = ?
        AND status = 'PENDING'
    `,
    JSON.stringify(
      callbackData
    ),
    now(),
    Number(deposit.id),
    Number(auth.user.id)
  );

  deposit =
    await getDepositById(
      env,
      deposit.id
    );

  try {
    await sendDepositNotification(
      env,
      deposit,
      auth.user
    );
  } catch (error) {
    console.error(
      "DEPOSIT_TELEGRAM_NOTIFICATION_ERROR",
      error
    );

    return json(
      {
        success: false,
        error:
          "Notifikasi ke admin gagal dikirim. Silakan coba lagi."
      },
      503
    );
  }

  return json({
    success: true,
    message:
      "Permintaan pengecekan pembayaran telah dikirim ke admin.",
    deposit: {
      ...publicDeposit(
        deposit
      ),
      qr_url:
        "/api/deposit/qr"
    }
  });
}

async function getQris(
  request,
  env
) {
  const auth =
    await getCurrentUser(
      request,
      env
    );

  if (auth.response) {
    return auth.response;
  }

  const qrisFileId =
    String(
      await setting(
        env,
        "qris_file_id"
      ) || ""
    ).trim();

  if (!qrisFileId) {
    return json(
      {
        success: false,
        error:
          "QRIS belum tersedia."
      },
      404
    );
  }

  const token =
    String(
      env?.TELEGRAM_BOT_TOKEN ||
      env?.BOT_TOKEN ||
      ""
    ).trim();

  if (!token) {
    return json(
      {
        success: false,
        error:
          "Telegram bot belum dikonfigurasi."
      },
      503
    );
  }

  let telegramResult;

  try {
    const response =
      await fetch(
        `https://api.telegram.org/bot${token}/getFile`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            file_id:
              qrisFileId
          })
        }
      );

    telegramResult =
      await response.json();
  } catch (error) {
    console.error(
      "QRIS_GET_FILE_ERROR",
      error
    );

    return json(
      {
        success: false,
        error:
          "Gagal mengambil QRIS."
      },
      502
    );
  }

  if (
    !telegramResult?.ok ||
    !telegramResult?.result?.file_path
  ) {
    return json(
      {
        success: false,
        error:
          "File QRIS tidak ditemukan di Telegram."
      },
      404
    );
  }

  const filePath =
    String(
      telegramResult.result.file_path
    );

  let imageResponse;

  try {
    imageResponse =
      await fetch(
        `https://api.telegram.org/file/bot${token}/${filePath}`,
        {
          method: "GET"
        }
      );
  } catch (error) {
    console.error(
      "QRIS_DOWNLOAD_ERROR",
      error
    );

    return json(
      {
        success: false,
        error:
          "Gagal mengambil gambar QRIS."
      },
      502
    );
  }

  if (!imageResponse.ok) {
    return json(
      {
        success: false,
        error:
          "Gambar QRIS tidak dapat diakses."
      },
      404
    );
  }

  const headers =
    new Headers();

  headers.set(
    "Content-Type",
    imageResponse.headers.get(
      "Content-Type"
    ) || "image/jpeg"
  );

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  headers.set(
    "Content-Disposition",
    'inline; filename="qris.jpg"'
  );

  return new Response(
    imageResponse.body,
    {
      status: 200,
      headers
    }
  );
}

export async function createDepositHandler(
  request,
  env
) {
  return createDeposit(
    request,
    env
  );
}

export async function getDepositHandler(
  request,
  env
) {
  return getDeposit(
    request,
    env
  );
}

export async function listDepositHandler(
  request,
  env
) {
  return listDeposits(
    request,
    env
  );
}

export async function checkDepositPayment(
  request,
  env
) {
  return checkPayment(
    request,
    env
  );
}

export async function qrisHandler(
  request,
  env
) {
  return getQris(
    request,
    env
  );
}

export async function depositHandler(
  request,
  env
) {
  const url =
    new URL(request.url);

  const pathname =
    url.pathname.replace(
      /\/+$/,
      ""
    ) || "/";

  if (
    request.method === "POST" &&
    pathname ===
      "/api/deposit"
  ) {
    return createDeposit(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    pathname ===
      "/api/deposit"
  ) {
    return getDeposit(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    pathname ===
      "/api/deposits"
  ) {
    return listDeposits(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    (
      pathname ===
        "/api/deposit/check" ||
      pathname ===
        "/api/deposit/check-payment"
    )
  ) {
    return checkPayment(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    (
      pathname ===
        "/api/deposit/qr" ||
      pathname ===
        "/api/deposit/qris"
    )
  ) {
    return getQris(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    pathname ===
      "/api/deposit/status"
  ) {
    return getDeposit(
      request,
      env
    );
  }

  return json(
    {
      success: false,
      error:
        "Deposit endpoint tidak ditemukan."
    },
    404
  );
}

export default depositHandler;
