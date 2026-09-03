import {
  money,
  now,
  number,
  user,
  setting,
  saveSetting,
  chargeCustomer,
  refundCustomer,
  backKeyboard,
  inlineKeyboard,
  callbackButton,
  randomId4,
  owner
} from "./utils.js";

import {
  replaceTrackedBotMessage,
  sendPermanentMessage,
  sendNumberMessage,
  sendOtpMessage,
  notifyOwner,
  sendOwnerOtpRequest
} from "./telegram.js";

const NOKOS2_PRICE = 3000;

async function listAvailableStock(env, country = null) {
  let query =
    "SELECT * FROM nokos2_stock WHERE status = 'AVAILABLE'";
  const binds = [];

  if (country) {
    query += " AND (country = ? OR country_code = ?)";
    binds.push(String(country), String(country).toUpperCase());
  }

  query += " ORDER BY id ASC LIMIT 50";

  const stmt = env.DB.prepare(query);
  const result = binds.length
    ? await stmt.bind(...binds).all()
    : await stmt.all();

  return result?.results || [];
}

async function getStockById(env, id) {
  return env.DB.prepare(
    "SELECT * FROM nokos2_stock WHERE id = ?"
  )
    .bind(String(id))
    .first();
}

async function getOrderByCode(env, orderCode) {
  return env.DB.prepare(
    "SELECT * FROM nokos2_stock WHERE order_id = ?"
  )
    .bind(String(orderCode))
    .first();
}

async function lockStock(env, id, telegramId, orderCode) {
  const result = await env.DB.prepare(
    `UPDATE nokos2_stock
     SET status = 'RESERVED',
         customer_id = ?,
         order_id = ?,
         updated_at = ?
     WHERE id = ? AND status = 'AVAILABLE'`
  )
    .bind(
      String(telegramId),
      String(orderCode),
      now(),
      String(id)
    )
    .run();

  return result?.meta?.changes > 0;
}

async function markSold(env, id) {
  await env.DB.prepare(
    `UPDATE nokos2_stock
     SET status = 'SOLD',
         updated_at = ?
     WHERE id = ?`
  )
    .bind(now(), String(id))
    .run();
}

async function releaseStock(env, id) {
  await env.DB.prepare(
    `UPDATE nokos2_stock
     SET status = 'AVAILABLE',
         customer_id = NULL,
         order_id = NULL,
         otp = NULL,
         updated_at = ?
     WHERE id = ? AND status = 'RESERVED'`
  )
    .bind(now(), String(id))
    .run();
}

