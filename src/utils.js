export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

export function now() {
  return new Date().toISOString();
}

export function money(value) {
  const number = Number(value || 0);
  return "Rp" + number.toLocaleString("id-ID");
}

export function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function esc(value, fallback = "-") {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
}

function telegramUrl(env, method) {
  if (!env?.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN belum tersedia.");
  }

  return (
    "https://api.telegram.org/bot" +
    env.TELEGRAM_BOT_TOKEN +
    "/" +
    method
  );
}

export async function tg(env, method, data = {}) {
  const response = await fetch(
    telegramUrl(env, method),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }
  );

  const result = await response.json().catch(() => ({
    ok: false,
    description: "Telegram mengembalikan response yang tidak valid."
  }));

  return result;
}

export async function send(
  env,
  chatId,
  text,
  extra = {}
) {
  return tg(
    env,
    "sendMessage",
    {
      chat_id: chatId,
      text: String(text ?? ""),
      ...extra
    }
  );
}

export async function sendPhoto(
  env,
  chatId,
  photo,
  caption = "",
  extra = {}
) {
  return tg(
    env,
    "sendPhoto",
    {
      chat_id: chatId,
      photo,
      caption,
      ...extra
    }
  );
}

export async function deleteMessage(
  env,
  chatId,
  messageId
) {
  if (!messageId) {
    return {
      ok: false,
      description: "message_id kosong"
    };
  }

  try {
    return await tg(
      env,
      "deleteMessage",
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  } catch (error) {
    return {
      ok: false,
      description: error?.message || "Gagal menghapus pesan."
    };
  }
}

export async function editOrSend(
  env,
  chatId,
  messageId,
  text,
  extra = {}
) {
  if (messageId) {
    try {
      const result = await tg(
        env,
        "editMessageText",
        {
          chat_id: chatId,
          message_id: messageId,
          text: String(text ?? ""),
          ...extra
        }
      );

      if (result?.ok) {
        return result;
      }
    } catch {}
  }

  return send(
    env,
    chatId,
    text,
    extra
  );
}

export async function editCaption(
  env,
  chatId,
  messageId,
  caption,
  extra = {}
) {
  if (!messageId) {
    return null;
  }

  try {
    return await tg(
      env,
      "editMessageCaption",
      {
        chat_id: chatId,
        message_id: messageId,
        caption: String(caption ?? ""),
        ...extra
      }
    );
  } catch (error) {
    return {
      ok: false,
      description: error?.message || "Gagal edit caption."
    };
  }
}

export async function answerCallback(
  env,
  callbackId,
  text = "",
  showAlert = false
) {
  if (!callbackId) {
    return null;
  }

  return tg(
    env,
    "answerCallbackQuery",
    {
      callback_query_id: callbackId,
      ...(text
        ? { text: String(text) }
        : {}),
      show_alert: Boolean(showAlert)
    }
  );
}

export async function user(
  env,
  telegramId
) {
  if (!env?.DB) {
    throw new Error("Binding DB belum tersedia.");
  }

  return env.DB
    .prepare(
      "SELECT * FROM users WHERE telegram_id = ?"
    )
    .bind(String(telegramId))
    .first();
}

export async function register(
  env,
  from
) {
  if (!from?.id) {
    throw new Error("Data Telegram user tidak valid.");
  }

  const id = String(from.id);

  const old = await user(
    env,
    id
  );

  if (old) {
    await env.DB
      .prepare(
        `
        UPDATE users
        SET username = ?,
            first_name = ?
        WHERE telegram_id = ?
        `
      )
      .bind(
        from.username || null,
        from.first_name || "",
        id
      )
      .run();

    return user(
      env,
      id
    );
  }

  await env.DB
    .prepare(
      `
      INSERT INTO users
      (
        telegram_id,
        username,
        first_name,
        balance,
        created_at
      )
      VALUES (?, ?, ?, 0, ?)
      `
    )
    .bind(
      id,
      from.username || null,
      from.first_name || "",
      now()
    )
    .run();

  return user(
    env,
    id
  );
}

export async function setting(
  env,
  key
) {
  if (!env?.DB) {
    throw new Error("Binding DB belum tersedia.");
  }

  const row = await env.DB
    .prepare(
      "SELECT value FROM settings WHERE key = ?"
    )
    .bind(String(key))
    .first();

  return row
    ? row.value
    : null;
}

export async function saveSetting(
  env,
  key,
  value
) {
  if (!env?.DB) {
    throw new Error("Binding DB belum tersedia.");
  }

  await env.DB
    .prepare(
      `
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key)
      DO UPDATE SET value = excluded.value
      `
    )
    .bind(
      String(key),
      String(value ?? "")
    )
    .run();

  return true;
}

export async function deleteSetting(
  env,
  key
) {
  if (!env?.DB) {
    throw new Error("Binding DB belum tersedia.");
  }

  await env.DB
    .prepare(
      "DELETE FROM settings WHERE key = ?"
    )
    .bind(String(key))
    .run();

  return true;
}

export async function owner(
  env,
  telegramId
) {
  return (
    String(telegramId) ===
    String(env?.OWNER_ID)
  );
}

export async function requireOwner(
  env,
  chatId
) {
  if (
    String(chatId) !==
    String(env?.OWNER_ID)
  ) {
    await send(
      env,
      chatId,
      "❌ Perintah ini hanya bisa digunakan oleh owner."
    );

    return false;
  }

  return true;
}

export async function sms(
  env,
  path,
  options = {}
) {
  if (!env?.SMSCODE_API_KEY) {
    throw new Error("SMSCODE_API_KEY belum tersedia.");
  }

  const headers = {
    Authorization:
      "Bearer " +
      env.SMSCODE_API_KEY,

    "Content-Type":
      "application/json",

    ...(options.headers || {})
  };

  const response = await fetch(
    "https://api.smscode.gg/v2" + path,
    {
      ...options,
      headers
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  return {
    response,
    data
  };
}

export function assertSmsSuccess(
  result,
  fallback = "Permintaan ke SMSCode gagal."
) {
  if (
    !result?.response?.ok ||
    !result?.data?.success
  ) {
    throw new Error(
      result?.data?.error?.message ||
      fallback
    );
  }

  return result.data;
}

export async function addBalance(
  env,
  telegramId,
  amount,
  referenceId = "",
  description = "Tambah saldo"
) {
  const u = await user(
    env,
    telegramId
  );

  if (!u) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const value = number(amount);

  if (value <= 0) {
    throw new Error(
      "Nominal saldo tidak valid."
    );
  }

  const current =
    number(u.balance);

  const newBalance =
    current + value;

  await env.DB
    .prepare(
      `
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      newBalance,
      String(telegramId)
    )
    .run();

  await env.DB
    .prepare(
      `
      INSERT INTO balance_transactions
      (
        telegram_id,
        type,
        amount,
        reference_id,
        description,
        created_at
      )
      VALUES (?, 'DEPOSIT', ?, ?, ?, ?)
      `
    )
    .bind(
      String(telegramId),
      value,
      String(referenceId || ""),
      description,
      now()
    )
    .run();

  return newBalance;
}

export async function chargeCustomer(
  env,
  telegramId,
  amount,
  referenceId = "",
  description = "Pembelian NOKOS"
) {
  const u = await user(
    env,
    telegramId
  );

  if (!u) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const value = number(amount);

  if (value <= 0) {
    throw new Error(
      "Nominal pembayaran tidak valid."
    );
  }

  const balance =
    number(u.balance);

  if (balance < value) {
    throw new Error(
      "Saldo tidak cukup. Saldo kamu " +
      money(balance) +
      ", harga " +
      money(value) +
      "."
    );
  }

  const newBalance =
    balance - value;

  await env.DB
    .prepare(
      `
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      newBalance,
      String(telegramId)
    )
    .run();

  await env.DB
    .prepare(
      `
      INSERT INTO balance_transactions
      (
        telegram_id,
        type,
        amount,
        reference_id,
        description,
        created_at
      )
      VALUES (?, 'ORDER', ?, ?, ?, ?)
      `
    )
    .bind(
      String(telegramId),
      -value,
      String(referenceId || ""),
      description,
      now()
    )
    .run();

  return newBalance;
}

export async function refundCustomer(
  env,
  telegramId,
  amount,
  referenceId = "",
  description = "Refund"
) {
  const u = await user(
    env,
    telegramId
  );

  if (!u) {
    throw new Error(
      "Customer tidak ditemukan."
    );
  }

  const value = number(amount);

  if (value <= 0) {
    return number(u.balance);
  }

  const current =
    number(u.balance);

  const newBalance =
    current + value;

  await env.DB
    .prepare(
      `
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      newBalance,
      String(telegramId)
    )
    .run();

  await env.DB
    .prepare(
      `
      INSERT INTO balance_transactions
      (
        telegram_id,
        type,
        amount,
        reference_id,
        description,
        created_at
      )
      VALUES (?, 'REFUND', ?, ?, ?, ?)
      `
    )
    .bind(
      String(telegramId),
      value,
      String(referenceId || ""),
      description,
      now()
    )
    .run();

  return newBalance;
}

export async function getBalance(
  env,
  telegramId
) {
  const u = await user(
    env,
    telegramId
  );

  return number(
    u?.balance
  );
}

export function backKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "⬅️ Menu",
            callback_data: "main"
          }
        ]
      ]
    }
  };
}

export function inlineKeyboard(
  rows = []
) {
  return {
    reply_markup: {
      inline_keyboard: rows
    }
  };
}

export function copyButton(
  text,
  label = "📋 Copy"
) {
  return {
    text: label,
    copy_text: {
      text: String(text ?? "")
    }
  };
}

export function callbackButton(
  text,
  callbackData
) {
  return {
    text: String(text),
    callback_data: String(callbackData)
  };
}

export function randomId4() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const array =
    new Uint32Array(4);

  crypto.getRandomValues(array);

  let result = "";

  for (let i = 0; i < 4; i++) {
    result +=
      chars[
        array[i] % chars.length
      ];
  }

  return result;
}

export function randomId(
  length = 8
) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const array =
    new Uint32Array(length);

  crypto.getRandomValues(array);

  let result = "";

  for (let i = 0; i < length; i++) {
    result +=
      chars[
        array[i] % chars.length
      ];
  }

  return result;
}

export function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeMarkdownV2(
  value
) {
  return String(
    value ?? ""
  ).replace(
    /[_*[\]()~`>#+\-=|{}.!\\]/g,
    "\\$&"
  );
}

export function getMessageId(
  result
) {
  return (
    result?.result?.message_id ||
    null
  );
}

export function getChatId(
  message
) {
  return (
    message?.chat?.id ??
    null
  );
}

export function isCallbackUpdate(
  update
) {
  return Boolean(
    update?.callback_query
  );
}

export function isMessageUpdate(
  update
) {
  return Boolean(
    update?.message
  );
}

export function parseCommand(
  text
) {
  const input =
    String(text || "").trim();

  if (!input.startsWith("/")) {
    return {
      command: "",
      args: [],
      raw: input
    };
  }

  const parts =
    input.split(/\s+/);

  let command =
    parts.shift() || "";

  command =
    command
      .replace(/^\/+/, "")
      .split("@")[0]
      .toLowerCase();

  return {
    command,
    args: parts,
    raw: input
  };
}

export function commandArgs(
  args,
  start = 0
) {
  return args
    .slice(start)
    .join(" ")
    .trim();
}

export function parseJson(
  value,
  fallback = null
) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function sleep(
  milliseconds
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

export async function retry(
  fn,
  attempts = 3,
  delay = 500
) {
  let lastError;

  for (
    let i = 0;
    i < attempts;
    i++
  ) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (
        i <
        attempts - 1
      ) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export function isTelegramEditError(
  result
) {
  const description =
    String(
      result?.description || ""
    ).toLowerCase();

  return (
    description.includes(
      "message is not modified"
    ) ||
    description.includes(
      "message to edit not found"
    ) ||
    description.includes(
      "message can't be edited"
    )
  );
}

export function isPositiveNumber(
  value
) {
  const n =
    Number(value);

  return (
    Number.isFinite(n) &&
    n > 0
  );
}

export function roundPrice(
  value
) {
  return Math.round(
    Number(value || 0)
  );
}

export function calculateProfitPrice(
  basePrice,
  percent = 3
) {
  const base =
    number(basePrice);

  const rate =
    number(percent);

  return Math.ceil(
    base +
    (base * rate / 100)
  );
}

export function calculateProfit(
  basePrice,
  sellPrice
) {
  return (
    number(sellPrice) -
    number(basePrice)
  );
}

export function normalizeCountryName(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isIndonesia(
  country
) {
  const value =
    normalizeCountryName(
      typeof country === "object"
        ? country?.name
        : country
    );

  return (
    value === "indonesia" ||
    value === "id"
  );
}

export function isWhatsApp(
  service
) {
  const value =
    normalizeCountryName(
      typeof service === "object"
        ? service?.name
        : service
    );

  return (
    value.includes("whatsapp") ||
    value === "wa"
  );
}
