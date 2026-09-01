const MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "📱 NOKOS 1", callback_data: "nokos1" },
        { text: "📦 NOKOS 2", callback_data: "nokos2" }
      ],
      [
        { text: "💰 Saldo", callback_data: "balance" },
        { text: "💳 Deposit", callback_data: "deposit" }
      ],
      [
        { text: "📋 Pesanan Saya", callback_data: "orders" },
        { text: "👤 Akun", callback_data: "account" }
      ],
      [{ text: "🆘 Bantuan", callback_data: "help" }]
    ]
  }
};

const BACK = {
  reply_markup: {
    inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "main" }]]
  }
};

function json(data, status = 200) {
  return Response.json(data, { status });
}

function now() {
  return new Date().toISOString();
}

function money(value) {
  return "Rp" + Number(value || 0).toLocaleString("id-ID");
}

function esc(value) {
  return String(value ?? "-");
}

async function tg(env, method, data = {}) {
  const r = await fetch(
    "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }
  );
  return r.json();
}

async function send(env, chatId, text, extra = {}) {
  return tg(env, "sendMessage", { chat_id: chatId, text, ...extra });
}

async function deleteMessage(env, chatId, messageId) {
  if (!messageId) return;
  try {
    await tg(env, "deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
  } catch {}
}

async function editOrSend(env, chatId, messageId, text, extra = {}) {
  if (messageId) {
    const r = await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...extra
    });
    if (r && r.ok) return r;
  }
  return send(env, chatId, text, extra);
}

async function user(env, telegramId) {
  return env.DB.prepare(
    "SELECT * FROM users WHERE telegram_id = ?"
  ).bind(String(telegramId)).first();
}

async function register(env, from) {
  const id = String(from.id);
  const old = await user(env, id);

  if (old) {
    await env.DB.prepare(
      "UPDATE users SET username = ?, first_name = ? WHERE telegram_id = ?"
    ).bind(
      from.username || null,
      from.first_name || "",
      id
    ).run();
    return user(env, id);
  }

  await env.DB.prepare(
    "INSERT INTO users (telegram_id, username, first_name, balance, created_at) VALUES (?, ?, ?, 0, ?)"
  ).bind(
    id,
    from.username || null,
    from.first_name || "",
    now()
  ).run();

  return user(env, id);
}

async function setting(env, key) {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).bind(key).first();
  return row ? row.value : null;
}

async function saveSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, String(value)).run();
}

async function owner(env, telegramId) {
  return String(telegramId) === String(env.OWNER_ID);
}

async function sms(env, path, options = {}) {
  const r = await fetch(
    "https://api.smscode.gg/v2" + path,
    {
      ...options,
      headers: {
        Authorization: "Bearer " + env.SMSCODE_API_KEY,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const data = await r.json().catch(() => ({}));
  return { response: r, data };
}

async function main(env, chatId, oldMessageId = null) {
  const text =
    "🏪 VenDigitalStore\n\n" +
    "Selamat datang di VenDigitalStore!\n\n" +
    "Silakan pilih menu yang ingin kamu gunakan.";

  if (oldMessageId) {
    return editOrSend(env, chatId, oldMessageId, text, MENU);
  }
  return send(env, chatId, text, MENU);
}

async function balance(env, chatId, telegramId, messageId = null) {
  const u = await user(env, telegramId);
  const text =
    "💰 SALDO\n\n" +
    "Saldo kamu:\n" +
    money(u ? u.balance : 0);

  return editOrSend(env, chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Deposit", callback_data: "deposit" }],
        [{ text: "⬅️ Menu", callback_data: "main" }]
      ]
    }
  });
}

async function account(env, chatId, telegramId, messageId = null) {
  const u = await user(env, telegramId);

  const text =
    "👤 AKUN\n\n" +
    "Nama: " + esc(u?.first_name) + "\n" +
    "Username: " + (u?.username ? "@" + u.username : "-") + "\n" +
    "Telegram ID: " + esc(u?.telegram_id) + "\n" +
    "Saldo: " + money(u?.balance);

  return editOrSend(env, chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "💰 Saldo", callback_data: "balance" }],
        [{ text: "⬅️ Menu", callback_data: "main" }]
      ]
    }
  });
}

async function depositMenu(env, chatId, messageId = null) {
  const qris = await setting(env, "qris_file_id");

  if (!qris) {
    return editOrSend(
      env,
      chatId,
      messageId,
      "❌ QRIS belum tersedia.\n\nSilakan hubungi owner.",
      BACK
    );
  }

  const text =
    "💳 DEPOSIT\n\n" +
    "Masukkan nominal deposit dengan mengetik angka.\n\n" +
    "Contoh:\n10000\n\n" +
    "Minimal deposit: Rp1.000";

  return editOrSend(env, chatId, messageId, text, BACK);
}

async function createDeposit(env, telegramId, amount) {
  const r = await env.DB.prepare(
    "INSERT INTO deposits (telegram_id, amount, status, created_at) VALUES (?, ?, 'PENDING', ?)"
  ).bind(String(telegramId), amount, now()).run();

  return r.meta.last_row_id;
}

async function sendQris(env, chatId, depositId, amount) {
  const qris = await setting(env, "qris_file_id");

  if (!qris) {
    return send(env, chatId, "❌ QRIS belum disiapkan oleh owner.");
  }

  return tg(env, "sendPhoto", {
    chat_id: chatId,
    photo: qris,
    caption:
      "💳 DEPOSIT VenDigitalStore\n\n" +
      "ID Deposit: " + depositId + "\n" +
      "Nominal: " + money(amount) + "\n\n" +
      "Setelah kamu transfer, wajib ketik:\n" +
      "/cek\n\n" +
      "Kemudian kirim bukti transfer.\n\n" +
      "⚠️ Saldo belum masuk sebelum dikonfirmasi owner."
  });
}

