import {
  register,
  user,
  money,
  parseCommand,
  backKeyboard,
  inlineKeyboard,
  callbackButton,
  owner
} from "./utils.js";

import {
  replaceTrackedBotMessage,
  sendPermanentMessage,
  handleTelegramUpdate,
  safeCallback
} from "./telegram.js";

import {
  handleNokos1Callback,
  showCountries
} from "./nokos1.js";

import {
  handleNokos2Callback,
  showNokos2Menu,
  ownerSendOtp,
  ownerDeleteNokos2,
  ownerAddNokos2
} from "./nokos2.js";

import {
  setCountryPrice,
  showPriceList
} from "./pricing.js";

import {
  handleQrisCallback,
  createDepositRequest,
  checkDeposit,
  handleDepositProof,
  confirmDeposit,
  setQris,
  handleOwnerQrisPhoto
} from "./qris.js";

const MENU = inlineKeyboard([
  [
    callbackButton("📱 NOKOS 1", "nokos1"),
    callbackButton("📦 NOKOS 2", "nokos2")
  ],
  [
    callbackButton("💰 Saldo", "balance"),
    callbackButton("💳 Deposit", "deposit")
  ],
  [
    callbackButton("📋 Pesanan Saya", "orders"),
    callbackButton("👤 Akun", "account")
  ],
  [callbackButton("🆘 Bantuan", "help")]
]);

async function showMainMenu(env, chatId, messageId = null) {
  return replaceTrackedBotMessage(
    env,
    chatId,
    "🏪 VenDigitalStore\n\n" +
      "Selamat datang di VenDigitalStore!\n\n" +
      "Silakan pilih menu yang ingin kamu gunakan.",
    MENU
  );
}

async function showBalance(env, chatId, telegramId) {
  const u = await user(env, telegramId);

  return replaceTrackedBotMessage(
    env,
    chatId,
    "💰 SALDO\n\n" +
      "Saldo kamu:\n" +
      money(u ? u.balance : 0),
    inlineKeyboard([
      [callbackButton("💳 Deposit", "deposit")],
      [callbackButton("⬅️ Menu", "main")]
    ])
  );
}

async function showAccount(env, chatId, telegramId) {
  const u = await user(env, telegramId);

  return replaceTrackedBotMessage(
    env,
    chatId,
    "👤 AKUN\n\n" +
      "Nama: " +
      (u?.first_name || "-") +
      "\n" +
      "Username: " +
      (u?.username ? "@" + u.username : "-") +
      "\n" +
      "Telegram ID: " +
      (u?.telegram_id || "-") +
      "\n" +
      "Saldo: " +
      money(u?.balance),
    inlineKeyboard([
      [callbackButton("💰 Saldo", "balance")],
      [callbackButton("⬅️ Menu", "main")]
    ])
  );
}

async function showOrders(env, chatId, telegramId) {
  try {
    const result = await env.DB.prepare(
      `SELECT * FROM nokos_orders
       WHERE telegram_id = ?
       ORDER BY id DESC LIMIT 10`
    )
      .bind(String(telegramId))
      .all();

    const rows = result?.results || [];

    if (!rows.length) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "📋 PESANAN SAYA\n\nBelum ada pesanan.",
        backKeyboard()
      );
    }

    let text = "📋 PESANAN SAYA\n\n";

    for (const order of rows) {
      text +=
        "ID: " +
        (order.sms_order_id || order.id) +
        "\n" +
        "Nomor: " +
        (order.phone_number || "-") +
        "\n" +
        "Harga: " +
        money(order.sell_price) +
        "\n" +
        "Status: " +
        (order.status || "-") +
        "\n\n";
    }

    return replaceTrackedBotMessage(
      env,
      chatId,
      text,
      backKeyboard()
    );
  } catch {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "📋 PESANAN SAYA\n\nBelum ada pesanan yang tersimpan.",
      backKeyboard()
    );
  }
}

