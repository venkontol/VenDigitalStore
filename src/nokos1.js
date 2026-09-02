const { json, money, now, dbUser, register, setting, saveSetting, api, send, replace, back } = require("./utils.js");

async function getCountries(env) {
  const result = await api(env, "/catalog/countries");
  return result.data || [];
}

async function getServices(env, countryId) {
  const result = await api(env, "/catalog/services?country_id=" + encodeURIComponent(countryId));
  return result.data || [];
}

async function getProducts(env, countryId, serviceId) {
  const params = new URLSearchParams({
    country_id: String(countryId),
    platform_id: String(serviceId),
    limit: "100",
    page: "1",
    sort: "price_asc"
  });
  const result = await api(env, "/catalog/products?" + params.toString());
  return result.data || [];
}

function countryPriceKey(code) {
  return "price_" + String(code || "").toUpperCase();
}

async function getGlobalPrice(env) {
  return Number(await setting(env, "price_default") || 4000);
}

async function getCountryPrice(env, country) {
  const code = String(country?.code || "").toUpperCase();
  if (code === "ID") return Number(await setting(env, "price_ID") || 3000);
  return Number(await setting(env, countryPriceKey(code)) || await getGlobalPrice(env));
}

function productProviderPrice(product) {
  const values = [
    product?.price,
    product?.amount,
    product?.price_usd,
    product?.cost,
    product?.provider_price
  ];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function availableProducts(products) {
  return products
    .filter(p => p && p.active !== false && Number(p.available || 0) > 0)
    .sort((a, b) => productProviderPrice(a) - productProviderPrice(b));
}

function productLabel(product, index, sellPrice) {
  const hot = index === 0 ? "🔥 HOT " : "";
  const operator = product.operator_name || product.name || "Nomor";
  const stock = Number(product.available || 0);
  return hot + "🛒 " + operator + " • Stok " + stock + " • " + money(sellPrice);
}

async function showCountries(env, chatId, oldId = null) {
  try {
    const countries = await getCountries(env);
    const rows = countries
      .filter(c => c && c.id != null)
      .map(c => [{ text: (c.emoji || "🌍") + " " + c.name, callback_data: "n1c:" + c.id }]);
    rows.push([{ text: "⬅️ Menu", callback_data: "main" }]);
    return replace(
      env,
      chatId,
      oldId,
      "🌍 NOKOS 1\n\nPilih negara:",
      { reply_markup: { inline_keyboard: rows } }
    );
  } catch (error) {
    return replace(env, chatId, oldId, "❌ Gagal mengambil daftar negara.\n\n" + error.message, back());
  }
}

async function showServices(env, chatId, countryId, oldId = null) {
  try {
    const countries = await getCountries(env);
    const country = countries.find(c => Number(c.id) === Number(countryId));
    if (!country) return replace(env, chatId, oldId, "❌ Negara tidak ditemukan.", back());

    const services = await getServices(env, countryId);
    if (!services.length) {
      return replace(env, chatId, oldId, "❌ Tidak ada service aktif untuk negara ini.", {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Negara", callback_data: "nokos1" }]]
        }
      });
    }

    const rows = services
      .filter(s => s && s.id != null)
      .map(s => [{ text: "📲 " + s.name, callback_data: "n1s:" + countryId + ":" + s.id }]);

    rows.push([{ text: "⬅️ Negara", callback_data: "nokos1" }]);

    return replace(
      env,
      chatId,
      oldId,
      (country.emoji || "🌍") + " " + country.name + "\n\nPilih service:",
      { reply_markup: { inline_keyboard: rows } }
    );
  } catch (error) {
    return replace(env, chatId, oldId, "❌ Gagal mengambil service.\n\n" + error.message, back());
  }
}

async function showProducts(env, chatId, countryId, serviceId, oldId = null) {
  try {
    const countries = await getCountries(env);
    const country = countries.find(c => Number(c.id) === Number(countryId));
    if (!country) return replace(env, chatId, oldId, "❌ Negara tidak ditemukan.", back());

    const services = await getServices(env, countryId);
    const service = services.find(s => Number(s.id) === Number(serviceId));
    if (!service) return replace(env, chatId, oldId, "❌ Service tidak ditemukan.", back());

    const products = availableProducts(await getProducts(env, countryId, serviceId));
    if (!products.length) {
      return replace(env, chatId, oldId, "❌ Stok habis untuk service ini.", {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ Service", callback_data: "n1c:" + countryId }]]
        }
      });
    }

    const sellPrice = await getCountryPrice(env, country);
    const rows = products.slice(0, 50).map((product, index) => [
      {
        text: productLabel(product, index, sellPrice),
        callback_data: "n1p:" + countryId + ":" + serviceId + ":" + product.id
      }
    ]);

    rows.push([{ text: "⬅️ Service", callback_data: "n1c:" + countryId }]);

    return replace(
      env,
      chatId,
      oldId,
      (country.emoji || "🌍") + " " + country.name +
      "\n📱 " + service.name +
      "\n\n💰 Harga jual: " + money(sellPrice) +
      "\n📊 Urutan: termurah → termahal" +
      "\n🔥 HOT = provider termurah\n\nPilih stok/operator:",
      { reply_markup: { inline_keyboard: rows } }
    );
  } catch (error) {
    return replace(env, chatId, oldId, "❌ Gagal mengambil stok.\n\n" + error.message, back());
  }
}