async function notifyOwner(env, depositId, u, amount) {
  return send(
    env,
    env.OWNER_ID,
    "🔔 DEPOSIT BARU\n\n" +
      "ID: " + depositId + "\n" +
      "Nama: " + esc(u.first_name) + "\n" +
      "Username: " + (u.username ? "@" + u.username : "-") + "\n" +
      "Telegram ID: " + u.telegram_id + "\n" +
      "Nominal: " + money(amount) + "\n\n" +
      "Status: ⏳ PENDING\n\n" +
      "Menunggu bukti transfer."
  );
}

async function checkDeposit(env, message) {
  const chatId = message.chat.id;
  const u = await register(env, message.from);

  const r = await env.DB.prepare(
    "SELECT * FROM deposits WHERE telegram_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1"
  ).bind(u.telegram_id).all();

  if (!r.results.length) {
    return send(
      env,
      chatId,
      "❌ Tidak ada deposit pending.\n\nSilakan pilih 💳 Deposit terlebih dahulu.",
      BACK
    );
  }

  const d = r.results[0];

  if (d.proof_file_id) {
    return send(
      env,
      chatId,
      "⏳ Bukti transfer untuk deposit #" + d.id +
      " sudah diterima.\n\nSilakan tunggu konfirmasi owner.",
      BACK
    );
  }

  return send(
    env,
    chatId,
    "📎 KIRIM BUKTI TRANSFER\n\n" +
      "ID Deposit: " + d.id + "\n" +
      "Nominal: " + money(d.amount) +
      "\n\nSilakan kirim screenshot/foto bukti transfer di chat ini."
  );
}

async function proof(env, message) {
  const chatId = message.chat.id;
  const u = await register(env, message.from);

  const r = await env.DB.prepare(
    "SELECT * FROM deposits WHERE telegram_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1"
  ).bind(u.telegram_id).all();

  if (!r.results.length) {
    return send(
      env,
      chatId,
      "❌ Tidak ada deposit pending."
    );
  }

  const d = r.results[0];

  if (d.proof_file_id) {
    return send(
      env,
      chatId,
      "⏳ Bukti transfer deposit #" + d.id + " sudah dikirim sebelumnya."
    );
  }

  const photo = message.photo[message.photo.length - 1];

  await env.DB.prepare(
    "UPDATE deposits SET proof_file_id = ? WHERE id = ? AND status = 'PENDING'"
  ).bind(photo.file_id, d.id).run();

  await send(
    env,
    env.OWNER_ID,
    "📎 BUKTI TRANSFER MASUK\n\n" +
      "ID Deposit: " + d.id + "\n" +
      "Nama: " + esc(u.first_name) + "\n" +
      "Username: " + (u.username ? "@" + u.username : "-") + "\n" +
      "Telegram ID: " + u.telegram_id + "\n" +
      "Nominal: " + money(d.amount) +
      "\n\nPeriksa pembayaran lalu gunakan:\n/konfirmasi " + d.id
  );

  await tg(env, "sendPhoto", {
    chat_id: env.OWNER_ID,
    photo: photo.file_id,
    caption:
      "📎 Bukti transfer deposit #" + d.id +
      "\nNominal: " + money(d.amount)
  });

  return send(
    env,
    chatId,
    "✅ Bukti transfer berhasil diterima.\n\n" +
      "ID Deposit: " + d.id + "\n" +
      "Nominal: " + money(d.amount) +
      "\n\n⏳ Menunggu pemeriksaan owner."
  );
}

async function confirm(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return send(env, message.chat.id, "❌ Command ini hanya dapat digunakan owner.");
  }

  const parts = String(message.text || "").trim().split(/\s+/);
  if (!parts[1] || !/^\d+$/.test(parts[1])) {
    return send(env, message.chat.id, "Format:\n/konfirmasi ID");
  }

  const id = parts[1];

  const d = await env.DB.prepare(
    "SELECT * FROM deposits WHERE id = ?"
  ).bind(id).first();

  if (!d) return send(env, message.chat.id, "❌ Deposit #" + id + " tidak ditemukan.");

  if (d.status !== "PENDING") {
    return send(
      env,
      message.chat.id,
      "❌ Deposit #" + id + " sudah diproses.\nStatus: " + d.status
    );
  }

  if (!d.proof_file_id) {
    return send(env, message.chat.id, "⚠️ Deposit #" + id + " belum memiliki bukti transfer.");
  }

  const u = await user(env, d.telegram_id);
  if (!u) return send(env, message.chat.id, "❌ Customer tidak ditemukan.");

  const newBalance = Number(u.balance || 0) + Number(d.amount || 0);

  await env.DB.prepare(
    "UPDATE users SET balance = ? WHERE telegram_id = ?"
  ).bind(newBalance, u.telegram_id).run();

  await env.DB.prepare(
    "UPDATE deposits SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ? AND status = 'PENDING'"
  ).bind(now(), id).run();

  await env.DB.prepare(
    "INSERT INTO balance_transactions (telegram_id, type, amount, reference_id, description, created_at) VALUES (?, 'DEPOSIT', ?, ?, ?, ?)"
  ).bind(
    u.telegram_id,
    d.amount,
    id,
    "Deposit #" + id,
    now()
  ).run();

  await send(
    env,
    u.telegram_id,
    "✅ DEPOSIT BERHASIL\n\n" +
      "ID Deposit: " + id + "\n" +
      "Nominal: " + money(d.amount) +
      "\n\nSaldo kamu sekarang:\n" + money(newBalance)
  );

  return send(
    env,
    message.chat.id,
    "✅ Deposit #" + id + " berhasil dikonfirmasi.\n\n" +
      "Customer: " + u.telegram_id + "\n" +
      "Saldo ditambahkan: " + money(d.amount) + "\n" +
      "Saldo sekarang: " + money(newBalance)
  );
}

