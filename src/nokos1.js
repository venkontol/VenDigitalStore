import {
  money,
  now,
  dbUser,
  setting,
  saveSetting,
  api,
  send,
  replace,
  back
} from "./utils.js";

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isWhatsApp(service) {
  const values = [
    service?.name,
    service?.code,
    service?.slug,
    service?.key,
    service?.service
  ].map(normalize);

  return values.some(value =>
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
    product?.price_usd
  ];

  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      return number;
    }
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
  return countryCode(country) === "ID" ||
    normalize(country?.name) === "indonesia";
}

async function getCountries(env) {
  const result = await api(env, "/catalog/countries");
  const data = Array.isArray(result?.data) ? result.data : [];

  return data
    .filter(country => country && country.id != null)
    .filter(country => country.active !== false);
}

async function getServices(env, countryIdValue) {
  const result = await api(
    env,
    "/catalog/services?country_id=" +
      encodeURIComponent(String(countryIdValue))
  );

  const data = Array.isArray(result?.data) ? result.data : [];

  return data
    .filter(service => service && service.id != null)
    .filter(service => service.active !== false);
}

async function getProducts(env, countryIdValue, serviceIdValue) {
  const params = new URLSearchParams({
    country_id: String(countryIdValue),
    platform_id: String(serviceIdValue),
    limit: "100",
    page: "1",
    sort: "price_asc"
  });

  const result = await api(
    env,
    "/catalog/products?" + params.toString()
  );

  const data = Array.isArray(result?.data) ? result.data : [];

  return data
    .filter(available)
    .sort((a, b) => providerPrice(a) - providerPrice(b));
}

async function getDefaultIndonesiaPrice(env) {
  const value = await setting(env, "price_ID");
  const price = Number(value);

  if (Number.isFinite(price) && price > 0) {
    return price;
  }

  return 3000;
}

async function getDefaultGlobalPrice(env) {
  const value = await setting(env, "price_default");
  const price = Number(value);

  if (Number.isFinite(price) && price > 0) {
    return price;
  }

  return 4000;
}

async function getWhatsAppPrice(env, country) {
  const code = countryCode(country);

  if (code === "ID") {
    return getDefaultIndonesiaPrice(env);
  }

  const custom = await setting(
    env,
    "price_" + code
  );

  const customPrice = Number(custom);

  if (Number.isFinite(customPrice) && customPrice > 0) {
    return customPrice;
  }

  return getDefaultGlobalPrice(env);
}

function addThreePercent(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.ceil(number * 1.03);
}

async function getSellingPrice(env, country, service, product) {
  if (isWhatsApp(service)) {
    return getWhatsAppPrice(env, country);
  }

  const original = providerPrice(product);

  return addThreePercent(original);
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

function productButtonText(product, service, index, sellPrice) {
  const hot = index === 0 ? "🔥 HOT " : "";
  const operator = operatorName(product, service);
  const stock = stockCount(product);

  return (
    hot +
    "📞 " +
    operator +
    " • Stok " +
    stock +
    " • " +
    money(sellPrice)
  );
}

async function findCatalogProduct(env, catalogProductId) {
  const countries = await getCountries(env);

  for (const country of countries) {
    const services = await getServices(env, country.id);

    for (const service of services) {
      const products = await getProducts(
        env,
        country.id,
        service.id
      );

      const product = products.find(
        item =>
          String(productId(item)) ===
          String(catalogProductId)
      );

      if (product) {
        return {
          country,
          service,
          product
        };
      }
    }
  }

  return null;
}

async function showCountries(
  env,
  chatId,
  messageId = null,
  page = 0
) {
  try {
    const countries = await getCountries(env);

    const prepared = [];

    for (const country of countries) {
      const services = await getServices(env, country.id);

      let cheapest = null;

      for (const service of services) {
        const products = await getProducts(
          env,
          country.id,
          service.id
        );

        if (!products.length) continue;

        const product = products[0];

        const price = await getSellingPrice(
          env,
          country,
          service,
          product
        );

        if (
          cheapest === null ||
          price < cheapest.price
        ) {
          cheapest = {
            price,
            service,
            product
          };
        }
      }

      if (cheapest) {
        prepared.push({
          country,
          price: cheapest.price
        });
      }
    }

    prepared.sort((a, b) => a.price - b.price);

    const perPage = 12;
    const totalPages = Math.max(
      1,
      Math.ceil(prepared.length / perPage)
    );

    const safePage = Math.min(
      Math.max(Number(page) || 0, 0),
      totalPages - 1
    );

    const start = safePage * perPage;
    const items = prepared.slice(
      start,
      start + perPage
    );

    const rows = [];

    for (let i = 0; i < items.length; i += 2) {
      const first = items[i];
      const second = items[i + 1];

      const firstText =
        (first.country.emoji || "🌍") +
        " " +
        first.country.name +
        " • " +
        money(first.price);

      const row = [
        {
          text: firstText,
          callback_data:
            "n1c:" +
            countryId(first.country)
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
          callback_data:
            "n1c:" +
            countryId(second.country)
        });
      }

      rows.push(row);
    }

    const navigation = [];

    if (safePage > 0) {
      navigation.push({
        text: "⬅️ Sebelumnya",
        callback_data:
          "n1page:" +
          (safePage - 1)
      });
    }

    if (safePage < totalPages - 1) {
      navigation.push({
        text: "Berikutnya ➡️",
        callback_data:
          "n1page:" +
          (safePage + 1)
      });
    }

    if (navigation.length) {
      rows.push(navigation);
    }

    rows.push([
      {
        text: "⬅️ Menu",
        callback_data: "main"
      }
    ]);

    return replace(
      env,
      chatId,
      messageId,
      "📱 NOKOS 1\n\n" +
        "Urutan negara: termurah → termahal\n" +
        "🔥 HOT = harga termurah\n\n" +
        "Pilih negara:",
      {
        reply_markup: {
          inline_keyboard: rows
        }
      }
    );
  } catch (error) {
    return replace(
      env,
      chatId,
      messageId,
      "❌ Gagal mengambil daftar negara.\n\n" +
        error.message,
      back()
    );
  }
}

