import {
  money,
  now,
  number,
  user,
  register,
  setting,
  saveSetting,
  addBalance,
  owner,
  backKeyboard,
  inlineKeyboard,
  callbackButton
} from "./utils.js";

import {
  replaceTrackedBotMessage,
  sendPermanentMessage,
  sendBotPhoto,
  notifyOwner
} from "./telegram.js";

const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 100000000;

export async function showDepositMenu(env, chatId, messageId = null) {
  const qris = await setting(env, "qris_file_id");

  if (!qris) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ QRIS belum tersedia.\n\nSilakan hubungi owner.",
      backKeyboard()
    );
  }

  return replaceTrackedBotMessage(
    env,
    chatId,
    "💳 DEPOSIT\n\n" +
      "Masukkan nominal deposit dengan mengetik angka.\n\n" +
      "Contoh:\n10000\n\n" +
      "Minimal deposit: " +
      money(MIN_DEPOSIT),
    backKeyboard()
  );
}

async function createDeposit(env, telegramId, amount) {
  const result = await env.DB.prepare(
    `INSERT INTO deposits
    (telegram_id, amount, status, created_at)
    VALUES (?, ?, 'PENDING', ?)`
  )
    .bind(String(telegramId), number(amount), now())
    .run();

  return result?.meta?.last_row_id;
}

async function getPendingDeposit(env, telegramId) {
  const result = await env.DB.prepare(
    `SELECT * FROM deposits
     WHERE telegram_id = ? AND status = 'PENDING'
     ORDER BY id DESC LIMIT 1`
  )
    .bind(String(telegramId))
    .all();

  return result?.results?.[0] || null;
}

async function getDepositById(env, id) {
  return env.DB.prepare(
    "SELECT * FROM deposits WHERE id = ?"
  )
    .bind(String(id))
    .first();
}

export async function createDepositRequest(env, message) {
  const chatId = message.chat.id;
  const text = String(message.text || "").trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const amount = Number(text);

  if (amount < MIN_DEPOSIT) {
    return sendPermanentMessage(
      env,
      chatId,
      "❌ Minimal deposit adalah " + money(MIN_DEPOSIT) + "."
    );
  }

  if (amount > MAX_DEPOSIT) {
    return sendPermanentMessage(
      env,
      chatId,
      "❌ Nominal terlalu besar."
    );
  }

  const u = await register(env, message.from);
  const depositId = await createDeposit(env, u.telegram_id, amount);
  const qris = await setting(env, "qris_file_id");

  if (!qris) {
    return sendPermanentMessage(
      env,
      chatId,
      "❌ QRIS belum disiapkan oleh owner."
    );
  }

  await sendBotPhoto(
    env,
    chatId,
    qris,
    "💳 DEPOSIT VenDigitalStore\n\n" +
      "ID Deposit: " +
      depositId +
      "\n" +
      "Nominal: " +
      money(amount) +
      "\n\n" +
      "Setelah transfer, ketik:\n" +
      "/cek\n\n" +
      "Lalu kirim bukti transfer.\n\n" +
      "⚠️ Saldo belum masuk sebelum dikonfirmasi owner.",
    {},
    { track: false }
  );

  await notifyOwner(
    env,
    "🔔 DEPOSIT BARU\n\n" +
      "ID: " +
      depositId +
      "\n" +
      "Nama: " +
      (u.first_name || "-") +
      "\n" +
      "Username: " +
      (u.username ? "@" + u.username : "-") +
      "\n" +
      "Telegram ID: " +
      u.telegram_id +
      "\n" +
      "Nominal: " +
      money(amount) +
      "\n\n" +
      "Status: ⏳ PENDING\n" +
      "Menunggu bukti transfer."
  );

  return true;
}

export async function checkDeposit(env, message) {
  const chatId = message.chat.id;
  const u = await register(env, message.from);
  const deposit = await getPendingDeposit(env, u.telegram_id);

  if (!deposit) {
    return sendPermanentMessage(
      env,
      chatId,
      "❌ Tidak ada deposit pending.\n\nSilakan pilih 💳 Deposit terlebih dahulu.",
      backKeyboard()
    );
  }

  if (deposit.proof_file_id) {
    return sendPermanentMessage(
      env,
      chatId,
      "⏳ Bukti transfer untuk deposit #" +
        deposit.id +
        " sudah diterima.\n\nSilakan tunggu konfirmasi owner.",
      backKeyboard()
    );
  }

  return sendPermanentMessage(
    env,
    chatId,
    "📎 KIRIM BUKTI TRANSFER\n\n" +
      "ID Deposit: " +
      deposit.id +
      "\n" +
      "Nominal: " +
      money(deposit.amount) +
      "\n\nSilakan kirim screenshot/foto bukti transfer di chat ini."
  );
}