async function setQris(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return send(env, message.chat.id, "❌ Hanya owner yang dapat mengatur QRIS.");
  }

  await saveSetting(env, "qris_waiting", "1");

  return send(
    env,
    message.chat.id,
    "📷 Kirim gambar QRIS sekarang.\n\nBot akan menyimpannya sebagai QRIS pembayaran deposit."
  );
}

async function ownerPhoto(env, message) {
  if (!(await owner(env, message.chat.id))) return false;

  const waiting = await setting(env, "qris_waiting");
  if (waiting !== "1") return false;

  const photo = message.photo[message.photo.length - 1];

  await saveSetting(env, "qris_file_id", photo.file_id);
  await saveSetting(env, "qris_waiting", "0");

  await send(
    env,
    message.chat.id,
    "✅ QRIS berhasil disimpan.\n\nQRIS ini sekarang digunakan untuk Deposit customer."
  );

  return true;
}

async function setCommands(env) {
  return tg(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Buka menu utama" },
      { command: "cek", description: "Kirim bukti pembayaran deposit" },
      { command: "konfirmasi", description: "Konfirmasi deposit (owner)" },
      { command: "setqris", description: "Atur QRIS (owner)" },
      { command: "setharga", description: "Atur harga negara (owner)" },
      { command: "harga", description: "Lihat harga negara" },
      { command: "bantuan", description: "Tampilkan bantuan" }
    ]
  });
}

async function help(env, chatId, messageId = null) {
  const text =
    "🆘 BANTUAN\n\n" +
    "/start — Menu utama\n" +
    "/cek — Konfirmasi pembayaran deposit\n" +
    "/harga — Lihat harga NOKOS 1\n" +
    "/bantuan — Bantuan\n\n" +
    "💳 Deposit:\n" +
    "Pilih Deposit → masukkan nominal → transfer QRIS → /cek → kirim bukti transfer.\n\n" +
    "📱 NOKOS 1:\n" +
    "Order nomor virtual dari katalog SMSCode.\n\n" +
    "📦 NOKOS 2:\n" +
    "Untuk stok WhatsApp milik VenDigitalStore.\n\n" +
    "📞 Jika ada masalah, hubungi owner:\n" +
    "https://wa.me/6288707201970";

  return editOrSend(env, chatId, messageId, text, BACK);
}

async function getCountries(env) {
  const r = await sms(env, "/catalog/countries");
  if (!r.response.ok || !r.data.success) throw new Error(
    r.data?.error?.message || "Gagal mengambil negara SMSCode"
  );
  return Array.isArray(r.data.data) ? r.data.data.filter(x => x.active !== false) : [];
}

async function getServices(env, countryId) {
  const r = await sms(
    env,
    "/catalog/services?country_id=" + encodeURIComponent(countryId)
  );
  if (!r.response.ok || !r.data.success) throw new Error(
    r.data?.error?.message || "Gagal mengambil layanan"
  );
  return Array.isArray(r.data.data) ? r.data.data.filter(x => x.active !== false) : [];
}

async function getProducts(env, countryId, platformId) {
  const qs = new URLSearchParams({
    country_id: String(countryId),
    platform_id: String(platformId),
    limit: "10000",
    page: "1",
    sort: "price_asc"
  });

  const r = await sms(env, "/catalog/products?" + qs.toString());
  if (!r.response.ok || !r.data.success) throw new Error(
    r.data?.error?.message || "Gagal mengambil produk"
  );
  return Array.isArray(r.data.data) ? r.data.data.filter(x => x.active !== false && Number(x.available || 0) > 0) : [];
}

async function countryPrice(env, country) {
  const key = "price_" + String(country.id);
  const custom = await setting(env, key);
  if (custom !== null && custom !== "") return Number(custom);

  const name = String(country.name || "").toLowerCase();
  const code = String(country.code || "").toUpperCase();

  if (code === "ID" || name === "indonesia") return 3000;
  return 4000;
}

