import {
  errorResponse,
  getSetting,
  nowUnix,
  normalizeDepositCode,
  readJson,
  successResponse
} from "./utils.js";

import {
  getCurrentUser
} from "./auth.js";

import {
  payDeposit
} from "./deposit.js";

const TELEGRAM_API =
  "https://api.telegram.org";

const QR_WAIT_PREFIX =
  "telegram_qr_waiting_";

const QR_WAIT_TTL =
  10 * 60;

export async function notifyPaymentCheck(
  request,
  env
) {
  const user =
    await getCurrentUser(
      request,
      env
    );

  if (!user) {
    return errorResponse(
      "Kamu harus login terlebih dahulu.",
      401
    );
  }

  let body;

  try {
    body =
      await readJson(request);
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Request tidak valid.",
      400
    );
  }

  const depositId =
    Number(body?.id);

  if (
    !Number.isSafeInteger(
      depositId
    ) ||
    depositId <= 0
  ) {
    return errorResponse(
      "ID deposit tidak valid.",
      400
    );
  }

  const deposit =
    await env.DB
      .prepare(`
        SELECT
          id,
          user_id,
          code,
          amount,
          status,
          expires_at
        FROM deposits
        WHERE id = ?
        AND user_id = ?
        LIMIT 1
      `)
      .bind(
        depositId,
        user.id
      )
      .first();

  if (!deposit) {
    return errorResponse(
      "Deposit tidak ditemukan.",
      404
    );
  }

  if (
    deposit.status !==
    "PENDING"
  ) {
    return errorResponse(
      "Deposit ini sudah tidak menunggu pembayaran.",
      400,
      {
        status:
          deposit.status
      }
    );
  }

  if (
    Number(
      deposit.expires_at
    ) <= nowUnix()
  ) {
    await env.DB
      .prepare(`
        UPDATE deposits
        SET status = 'EXPIRED'
        WHERE id = ?
        AND status = 'PENDING'
      `)
      .bind(
        deposit.id
      )
      .run();

    return errorResponse(
      "Deposit sudah kedaluwarsa.",
      400,
      {
        status: "EXPIRED"
      }
    );
  }

  const result =
    await sendPaymentCheckNotification(
      env,
      {
        code:
          deposit.code,
        amount:
          Number(
            deposit.amount
          ),
        username:
          user.username,
        userId:
          user.id
      }
    );

  if (!result.success) {
    return errorResponse(
      "Gagal mengirim notifikasi ke Telegram.",
      502
    );
  }

  return successResponse({
    sent: true,
    code:
      deposit.code
  });
}

