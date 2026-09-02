import {
  tg,
  send,
  sendPhoto,
  deleteMessage,
  answerCallback,
  editOrSend,
  inlineKeyboard,
  callbackButton,
  copyButton,
  getMessageId,
  getChatId,
  register,
  owner,
  now
} from "./utils.js";

export const BOT_MESSAGES = new Map();

export async function saveBotMessage(
  chatId,
  messageId
) {
  if (!chatId || !messageId) {
    return;
  }

  const key = String(chatId);

  if (!BOT_MESSAGES.has(key)) {
    BOT_MESSAGES.set(key, []);
  }

  const list = BOT_MESSAGES.get(key);

  if (!list.includes(messageId)) {
    list.push(messageId);
  }

  if (list.length > 30) {
    list.splice(0, list.length - 30);
  }
}

export async function forgetBotMessage(
  chatId,
  messageId
) {
  const key = String(chatId);
  const list = BOT_MESSAGES.get(key);

  if (!list) {
    return;
  }

  const index =
    list.indexOf(messageId);

  if (index !== -1) {
    list.splice(index, 1);
  }
}

export async function deleteBotMessages(
  env,
  chatId,
  keep = []
) {
  const key = String(chatId);
  const list =
    BOT_MESSAGES.get(key) || [];

  const keepSet =
    new Set(
      keep
        .filter(Boolean)
        .map(Number)
    );

  const targets =
    list.filter(
      id => !keepSet.has(Number(id))
    );

  for (const messageId of targets) {
    await deleteMessage(
      env,
      chatId,
      messageId
    );

    await forgetBotMessage(
      chatId,
      messageId
    );
  }
}

export async function sendBot(
  env,
  chatId,
  text,
  extra = {},
  options = {}
) {
  const message =
    await send(
      env,
      chatId,
      text,
      extra
    );

  const messageId =
    getMessageId(message);

  if (
    messageId &&
    options.track !== false
  ) {
    await saveBotMessage(
      chatId,
      messageId
    );
  }

  return message;
}

export async function sendBotPhoto(
  env,
  chatId,
  photo,
  caption = "",
  extra = {},
  options = {}
) {
  const message =
    await sendPhoto(
      env,
      chatId,
      photo,
      caption,
      extra
    );

  const messageId =
    getMessageId(message);

  if (
    messageId &&
    options.track !== false
  ) {
    await saveBotMessage(
      chatId,
      messageId
    );
  }

  return message;
}

export async function replaceBotMessage(
  env,
  chatId,
  oldMessageId,
  text,
  extra = {}
) {
  if (oldMessageId) {
    await deleteMessage(
      env,
      chatId,
      oldMessageId
    );

    await forgetBotMessage(
      chatId,
      oldMessageId
    );
  }

  await deleteBotMessages(
    env,
    chatId
  );

  return sendBot(
    env,
    chatId,
    text,
    extra
  );
}

export async function replaceTrackedBotMessage(
  env,
  chatId,
  text,
  extra = {},
  keep = []
) {
  await deleteBotMessages(
    env,
    chatId,
    keep
  );

  return sendBot(
    env,
    chatId,
    text,
    extra
  );
}

export async function sendPermanentMessage(
  env,
  chatId,
  text,
  extra = {}
) {
  return sendBot(
    env,
    chatId,
    text,
    extra,
    {
      track: false
    }
  );
}

export async function sendPermanentPhoto(
  env,
  chatId,
  photo,
  caption = "",
  extra = {}
) {
  return sendBotPhoto(
    env,
    chatId,
    photo,
    caption,
    extra,
    {
      track: false
    }
  );
}