async function showServices(
  env,
  chatId,
  countryValue,
  messageId = null
) {
  try {
    const countries = await getCountries(env);

    const country = countries.find(
      item =>
        String(countryId(item)) ===
        String(countryValue)
    );

    if (!country) {
      return replace(
        env,
        chatId,
        messageId,
        "❌ Negara tidak ditemukan.",
        back()
      );
    }

    const services = await getServices(
      env,
      country.id
    );

    const prepared = [];

    for (const service of services) {
      const products = await getProducts(
        env,
        country.id,
        service.id
      );

      if (!products.length) continue;

      const product = products[0];

      const price = await getSellingPrice(
        env,
        country,
        service,
        product
      );

      prepared.push({
        service,
        price
      });
    }

    prepared.sort(
      (a, b) => a.price - b.price
    );

    if (!prepared.length) {
      return replace(
        env,
        chatId,
        messageId,
        "❌ Tidak ada service yang memiliki stok untuk " +
          country.name +
          ".",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⬅️ Negara",
                  callback_data: "nokos1"
                }
              ]
            ]
          }
        }
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
            "n1s:" +
            country.id +
            ":" +
            serviceId(first.service)
        }
      ];

      if (second) {
        row.push({
          text:
            "📱 " +
            second.service.name +
            " • " +
            money(second.price),
          callback_data:
            "n1s:" +
            country.id +
            ":" +
            serviceId(second.service)
        });
      }

      rows.push(row);
    }

    rows.push([
      {
        text: "⬅️ Negara",
        callback_data: "nokos1"
      }
    ]);

    return replace(
      env,
      chatId,
      messageId,
      "📱 NOKOS 1\n\n" +
        (country.emoji || "🌍") +
        " " +
        country.name +
        "\n\n" +
        "Urutan: termurah → termahal\n" +
        "🔥 HOT = harga termurah\n\n" +
        "Pilih platform:",
      {
        reply_markup: {
          inline_keyboard: rows
        }
      }
    );
  } catch (error) {
    return replace(
      env,
      chatId,
      messageId,
      "❌ Gagal mengambil platform.\n\n" +
        error.message,
      back()
    );
  }
}