export async function handleDepositProof(env, message) {
  if (!message?.photo?.length) return false;

  const chatId = message.chat.id;
  const u = await register(env, message.from);
  const deposit = await getPendingDeposit(env, u.telegram_id);

  if (!deposit) {
    return false;
  }

  if (deposit.proof_file_id) {
    await sendPermanentMessage(
      env,
      chatId,
      "⏳ Bukti transfer deposit #" +
        deposit.id +
        " sudah dikirim sebelumnya."
    );
    return true;
  }

  const photo = message.photo[message.photo.length - 1];

  await env.DB.prepare(
    `UPDATE deposits
     SET proof_file_id = ?
     WHERE id = ? AND status = 'PENDING'`
  )
    .bind(photo.file_id, deposit.id)
    .run();

  await notifyOwner(
    env,
    "📎 BUKTI TRANSFER MASUK\n\n" +
      "ID Deposit: " +
      deposit.id +
      "\n" +
      "Nama: " +
      (u.first_name || "-") +
      "\n" +
      "Username: " +
      (u.username ? "@" + u.username : "-") +
      "\n" +
      "Telegram ID: " +
      u.telegram_id +
      "\n" +
      "Nominal: " +
      money(deposit.amount) +
      "\n\n" +
      "Periksa pembayaran lalu gunakan:\n" +
      "/konfirmasi " +
      deposit.id
  );

  await sendBotPhoto(
    env,
    env.OWNER_ID,
    photo.file_id,
    "📎 Bukti transfer deposit #" +
      deposit.id +
      "\nNominal: " +
      money(deposit.amount),
    {},
    { track: false }
  );

  await sendPermanentMessage(
    env,
    chatId,
    "✅ Bukti transfer berhasil diterima.\n\n" +
      "ID Deposit: " +
      deposit.id +
      "\n" +
      "Nominal: " +
      money(deposit.amount) +
      "\n\n⏳ Menunggu pemeriksaan owner."
  );

  return true;
}

export async function confirmDeposit(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Command ini hanya dapat digunakan owner."
    );
  }

  const parts = String(message.text || "").trim().split(/\s+/);

  if (!parts[1] || !/^\d+$/.test(parts[1])) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "Format:\n/konfirmasi ID"
    );
  }

  const id = parts[1];
  const deposit = await getDepositById(env, id);

  if (!deposit) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Deposit #" + id + " tidak ditemukan."
    );
  }

  if (deposit.status !== "PENDING") {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Deposit #" +
        id +
        " sudah diproses.\nStatus: " +
        deposit.status
    );
  }

  if (!deposit.proof_file_id) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "⚠️ Deposit #" + id + " belum memiliki bukti transfer."
    );
  }

  const customer = await user(env, deposit.telegram_id);

  if (!customer) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Customer tidak ditemukan."
    );
  }

  const newBalance = await addBalance(
    env,
    customer.telegram_id,
    deposit.amount,
    id,
    "Deposit #" + id
  );

  await env.DB.prepare(
    `UPDATE deposits
     SET status = 'CONFIRMED',
         confirmed_at = ?
     WHERE id = ? AND status = 'PENDING'`
  )
    .bind(now(), id)
    .run();

  await sendPermanentMessage(
    env,
    customer.telegram_id,
    "✅ DEPOSIT BERHASIL\n\n" +
      "ID Deposit: " +
      id +
      "\n" +
      "Nominal: " +
      money(deposit.amount) +
      "\n\n" +
      "Saldo kamu sekarang:\n" +
      money(newBalance)
  );

  return sendPermanentMessage(
    env,
    message.chat.id,
    "✅ Deposit #" +
      id +
      " berhasil dikonfirmasi.\n\n" +
      "Customer: " +
      customer.telegram_id +
      "\n" +
      "Saldo ditambahkan: " +
      money(deposit.amount) +
      "\n" +
      "Saldo sekarang: " +
      money(newBalance)
  );
}

export async function setQris(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Hanya owner yang dapat mengatur QRIS."
    );
  }

  await saveSetting(env, "qris_waiting", "1");

  return sendPermanentMessage(
    env,
    message.chat.id,
    "📷 Kirim gambar QRIS sekarang.\n\n" +
      "Bot akan menyimpannya sebagai QRIS pembayaran deposit."
  );
}

export async function handleOwnerQrisPhoto(env, message) {
  if (!(await owner(env, message.chat.id))) return false;
  if (!message?.photo?.length) return false;

  const waiting = await setting(env, "qris_waiting");
  if (waiting !== "1") return false;

  const photo = message.photo[message.photo.length - 1];

  await saveSetting(env, "qris_file_id", photo.file_id);
  await saveSetting(env, "qris_waiting", "0");

  await sendPermanentMessage(
    env,
    message.chat.id,
    "✅ QRIS berhasil disimpan.\n\n" +
      "QRIS ini sekarang digunakan untuk Deposit customer."
  );

  return true;
}

export async function handleQrisCallback(env, data, context) {
  if (data === "deposit") {
    return showDepositMenu(env, context.chatId, context.messageId);
  }
  return null;
}