export async function telegramWebhook(
  request,
  env
) {
  const token =
    getTelegramToken(env);

  if (!token) {
    return errorResponse(
      "Telegram bot belum dikonfigurasi.",
      503
    );
  }

  const secret =
    String(
      env.TELEGRAM_WEBHOOK_SECRET ||
        ""
    );

  if (secret) {
    const provided =
      request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

    if (
      !provided ||
      !constantTimeEqual(
        provided,
        secret
      )
    ) {
      return errorResponse(
        "Unauthorized.",
        401
      );
    }
  }

  let update;

  try {
    update =
      await request.json();
  } catch {
    return errorResponse(
      "Invalid Telegram update.",
      400
    );
  }

  const message =
    update?.message;

  if (!message) {
    return successResponse({
      received: true
    });
  }

  const chatId =
    String(
      message.chat?.id ??
        ""
    );

  if (!chatId) {
    return successResponse({
      received: true
    });
  }

  const ownerChatId =
    String(
      await getSetting(
        env.DB,
        "telegram_owner_chat_id",
        env.TELEGRAM_OWNER_CHAT_ID ||
          ""
      ) || ""
    );

  if (
    !ownerChatId ||
    chatId !== ownerChatId
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      "Akses ditolak."
    );

    return successResponse({
      received: true
    });
  }

  const text =
    typeof message.text ===
    "string"
      ? message.text.trim()
      : "";

  if (
    text.toLowerCase() ===
    "/start"
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      [
        "VenDigitalStore Bot",
        "",
        "/pay XXXX - konfirmasi deposit",
        "/setqr - ganti QRIS",
        "/status - cek status bot"
      ].join("\n")
    );

    return successResponse({
      received: true
    });
  }

  if (
    text.toLowerCase() ===
    "/status"
  ) {
    const qr =
      await getSetting(
        env.DB,
        "telegram_qr_file_id",
        null
      );

    await sendTelegramMessage(
      env,
      chatId,
      [
        "VenDigitalStore Bot aktif.",
        "",
        `QRIS: ${
          qr
            ? "tersedia"
            : "belum tersedia"
        }`
      ].join("\n")
    );

    return successResponse({
      received: true
    });
  }

  if (
    text.toLowerCase() ===
    "/setqr"
  ) {
    await setQrWaitingState(
      env,
      chatId
    );

    await sendTelegramMessage(
      env,
      chatId,
      "Silakan kirim foto QRIS baru dalam 10 menit."
    );

    return successResponse({
      received: true,
      waiting_qr: true
    });
  }

  const waitingQr =
    await getSetting(
      env.DB,
      QR_WAIT_PREFIX +
        chatId,
      null
    );

  if (
    waitingQr &&
    Number(waitingQr) >=
      nowUnix() &&
    message.photo?.length
  ) {
    const photos =
      message.photo;

    const largest =
      photos[
        photos.length - 1
      ];

    const fileId =
      largest?.file_id;

    if (!fileId) {
      return successResponse({
        received: true
      });
    }

    await env.DB.batch([
      env.DB
        .prepare(`
          INSERT INTO settings (
            key,
            value,
            updated_at
          )
          VALUES (
            'telegram_qr_file_id',
            ?,
            ?
          )
          ON CONFLICT(key)
          DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `)
        .bind(
          fileId,
          nowUnix()
        ),

      env.DB
        .prepare(`
          DELETE FROM settings
          WHERE key = ?
        `)
        .bind(
          QR_WAIT_PREFIX +
            chatId
        )
    ]);

    await sendTelegramMessage(
      env,
      chatId,
      "QRIS berhasil diperbarui."
    );

    return successResponse({
      received: true,
      qr_updated: true
    });
  }

  if (
    waitingQr &&
    Number(waitingQr) <
      nowUnix()
  ) {
    await env.DB
      .prepare(`
        DELETE FROM settings
        WHERE key = ?
      `)
      .bind(
        QR_WAIT_PREFIX +
          chatId
      )
      .run();
  }

  const payMatch =
    text.match(
      /^\/pay(?:@\w+)?\s+([A-Za-z0-9]{4})$/i
    );

  if (payMatch) {
    const code =
      normalizeDepositCode(
        payMatch[1]
      );

    const result =
      await payDeposit(
        env,
        code,
        `DEPOSIT:${code}`
      );

    if (!result.success) {
      await sendPayError(
        env,
        chatId,
        code,
        result
      );

      return successResponse({
        received: true,
        paid: false,
        reason:
          result.reason ||
          "FAILED"
      });
    }

    const username =
      result.user?.username ||
      "unknown";

    const balance =
      Number(
        result.user?.balance ||
          0
      ).toLocaleString(
        "id-ID"
      );

    const amount =
      Number(
        result.deposit?.amount ||
          0
      ).toLocaleString(
        "id-ID"
      );

    const messageText =
      result.duplicate
        ? [
            "Deposit sudah diproses sebelumnya.",
            "",
            `Kode: ${code}`,
            `Username: ${username}`,
            `Saldo: Rp${balance}`
          ].join("\n")
        : [
            "Deposit berhasil dikonfirmasi.",
            "",
            `Kode: ${code}`,
            `Username: ${username}`,
            `Nominal: Rp${amount}`,
            `Saldo: Rp${balance}`
          ].join("\n");

    await sendTelegramMessage(
      env,
      chatId,
      messageText
    );

    return successResponse({
      received: true,
      paid: true,
      duplicate:
        Boolean(
          result.duplicate
        )
    });
  }

  if (message.photo?.length) {
    await sendTelegramMessage(
      env,
      chatId,
      [
        "Foto diterima.",
        "",
        "Jika ingin mengganti QRIS:",
        "/setqr"
      ].join("\n")
    );

    return successResponse({
      received: true
    });
  }

  if (text) {
    await sendTelegramMessage(
      env,
      chatId,
      [
        "Perintah tidak dikenali.",
        "",
        "/pay XXXX",
        "/setqr",
        "/status"
      ].join("\n")
    );
  }

  return successResponse({
    received: true
  });
}

