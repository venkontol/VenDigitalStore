import {
  addBalance,
  dbFirst,
  dbRun,
  money,
  now,
  saveSetting,
  setting
} from "./utils.js";

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(env) {
  return String(
    env?.TELEGRAM_BOT_TOKEN ||
    env?.BOT_TOKEN ||
    ""
  ).trim();
}

function getOwnerId(env) {
  return String(
    env?.TELEGRAM_OWNER_ID ||
    env?.OWNER_ID ||
    ""
  ).trim();
}

function getWebhookSecret(env) {
  return String(
    env?.TELEGRAM_WEBHOOK_SECRET ||
    env?.TELEGRAM_SECRET ||
    ""
  ).trim();
}

function getApiUrl(env, method) {
  const token = getBotToken(env);

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
  }

  return `${TELEGRAM_API}/bot${token}/${method}`;
}

async function telegramApi(env, method, payload = {}) {
  const response = await fetch(
    getApiUrl(env, method),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Telegram API mengembalikan respons tidak valid. HTTP ${response.status}.`
    );
  }

  if (!response.ok || !data?.ok) {
    const description =
      data?.description ||
      `Telegram API gagal. HTTP ${response.status}.`;

    throw new Error(description);
  }

  return data;
}

async function sendMessage(
  env,
  chatId,
  text,
  extra = {}
) {
  return telegramApi(
    env,
    "sendMessage",
    {
      chat_id: String(chatId),
      text: String(text),
      ...extra
    }
  );
}

async function getFile(
  env,
  fileId
) {
  return telegramApi(
    env,
    "getFile",
    {
      file_id: String(fileId)
    }
  );
}

async function answerCallbackQuery(
  env,
  callbackQueryId,
  text = ""
) {
  return telegramApi(
    env,
    "answerCallbackQuery",
    {
      callback_query_id: String(callbackQueryId),
      text: String(text || "")
    }
  );
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isDepositCode(value) {
  return /^[A-Z2-9]{4}$/.test(
    normalizeCode(value)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMessage(update) {
  if (update?.message) {
    return update.message;
  }

  if (update?.edited_message) {
    return update.edited_message;
  }

  if (update?.channel_post) {
    return update.channel_post;
  }

  return null;
}

function getChatIdFromMessage(message) {
  return String(
    message?.chat?.id ??
    ""
  );
}

function getSenderId(message) {
  return String(
    message?.from?.id ??
    ""
  );
}

function getMessageText(message) {
  return String(
    message?.text ||
    message?.caption ||
    ""
  ).trim();
}

function getCommand(text) {
  const value = String(text || "").trim();

  if (!value.startsWith("/")) {
    return {
      name: "",
      args: []
    };
  }

  const parts = value
    .split(/\s+/)
    .filter(Boolean);

  const rawName = parts.shift() || "";

  const name = rawName
    .split("@")[0]
    .toLowerCase();

  return {
    name,
    args: parts
  };
}

function getPhotoFileId(message) {
  const photos = Array.isArray(message?.photo)
    ? message.photo
    : [];

  if (!photos.length) {
    return null;
  }

  const largest = photos[
    photos.length - 1
  ];

  return largest?.file_id
    ? String(largest.file_id)
    : null;
}

function isOwner(env, userId) {
  const ownerId = getOwnerId(env);

  if (!ownerId || !userId) {
    return false;
  }

  return String(ownerId) === String(userId);
}

async function requireOwnerMessage(
  env,
  message
) {
  const senderId = getSenderId(message);

  if (!isOwner(env, senderId)) {
    const chatId = getChatIdFromMessage(message);

    if (chatId) {
      await sendMessage(
        env,
        chatId,
        "Akses ditolak."
      );
    }

    return false;
  }

  return true;
}

async function getPendingDeposit(
  env,
  code
) {
  return dbFirst(
    env,
    `
      SELECT
        d.id,
        d.user_id,
        d.reference_id,
        d.merchant_order_id,
        d.amount,
        d.provider,
        d.payment_method,
        d.status,
        d.paid_at,
        d.expired_at,
        d.created_at,
        d.updated_at,
        u.username,
        u.first_name,
        u.balance
      FROM deposits d
      INNER JOIN users u
        ON u.id = d.user_id
      WHERE d.reference_id = ?
        AND d.status = 'PENDING'
      LIMIT 1
    `,
    normalizeCode(code)
  );
}

async function getDepositByCode(
  env,
  code
) {
  return dbFirst(
    env,
    `
      SELECT
        d.id,
        d.user_id,
        d.reference_id,
        d.merchant_order_id,
        d.amount,
        d.provider,
        d.payment_method,
        d.status,
        d.paid_at,
        d.expired_at,
        d.created_at,
        d.updated_at,
        u.username,
        u.first_name,
        u.balance
      FROM deposits d
      INNER JOIN users u
        ON u.id = d.user_id
      WHERE d.reference_id = ?
      LIMIT 1
    `,
    normalizeCode(code)
  );
}

async function markDepositPaid(
  env,
  deposit
) {
  const timestamp = now();

  const result = await dbRun(
    env,
    `
      UPDATE deposits
      SET
        status = 'PAID',
        signature_verified = 1,
        paid_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status = 'PENDING'
    `,
    timestamp,
    timestamp,
    Number(deposit.id)
  );

  if (!result?.success) {
    throw new Error(
      "Gagal mengubah status deposit."
    );
  }

  const changes = Number(
    result?.meta?.changes || 0
  );

  if (changes !== 1) {
    const current = await getDepositByCode(
      env,
      deposit.reference_id
    );

    if (
      current &&
      String(current.status).toUpperCase() === "PAID"
    ) {
      return current;
    }

    throw new Error(
      "Deposit tidak dapat dikonfirmasi."
    );
  }

  return getDepositByCode(
    env,
    deposit.reference_id
  );
}

async function expireDepositIfNeeded(
  env,
  deposit
) {
  if (!deposit?.expired_at) {
    return deposit;
  }

  const expiredAt = Date.parse(
    String(deposit.expired_at)
  );

  if (!Number.isFinite(expiredAt)) {
    return deposit;
  }

  if (expiredAt > Date.now()) {
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

  return getDepositByCode(
    env,
    deposit.reference_id
  );
}

async function handlePay(
  env,
  message,
  args
) {
  const chatId = getChatIdFromMessage(message);

  const rawCode = args?.[0] || "";
  const code = normalizeCode(rawCode);

  if (!isDepositCode(code)) {
    await sendMessage(
      env,
      chatId,
      [
        "Format salah.",
        "",
        "Gunakan:",
        "/pay XXXX",
        "",
        "Contoh:",
        "/pay A7K3"
      ].join("\n")
    );

    return;
  }

  let deposit = await getPendingDeposit(
    env,
    code
  );

  if (!deposit) {
    const existing = await getDepositByCode(
      env,
      code
    );

    if (!existing) {
      await sendMessage(
        env,
        chatId,
        `Deposit dengan ID ${code} tidak ditemukan.`
      );

      return;
    }

    if (
      String(existing.status).toUpperCase() === "PAID"
    ) {
      await sendMessage(
        env,
        chatId,
        [
          `Deposit ${code} sudah PAID.`,
          "",
          `Username: @${existing.username}`,
          `Nominal: ${money(existing.amount)}`,
          "Saldo tidak ditambahkan lagi."
        ].join("\n")
      );

      return;
    }

    if (
      String(existing.status).toUpperCase() === "EXPIRED"
    ) {
      await sendMessage(
        env,
        chatId,
        `Deposit ${code} sudah expired.`
      );

      return;
    }

    await sendMessage(
      env,
      chatId,
      `Deposit ${code} tidak dapat diproses. Status: ${existing.status}.`
    );

    return;
  }

  deposit = await expireDepositIfNeeded(
    env,
    deposit
  );

  if (!deposit) {
    await sendMessage(
      env,
      chatId,
      `Deposit ${code} tidak ditemukan.`
    );

    return;
  }

  if (
    String(deposit.status).toUpperCase() !== "PENDING"
  ) {
    if (
      String(deposit.status).toUpperCase() === "PAID"
    ) {
      await sendMessage(
        env,
        chatId,
        `Deposit ${code} sudah PAID.`
      );
    } else {
      await sendMessage(
        env,
        chatId,
        `Deposit ${code} tidak berstatus PENDING.`
      );
    }

    return;
  }

  const userId = Number(
    deposit.user_id
  );

  const amount = Math.round(
    Number(deposit.amount)
  );

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    await sendMessage(
      env,
      chatId,
      `Deposit ${code} memiliki data customer yang tidak valid.`
    );

    return;
  }

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    await sendMessage(
      env,
      chatId,
      `Deposit ${code} memiliki nominal yang tidak valid.`
    );

    return;
  }

  const referenceId =
    `DEPOSIT:${code}`;

  let balanceAfter;

  try {
    balanceAfter = await addBalance(
      env,
      userId,
      amount,
      referenceId,
      `Deposit manual QRIS ${code}`,
      "DEPOSIT"
    );
  } catch (error) {
    console.error(
      "TELEGRAM_PAY_BALANCE_ERROR",
      error
    );

    await sendMessage(
      env,
      chatId,
      [
        `Gagal menambahkan saldo untuk ${code}.`,
        "",
        String(error?.message || "Kesalahan database.")
      ].join("\n")
    );

    return;
  }

  try {
    const paidDeposit =
      await markDepositPaid(
        env,
        deposit
      );

    await sendMessage(
      env,
      chatId,
      [
        "Deposit berhasil dikonfirmasi.",
        "",
        `ID: ${code}`,
        `Username: @${deposit.username}`,
        `Nama: ${deposit.first_name || "-"}`,
        `Nominal: ${money(amount)}`,
        `Saldo sekarang: ${money(balanceAfter)}`,
        `Status: ${paidDeposit?.status || "PAID"}`
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "TELEGRAM_PAY_STATUS_ERROR",
      error
    );

    await sendMessage(
      env,
      chatId,
      [
        `Saldo untuk deposit ${code} sudah diproses.`,
        "",
        `Username: @${deposit.username}`,
        `Nominal: ${money(amount)}`,
        `Saldo sekarang: ${money(balanceAfter)}`,
        "",
        "Status deposit sedang disinkronkan."
      ].join("\n")
    );
  }
}

async function setQrFile(
  env,
  fileId
) {
  if (!fileId) {
    throw new Error(
      "File ID QRIS tidak tersedia."
    );
  }

  await saveSetting(
    env,
    "qris_file_id",
    fileId
  );

  await saveSetting(
    env,
    "qris_updated_at",
    now()
  );

  return true;
}

async function handleSetQr(
  env,
  message
) {
  const chatId =
    getChatIdFromMessage(message);

  const photoFileId =
    getPhotoFileId(message);

  if (photoFileId) {
    try {
      await setQrFile(
        env,
        photoFileId
      );

      await saveSetting(
        env,
        `telegram_qr_waiting:${getSenderId(message)}`,
        ""
      );

      await sendMessage(
        env,
        chatId,
        [
          "QRIS berhasil diperbarui.",
          "",
          "QRIS terbaru sekarang tersimpan dan siap digunakan website."
        ].join("\n")
      );
    } catch (error) {
      console.error(
        "TELEGRAM_SETQR_ERROR",
        error
      );

      await sendMessage(
        env,
        chatId,
        "Gagal menyimpan QRIS."
      );
    }

    return;
  }

  await saveSetting(
    env,
    `telegram_qr_waiting:${getSenderId(message)}`,
    "1"
  );

  await sendMessage(
    env,
    chatId,
    [
      "Silakan kirim foto QRIS sekarang.",
      "",
      "Foto berikutnya akan dijadikan QRIS aktif website."
    ].join("\n")
  );
}

async function handleQrPhoto(
  env,
  message
) {
  const chatId =
    getChatIdFromMessage(message);

  const senderId =
    getSenderId(message);

  const waiting = await setting(
    env,
    `telegram_qr_waiting:${senderId}`
  );

  if (waiting !== "1") {
    return false;
  }

  const fileId =
    getPhotoFileId(message);

  if (!fileId) {
    await sendMessage(
      env,
      chatId,
      "Foto QRIS tidak ditemukan."
    );

    return true;
  }

  try {
    await setQrFile(
      env,
      fileId
    );

    await saveSetting(
      env,
      `telegram_qr_waiting:${senderId}`,
      ""
    );

    await sendMessage(
      env,
      chatId,
      [
        "QRIS berhasil diperbarui.",
        "",
        "Website akan menggunakan QRIS terbaru."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "TELEGRAM_QR_PHOTO_ERROR",
      error
    );

    await sendMessage(
      env,
      chatId,
      "Gagal menyimpan QRIS."
    );
  }

  return true;
}

async function handleStart(
  env,
  message
) {
  const chatId =
    getChatIdFromMessage(message);

  await sendMessage(
    env,
    chatId,
    [
      "VenDigitalStore Bot",
      "",
      "Bot ini hanya digunakan untuk konfirmasi deposit dan pengaturan QRIS.",
      "",
      "/pay XXXX",
      "Konfirmasi deposit.",
      "",
      "/setqr",
      "Ganti QRIS."
    ].join("\n")
  );
}

async function handleHelp(
  env,
  message
) {
  return handleStart(
    env,
    message
  );
}

async function handleUnknownCommand(
  env,
  message
) {
  const chatId =
    getChatIdFromMessage(message);

  await sendMessage(
    env,
    chatId,
    [
      "Perintah tidak dikenal.",
      "",
      "/pay XXXX",
      "/setqr"
    ].join("\n")
  );
}

async function handleTextMessage(
  env,
  message
) {
  const text =
    getMessageText(message);

  const command =
    getCommand(text);

  if (!command.name) {
    return;
  }

  if (
    command.name === "/start" ||
    command.name === "/help"
  ) {
    await handleStart(
      env,
      message
    );

    return;
  }

  const ownerCommands = [
    "/pay",
    "/setqr"
  ];

  if (
    ownerCommands.includes(
      command.name
    )
  ) {
    const allowed =
      await requireOwnerMessage(
        env,
        message
      );

    if (!allowed) {
      return;
    }
  }

  switch (command.name) {
    case "/pay":
      await handlePay(
        env,
        message,
        command.args
      );
      break;

    case "/setqr":
      await handleSetQr(
        env,
        message
      );
      break;

    default:
      await handleUnknownCommand(
        env,
        message
      );
      break;
  }
}

async function processUpdate(
  env,
  update
) {
  if (!update || typeof update !== "object") {
    return;
  }

  if (update.callback_query) {
    const callbackId =
      update.callback_query.id;

    if (callbackId) {
      try {
        await answerCallbackQuery(
          env,
          callbackId
        );
      } catch (error) {
        console.error(
          "TELEGRAM_CALLBACK_ERROR",
          error
        );
      }
    }

    return;
  }

  const message =
    getMessage(update);

  if (!message) {
    return;
  }

  const senderId =
    getSenderId(message);

  if (
    isOwner(env, senderId) &&
    getPhotoFileId(message)
  ) {
    const handled =
      await handleQrPhoto(
        env,
        message
      );

    if (handled) {
      return;
    }
  }

  await handleTextMessage(
    env,
    message
  );
}

export async function handleTelegramWebhook(
  request,
  env
) {
  if (
    request.method !== "POST"
  ) {
    return new Response(
      "Method Not Allowed",
      {
        status: 405,
        headers: {
          Allow: "POST"
        }
      }
    );
  }

  const configuredSecret =
    getWebhookSecret(env);

  if (configuredSecret) {
    const receivedSecret =
      request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token"
      ) || "";

    if (
      receivedSecret !==
      configuredSecret
    ) {
      return new Response(
        "Forbidden",
        {
          status: 403
        }
      );
    }
  }

  let update;

  try {
    update =
      await request.json();
  } catch {
    return new Response(
      "Invalid JSON",
      {
        status: 400
      }
    );
  }

  try {
    await processUpdate(
      env,
      update
    );
  } catch (error) {
    console.error(
      "TELEGRAM_WEBHOOK_ERROR",
      error
    );
  }

  return new Response(
    "OK",
    {
      status: 200
    }
  );
}

export async function sendDepositNotification(
  env,
  deposit,
  user = null
) {
  const ownerId =
    getOwnerId(env);

  if (!ownerId) {
    throw new Error(
      "TELEGRAM_OWNER_ID belum dikonfigurasi."
    );
  }

  if (!deposit) {
    throw new Error(
      "Data deposit tidak tersedia."
    );
  }

  const code =
    normalizeCode(
      deposit.reference_id
    );

  const amount =
    Math.round(
      Number(deposit.amount)
    );

  const username =
    user?.username ||
    deposit.username ||
    "-";

  const firstName =
    user?.first_name ||
    deposit.first_name ||
    "-";

  const status =
    deposit.status ||
    "PENDING";

  const text = [
    "DEPOSIT BARU",
    "",
    `ID: ${escapeHtml(code)}`,
    `Username: @${escapeHtml(username)}`,
    `Nama: ${escapeHtml(firstName)}`,
    `Nominal: ${money(amount)}`,
    `Status: ${escapeHtml(status)}`,
    "",
    `Konfirmasi: /pay ${code}`
  ].join("\n");

  return sendMessage(
    env,
    ownerId,
    text
  );
}

export async function getQrFileId(
  env
) {
  return setting(
    env,
    "qris_file_id"
  );
}

export async function getQrFileUrl(
  env
) {
  const fileId =
    await getQrFileId(env);

  if (!fileId) {
    return null;
  }

  const result =
    await getFile(
      env,
      fileId
    );

  const filePath =
    result?.result?.file_path;

  if (!filePath) {
    throw new Error(
      "Telegram tidak mengembalikan file_path QRIS."
    );
  }

  const token =
    getBotToken(env);

  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN belum dikonfigurasi."
    );
  }

  return `${TELEGRAM_API}/file/bot${token}/${filePath}`;
}

export async function sendTelegramMessage(
  env,
  chatId,
  text,
  extra = {}
) {
  return sendMessage(
    env,
    chatId,
    text,
    extra
  );
}

export async function telegramSetWebhook(
  env,
  webhookUrl
) {
  const payload = {
    url: String(webhookUrl)
  };

  const secret =
    getWebhookSecret(env);

  if (secret) {
    payload.secret_token =
      secret;
  }

  return telegramApi(
    env,
    "setWebhook",
    payload
  );
}

export async function telegramDeleteWebhook(
  env
) {
  return telegramApi(
    env,
    "deleteWebhook",
    {
      drop_pending_updates: false
    }
  );
}

export async function telegramGetWebhookInfo(
  env
) {
  return telegramApi(
    env,
    "getWebhookInfo"
  );
}

export default handleTelegramWebhook;
