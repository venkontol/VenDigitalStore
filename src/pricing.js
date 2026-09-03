import {
  money,
  number,
  setting,
  saveSetting,
  owner
} from "./utils.js";

import {
  sendPermanentMessage,
  replaceTrackedBotMessage
} from "./telegram.js";

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isWhatsAppService(service) {
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

export function isIndonesia(country) {
  const code = normalize(country?.code).toUpperCase();
  const name = normalize(country?.name);
  return code === "ID" || name === "indonesia";
}

export function countryCode(country) {
  return normalize(country?.code).toUpperCase();
}

export function providerPrice(product) {
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

export function addThreePercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 1.03);
}

export async function getDefaultIndonesiaPrice(env) {
  const value = await setting(env, "price_ID");
  const price = Number(value);
  if (Number.isFinite(price) && price > 0) return price;
  return 3000;
}

export async function getDefaultGlobalPrice(env) {
  const value = await setting(env, "price_default");
  const price = Number(value);
  if (Number.isFinite(price) && price > 0) return price;
  return 4000;
}

export async function getWhatsAppPrice(env, country) {
  const code = countryCode(country);

  if (code === "ID" || isIndonesia(country)) {
    return getDefaultIndonesiaPrice(env);
  }

  const custom = await setting(env, "price_" + code);
  const customPrice = Number(custom);

  if (Number.isFinite(customPrice) && customPrice > 0) {
    return customPrice;
  }

  const byName = await setting(
    env,
    "price_name_" + normalize(country?.name)
  );
  const namedPrice = Number(byName);

  if (Number.isFinite(namedPrice) && namedPrice > 0) {
    return namedPrice;
  }

  return getDefaultGlobalPrice(env);
}

export async function getSellingPrice(env, country, service, product = {}) {
  if (isWhatsAppService(service)) {
    return getWhatsAppPrice(env, country);
  }

  return addThreePercent(providerPrice(product));
}

export function isProfitable(service, product, sellPrice) {
  if (!isWhatsAppService(service)) return true;

  const provider = providerPrice(product);
  return provider <= number(sellPrice);
}

export async function setCountryPrice(env, message) {
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
      "Format:\n" +
        "/setharga Vietnam 5000\n" +
        "/setharga Indonesia 3000\n" +
        "/setharga default 4000"
    );
  }

  const inputPrice = parts[parts.length - 1].replace(/\./g, "");
  const countryName = parts.slice(1, -1).join(" ").trim();
  const price = Number(inputPrice);

  if (!Number.isFinite(price) || price < 0) {
    return sendPermanentMessage(
      env,
      message.chat.id,
      "❌ Harga tidak valid."
    );
  }

  const lower = normalize(countryName);

  if (lower === "default" || lower === "global") {
    await saveSetting(env, "price_default", price);
    return sendPermanentMessage(
      env,
      message.chat.id,
      "✅ Harga default global diubah.\n\n" +
        "WhatsApp negara lain: " +
        money(price)
    );
  }

  if (lower === "indonesia" || lower === "id") {
    await saveSetting(env, "price_ID", price);
    return sendPermanentMessage(
      env,
      message.chat.id,
      "✅ Harga Indonesia diubah.\n\n" +
        "WhatsApp Indonesia: " +
        money(price)
    );
  }

  await saveSetting(env, "price_name_" + lower, price);

  const maybeCode = countryName.slice(0, 2).toUpperCase();
  if (/^[A-Z]{2}$/.test(maybeCode)) {
    await saveSetting(env, "price_" + maybeCode, price);
  }

  return sendPermanentMessage(
    env,
    message.chat.id,
    "✅ Harga berhasil diubah.\n\n" +
      "Negara: " +
      countryName +
      "\n" +
      "Harga jual: " +
      money(price)
  );
}

export async function showPriceList(env, chatId, countries = []) {
  const idPrice = await getDefaultIndonesiaPrice(env);
  const globalPrice = await getDefaultGlobalPrice(env);

  let text =
    "💰 HARGA NOKOS 1\n\n" +
    "WhatsApp Indonesia: " +
    money(idPrice) +
    "\n" +
    "WhatsApp negara lain (default): " +
    money(globalPrice) +
    "\n" +
    "Non-WhatsApp: harga provider + 3%\n\n";

  if (Array.isArray(countries) && countries.length) {
    text += "Custom aktif:\n";
    let count = 0;

    for (const country of countries.slice(0, 30)) {
      const code = countryCode(country);
      const custom = await setting(env, "price_" + code);
      const named = await setting(
        env,
        "price_name_" + normalize(country?.name)
      );

      const value = Number(custom || named);
      if (Number.isFinite(value) && value > 0) {
        text +=
          (country.emoji || "🌍") +
          " " +
          country.name +
          " • " +
          money(value) +
          "\n";
        count += 1;
      }
    }

    if (!count) {
      text += "Belum ada harga custom negara.\n";
    }
  }

  text +=
    "\nOwner dapat mengubah harga dengan:\n" +
    "/setharga Vietnam 5000";

  return replaceTrackedBotMessage(env, chatId, text);
}