async function showCountries(env, chatId, messageId = null, page = 0) {
  const countries = await getCountries(env);
  const perPage = 12;
  const start = page * perPage;
  const items = countries.slice(start, start + perPage);

  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];

    const row = [{
      text: (a.emoji || "") + " " + a.name,
      callback_data: "n1c:" + a.id
    }];

    if (b) {
      row.push({
        text: (b.emoji || "") + " " + b.name,
        callback_data: "n1c:" + b.id
      });
    }
    rows.push(row);
  }

  const nav = [];
  if (page > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: "n1page:" + (page - 1) });
  if (start + perPage < countries.length) nav.push({ text: "Berikutnya ➡️", callback_data: "n1page:" + (page + 1) });
  if (nav.length) rows.push(nav);
  rows.push([{ text: "⬅️ Menu", callback_data: "main" }]);

  return editOrSend(
    env,
    chatId,
    messageId,
    "📱 NOKOS 1\n\nPilih negara:",
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function showServices(env, chatId, messageId, countryId) {
  const countries = await getCountries(env);
  const country = countries.find(x => String(x.id) === String(countryId));

  if (!country) return send(env, chatId, "❌ Negara tidak ditemukan.", BACK);

  const services = await getServices(env, countryId);

  if (!services.length) {
    return editOrSend(
      env,
      chatId,
      messageId,
      "❌ Tidak ada layanan aktif untuk " + country.name + ".",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Negara", callback_data: "n1page:0" }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );
  }

  const rows = [];
  for (let i = 0; i < services.length; i += 2) {
    const row = [{
      text: "📱 " + services[i].name,
      callback_data: "n1s:" + country.id + ":" + services[i].id
    }];
    if (services[i + 1]) {
      row.push({
        text: "📱 " + services[i + 1].name,
        callback_data: "n1s:" + country.id + ":" + services[i + 1].id
      });
    }
    rows.push(row);
  }

  rows.push([{ text: "⬅️ Negara", callback_data: "n1page:0" }]);

  return editOrSend(
    env,
    chatId,
    messageId,
    "📱 NOKOS 1\n\n" +
      country.emoji + " " + country.name +
      "\n\nPilih layanan/platform:",
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function showProducts(env, chatId, messageId, countryId, platformId) {
  const countries = await getCountries(env);
  const country = countries.find(x => String(x.id) === String(countryId));
  if (!country) return send(env, chatId, "❌ Negara tidak ditemukan.", BACK);

  const services = await getServices(env, countryId);
  const service = services.find(x => String(x.id) === String(platformId));
  if (!service) return send(env, chatId, "❌ Layanan tidak ditemukan.", BACK);

  const products = await getProducts(env, countryId, platformId);
  const price = await countryPrice(env, country);

  if (!products.length) {
    return editOrSend(
      env,
      chatId,
      messageId,
      "❌ Stok " + service.name + " untuk " + country.name + " sedang kosong.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅️ Layanan", callback_data: "n1c:" + country.id }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );
  }

  const rows = products.slice(0, 20).map(p => [{
    text: "📞 " + (p.name || service.name) + " • " + Number(p.available) + " stok",
    callback_data: "n1p:" + p.catalog_product_id
  }]);

  rows.push([{ text: "⬅️ Layanan", callback_data: "n1c:" + country.id }]);

  return editOrSend(
    env,
    chatId,
    messageId,
    "📱 NOKOS 1\n\n" +
      country.emoji + " " + country.name + "\n" +
      "Platform: " + service.name + "\n\n" +
      "Harga jual: " + money(price) + "\n\n" +
      "Pilih produk/tier yang tersedia:",
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function createSmsOrder(env, catalogProductId) {
  const key = "vds-" + crypto.randomUUID();

  const r = await sms(env, "/orders/create", {
    method: "POST",
    body: JSON.stringify({
      catalog_product_id: Number(catalogProductId),
      quantity: 1
    }),
    headers: {
      "Idempotency-Key": key
    }
  });

  if (!r.response.ok || !r.data.success) {
    throw new Error(r.data?.error?.message || "Gagal membuat order SMSCode");
  }

  return r.data.data?.orders?.[0] || null;
}

async function saveOrder(env, telegramId, smsOrder, sellPrice) {
  const columns = [
    "telegram_id",
    "sms_order_id",
    "phone_number",
    "amount",
    "sell_price",
    "status",
    "created_at",
    "expires_at"
  ];

  const values = [
    String(telegramId),
    smsOrder.id,
    smsOrder.phone_number || null,
    Number(smsOrder.amount?.canonical_amount || 0),
    Number(sellPrice),
    smsOrder.status || "ACTIVE",
    now(),
    smsOrder.expires_at || null
  ];

  const placeholders = values.map(() => "?").join(", ");

  try {
    await env.DB.prepare(
      "INSERT INTO orders (" + columns.join(",") + ") VALUES (" + placeholders + ")"
    ).bind(...values).run();
  } catch {
    await saveSetting(
      env,
      "last_sms_order_" + String(telegramId),
      JSON.stringify({
        id: smsOrder.id,
        phone_number: smsOrder.phone_number,
        sell_price: sellPrice,
        created_at: now(),
        expires_at: smsOrder.expires_at || null
      })
    );
  }
}

async function chargeCustomer(env, telegramId, amount) {
  const u = await user(env, telegramId);
  if (!u) throw new Error("Customer tidak ditemukan.");

  const balance = Number(u.balance || 0);
  if (balance < amount) {
    throw new Error(
      "Saldo tidak cukup. Saldo kamu " + money(balance) +
      ", harga " + money(amount) + "."
    );
  }

  const newBalance = balance - amount;

  await env.DB.prepare(
    "UPDATE users SET balance = ? WHERE telegram_id = ?"
  ).bind(newBalance, String(telegramId)).run();

  await env.DB.prepare(
    "INSERT INTO balance_transactions (telegram_id, type, amount, reference_id, description, created_at) VALUES (?, 'ORDER', ?, ?, ?, ?)"
  ).bind(
    String(telegramId),
    -amount,
    "",
    "Pembelian NOKOS 1",
    now()
  ).run();

  return newBalance;
}

async function refundCustomer(env, telegramId, amount, referenceId, description) {
  const u = await user(env, telegramId);
  if (!u) return;

  const newBalance = Number(u.balance || 0) + Number(amount || 0);

  await env.DB.prepare(
    "UPDATE users SET balance = ? WHERE telegram_id = ?"
  ).bind(newBalance, String(telegramId)).run();

  await env.DB.prepare(
    "INSERT INTO balance_transactions (telegram_id, type, amount, reference_id, description, created_at) VALUES (?, 'REFUND', ?, ?, ?, ?)"
  ).bind(
    String(telegramId),
    Number(amount || 0),
    String(referenceId || ""),
    description || "Refund",
    now()
  ).run();
}

async function buyNokos1(env, chatId, telegramId, catalogProductId) {
  const countries = await getCountries(env);
  const services = [];
  let product = null;
  let country = null;

  for (const c of countries) {
    const svcs = await getServices(env, c.id);
    for (const s of svcs) {
      const products = await getProducts(env, c.id, s.id);
      const found = products.find(
        p => String(p.catalog_product_id) === String(catalogProductId)
      );
      if (found) {
        product = found;
        country = c;
        services.push(s);
        break;
      }
    }
    if (product) break;
  }

  if (!product || !country) {
    return send(env, chatId, "❌ Produk sudah tidak tersedia. Silakan pilih ulang.");
  }

  const sellPrice = await countryPrice(env, country);
  const u = await user(env, telegramId);

  if (Number(u?.balance || 0) < sellPrice) {
    return send(
      env,
      chatId,
      "❌ Saldo tidak cukup.\n\n" +
        "Harga: " + money(sellPrice) + "\n" +
        "Saldo: " + money(u?.balance) + "\n\n" +
        "Silakan deposit terlebih dahulu.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Deposit", callback_data: "deposit" }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );
  }

  let smsOrder;

  try {
    smsOrder = await createSmsOrder(env, catalogProductId);
  } catch (e) {
    return send(
      env,
      chatId,
      "❌ Order gagal dibuat.\n\n" + e.message,
      BACK
    );
  }

  if (!smsOrder || !smsOrder.id) {
    return send(env, chatId, "❌ SMSCode tidak mengembalikan order yang valid.", BACK);
  }

  try {
    const newBalance = await chargeCustomer(env, telegramId, sellPrice);

    await saveOrder(env, telegramId, smsOrder, sellPrice);

    return send(
      env,
      chatId,
      "✅ ORDER NOKOS 1 BERHASIL\n\n" +
        "Order ID: " + smsOrder.id + "\n" +
        "Negara: " + country.emoji + " " + country.name + "\n" +
        "Platform: " + services[0]?.name + "\n" +
        "Nomor: " + (smsOrder.phone_number || "-") + "\n" +
        "Harga: " + money(sellPrice) + "\n" +
        "Saldo: " + money(newBalance) +
        "\n\n⏳ Menunggu OTP...\n\n" +
        "Bot akan memeriksa status OTP secara berkala.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Cek OTP", callback_data: "otp:" + smsOrder.id }],
            [{ text: "❌ Batalkan", callback_data: "cancel:" + smsOrder.id }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );
  } catch (e) {
    try {
      await sms(env, "/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ id: smsOrder.id })
      });
    } catch {}

    return send(
      env,
      chatId,
      "❌ Order dibuat tetapi pembayaran lokal gagal diproses.\n\n" +
        "Order SMSCode: " + smsOrder.id,
      BACK
    );
  }
}

async function getSmsOrder(env, id) {
  const r = await sms(env, "/orders/" + encodeURIComponent(id));
  if (!r.response.ok || !r.data.success) {
    throw new Error(r.data?.error?.message || "Gagal mengambil order");
  }
  return r.data.data;
}

async function otpStatus(env, chatId, telegramId, id, messageId = null) {
  const d = await getSmsOrder(env, id);

  const local = await setting(env, "order_owner_" + id);
  const ownerId = local ? JSON.parse(local).telegram_id : null;

  if (ownerId && String(ownerId) !== String(telegramId)) {
    return send(env, chatId, "❌ Order bukan milik kamu.");
  }

  if (d.status === "OTP_RECEIVED" && d.otp_code) {
    return editOrSend(
      env,
      chatId,
      messageId,
      "🔐 OTP DITERIMA\n\n" +
        "Order ID: " + d.id + "\n" +
        "Nomor: " + (d.phone_number || "-") + "\n" +
        "OTP: " + d.otp_code + "\n\n" +
        "Gunakan OTP pada aplikasi tujuan.\n" +
        "Setelah selesai, order dapat diselesaikan.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Selesai", callback_data: "finish:" + d.id }],
            [{ text: "🔄 Refresh", callback_data: "otp:" + d.id }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );
  }

  if (d.status === "COMPLETED") {
    return editOrSend(
      env,
      chatId,
      messageId,
      "✅ ORDER SELESAI\n\nOrder ID: " + d.id,
      BACK
    );
  }

  if (d.status === "CANCELED" || d.status === "EXPIRED") {
    return editOrSend(
      env,
      chatId,
      messageId,
      "❌ ORDER BERAKHIR\n\n" +
        "Order ID: " + d.id + "\n" +
        "Status: " + d.status,
      BACK
    );
  }

  return editOrSend(
    env,
    chatId,
    messageId,
    "⏳ OTP BELUM MASUK\n\n" +
      "Order ID: " + d.id + "\n" +
      "Nomor: " + (d.phone_number || "-") + "\n\n" +
      "Status: " + d.status + "\n" +
      "Expired: " + (d.expires_at || "-"),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Cek OTP", callback_data: "otp:" + d.id }],
          [{ text: "❌ Batalkan", callback_data: "cancel:" + d.id }],
          [{ text: "⬅️ Menu", callback_data: "main" }]
        ]
      }
    }
  );
}