async function showHelp(env, chatId) {
  return replaceTrackedBotMessage(
    env,
    chatId,
    "🆘 BANTUAN\n\n" +
      "/start — Menu utama\n" +
      "/cek — Kirim bukti deposit\n" +
      "/harga — Lihat harga NOKOS 1\n" +
      "/bantuan — Bantuan\n\n" +
      "💳 Deposit:\n" +
      "Pilih Deposit → ketik nominal → transfer QRIS → /cek → kirim bukti.\n\n" +
      "📱 NOKOS 1:\n" +
      "Nomor virtual dari SMSCode.\n\n" +
      "📦 NOKOS 2:\n" +
      "Stok WhatsApp internal VenDigitalStore.\n\n" +
      "📞 Owner:\n" +
      "https://wa.me/6288707201970",
    backKeyboard()
  );
}

async function handleCallback(env, callbackQuery) {
  return safeCallback(env, callbackQuery, async (context) => {
    const data = context.data;

    if (data === "main") {
      return showMainMenu(env, context.chatId, context.messageId);
    }

    if (data === "balance") {
      return showBalance(env, context.chatId, context.user?.id);
    }

    if (data === "account") {
      return showAccount(env, context.chatId, context.user?.id);
    }

    if (data === "orders") {
      return showOrders(env, context.chatId, context.user?.id);
    }

    if (data === "help") {
      return showHelp(env, context.chatId);
    }

    if (data === "deposit") {
      return handleQrisCallback(env, data, context);
    }

    if (
      data === "nokos1" ||
      data.startsWith("n1page:") ||
      data.startsWith("n1c:") ||
      data.startsWith("n1s:") ||
      data.startsWith("n1p:") ||
      data.startsWith("otp:") ||
      data.startsWith("cancel:")
    ) {
      return handleNokos1Callback(env, data, context);
    }

    if (
      data === "nokos2" ||
      data.startsWith("n2c:") ||
      data.startsWith("n2buy:") ||
      data.startsWith("n2otp:") ||
      data.startsWith("n2cancel:")
    ) {
      return handleNokos2Callback(env, data, context);
    }

    return null;
  });
}

async function handleMessage(env, message) {
  if (!message?.chat || !message?.from) return;

  if (message.photo) {
    if (await handleOwnerQrisPhoto(env, message)) return;
    if (await handleDepositProof(env, message)) return;
    return;
  }

  if (!message.text) return;

  const text = String(message.text || "").trim();
  const { command, args, raw } = parseCommand(text);

  await register(env, message.from);

  if (command === "start") {
    return showMainMenu(env, message.chat.id);
  }

  if (command === "cek") {
    return checkDeposit(env, message);
  }

  if (command === "harga") {
    return showPriceList(env, message.chat.id);
  }

  if (command === "bantuan" || command === "help") {
    return showHelp(env, message.chat.id);
  }

  if (command === "setharga") {
    return setCountryPrice(env, message);
  }

  if (command === "setqris") {
    return setQris(env, message);
  }

  if (command === "konfirmasi") {
    return confirmDeposit(env, message);
  }

  if (command === "otp") {
    return ownerSendOtp(env, message);
  }

  if (command === "delnokos2") {
    return ownerDeleteNokos2(env, message);
  }

  if (command === "addnokos2") {
    return ownerAddNokos2(env, message);
  }

  if (command === "admin") {
    if (!(await owner(env, message.chat.id))) {
      return sendPermanentMessage(
        env,
        message.chat.id,
        "❌ Hanya owner."
      );
    }

    return sendPermanentMessage(
      env,
      message.chat.id,
      "👑 PANEL OWNER\n\n" +
        "/setharga Vietnam 5000\n" +
        "/harga\n" +
        "/setqris\n" +
        "/konfirmasi ID\n" +
        "/otp A7K2 123456\n" +
        "/addnokos2 Indonesia 628xxxxxxxxxx\n" +
        "/delnokos2 628xxxxxxxxxx"
    );
  }

  if (/^\d+$/.test(text)) {
    const handled = await createDepositRequest(env, message);
    if (handled) return;
  }

  return sendPermanentMessage(
    env,
    message.chat.id,
    "Gunakan /start untuk membuka menu."
  );
}

export async function handleUpdate(env, update) {
  return handleTelegramUpdate(env, update, {
    callback: (callbackQuery) => handleCallback(env, callbackQuery),
    message: (message) => handleMessage(env, message)
  });
}

export async function handleScheduled(env) {
  return null;
}