export async function sendNumberMessage(
  env,
  chatId,
  number,
  orderId,
  extra = {}
) {
  const value =
    String(number || "").trim();

  if (!value) {
    return sendPermanentMessage(
      env,
      chatId,
      "❌ Nomor tidak tersedia.",
      extra
    );
  }

  const rows = [
    [
      copyButton(
        value,
        "📋 Copy Nomor"
      )
    ]
  ];

  if (orderId) {
    rows.push([
      callbackButton(
        "❌ Batalkan",
        "cancel:" + orderId
      ),
      callbackButton(
        "🔐 Minta OTP",
        "requestotp:" + orderId
      )
    ]);
  }

  return sendPermanentMessage(
    env,
    chatId,
    "📱 NOMOR WHATSAPP\n\n" +
      "Nomor: " +
      value +
      "\n\n" +
      "Silakan gunakan tombol di bawah.",
    {
      ...extra,
      reply_markup: {
        inline_keyboard: rows
      }
    }
  );
}

export async function sendOtpMessage(
  env,
  chatId,
  number,
  otp,
  orderId,
  extra = {}
) {
  const value =
    String(number || "").trim();

  const code =
    String(otp || "").trim();

  const rows = [
    [
      copyButton(
        code,
        "📋 Copy OTP"
      )
    ]
  ];

  if (orderId) {
    rows.push([
      callbackButton(
        "📱 Lihat Nomor",
        "shownumber:" + orderId
      )
    ]);
  }

  return sendPermanentMessage(
    env,
    chatId,
    "🔐 KODE OTP\n\n" +
      "Nomor: " +
      value +
      "\n" +
      "OTP: " +
      code +
      "\n\n" +
      "Gunakan kode tersebut sebelum kedaluwarsa.",
    {
      ...extra,
      reply_markup: {
        inline_keyboard: rows
      }
    }
  );
}

export async function sendOwnerOrder(
  env,
  data = {}
) {
  const text =
    "📱 ORDER MASUK\n\n" +
    "ID: " +
    String(data.id || "-") +
    "\n" +
    "Customer: " +
    String(data.telegramId || "-") +
    "\n" +
    "Nama: " +
    String(data.name || "-") +
    "\n" +
    "Username: " +
    String(
      data.username
        ? "@" + data.username
        : "-"
    ) +
    "\n" +
    "Negara: " +
    String(data.country || "-") +
    "\n" +
    "Service: " +
    String(data.service || "-") +
    "\n" +
    "Operator: " +
    String(data.operator || "-") +
    "\n" +
    "Nomor: " +
    String(data.phone || "-") +
    "\n" +
    "Harga: " +
    String(data.price || "-") +
    "\n" +
    "Status: " +
    String(data.status || "PENDING");

  const rows = [];

  if (data.id) {
    rows.push([
      callbackButton(
        "🔐 Minta OTP",
        "owner_requestotp:" +
          data.id
      ),
      callbackButton(
        "❌ Batalkan",
        "owner_cancel:" +
          data.id
      )
    ]);
  }

  return sendPermanentMessage(
    env,
    env.OWNER_ID,
    text,
    {
      reply_markup: {
        inline_keyboard: rows
      }
    }
  );
}

export async function sendOwnerOtpRequest(
  env,
  data = {}
) {
  const text =
    "🔐 PERMINTAAN OTP\n\n" +
    "ID: " +
    String(data.id || "-") +
    "\n" +
    "Customer: " +
    String(data.telegramId || "-") +
    "\n" +
    "Nama: " +
    String(data.name || "-") +
    "\n" +
    "Username: " +
    String(
      data.username
        ? "@" + data.username
        : "-"
    ) +
    "\n" +
    "Nomor: " +
    String(data.phone || "-") +
    "\n" +
    "Negara: " +
    String(data.country || "-") +
    "\n" +
    "Service: " +
    String(data.service || "-") +
    "\n\n" +
    "Kirim OTP dengan format:\n" +
    "/otp " +
    String(data.id || "XXXX") +
    " 123456";

  return sendPermanentMessage(
    env,
    env.OWNER_ID,
    text
  );
}

export async function notifyOwner(
  env,
  text,
  extra = {}
) {
  if (!env?.OWNER_ID) {
    return null;
  }

  return sendPermanentMessage(
    env,
    env.OWNER_ID,
    text,
    extra
  );
}

