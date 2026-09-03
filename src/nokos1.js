import {
  money,
  now,
  number,
  user,
  setting,
  saveSetting,
  sms,
  assertSmsSuccess,
  chargeCustomer,
  refundCustomer,
  backKeyboard,
  inlineKeyboard,
  callbackButton,
  randomId
} from "./utils.js";

import {
  replaceTrackedBotMessage,
  sendPermanentMessage,
  sendNumberMessage,
  sendOtpMessage,
  notifyOwner
} from "./telegram.js";

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isWhatsAppService(service) {
  const values = [
    service?.name,
    service?.code,
    service?.slug,
    service?.key,
    service?.service
  ].map(normalize);

  return values.some(
    (value) =>
      value === "whatsapp" ||
      value === "wa" ||
      value.includes("whatsapp")
  );
}

function providerPrice(product) {
  const values = [
    product?.price,
    product?.amount,
    product?.provider_price,
    product?.cost,
    product?.canonical_amount,
    product?.amount?.canonical_amount
  ];

  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return 0;
}

function available(product) {
  if (!product) return false;
  if (product.active === false) return false;
  return Number(product.available || 0) > 0;
}

function productId(product) {
  return product?.catalog_product_id ?? product?.id;
}

function serviceId(service) {
  return service?.id;
}

function countryId(country) {
  return country?.id;
}

function countryCode(country) {
  return normalize(country?.code).toUpperCase();
}

function isIndonesia(country) {
  return (
    countryCode(country) === "ID" ||
    normalize(country?.name) === "indonesia"
  );
}

async function getCountries(env) {
  const result = await sms(env, "/catalog/countries");
  assertSmsSuccess(result, "Gagal mengambil daftar negara SMSCode.");
  const data = Array.isArray(result.data?.data) ? result.data.data : [];
  return data.filter((c) => c && c.id != null && c.active !== false);
}

async function getServices(env, countryIdValue) {
  const result = await sms(
    env,
    "/catalog/services?country_id=" + encodeURIComponent(String(countryIdValue))
  );
  assertSmsSuccess(result, "Gagal mengambil daftar layanan.");
  const data = Array.isArray(result.data?.data) ? result.data.data : [];
  return data.filter((s) => s && s.id != null && s.active !== false);
}

async function getProducts(env, countryIdValue, serviceIdValue) {
  const params = new URLSearchParams({
    country_id: String(countryIdValue),
    platform_id: String(serviceIdValue),
    limit: "100",
    page: "1",
    sort: "price_asc"
  });

  const result = await sms(env, "/catalog/products?" + params.toString());
  assertSmsSuccess(result, "Gagal mengambil daftar produk.");
  const data = Array.isArray(result.data?.data) ? result.data.data : [];

  return data
    .filter(available)
    .sort((a, b) => providerPrice(a) - providerPrice(b));
}

async function getDefaultIndonesiaPrice(env) {
  const value = await setting(env, "price_ID");
  const price = Number(value);
  if (Number.isFinite(price) && price > 0) return price;
  return 3000;
}

async function getDefaultGlobalPrice(env) {
  const value = await setting(env, "price_default");
  const price = Number(value);
  if (Number.isFinite(price) && price > 0) return price;
  return 4000;
}

async function getWhatsAppPrice(env, country) {
  const code = countryCode(country);

  if (code === "ID") {
    return getDefaultIndonesiaPrice(env);
  }

  const custom = await setting(env, "price_" + code);
  const customPrice = Number(custom);
  if (Number.isFinite(customPrice) && customPrice > 0) {
    return customPrice;
  }

  return getDefaultGlobalPrice(env);
}

function addThreePercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 1.03);
}

async function getSellingPrice(env, country, service, product) {
  if (isWhatsAppService(service)) {
    return getWhatsAppPrice(env, country);
  }
  return addThreePercent(providerPrice(product));
}

function operatorName(product, service) {
  return (
    product?.operator_name ||
    product?.name ||
    product?.operator ||
    service?.name ||
    "Nomor"
  );
}

function stockCount(product) {
  return Number(product?.available || 0);
}