export async function getQrImage(
  request,
  env
) {
  const fileId =
    await getSetting(
      env.DB,
      "telegram_qr_file_id",
      null
    );

  if (!fileId) {
    return new Response(
      "QRIS belum tersedia.",
      {
        status: 404,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const token =
    getTelegramToken(env);

  if (!token) {
    return new Response(
      "Telegram bot belum dikonfigurasi.",
      {
        status: 503,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const fileResult =
    await telegramApi(
      env,
      "getFile",
      {
        file_id:
          fileId
      }
    );

  if (
    !fileResult.ok ||
    !fileResult.result?.file_path
  ) {
    return new Response(
      "QRIS tidak dapat diambil.",
      {
        status: 502,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const filePath =
    String(
      fileResult.result.file_path
    );

  if (
    filePath.includes("..") ||
    filePath.includes("\\")
  ) {
    return new Response(
      "QRIS tidak valid.",
      {
        status: 502,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const fileUrl =
    `${TELEGRAM_API}/file/bot${token}/${filePath}`;

  let imageResponse;

  try {
    imageResponse =
      await fetch(
        fileUrl
      );
  } catch {
    return new Response(
      "QRIS tidak dapat diambil.",
      {
        status: 502,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  if (
    !imageResponse.ok
  ) {
    return new Response(
      "QRIS tidak dapat diambil.",
      {
        status: 502,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const contentType =
    imageResponse.headers.get(
      "Content-Type"
    ) || "";

  if (
    !contentType.startsWith(
      "image/"
    )
  ) {
    return new Response(
      "QRIS bukan file gambar.",
      {
        status: 502,
        headers: {
          "Content-Type":
            "text/plain; charset=UTF-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }

  const headers =
    new Headers();

  headers.set(
    "Content-Type",
    contentType
  );

  headers.set(
    "Cache-Control",
    "private, max-age=300"
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  return new Response(
    imageResponse.body,
    {
      status: 200,
      headers
    }
  );
}

async function sendPaymentCheckNotification(
  env,
  data
) {
  const ownerChatId =
    String(
      await getSetting(
        env.DB,
        "telegram_owner_chat_id",
        env.TELEGRAM_OWNER_CHAT_ID ||
          ""
      ) || ""
    );

  if (!ownerChatId) {
    return {
      success: false,
      reason:
        "OWNER_CHAT_ID_MISSING"
    };
  }

  const text = [
    "Permintaan cek pembayaran",
    "",
    `Kode: ${data.code}`,
    `Username: ${data.username}`,
    `User ID: ${data.userId}`,
    `Nominal: Rp${Number(
      data.amount || 0
    ).toLocaleString("id-ID")}`,
    "",
    `Konfirmasi: /pay ${data.code}`
  ].join("\n");

  return sendTelegramMessage(
    env,
    ownerChatId,
    text
  );
}

async function setQrWaitingState(
  env,
  chatId
) {
  const expiresAt =
    nowUnix() +
    QR_WAIT_TTL;

  await env.DB
    .prepare(`
      INSERT INTO settings (
        key,
        value,
        updated_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(key)
      DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    .bind(
      QR_WAIT_PREFIX +
        chatId,
      String(expiresAt),
      nowUnix()
    )
    .run();
}

async function sendPayError(
  env,
  chatId,
  code,
  result
) {
  let text;

  switch (
    result?.reason
  ) {
    case "NOT_FOUND":
      text =
        `Deposit ${code} tidak ditemukan.`;
      break;

    case "EXPIRED":
      text =
        `Deposit ${code} sudah expired.`;
      break;

    case "INVALID_STATUS":
      text =
        `Deposit ${code} tidak bisa dibayar. Status: ${result.status}.`;
      break;

    case "USER_INACTIVE":
      text =
        "Akun pengguna tidak aktif.";
      break;

    case "INVALID_AMOUNT":
      text =
        `Nominal deposit ${code} tidak valid.`;
      break;

    default:
      text =
        `Gagal memproses deposit ${code}.`;
      break;
  }

  await sendTelegramMessage(
    env,
    chatId,
    text
  );
}

async function sendTelegramMessage(
  env,
  chatId,
  text
) {
  if (
    chatId === null ||
    chatId === undefined ||
    !String(chatId)
  ) {
    return {
      success: false
    };
  }

  const result =
    await telegramApi(
      env,
      "sendMessage",
      {
        chat_id:
          chatId,
        text:
          String(text || "")
      }
    );

  return {
    success:
      Boolean(
        result?.ok
      ),
    result
  };
}

async function telegramApi(
  env,
  method,
  body
) {
  const token =
    getTelegramToken(env);

  if (!token) {
    return {
      ok: false,
      description:
        "Telegram bot token belum dikonfigurasi."
    };
  }

  try {
    const response =
      await fetch(
        `${TELEGRAM_API}/bot${token}/${method}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(
              body
            )
        }
      );

    let data;

    try {
      data =
        await response.json();
    } catch {
      return {
        ok: false,
        description:
          "Respons Telegram tidak valid."
      };
    }

    return data;
  } catch (error) {
    return {
      ok: false,
      description:
        String(
          error?.message ||
            error
        )
    };
  }
}

function getTelegramToken(
  env
) {
  return String(
    env.TELEGRAM_BOT_TOKEN ||
      ""
  ).trim();
}

function constantTimeEqual(
  a,
  b
) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let index = 0;
    index < a.length;
    index++
  ) {
    result |=
      a.charCodeAt(index) ^
      b.charCodeAt(index);
  }

  return result === 0;
      }