export async function notifyCustomer(
  env,
  telegramId,
  text,
  extra = {}
) {
  if (!telegramId) {
    return null;
  }

  return sendPermanentMessage(
    env,
    telegramId,
    text,
    extra
  );
}

export async function answer(
  env,
  callbackQuery,
  text = "",
  alert = false
) {
  return answerCallback(
    env,
    callbackQuery?.id,
    text,
    alert
  );
}

export async function callbackContext(
  env,
  callbackQuery
) {
  const chatId =
    getChatId(
      callbackQuery?.message
    );

  const messageId =
    callbackQuery
      ?.message
      ?.message_id || null;

  const userData =
    callbackQuery?.from;

  if (userData) {
    await register(
      env,
      userData
    );
  }

  return {
    chatId,
    messageId,
    user: userData,
    data:
      String(
        callbackQuery?.data || ""
      ),
    queryId:
      callbackQuery?.id || null
  };
}

export async function parseCallback(
  data
) {
  const value =
    String(data || "");

  const parts =
    value.split(":");

  return {
    action:
      parts.shift() || "",
    args: parts
  };
}

export async function safeCallback(
  env,
  callbackQuery,
  handler
) {
  const context =
    await callbackContext(
      env,
      callbackQuery
    );

  await answer(
    env,
    callbackQuery
  );

  try {
    return await handler(
      context
    );
  } catch (error) {
    const message =
      error?.message ||
      "Terjadi kesalahan.";

    if (
      context.chatId
    ) {
      await sendBot(
        env,
        context.chatId,
        "❌ Terjadi kesalahan.\n\n" +
          message
      );
    }

    return null;
  }
}

export async function handleTelegramUpdate(
  env,
  update,
  handlers = {}
) {
  if (!update) {
    return {
      ok: true,
      ignored: true
    };
  }

  if (
    update.callback_query
  ) {
    if (
      typeof handlers.callback ===
      "function"
    ) {
      await handlers.callback(
        update.callback_query
      );
    }

    return {
      ok: true,
      type: "callback"
    };
  }

  if (
    update.message
  ) {
    if (
      typeof handlers.message ===
      "function"
    ) {
      await handlers.message(
        update.message
      );
    }

    return {
      ok: true,
      type: "message"
    };
  }

  return {
    ok: true,
    ignored: true
  };
}

export async function setWebhook(
  env,
  webhookUrl
) {
  return tg(
    env,
    "setWebhook",
    {
      url: webhookUrl,
      allowed_updates: [
        "message",
        "callback_query"
      ],
      drop_pending_updates: false
    }
  );
}

export async function deleteWebhook(
  env,
  dropPending = false
) {
  return tg(
    env,
    "deleteWebhook",
    {
      drop_pending_updates:
        Boolean(dropPending)
    }
  );
}

export async function getWebhookInfo(
  env
) {
  return tg(
    env,
    "getWebhookInfo"
  );
}

export async function getMe(
  env
) {
  return tg(
    env,
    "getMe"
  );
}

export async function sendTyping(
  env,
  chatId
) {
  return tg(
    env,
    "sendChatAction",
    {
      chat_id: chatId,
      action: "typing"
    }
  );
}

export async function sendUploadPhotoAction(
  env,
  chatId
) {
  return tg(
    env,
    "sendChatAction",
    {
      chat_id: chatId,
      action: "upload_photo"
    }
  );
}

export async function pinMessage(
  env,
  chatId,
  messageId,
  disableNotification = true
) {
  return tg(
    env,
    "pinChatMessage",
    {
      chat_id: chatId,
      message_id: messageId,
      disable_notification:
        disableNotification
    }
  );
}

export async function unpinMessage(
  env,
  chatId,
  messageId = null
) {
  const data = {
    chat_id: chatId
  };

  if (messageId) {
    data.message_id =
      messageId;
  }

  return tg(
    env,
    "unpinChatMessage",
    data
  );
}