async function cancelOrder(env, chatId, telegramId, id) {
  const meta = await setting(env, "order_owner_" + id);

  if (meta) {
    const parsed = JSON.parse(meta);
    if (String(parsed.telegram_id) !== String(telegramId)) {
      return send(env, chatId, "❌ Order bukan milik kamu.");
    }
  }

  let d;
  try {
    d = await getSmsOrder(env, id);
  } catch (e) {
    return send(env, chatId, "❌ " + e.message, BACK);
  }

  if (!["ACTIVE", "OTP_RECEIVED"].includes(String(d.status))) {
    return send(
      env,
      chatId,
      "❌ Order tidak dapat dibatalkan.\nStatus: " + d.status,
      BACK
    );
  }

  const r = await sms(env, "/orders/cancel", {
    method: "POST",
    body: JSON.stringify({ id: Number(id) })
  });

  if (!r.response.ok || !r.data.success) {
    return send(
      env,
      chatId,
      "❌ Gagal membatalkan order.\n\n" +
        (r.data?.error?.message || "Unknown error"),
      BACK
    );
  }

  const refund = Number(meta ? JSON.parse(meta).sell_price : 0);

  if (refund > 0) {
    await refundCustomer(
      env,
      telegramId,
      refund,
      id,
      "Refund NOKOS 1 #" + id
    );
  }

  return send(
    env,
    chatId,
    "✅ ORDER DIBATALKAN\n\n" +
      "Order ID: " + id + "\n" +
      "Refund: " + money(refund) +
      "\n\nSaldo sudah dikembalikan.",
    BACK
  );
}