async function saveOtp(env, id, otp) {
  await env.DB.prepare(
    `UPDATE nokos2_stock
     SET otp = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(String(otp), now(), String(id))
    .run();
}

export async function showNokos2Menu(env, chatId, messageId = null) {
  try {
    const stocks = await listAvailableStock(env);

    if (!stocks.length) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "📦 NOKOS 2\n\n" +
          "Stok WhatsApp internal sedang kosong.\n" +
          "Silakan coba lagi nanti.",
        backKeyboard()
      );
    }

    const countries = {};
    for (const item of stocks) {
      const key = item.country || item.country_code || "Lainnya";
      if (!countries[key]) countries[key] = 0;
      countries[key] += 1;
    }

    const rows = Object.keys(countries).map((name) => [
      {
        text: "🌍 " + name + " • " + countries[name] + " stok",
        callback_data: "n2c:" + encodeURIComponent(name)
      }
    ]);

    rows.push([callbackButton("⬅️ Menu", "main")]);

    return replaceTrackedBotMessage(
      env,
      chatId,
      "📦 NOKOS 2\n\n" +
        "Stok WhatsApp internal VenDigitalStore\n" +
        "Harga: " +
        money(NOKOS2_PRICE) +
        " / nomor\n\n" +
        "Pilih negara:",
      inlineKeyboard(rows)
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal memuat stok NOKOS 2.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function showNokos2Country(
  env,
  chatId,
  countryName,
  messageId = null
) {
  try {
    const decoded = decodeURIComponent(String(countryName || ""));
    const stocks = await listAvailableStock(env, decoded);

    if (!stocks.length) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Stok " + decoded + " sedang kosong.",
        inlineKeyboard([[callbackButton("⬅️ NOKOS 2", "nokos2")]])
      );
    }

    const rows = stocks.slice(0, 20).map((item) => [
      {
        text:
          "📞 " +
          (item.phone_number || "-") +
          " • " +
          money(item.price || NOKOS2_PRICE),
        callback_data: "n2buy:" + item.id
      }
    ]);

    rows.push([callbackButton("⬅️ Negara", "nokos2")]);

    return replaceTrackedBotMessage(
      env,
      chatId,
      "📦 NOKOS 2\n\n" +
        "Negara: " +
        decoded +
        "\n" +
        "Harga: " +
        money(NOKOS2_PRICE) +
        "\n\n" +
        "Pilih nomor:",
      inlineKeyboard(rows)
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal memuat nomor.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function buyNokos2(env, chatId, telegramId, stockId) {
  try {
    const stock = await getStockById(env, stockId);

    if (!stock || stock.status !== "AVAILABLE") {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Nomor sudah tidak tersedia. Silakan pilih ulang.",
        inlineKeyboard([[callbackButton("⬅️ NOKOS 2", "nokos2")]])
      );
    }

    const price = number(stock.price || NOKOS2_PRICE);
    const u = await user(env, telegramId);

    if (number(u?.balance) < price) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Saldo tidak cukup.\n\n" +
          "Harga: " +
          money(price) +
          "\n" +
          "Saldo: " +
          money(u?.balance) +
          "\n\nSilakan deposit terlebih dahulu.",
        inlineKeyboard([
          [callbackButton("💳 Deposit", "deposit")],
          [callbackButton("⬅️ Menu", "main")]
        ])
      );
    }

    const orderCode = randomId4();
    const locked = await lockStock(env, stock.id, telegramId, orderCode);

    if (!locked) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Nomor baru saja diambil orang lain. Silakan pilih nomor lain.",
        inlineKeyboard([[callbackButton("⬅️ NOKOS 2", "nokos2")]])
      );
    }

    let newBalance;
    try {
      newBalance = await chargeCustomer(
        env,
        telegramId,
        price,
        orderCode,
        "Pembelian NOKOS 2"
      );
    } catch (error) {
      await releaseStock(env, stock.id);
      throw error;
    }

    await markSold(env, stock.id);

    await sendNumberMessage(
      env,
      chatId,
      stock.phone_number,
      orderCode
    );

    await notifyOwner(
      env,
      "📦 ORDER NOKOS 2\n\n" +
        "ID: " +
        orderCode +
        "\n" +
        "Customer: " +
        telegramId +
        "\n" +
        "Nama: " +
        (u?.first_name || "-") +
        "\n" +
        "Username: " +
        (u?.username ? "@" + u.username : "-") +
        "\n" +
        "Negara: " +
        (stock.country || "-") +
        "\n" +
        "Nomor: " +
        (stock.phone_number || "-") +
        "\n" +
        "Harga: " +
        money(price)
    );

    return replaceTrackedBotMessage(
      env,
      chatId,
      "✅ NOKOS 2 BERHASIL\n\n" +
        "ID: " +
        orderCode +
        "\n" +
        "Negara: " +
        (stock.country || "-") +
        "\n" +
        "Nomor: " +
        (stock.phone_number || "-") +
        "\n" +
        "Harga: " +
        money(price) +
        "\n" +
        "Saldo: " +
        money(newBalance) +
        "\n\n" +
        "Nomor sudah dikirim di pesan terpisah (tidak akan dihapus).\n" +
        "Tekan 🔐 Minta OTP jika membutuhkan kode.",
      inlineKeyboard([
        [callbackButton("🔐 Minta OTP", "n2otp:" + orderCode)],
        [callbackButton("❌ Batalkan", "n2cancel:" + orderCode)],
        [callbackButton("⬅️ Menu", "main")]
      ])
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal membeli NOKOS 2.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function requestNokos2Otp(env, chatId, telegramId, orderCode) {
  try {
    const order = await getOrderByCode(env, orderCode);

    if (!order) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Order tidak ditemukan.",
        backKeyboard()
      );
    }

    if (String(order.customer_id) !== String(telegramId)) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Order bukan milik kamu.",
        backKeyboard()
      );
    }

    const u = await user(env, telegramId);

    await sendOwnerOtpRequest(env, {
      id: order.order_id,
      telegramId,
      name: u?.first_name || "-",
      username: u?.username || "",
      phone: order.phone_number,
      country: order.country,
      service: "NOKOS 2"
    });

    return replaceTrackedBotMessage(
      env,
      chatId,
      "🔐 PERMINTAAN OTP DIKIRIM\n\n" +
        "ID: " +
        order.order_id +
        "\n" +
        "Nomor: " +
        (order.phone_number || "-") +
        "\n\n" +
        "Owner akan mengirim OTP segera.",
      inlineKeyboard([
        [callbackButton("⬅️ Menu", "main")]
      ])
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal meminta OTP.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function cancelNokos2(env, chatId, telegramId, orderCode) {
  try {
    const order = await getOrderByCode(env, orderCode);

    if (!order) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Order tidak ditemukan.",
        backKeyboard()
      );
    }

    if (String(order.customer_id) !== String(telegramId)) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Order bukan milik kamu.",
        backKeyboard()
      );
    }

    if (order.status === "SOLD" || order.status === "RESERVED") {
      const price = number(order.price || NOKOS2_PRICE);

      await env.DB.prepare(
        `UPDATE nokos2_stock
         SET status = 'AVAILABLE',
             customer_id = NULL,
             order_id = NULL,
             otp = NULL,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(now(), String(order.id))
        .run();

      await refundCustomer(
        env,
        telegramId,
        price,
        orderCode,
        "Refund NOKOS 2 #" + orderCode
      );

      await notifyOwner(
        env,
        "❌ NOKOS 2 DIBATALKAN\n\n" +
          "ID: " +
          orderCode +
          "\n" +
          "Customer: " +
          telegramId +
          "\n" +
          "Nomor: " +
          (order.phone_number || "-") +
          "\n" +
          "Refund: " +
          money(price)
      );

      return replaceTrackedBotMessage(
        env,
        chatId,
        "✅ ORDER DIBATALKAN\n\n" +
          "ID: " +
          orderCode +
          "\n" +
          "Refund: " +
          money(price) +
          "\n\nSaldo sudah dikembalikan.",
        backKeyboard()
      );
    }

    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Order tidak dapat dibatalkan.\nStatus: " + order.status,
      backKeyboard()
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal membatalkan order.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function ownerSendOtp(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Command ini hanya untuk owner."
    );
  }

  const parts = String(message.text || "").trim().split(/\s+/);

  if (parts.length < 3) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "Format:\n/otp A7K2 123456"
    );
  }

  const orderCode = parts[1].toUpperCase();
  const otp = parts[2];

  const order = await getOrderByCode(env, orderCode);

  if (!order) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Order ID " + orderCode + " tidak ditemukan."
    );
  }

  if (!order.customer_id) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Order ini belum memiliki customer."
    );
  }

  await saveOtp(env, order.id, otp);

  await sendOtpMessage(
    env,
    order.customer_id,
    order.phone_number,
    otp,
    order.order_id
  );

  return sendPermanentMessage(
    env,
    message.chat.id,
    "✅ OTP terkirim\n\n" +
      "ID: " +
      orderCode +
      "\n" +
      "Customer: " +
      order.customer_id +
      "\n" +
      "OTP: " +
      otp
  );
}