async function showProducts(
  env,
  chatId,
  countryValue,
  serviceValue,
  messageId = null
) {
  try {
    const countries = await getCountries(env);

    const country = countries.find(
      item =>
        String(countryId(item)) ===
        String(countryValue)
    );

    if (!country) {
      return replace(
        env,
        chatId,
        messageId,
        "❌ Negara tidak ditemukan.",
        back()
      );
    }

    const services = await getServices(
      env,
      country.id
    );

    const service = services.find(
      item =>
        String(serviceId(item)) ===
        String(serviceValue)
    );

    if (!service) {
      return replace(
        env,
        chatId,
        messageId,
        "❌ Platform tidak ditemukan.",
        back()
      );
    }

    const products = await getProducts(
      env,
      country.id,
      service.id
    );

    if (!products.length) {
      return replace(
        env,
        chatId,
        messageId,
        "❌ Stok " +
          service.name +
          " untuk " +
          country.name +
          " sedang habis.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⬅️ Platform",
                  callback_data:
                    "n1c:" +
                    country.id
                }
              ]
            ]
          }
        }
      );
    }

    const price = await getSellingPrice(
      env,
      country,
      service,
      products[0]
    );

    const rows = products
      .slice(0, 50)
      .map((product, index) => [
        {
          text: productButtonText(
            product,
            service,
            index,
            price
          ),
          callback_data:
            "n1p:" +
            country.id +
            ":" +
            service.id +
            ":" +
            productId(product)
        }
      ]);

    rows.push([
      {
        text: "⬅️ Platform",
        callback_data:
          "n1c:" +
          country.id
      }
    ]);

    const whatsappText = isWhatsApp(service)
      ? isIndonesia(country)
        ? "🇮🇩 Harga WhatsApp Indonesia: " +
          money(price)
        : "🌍 Harga WhatsApp: " +
          money(price)
      : "💹 Harga provider + 3%";

    return replace(
      env,
      chatId,
      messageId,
      "📱 NOKOS 1\n\n" +
        (country.emoji || "🌍") +
        " " +
        country.name +
        "\n" +
        "📲 " +
        service.name +
        "\n\n" +
        whatsappText +
        "\n" +
        "📊 Urutan stok: termurah → termahal\n" +
        "🔥 HOT = provider termurah\n\n" +
        "Pilih operator/stok:",
      {
        reply_markup: {
          inline_keyboard: rows
        }
      }
    );
  } catch (error) {
    return replace(
      env,
      chatId,
      messageId,
      "❌ Gagal mengambil stok.\n\n" +
        error.message,
      back()
    );
  }
}

async function createOrder(
  env,
  telegramId,
  countryValue,
  serviceValue,
  productValue
) {
  const user = await dbUser(
    env,
    telegramId
  );

  if (!user) {
    throw new Error(
      "Akun tidak ditemukan."
    );
  }

  const countries = await getCountries(env);

  const country = countries.find(
    item =>
      String(countryId(item)) ===
      String(countryValue)
  );

  if (!country) {
    throw new Error(
      "Negara tidak ditemukan."
    );
  }

  const services = await getServices(
    env,
    country.id
  );

  const service = services.find(
    item =>
      String(serviceId(item)) ===
      String(serviceValue)
  );

  if (!service) {
    throw new Error(
      "Platform tidak ditemukan."
    );
  }

  const products = await getProducts(
    env,
    country.id,
    service.id
  );

  const product = products.find(
    item =>
      String(productId(item)) ===
      String(productValue)
  );

  if (!product) {
    throw new Error(
      "Produk sudah tidak tersedia."
    );
  }

  if (!available(product)) {
    throw new Error(
      "Stok sudah habis."
    );
  }

  const originalProviderPrice =
    providerPrice(product);

  const sellPrice =
    await getSellingPrice(
      env,
      country,
      service,
      product
    );

  if (
    isWhatsApp(service) &&
    isIndonesia(country) &&
    originalProviderPrice > sellPrice
  ) {
    throw new Error(
      "Order dibatalkan karena harga provider " +
        money(originalProviderPrice) +
        " lebih tinggi dari harga jual " +
        money(sellPrice) +
        "."
    );
  }

  const balance = Number(
    user.balance || 0
  );

  if (balance < sellPrice) {
    throw new Error(
      "Saldo tidak cukup. Saldo kamu " +
        money(balance) +
        ", harga " +
        money(sellPrice) +
        "."
    );
  }

  const idempotencyKey =
    "n1_" +
    telegramId +
    "_" +
    Date.now() +
    "_" +
    crypto.randomUUID();

  const response = await api(
    env,
    "/orders/create",
    {
      method: "POST",
      headers: {
        "Idempotency-Key":
          idempotencyKey
      },
      body: JSON.stringify({
        catalog_product_id:
          Number(productId(product)),
        quantity: 1
      })
    }
  );

  const order =
    response?.data?.orders?.[0] ||
    response?.data?.data?.orders?.[0] ||
    response?.data?.data ||
    null;

  if (!order?.id) {
    throw new Error(
      "SMSCode tidak mengembalikan order yang valid."
    );
  }

  const deducted = await env.DB
    .prepare(
      "UPDATE users SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?"
    )
    .bind(
      sellPrice,
      String(telegramId),
      sellPrice
    )
    .run();

  if (!deducted?.meta?.changes) {
    try {
      await api(
        env,
        "/orders/cancel",
        {
          method: "POST",
          body: JSON.stringify({
            id: Number(order.id)
          })
        }
      );
    } catch {}

    throw new Error(
      "Saldo berubah. Order dibatalkan."
    );
  }

  const createdAt = now();

  try {
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
      product.id || null,
      product.catalog_product_id || null,
      order.phone_number || null,
      null,
      sellPrice,
      originalProviderPrice,
      order.status || "ACTIVE",
      createdAt,
      createdAt,
      order.expires_at || null,
      idempotencyKey
    ).run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE users SET balance = balance + ? WHERE telegram_id = ?"
    ).bind(
      sellPrice,
      String(telegramId)
    ).run();

    try {
      await api(
        env,
        "/orders/cancel",
        {
          method: "POST",
          body: JSON.stringify({
            id: Number(order.id)
          })
        }
      );
    } catch {}

    throw new Error(
      "Order dibatalkan karena penyimpanan lokal gagal."
    );
  }

  await saveSetting(
    env,
    "order_owner_" + order.id,
    JSON.stringify({
      telegram_id:
        String(telegramId),
      sell_price: sellPrice,
      provider_price:
        originalProviderPrice,
      country_id: country.id,
      country_code:
        country.code || null,
      country_name:
        country.name || null,
      service_id: service.id,
      service_name:
        service.name || null,
      phone_number:
        order.phone_number || null,
      type: "NOKOS1"
    })
  );

  return {
    user,
    country,
    service,
    product,
    order,
    sellPrice,
    providerPrice:
      originalProviderPrice
  };
}