async function findCatalogProduct(env, catalogProductId) {
  const countries = await getCountries(env);

  for (const country of countries) {
    const services = await getServices(env, country.id);
    for (const service of services) {
      const products = await getProducts(env, country.id, service.id);
      const product = products.find(
        (item) => String(productId(item)) === String(catalogProductId)
      );
      if (product) {
        return { country, service, product };
      }
    }
  }

  return null;
}

export async function showCountries(env, chatId, messageId = null, page = 0) {
  try {
    const countries = await getCountries(env);
    const prepared = [];

    for (const country of countries) {
      const services = await getServices(env, country.id);
      let cheapest = null;

      for (const service of services) {
        const products = await getProducts(env, country.id, service.id);
        if (!products.length) continue;

        const product = products[0];
        const price = await getSellingPrice(env, country, service, product);

        if (cheapest === null || price < cheapest.price) {
          cheapest = { price, service, product };
        }
      }

      if (cheapest) {
        prepared.push({ country, price: cheapest.price });
      }
    }

    prepared.sort((a, b) => a.price - b.price);

    const perPage = 12;
    const totalPages = Math.max(1, Math.ceil(prepared.length / perPage));
    const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
    const start = safePage * perPage;
    const items = prepared.slice(start, start + perPage);

    const rows = [];

    for (let i = 0; i < items.length; i += 2) {
      const first = items[i];
      const second = items[i + 1];

      const firstHot = start + i === 0 ? "🔥 HOT " : "";
      const row = [
        {
          text:
            firstHot +
            (first.country.emoji || "🌍") +
            " " +
            first.country.name +
            " • " +
            money(first.price),
          callback_data: "n1c:" + countryId(first.country)
        }
      ];

      if (second) {
        row.push({
          text:
            (second.country.emoji || "🌍") +
            " " +
            second.country.name +
            " • " +
            money(second.price),
          callback_data: "n1c:" + countryId(second.country)
        });
      }

      rows.push(row);
    }

    const navigation = [];
    if (safePage > 0) {
      navigation.push({
        text: "⬅️ Sebelumnya",
        callback_data: "n1page:" + (safePage - 1)
      });
    }
    if (safePage < totalPages - 1) {
      navigation.push({
        text: "Berikutnya ➡️",
        callback_data: "n1page:" + (safePage + 1)
      });
    }
    if (navigation.length) rows.push(navigation);

    rows.push([callbackButton("⬅️ Menu", "main")]);

    return replaceTrackedBotMessage(
      env,
      chatId,
      "📱 NOKOS 1\n\n" +
        "Urutan: termurah → termahal\n" +
        "🔥 HOT = harga termurah\n\n" +
        "Pilih negara:",
      inlineKeyboard(rows)
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal mengambil daftar negara.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function showServices(env, chatId, countryValue, messageId = null) {
  try {
    const countries = await getCountries(env);
    const country = countries.find(
      (item) => String(countryId(item)) === String(countryValue)
    );

    if (!country) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Negara tidak ditemukan.",
        backKeyboard()
      );
    }

    const services = await getServices(env, country.id);
    const prepared = [];

    for (const service of services) {
      const products = await getProducts(env, country.id, service.id);
      if (!products.length) continue;

      const product = products[0];
      const price = await getSellingPrice(env, country, service, product);
      prepared.push({ service, price });
    }

    prepared.sort((a, b) => a.price - b.price);

    if (!prepared.length) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Tidak ada layanan berstok untuk " + country.name + ".",
        inlineKeyboard([[callbackButton("⬅️ Negara", "nokos1")]])
      );
    }

    const rows = [];

    for (let i = 0; i < prepared.length; i += 2) {
      const first = prepared[i];
      const second = prepared[i + 1];

      const firstText =
        (i === 0 ? "🔥 HOT " : "") +
        "📱 " +
        first.service.name +
        " • " +
        money(first.price);

      const row = [
        {
          text: firstText,
          callback_data:
            "n1s:" + country.id + ":" + serviceId(first.service)
        }
      ];

      if (second) {
        row.push({
          text:
            "📱 " + second.service.name + " • " + money(second.price),
          callback_data:
            "n1s:" + country.id + ":" + serviceId(second.service)
        });
      }

      rows.push(row);
    }

    rows.push([callbackButton("⬅️ Negara", "nokos1")]);

    return replaceTrackedBotMessage(
      env,
      chatId,
      "📱 NOKOS 1\n\n" +
        (country.emoji || "🌍") +
        " " +
        country.name +
        "\n\n" +
        "Urutan: termurah → termahal\n" +
        "🔥 HOT = harga termurah\n\n" +
        "Pilih platform:",
      inlineKeyboard(rows)
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal mengambil platform.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function showProducts(
  env,
  chatId,
  countryValue,
  serviceValue,
  messageId = null
) {
  try {
    const countries = await getCountries(env);
    const country = countries.find(
      (item) => String(countryId(item)) === String(countryValue)
    );

    if (!country) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Negara tidak ditemukan.",
        backKeyboard()
      );
    }

    const services = await getServices(env, country.id);
    const service = services.find(
      (item) => String(serviceId(item)) === String(serviceValue)
    );

    if (!service) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Layanan tidak ditemukan.",
        backKeyboard()
      );
    }

    const products = await getProducts(env, country.id, service.id);
    const sellPrice = await getSellingPrice(
      env,
      country,
      service,
      products[0] || {}
    );

    const filtered = [];

    for (const product of products) {
      const provider = providerPrice(product);
      const price = await getSellingPrice(env, country, service, product);

      if (isWhatsAppService(service) && provider > price) {
        continue;
      }

      filtered.push({ product, price });
    }

    if (!filtered.length) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Stok " +
          service.name +
          " untuk " +
          country.name +
          " sedang kosong / tidak menguntungkan.",
        inlineKeyboard([
          [callbackButton("⬅️ Layanan", "n1c:" + country.id)],
          [callbackButton("⬅️ Menu", "main")]
        ])
      );
    }

    const rows = filtered.slice(0, 20).map((item, index) => {
      const hot = index === 0 ? "🔥 HOT " : "";
      return [
        {
          text:
            hot +
            "📞 " +
            operatorName(item.product, service) +
            " • Stok " +
            stockCount(item.product) +
            " • " +
            money(item.price),
          callback_data: "n1p:" + productId(item.product)
        }
      ];
    });

    rows.push([callbackButton("⬅️ Layanan", "n1c:" + country.id)]);

    return replaceTrackedBotMessage(
      env,
      chatId,
      "📱 NOKOS 1\n\n" +
        (country.emoji || "🌍") +
        " " +
        country.name +
        "\n" +
        "Platform: " +
        service.name +
        "\n\n" +
        "Harga jual: " +
        money(sellPrice) +
        "\n\n" +
        "Pilih produk/tier:",
      inlineKeyboard(rows)
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Gagal mengambil produk.\n\n" + error.message,
      backKeyboard()
    );
  }
}