async function finishOrder(env, chatId, telegramId, id) {
  const meta = await setting(env, "order_owner_" + id);
  if (meta) {
    const parsed = JSON.parse(meta);
    if (String(parsed.telegram_id) !== String(telegramId)) {
      return send(env, chatId, "❌ Order bukan milik kamu.");
    }
  }

  const r = await sms(env, "/orders/finish", {
    method: "POST",
    body: JSON.stringify({ id: Number(id) })
  });

  if (!r.response.ok || !r.data.success) {
    return send(
      env,
      chatId,
      "❌ Gagal menyelesaikan order.\n\n" +
        (r.data?.error?.message || "Unknown error"),
      BACK
    );
  }

  return send(
    env,
    chatId,
    "✅ ORDER SELESAI\n\nOrder ID: " + id + "\nNomor telah dilepas.",
    BACK
  );
}

async function orders(env, chatId, telegramId, messageId = null) {
  try {
    const r = await env.DB.prepare(
      "SELECT * FROM orders WHERE telegram_id = ? ORDER BY id DESC LIMIT 10"
    ).bind(String(telegramId)).all();

    if (!r.results.length) {
      return editOrSend(env, chatId, messageId, "📋 PESANAN SAYA\n\nBelum ada pesanan.", BACK);
    }

    let text = "📋 PESANAN SAYA\n\n";
    for (const o of r.results) {
      text +=
        "ID: " + esc(o.sms_order_id || o.id) + "\n" +
        "Nomor: " + esc(o.phone_number) + "\n" +
        "Harga: " + money(o.sell_price) + "\n" +
        "Status: " + esc(o.status) + "\n\n";
    }

    return editOrSend(env, chatId, messageId, text, BACK);
  } catch {
    return editOrSend(
      env,
      chatId,
      messageId,
      "📋 PESANAN SAYA\n\nBelum ada pesanan yang tersimpan.",
      BACK
    );
  }
}

