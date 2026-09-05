import {
  errorResponse,
  getCurrentUser,
  getSetting,
  nowUnix,
  normalizeDepositCode,
  readJson,
  successResponse
} from "./utils.js";

import {
  payDeposit
} from "./deposit.js";

const TELEGRAM_API = "https://api.telegram.org";

export async function notifyPaymentCheck(
  request,
  env
) {
  const user = await getCurrentUser(
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
    body = await readJson(request);
  } catch (error) {
    return errorResponse(
      error.message,
      400
    );
  }

  const depositId = Number(body.id);

  if (
    !Number.isSafeInteger(depositId) ||
    depositId <= 0
  ) {
    return errorResponse(
      "ID deposit tidak valid.",
      400
    );
  }

  const deposit = await env.DB
    .prepare(
      `SELECT
        id,
        user_id,
        code,
        amount,
        status,
        expires_at
       FROM deposits
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`
    )
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

  if (deposit.status !== "PENDING") {
    return errorResponse(
      "Deposit ini sudah tidak menunggu pembayaran.",
      400,
      {
        status: deposit.status
      }
    );
  }

  if (
    Number(deposit.expires_at) <= nowUnix()
  ) {
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
        code: deposit.code,
        amount: Number(deposit.amount),
        username: user.username,
        userId: user.id
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
    code: deposit.code
  });
}

export async function telegramWebhook(
  request,
  env
) {
  const secret =
    env.TELEGRAM_WEBHOOK_SECRET;

  if (secret) {
    const provided =
      request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      );

    if (
      !provided ||
      provided !== secret
    ) {
      return errorResponse(
        "Unauthorized.",
        401
      );
    }
  }

  let update;

  try {
    update = await request.json();
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

  const text =
    typeof message.text === "string"
      ? message.text.trim()
      : "";

  if (!text) {
    return successResponse({
      received: true
    });
  }

  const chatId =
    String(message.chat?.id ?? "");

  const ownerChatId =
    await getSetting(
      env.DB,
      "telegram_owner_chat_id",
      env.TELEGRAM_OWNER_CHAT_ID || ""
    );

  if (
    !ownerChatId ||
    chatId !== String(ownerChatId)
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

  if (
    text.toLowerCase() === "/start"
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      [
        "VenDigitalStore Bot",
        "",
        "/pay XXXX - konfirmasi deposit",
        "/setqr - balas dengan foto QRIS baru",
        "/status - cek status bot"
      ].join("\n")
    );

    return successResponse({
      received: true
    });
  }

  if (
    text.toLowerCase() === "/status"
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      "Bot VenDigitalStore aktif."
    );

    return successResponse({
      received: true
    });
  }

  if (
    text.toLowerCase() === "/setqr"
  ) {
    await setQrWaitingState(
      env,
      chatId
    );

    await sendTelegramMessage(
      env,
      chatId,
      "Silakan kirim foto QRIS baru sebagai balasan berikutnya."
    );

    return successResponse({
      received: true
    });
  }

  const waitingQr =
    await getSetting(
      env.DB,
      `telegram_qr_waiting_${chatId}`,
      null
    );

  if (
    waitingQr === "1" &&
    message.photo?.length
  ) {
    const photos =
      message.photo;

    const largest =
      photos[photos.length - 1];

    const fileId =
      largest?.file_id;

    if (!fileId) {
      return successResponse({
        received: true
      });
    }

    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES ('telegram_qr_file_id', ?, ?)
           ON CONFLICT(key)
           DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`
        )
        .bind(
          fileId,
          nowUnix()
        ),
      env.DB
        .prepare(
          `DELETE FROM settings
           WHERE key = ?`
        )
        .bind(
          `telegram_qr_waiting_${chatId}`
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
      if (
        result.reason === "NOT_FOUND"
      ) {
        await sendTelegramMessage(
          env,
          chatId,
          `Deposit ${code} tidak ditemukan.`
        );
      } else if (
        result.reason === "EXPIRED"
      ) {
        await sendTelegramMessage(
          env,
          chatId,
          `Deposit ${code} sudah expired.`
        );
      } else if (
        result.reason === "INVALID_STATUS"
      ) {
        await sendTelegramMessage(
          env,
          chatId,
          `Deposit ${code} tidak bisa dibayar. Status: ${result.status}.`
        );
      } else {
        await sendTelegramMessage(
          env,
          chatId,
          `Gagal memproses deposit ${code}.`
        );
      }

      return successResponse({
        received: true,
        paid: false
      });
    }

    const username =
      result.user?.username ||
      "unknown";

    const balance =
      Number(
        result.user?.balance || 0
      ).toLocaleString("id-ID");

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
            `Nominal: Rp${Number(result.deposit.amount).toLocaleString("id-ID")}`,
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
      duplicate: Boolean(
        result.duplicate
      )
    });
  }

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
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
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
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const fileResult =
    await telegramApi(
      env,
      "getFile",
      {
        file_id: fileId
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
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const fileUrl =
    `${TELEGRAM_API}/file/bot${token}/${fileResult.result.file_path}`;

  const imageResponse =
    await fetch(fileUrl);

  if (!imageResponse.ok) {
    return new Response(
      "QRIS tidak dapat diambil.",
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      }
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
    "private, max-age=300"
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
    await getSetting(
      env.DB,
      "telegram_owner_chat_id",
      env.TELEGRAM_OWNER_CHAT_ID || ""
    );

  if (!ownerChatId) {
    return {
      success: false
    };
  }

  const text = [
    "Permintaan cek pembayaran",
    "",
    `Kode: ${data.code}`,
    `Username: ${data.username}`,
    `User ID: ${data.userId}`,
    `Nominal: Rp${Number(data.amount).toLocaleString("id-ID")}`,
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
  await env.DB
    .prepare(
      `INSERT INTO settings
      (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key)
      DO UPDATE SET
        value = '1',
        updated_at = excluded.updated_at`
    )
    .bind(
      `telegram_qr_waiting_${chatId}`,
      nowUnix()
    )
    .run();
}

async function sendTelegramMessage(
  env,
  chatId,
  text
) {
  if (!chatId) {
    return {
      success: false
    };
  }

  const result =
    await telegramApi(
      env,
      "sendMessage",
      {
        chat_id: chatId,
        text
      }
    );

  return {
    success: Boolean(
      result.ok
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
          body: JSON.stringify(body)
        }
      );

    const data =
      await response.json();

    return data;
  } catch (error) {
    return {
      ok: false,
      description:
        String(error?.message || error)
    };
  }
}

function getTelegramToken(env) {
  return (
    env.TELEGRAM_BOT_TOKEN ||
    ""
  );
      }