async function buyProduct(
  env,
  chatId,
  telegramId,
  countryValue,
  serviceValue,
  productValue,
  messageId = null
) {
  try {
    await replace(
      env,
      chatId,
      messageId,
      "⏳ MEMPROSES NOKOS 1\n\nMohon tunggu...",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⏳ Memproses...",
                callback_data: "noop"
              }
            ]
          ]
        }
      }
    );

    const result =
      await createOrder(
        env,
        telegramId,
        countryValue,
        serviceValue,
        productValue
      );

    const order = result.order;

    const phone =
      order.phone_number || "-";

    return send(
      env,
      chatId,
      "✅ ORDER NOKOS 1 BERHASIL\n\n" +
        "Order ID: #" +
        order.id +
        "\n" +
        "Negara: " +
        (result.country.emoji || "🌍") +
        " " +
        result.country.name +
        "\n" +
        "Platform: " +
        result.service.name +
        "\n" +
        "Operator: " +
        operatorName(
          result.product,
          result.service
        ) +
        "\n" +
        "Nomor: " +
        phone +
        "\n" +
        "Harga: " +
        money(result.sellPrice) +
        "\n\n" +
        "⏳ Menunggu OTP...",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔄 Cek OTP",
                callback_data:
                  "otp:" +
                  order.id
              }
            ],
            [
              {
                text: "❌ Batalkan",
                callback_data:
                  "cancel:" +
                  order.id
              }
            ],
            [
              {
                text: "⬅️ Menu",
                callback_data: "main"
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    return send(
      env,
      chatId,
      "❌ ORDER NOKOS 1 GAGAL\n\n" +
        error.message,
      back()
    );
  }
}

async function handleNokos1Callback(
  env,
  callback
) {
  const data = String(
    callback?.data || ""
  );

  if (!callback?.message?.chat?.id) {
    return false;
  }

  const chatId =
    callback.message.chat.id;

  const messageId =
    callback.message.message_id;

  const telegramId =
    callback.from?.id;

  const parts =
    data.split(":");

  if (data === "nokos1") {
    await showCountries(
      env,
      chatId,
      messageId,
      0
    );
    return true;
  }

  if (
    parts[0] === "n1page" &&
    parts.length === 2
  ) {
    const page =
      Number(parts[1]);

    await showCountries(
      env,
      chatId,
      messageId,
      Number.isFinite(page)
        ? page
        : 0
    );

    return true;
  }

  if (
    parts[0] === "n1c" &&
    parts.length === 2
  ) {
    await showServices(
      env,
      chatId,
      parts[1],
      messageId
    );

    return true;
  }

  if (
    parts[0] === "n1s" &&
    parts.length === 3
  ) {
    await showProducts(
      env,
      chatId,
      parts[1],
      parts[2],
      messageId
    );

    return true;
  }

  if (
    parts[0] === "n1p" &&
    parts.length === 4
  ) {
    if (
      telegramId === undefined ||
      telegramId === null
    ) {
      return true;
    }

    await buyProduct(
      env,
      chatId,
      telegramId,
      parts[1],
      parts[2],
      parts[3],
      messageId
    );

    return true;
  }

  return false;
}

export {
  getCountries,
  getServices,
  getProducts,
  getWhatsAppPrice,
  getSellingPrice,
  showCountries,
  showServices,
  showProducts,
  createOrder,
  buyProduct,
  handleNokos1Callback
};