async function showPrices(env, chatId, messageId = null) {
  const countries = await getCountries(env);
  const rows = [];

  for (const c of countries.slice(0, 40)) {
    const p = await countryPrice(env, c);
    rows.push([
      {
        text: (c.emoji || "") + " " + c.name + " • " + money(p),
        callback_data: "price:" + c.id
      }
    ]);
  }

  rows.push([{ text: "⬅️ Menu", callback_data: "main" }]);

  return editOrSend(
    env,
    chatId,
    messageId,
    "💰 HARGA NOKOS 1\n\n" +
      "Indonesia default: Rp3.000\n" +
      "Negara lain default: Rp4.000\n\n" +
      "Harga custom owner akan menggantikan harga default.",
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function setPrice(env, message) {
  if (!(await owner(env, message.chat.id))) {
    return send(env, message.chat.id, "❌ Command ini hanya untuk owner.");
  }

  const parts = String(message.text || "").trim().split(/\s+/);

  if (parts.length < 3) {
    return send(
      env,
      message.chat.id,
      "Format:\n/setharga Vietnam 5000\n\n" +
      "Harga harus berupa angka rupiah."
    );
  }

  const inputPrice = parts.pop();
  const countryName = parts.slice(1).join(" ");
  const price = Number(inputPrice.replace(/\./g, ""));

  if (!Number.isFinite(price) || price < 0) {
    return send(env, message.chat.id, "❌ Harga tidak valid.");
  }

  const countries = await getCountries(env);
  const country = countries.find(
    c => String(c.name).toLowerCase() === countryName.toLowerCase() ||
         String(c.code).toLowerCase() === countryName.toLowerCase()
  );

  if (!country) {
    return send(
      env,
      message.chat.id,
      "❌ Negara tidak ditemukan di katalog SMSCode.\n\n" +
      "Gunakan nama negara persis seperti katalog."
    );
  }

  await saveSetting(env, "price_" + country.id, price);

  return send(
    env,
    message.chat.id,
    "✅ Harga berhasil diubah.\n\n" +
      country.emoji + " " + country.name + "\n" +
      "Harga jual: " + money(price)
  );
}

async function showPriceOne(env, chatId, countryId, messageId = null) {
  const countries = await getCountries(env);
  const country = countries.find(c => String(c.id) === String(countryId));

  if (!country) return send(env, chatId, "❌ Negara tidak ditemukan.", BACK);

  const p = await countryPrice(env, country);

  return editOrSend(
    env,
    chatId,
    messageId,
    "💰 HARGA\n\n" +
      country.emoji + " " + country.name + "\n" +
      "Harga jual: " + money(p),
    BACK
  );
}

async function adminHelp(env, chatId) {
  if (!(await owner(env, chatId))) {
    return send(env, chatId, "❌ Hanya owner.", BACK);
  }

  return send(
    env,
    chatId,
    "👑 PANEL OWNER\n\n" +
      "/setharga Vietnam 5000\n" +
      "Atur harga negara.\n\n" +
      "/harga\n" +
      "Lihat harga NOKOS 1.\n\n" +
      "/setqris\n" +
      "Ganti QRIS pembayaran.\n\n" +
      "/konfirmasi ID\n" +
      "Konfirmasi deposit customer.",
    BACK
  );
}

async function messageHandler(env, message) {
  if (!message?.chat || !message?.from) return;

  if (message.photo) {
    if (await ownerPhoto(env, message)) return;
    await proof(env, message);
    return;
  }

  if (!message.text) return;

  const text = message.text.trim();

  if (text === "/start") {
    await register(env, message.from);
    await main(env, message.chat.id);
    return;
  }

  if (text === "/cek") {
    await checkDeposit(env, message);
    return;
  }

  if (text === "/setqris") {
    await setQris(env, message);
    return;
  }

  if (text.startsWith("/konfirmasi")) {
    await confirm(env, message);
    return;
  }

  if (text.startsWith("/setharga")) {
    await setPrice(env, message);
    return;
  }

  if (text === "/harga") {
    await showPrices(env, message.chat.id);
    return;
  }

  if (text === "/bantuan" || text === "/help") {
    await help(env, message.chat.id);
    return;
  }

  if (text === "/admin") {
    await adminHelp(env, message.chat.id);
    return;
  }

  if (/^\d+$/.test(text)) {
    const amount = Number(text);

    if (amount < 1000) {
      await send(env, message.chat.id, "❌ Minimal deposit adalah Rp1.000.");
      return;
    }

    if (amount > 100000000) {
      await send(env, message.chat.id, "❌ Nominal terlalu besar.");
      return;
    }

    const u = await register(env, message.from);
    const depositId = await createDeposit(env, u.telegram_id, amount);

    await sendQris(env, message.chat.id, depositId, amount);
    await notifyOwner(env, depositId, u, amount);
    return;
  }

  await send(env, message.chat.id, "Gunakan /start untuk membuka menu.");
}

async function callbackHandler(env, callback) {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  const telegramId = callback.from.id;
  const messageId = callback.message.message_id;

  await tg(env, "answerCallbackQuery", {
    callback_query_id: callback.id
  });

  await register(env, callback.from);

  try {
    if (data === "main") {
      await main(env, chatId, messageId);
      return;
    }

    if (data === "balance") {
      await balance(env, chatId, telegramId, messageId);
      return;
    }

    if (data === "account") {
      await account(env, chatId, telegramId, messageId);
      return;
    }

    if (data === "deposit") {
      await depositMenu(env, chatId, messageId);
      return;
    }

    if (data === "help") {
      await help(env, chatId, messageId);
      return;
    }

    if (data === "orders") {
      await orders(env, chatId, telegramId, messageId);
      return;
    }

    if (data === "nokos1") {
      await showCountries(env, chatId, messageId, 0);
      return;
    }

    if (data === "nokos2") {
      await editOrSend(
        env,
        chatId,
        messageId,
        "📦 NOKOS 2\n\n" +
          "Khusus stok nomor WhatsApp milik VenDigitalStore.\n\n" +
          "Modul stok WhatsApp akan disambungkan setelah NOKOS 1 selesai.",
        BACK
      );
      return;
    }

    if (data.startsWith("n1page:")) {
      const page = Number(data.split(":")[1] || 0);
      await showCountries(env, chatId, messageId, page);
      return;
    }

    if (data.startsWith("n1c:")) {
      const countryId = data.split(":")[1];
      await showServices(env, chatId, messageId, countryId);
      return;
    }

    if (data.startsWith("n1s:")) {
      const [, countryId, platformId] = data.split(":");
      await showProducts(env, chatId, messageId, countryId, platformId);
      return;
    }

    if (data.startsWith("n1p:")) {
      const productId = data.split(":")[1];
      await editOrSend(
        env,
        chatId,
        messageId,
        "⏳ Membuat order NOKOS 1...\n\nMohon tunggu.",
        {
          reply_markup: {
            inline_keyboard: [[{ text: "⏳ Memproses...", callback_data: "noop" }]]
          }
        }
      );

      try {
        const smsOrder = await createSmsOrder(env, productId);
        const countries = await getCountries(env);

        let country = null;
        let service = null;

        for (const c of countries) {
          const svcs = await getServices(env, c.id);
          for (const s of svcs) {
            const ps = await getProducts(env, c.id, s.id);
            if (ps.some(p => String(p.catalog_product_id) === String(productId))) {
              country = c;
              service = s;
              break;
            }
          }
          if (country) break;
        }

        if (!country) throw new Error("Negara produk tidak ditemukan.");

        const sellPrice = await countryPrice(env, country);
        const u = await user(env, telegramId);

        if (Number(u?.balance || 0) < sellPrice) {
          try {
            await sms(env, "/orders/cancel", {
              method: "POST",
              body: JSON.stringify({ id: Number(smsOrder.id) })
            });
          } catch {}

          await editOrSend(
            env,
            chatId,
            messageId,
            "❌ Saldo tidak cukup.\n\n" +
              "Harga: " + money(sellPrice) + "\n" +
              "Saldo: " + money(u?.balance) +
              "\n\nSilakan deposit terlebih dahulu.",
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "💳 Deposit", callback_data: "deposit" }],
                  [{ text: "⬅️ Menu", callback_data: "main" }]
                ]
              }
            }
          );
          return;
        }

        const newBalance = await chargeCustomer(env, telegramId, sellPrice);

        await saveOrder(env, telegramId, smsOrder, sellPrice);

        await saveSetting(
          env,
          "order_owner_" + smsOrder.id,
          JSON.stringify({
            telegram_id: telegramId,
            sell_price: sellPrice
          })
        );

        await editOrSend(
          env,
          chatId,
          messageId,
          "✅ ORDER NOKOS 1 BERHASIL\n\n" +
            "Order ID: " + smsOrder.id + "\n" +
            "Negara: " + country.emoji + " " + country.name + "\n" +
            "Platform: " + (service?.name || "-") + "\n" +
            "Nomor: " + (smsOrder.phone_number || "-") + "\n" +
            "Harga: " + money(sellPrice) + "\n" +
            "Saldo: " + money(newBalance) +
            "\n\n⏳ Menunggu OTP...",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔄 Cek OTP", callback_data: "otp:" + smsOrder.id }],
                [{ text: "❌ Batalkan", callback_data: "cancel:" + smsOrder.id }],
                [{ text: "⬅️ Menu", callback_data: "main" }]
              ]
            }
          }
        );
      } catch (e) {
        await editOrSend(
          env,
          chatId,
          messageId,
          "❌ Order gagal.\n\n" + e.message,
          BACK
        );
      }
      return;
    }

    if (data.startsWith("otp:")) {
      await otpStatus(env, chatId, telegramId, data.split(":")[1], messageId);
      return;
    }

    if (data.startsWith("cancel:")) {
      await cancelOrder(env, chatId, telegramId, data.split(":")[1]);
      return;
    }

    if (data.startsWith("finish:")) {
      await finishOrder(env, chatId, telegramId, data.split(":")[1]);
      return;
    }

    if (data.startsWith("price:")) {
      await showPriceOne(env, chatId, data.split(":")[1], messageId);
      return;
    }

    if (data === "noop") return;
  } catch (e) {
    await send(env, chatId, "❌ Terjadi kesalahan:\n" + e.message, BACK);
  }
}