export function mainKeyboard() {
  return inlineKeyboard([
    [
      callbackButton(
        "📱 NOKOS 1",
        "nokos1"
      ),
      callbackButton(
        "📦 NOKOS 2",
        "nokos2"
      )
    ],
    [
      callbackButton(
        "💰 Saldo",
        "balance"
      ),
      callbackButton(
        "💳 Deposit",
        "deposit"
      )
    ],
    [
      callbackButton(
        "📋 Pesanan Saya",
        "orders"
      ),
      callbackButton(
        "👤 Akun",
        "account"
      )
    ],
    [
      callbackButton(
        "🆘 Bantuan",
        "help"
      )
    ]
  ]);
}

export function backKeyboard() {
  return inlineKeyboard([
    [
      callbackButton(
        "⬅️ Menu",
        "main"
      )
    ]
  ]);
}

export function orderKeyboard(
  orderId
) {
  return inlineKeyboard([
    [
      callbackButton(
        "❌ Batalkan",
        "cancel:" + orderId
      ),
      callbackButton(
        "🔐 Minta OTP",
        "requestotp:" + orderId
      )
    ]
  ]);
}

export function numberKeyboard(
  orderId,
  number
) {
  const rows = [
    [
      copyButton(
        number,
        "📋 Copy Nomor"
      )
    ]
  ];

  if (orderId) {
    rows.push([
      callbackButton(
        "❌ Batalkan",
        "cancel:" + orderId
      ),
      callbackButton(
        "🔐 Minta OTP",
        "requestotp:" + orderId
      )
    ]);
  }

  return inlineKeyboard(rows);
}

export function otpKeyboard(
  orderId,
  otp
) {
  const rows = [
    [
      copyButton(
        otp,
        "📋 Copy OTP"
      )
    ]
  ];

  if (orderId) {
    rows.push([
      callbackButton(
        "📱 Lihat Nomor",
        "shownumber:" + orderId
      )
    ]);
  }

  return inlineKeyboard(rows);
}

export async function ensureOwner(
  env,
  chatId
) {
  return owner(
    env,
    chatId
  );
}

export function messageText(
  message
) {
  return String(
    message?.text || ""
  ).trim();
}

export function messagePhoto(
  message
) {
  if (
    !Array.isArray(
      message?.photo
    )
  ) {
    return null;
  }

  if (
    !message.photo.length
  ) {
    return null;
  }

  return message.photo[
    message.photo.length - 1
  ];
}

export function messageDocument(
  message
) {
  return (
    message?.document ||
    null
  );
}

export function messageVideo(
  message
) {
  return (
    message?.video ||
    null
  );
}

export function messageFileId(
  message
) {
  const photo =
    messagePhoto(message);

  if (photo?.file_id) {
    return photo.file_id;
  }

  if (
    message?.document?.file_id
  ) {
    return message.document.file_id;
  }

  if (
    message?.video?.file_id
  ) {
    return message.video.file_id;
  }

  return null;
}

export function isCommand(
  message,
  command
) {
  const text =
    messageText(message);

  const target =
    String(command || "")
      .replace(/^\/+/, "")
      .toLowerCase();

  const first =
    text
      .split(/\s+/)[0]
      .replace(/^\/+/, "")
      .split("@")[0]
      .toLowerCase();

  return first === target;
}

export function commandArgs(
  message
) {
  const text =
    messageText(message);

  if (!text) {
    return [];
  }

  const parts =
    text.split(/\s+/);

  if (
    parts[0].startsWith("/")
  ) {
    parts.shift();
  }

  return parts;
}

export function commandName(
  message
) {
  const text =
    messageText(message);

  if (!text.startsWith("/")) {
    return "";
  }

  return (
    text
      .split(/\s+/)[0]
      .replace(/^\/+/, "")
      .split("@")[0]
      .toLowerCase()
  );
}