async function createOrder(env, telegramId, countryId, serviceId, productId) {
  const user = await dbUser(env, telegramId);
  if (!user) throw new Error("Akun tidak ditemukan.");

  const countries = await getCountries(env);
  const country = countries.find(c => Number(c.id) === Number(countryId));
  const services = await getServices(env, countryId);
  const service = services.find(s => Number(s.id) === Number(serviceId));
  const products = await getProducts(env, countryId, serviceId);
  const product = products.find(p => Number(p.id) === Number(productId));

  if (!country || !service || !product) throw new Error("Produk tidak ditemukan.");
  if (product.active === false || Number(product.available || 0) < 1) throw new Error("Stok tidak tersedia.");

  const sellPrice = await getCountryPrice(env, country);
  const providerPrice = productProviderPrice(product);

  if (String(country.code).toUpperCase() === "ID" && providerPrice > sellPrice) {
    throw new Error(
      "Nomor Indonesia ini dibatalkan karena harga provider " +
      money(providerPrice) +
      " lebih tinggi dari harga jual " +
      money(sellPrice) +
      "."
    );
  }

  if (Number(user.balance) < sellPrice) {
    throw new Error("Saldo tidak cukup. Harga " + money(sellPrice) + ".");
  }

  const exchange = await api(env, "/catalog/exchange-rate");
  const rate = Number(exchange.data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Exchange rate provider tidak valid.");

  const maxUsd = (sellPrice / rate).toFixed(4);
  const idempotencyKey = "tg_" + telegramId + "_" + Date.now() + "_" + crypto.randomUUID();

  const response = await api(env, "/orders/create", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      catalog_product_id: Number(product.catalog_product_id || product.id),
      max_price: maxUsd,
      quantity: 1
    })
  });

  const order = response.data?.orders?.[0];
  if (!order) throw new Error("SMSCode tidak mengembalikan order.");

  const deducted = await env.DB.prepare(
    "UPDATE users SET balance=balance-? WHERE telegram_id=? AND balance>=?"
  ).bind(sellPrice, String(telegramId), sellPrice).run();

  if (!deducted.meta?.changes) {
    try {
      await api(env, "/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ id: Number(order.id) })
      });
    } catch (_) {}
    throw new Error("Saldo berubah. Order dibatalkan.");
  }

  const created = now();
  await env.DB.prepare(
    `INSERT INTO nokos_orders(
      telegram_id,
      smscode_order_id,
      country_id,
      country_code,
      country_name,
      service_id,
      service_code,
      service_name,
      operator_id,
      operator_name,
      product_id,
      catalog_product_id,
      phone_number,
      otp_code,
      sell_price,
      provider_price,
      status,
      created_at,
      updated_at,
      expires_at,
      idempotency_key
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    String(telegramId),
    String(order.id),
    country.id,
    country.code || null,
    country.name || null,
    service.id,
    service.code || null,
    service.name || null,
    product.operator_id || null,
    product.operator_name || null,
    product.id,
    product.catalog_product_id || null,
    order.phone_number || null,
    null,
    sellPrice,
    providerPrice,
    order.status || "ACTIVE",
    created,
    created,
    order.expires_at || null,
    idempotencyKey
  ).run();

  return {
    user,
    country,
    service,
    product,
    order,
    sellPrice,
    providerPrice
  };
}

async function buyProduct(env, chatId, telegramId, countryId, serviceId, productId) {
  try {
    const result = await createOrder(env, telegramId, countryId, serviceId, productId);
    const order = result.order;
    const phone = order.phone_number || "-";

    await send(
      env,
      chatId,
      "✅ ORDER NOKOS 1 BERHASIL\n\n" +
      "ID: #" + order.id +
      "\nNegara: " + result.country.name +
      "\nService: " + result.service.name +
      "\nNomor: " + phone +
      "\nHarga: " + money(result.sellPrice) +
      "\n\n⏳ Menunggu OTP.\n" +
      "Jika OTP tidak diterima sampai waktu habis, order akan dibatalkan dan saldo dikembalikan.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Pesanan Saya", callback_data: "orders" }],
            [{ text: "⬅️ Menu", callback_data: "main" }]
          ]
        }
      }
    );

    await send(
      env,
      env.OWNER_ID,
      "📱 NOKOS 1 ORDER\n\n" +
      "Order: #" + order.id +
      "\nCustomer: " + telegramId +
      "\nNegara: " + result.country.name +
      "\nService: " + result.service.name +
      "\nNomor: " + phone +
      "\nHarga jual: " + money(result.sellPrice) +
      "\nProvider: " + money(result.providerPrice) +
      "\nStatus: " + (order.status || "ACTIVE")
    );
  } catch (error) {
    await send(env, chatId, "❌ Order gagal.\n\n" + error.message, back());
  }
}

async function handleNokos1Callback(env, callback) {
  const data = String(callback.data || "");
  const chatId = callback.message.chat.id;
  const oldId = callback.message.message_id;
  const parts = data.split(":");

  if (data === "nokos1") return showCountries(env, chatId, oldId);
  if (parts[0] === "n1c" && parts.length === 2) {
    return showServices(env, chatId, Number(parts[1]), oldId);
  }
  if (parts[0] === "n1s" && parts.length === 3) {
    return showProducts(env, chatId, Number(parts[1]), Number(parts[2]), oldId);
  }
  if (parts[0] === "n1p" && parts.length === 4) {
    return buyProduct(env, chatId, callback.from.id, Number(parts[1]), Number(parts[2]), Number(parts[3]));
  }

  return false;
}

module.exports = {
  getCountries,
  getServices,
  getProducts,
  getCountryPrice,
  showCountries,
  showServices,
  showProducts,
  createOrder,
  buyProduct,
  handleNokos1Callback
};