async function scheduledHandler(env) {
  try {
    const r = await sms(env, "/orders/active");

    if (!r.response.ok || !r.data.success) return;

    const active = Array.isArray(r.data.data) ? r.data.data : [];

    for (const order of active) {
      const metaRaw = await setting(env, "order_owner_" + order.id);
      if (!metaRaw) continue;

      const meta = JSON.parse(metaRaw);

      if (order.status === "OTP_RECEIVED" && order.otp_code) {
        const last = await setting(env, "otp_notified_" + order.id);
        if (last === String(order.otp_code)) continue;

        await saveSetting(env, "otp_notified_" + order.id, String(order.otp_code));

        await send(
          env,
          meta.telegram_id,
          "🔐 OTP MASUK\n\n" +
            "Order ID: " + order.id + "\n" +
            "OTP: " + order.otp_code +
            "\n\nNomor: " + (order.phone_number || "-")
        );
      }

      if (
        order.expires_at &&
        new Date(order.expires_at).getTime() <= Date.now() &&
        order.status === "ACTIVE"
      ) {
        const refund = Number(meta.sell_price || 0);

        try {
          await sms(env, "/orders/cancel", {
            method: "POST",
            body: JSON.stringify({ id: Number(order.id) })
          });
        } catch {}

        if (refund > 0) {
          await refundCustomer(
            env,
            meta.telegram_id,
            refund,
            order.id,
            "Refund order expired #" + order.id
          );

          await send(
            env,
            meta.telegram_id,
            "⏰ ORDER EXPIRED\n\n" +
              "Order ID: " + order.id + "\n" +
              "Refund: " + money(refund) +
              "\n\nSaldo telah dikembalikan."
          );
        }
      }
    }
  } catch {}
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduledHandler(env));
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(
          "VenDigitalStore Telegram Bot is online.",
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain;charset=UTF-8"
            }
          }
        );
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        return json({
          success: true,
          service: "VenDigitalStore",
          telegram: "online",
          database: "D1",
          smscode: "configured"
        });
      }

      if (request.method === "POST" && url.pathname === "/telegram/webhook") {
        const update = await request.json();

        if (update.callback_query) {
          await callbackHandler(env, update.callback_query);
        }

        if (update.message) {
          await messageHandler(env, update.message);
        }

        return json({ success: true });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return json(
        {
          success: false,
          error: error.message
        },
        500
      );
    }
  }
};