export async function clearChatBotMessages(
  env,
  chatId
) {
  await deleteBotMessages(
    env,
    chatId
  );

  BOT_MESSAGES.delete(
    String(chatId)
  );

  return true;
}

export function trackedMessages(
  chatId
) {
  return [
    ...(BOT_MESSAGES.get(
      String(chatId)
    ) || [])
  ];
}

export async function removeTrackedMessage(
  env,
  chatId,
  messageId
) {
  if (!messageId) {
    return;
  }

  await deleteMessage(
    env,
    chatId,
    messageId
  );

  await forgetBotMessage(
    chatId,
    messageId
  );
}

export async function replaceWithKeyboard(
  env,
  chatId,
  oldMessageId,
  text,
  rows = []
) {
  return replaceBotMessage(
    env,
    chatId,
    oldMessageId,
    text,
    inlineKeyboard(rows)
  );
}

export async function sendMainMenu(
  env,
  chatId,
  oldMessageId = null
) {
  return replaceBotMessage(
    env,
    chatId,
    oldMessageId,
    "🏪 VenDigitalStore\n\n" +
      "Selamat datang di VenDigitalStore!\n\n" +
      "Silakan pilih menu yang ingin kamu gunakan.",
    mainKeyboard()
  );
}

export async function sendBackMenu(
  env,
  chatId,
  text
) {
  return replaceTrackedBotMessage(
    env,
    chatId,
    text,
    backKeyboard()
  );
}

export async function sendBalance(
  env,
  chatId,
  balance
) {
  return replaceTrackedBotMessage(
    env,
    chatId,
    "💰 SALDO\n\n" +
      "Saldo kamu:\n" +
      String(balance),
    inlineKeyboard([
      [
        callbackButton(
          "💳 Deposit",
          "deposit"
        )
      ],
      [
        callbackButton(
          "⬅️ Menu",
          "main"
        )
      ]
    ])
  );
}

export async function sendAccount(
  env,
  chatId,
  data = {}
) {
  const text =
    "👤 AKUN\n\n" +
    "Nama: " +
    String(data.firstName || "-") +
    "\n" +
    "Username: " +
    String(
      data.username
        ? "@" + data.username
        : "-"
    ) +
    "\n" +
    "Telegram ID: " +
    String(data.telegramId || "-") +
    "\n" +
    "Saldo: " +
    String(data.balance || "Rp0");

  return replaceTrackedBotMessage(
    env,
    chatId,
    text,
    backKeyboard()
  );
}

export async function sendHelp(
  env,
  chatId
) {
  return replaceTrackedBotMessage(
    env,
    chatId,
    "🆘 BANTUAN\n\n" +
      "📱 NOKOS 1: nomor dari katalog SMSCode.\n" +
      "📦 NOKOS 2: stok nomor WhatsApp VenDigitalStore.\n" +
      "💳 Deposit: transfer QRIS lalu kirim bukti pembayaran.\n\n" +
      "Gunakan tombol menu untuk melanjutkan.",
    backKeyboard()
  );
}

export async function sendError(
  env,
  chatId,
  error
) {
  const message =
    error?.message ||
    String(error || "Terjadi kesalahan.");

  return sendBot(
    env,
    chatId,
    "❌ Terjadi kesalahan.\n\n" +
      message
  );
}

export async function sendSuccess(
  env,
  chatId,
  text,
  extra = {}
) {
  return sendBot(
    env,
    chatId,
    "✅ " + String(text),
    extra
  );
}

export async function sendWaiting(
  env,
  chatId,
  text = "⏳ Sedang diproses..."
) {
  return sendBot(
    env,
    chatId,
    text
  );
}

export async function sendCancelled(
  env,
  chatId,
  text = "Pesanan berhasil dibatalkan."
) {
  return sendPermanentMessage(
    env,
    chatId,
    "❌ " + text
  );
}

export async function sendExpired(
  env,
  chatId,
  text = "Pesanan telah kedaluwarsa."
) {
  return sendPermanentMessage(
    env,
    chatId,
    "⏰ " + text
  );
        }