async function createSmsOrder(env, catalogProductId) {
  const key = "vds-" + randomId(12);

  const result = await sms(env, "/orders/create", {
    method: "POST",
    body: JSON.stringify({
      catalog_product_id: Number(catalogProductId),
      quantity: 1
    }),
    headers: {
      "Idempotency-Key": key
    }
  });

  assertSmsSuccess(result, "Gagal membuat order SMSCode.");
  return result.data?.data?.orders?.[0] || null;
}

async function saveNokos1Order(env, telegramId, smsOrder, sellPrice, meta = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO nokos_orders
      (telegram_id, sms_order_id, phone_number, amount, sell_price, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        String(telegramId),
        smsOrder.id,
        smsOrder.phone_number || null,
        number(smsOrder.amount?.canonical_amount || providerPrice(smsOrder)),
        number(sellPrice),
        smsOrder.status || "ACTIVE",
        now(),
        smsOrder.expires_at || null
      )
      .run();
  } catch {}

  await saveSetting(
    env,
    "order_owner_" + smsOrder.id,
    JSON.stringify({
      telegram_id: telegramId,
      sell_price: sellPrice,
      country: meta.country || null,
      service: meta.service || null
    })
  );
}

export async function buyNokos1(env, chatId, telegramId, catalogProductId) {
  try {
    const found = await findCatalogProduct(env, catalogProductId);
    if (!found) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Produk sudah tidak tersedia. Silakan pilih ulang.",
        backKeyboard()
      );
    }

    const { country, service, product } = found;
    const sellPrice = await getSellingPrice(env, country, service, product);
    const provider = providerPrice(product);

    if (isWhatsAppService(service) && provider > sellPrice) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Produk ini tidak dapat dijual karena harga provider lebih tinggi dari harga jual.",
        backKeyboard()
      );
    }

    const u = await user(env, telegramId);
    if (number(u?.balance) < sellPrice) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ Saldo tidak cukup.\n\n" +
          "Harga: " +
          money(sellPrice) +
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

    await replaceTrackedBotMessage(
      env,
      chatId,
      "⏳ Membuat order NOKOS 1...\n\nMohon tunggu."
    );

    const smsOrder = await createSmsOrder(env, catalogProductId);

    if (!smsOrder?.id) {
      return replaceTrackedBotMessage(
        env,
        chatId,
        "❌ SMSCode tidak mengembalikan order yang valid.",
        backKeyboard()
      );
    }

    const newBalance = await chargeCustomer(
      env,
      telegramId,
      sellPrice,
      smsOrder.id,
      "Pembelian NOKOS 1"
    );

    await saveNokos1Order(env, telegramId, smsOrder, sellPrice, {
      country: country.name,
      service: service.name
    });

    await sendNumberMessage(
      env,
      chatId,
      smsOrder.phone_number || "-",
      smsOrder.id
    );

    await notifyOwner(
      env,
      "📱 ORDER NOKOS 1\n\n" +
        "Order ID: " +
        smsOrder.id +
        "\n" +
        "Customer: " +
        telegramId +
        "\n" +
        "Negara: " +
        (country.emoji || "") +
        " " +
        country.name +
        "\n" +
        "Platform: " +
        service.name +
        "\n" +
        "Nomor: " +
        (smsOrder.phone_number || "-") +
        "\n" +
        "Harga: " +
        money(sellPrice)
    );

    return replaceTrackedBotMessage(
      env,
      chatId,
      "✅ ORDER NOKOS 1 BERHASIL\n\n" +
        "Order ID: " +
        smsOrder.id +
        "\n" +
        "Negara: " +
        (country.emoji || "") +
        " " +
        country.name +
        "\n" +
        "Platform: " +
        service.name +
        "\n" +
        "Nomor: " +
        (smsOrder.phone_number || "-") +
        "\n" +
        "Harga: " +
        money(sellPrice) +
        "\n" +
        "Saldo: " +
        money(newBalance) +
        "\n\n" +
        "⏳ Menunggu OTP...\n" +
        "Nomor sudah dikirim di pesan terpisah (tidak akan dihapus).",
      inlineKeyboard([
        [callbackButton("🔄 Cek OTP", "otp:" + smsOrder.id)],
        [callbackButton("❌ Batalkan", "cancel:" + smsOrder.id)],
        [callbackButton("⬅️ Menu", "main")]
      ])
    );
  } catch (error) {
    return replaceTrackedBotMessage(
      env,
      chatId,
      "❌ Order gagal.\n\n" + error.message,
      backKeyboard()
    );
  }
}

export async function handleNokos1Callback(env, data, context) {
  const { chatId, messageId, user } = context;
  const telegramId = user?.id;

  if (data === "nokos1") {
    return showCountries(env, chatId, messageId, 0);
  }

  if (data.startsWith("n1page:")) {
    const page = Number(data.split(":")[1] || 0);
    return showCountries(env, chatId, messageId, page);
  }

  if (data.startsWith("n1c:")) {
    const countryValue = data.split(":")[1];
    return showServices(env, chatId, countryValue, messageId);
  }

  if (data.startsWith("n1s:")) {
    const parts = data.split(":");
    const countryValue = parts[1];
    const serviceValue = parts[2];
    return showProducts(env, chatId, countryValue, serviceValue, messageId);
  }

  if (data.startsWith("n1p:")) {
    const productIdValue = data.split(":")[1];
    return buyNokos1(env, chatId, telegramId, productIdValue);
  }

  return null;
}