export async function ownerDeleteNokos2(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Command ini hanya untuk owner."
    );
  }

  const parts = String(message.text || "").trim().split(/\s+/);

  if (parts.length < 2) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "Format:\n/delnokos2 628xxxxxxxxxx\natau\n/delnokos2 ID_STOK"
    );
  }

  const target = parts[1];

  const byPhone = await env.DB.prepare(
    "SELECT * FROM nokos2_stock WHERE phone_number = ? OR id = ?"
  )
    .bind(String(target), String(target))
    .first();

  if (!byPhone) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Nomor/stok tidak ditemukan."
    );
  }

  await env.DB.prepare(
    "DELETE FROM nokos2_stock WHERE id = ?"
  )
    .bind(String(byPhone.id))
    .run();

  return sendPermanentMessage(
    env,
    message.chat.id,
    "✅ Stok NOKOS 2 dihapus\n\n" +
      "ID: " +
      byPhone.id +
      "\n" +
      "Nomor: " +
      (byPhone.phone_number || "-")
  );
}

export async function ownerAddNokos2(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Command ini hanya untuk owner."
    );
  }

  const parts = String(message.text || "").trim().split(/\s+/);

  if (parts.length < 3) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "Format:\n/addnokos2 Indonesia 628xxxxxxxxxx"
    );
  }

  const phone = parts[parts.length - 1];
  const country = parts.slice(1, -1).join(" ");

  if (!/^\+?\d{8,20}$/.test(phone)) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Format nomor tidak valid."
    );
  }

  await env.DB.prepare(
    `INSERT INTO nokos2_stock
    (country, country_code, phone_number, price, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'AVAILABLE', ?, ?)`
  )
    .bind(
      country,
      country.slice(0, 2).toUpperCase(),
      phone,
      NOKOS2_PRICE,
      now(),
      now()
    )
    .run();

  return sendPermanentMessage(
    env,
    message.chat.id,
    "✅ Stok NOKOS 2 ditambahkan\n\n" +
      "Negara: " +
      country +
      "\n" +
      "Nomor: " +
      phone +
      "\n" +
      "Harga: " +
      money(NOKOS2_PRICE)
  );
}

export async function handleNokos2Callback(env, data, context) {
  const { chatId, user } = context;
  const telegramId = user?.id;

  if (data === "nokos2") {
    return showNokos2Menu(env, chatId);
  }

  if (data.startsWith("n2c:")) {
    const country = data.slice(4);
    return showNokos2Country(env, chatId, country);
  }

  if (data.startsWith("n2buy:")) {
    const stockId = data.split(":")[1];
    return buyNokos2(env, chatId, telegramId, stockId);
  }

  if (data.startsWith("n2otp:")) {
    const orderCode = data.split(":")[1];
    return requestNokos2Otp(env, chatId, telegramId, orderCode);
  }

  if (data.startsWith("n2cancel:")) {
    const orderCode = data.split(":")[1];
    return cancelNokos2(env, chatId, telegramId, orderCode);
  }

  return null;
}