import {
  errorResponse,
  jsonResponse,
  readJson,
  nowUnix
} from "./utils.js";

import {
  confirmDepositByCode,
  cancelDepositByCode
} from "./deposit.js";

async function getTelegramConfig(env) {
  const token = env.TELEGRAM_BOT_TOKEN || "";
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID || "";

  if (!token || !chatId) {
    console.warn(
      "[TELEGRAM CONFIG]",
      "Token atau Chat ID tidak dikonfigurasi"
    );
  }

  return {
    token,
    chatId
  };
}

async function validateTelegramUpdate(request, env) {
  const config = await getTelegramConfig(env);

  if (!config.token) {
    return null;
  }

  const body = await readJson(request);

  if (!body || !body.message) {
    return null;
  }

  const message = body.message;
  const chatId = message.chat?.id;
  const userId = message.from?.id;

  if (String(chatId) !== String(config.chatId)) {
    console.warn(
      "[TELEGRAM AUTH]",
      `Unauthorized chat: ${chatId}`
    );

    return null;
  }

  return {
    message,
    chatId,
    userId,
    text: message.text || ""
  };
}

async function sendTelegramMessage(
  token,
  chatId,
  text,
  parseMode = "HTML"
) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(
        "[TELEGRAM SEND ERROR]",
        result.description
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[TELEGRAM SEND EXCEPTION]",
      error
    );

    return false;
  }
}

async function getPendingDeposits(env) {
  try {
    const results = await env.DB
      .prepare(
        `
          SELECT
            d.id,
            d.code,
            d.amount,
            d.status,
            d.created_at,
            d.expires_at,
            u.username,
            u.first_name
          FROM deposits d
          INNER JOIN users u ON u.id = d.user_id
          WHERE d.status = 'PENDING'
          ORDER BY d.created_at ASC
          LIMIT 20
        `
      )
      .all();

    return (results?.results || []).map(row => ({
      id: row.id,
      code: row.code,
      amount: Number(row.amount || 0),
      username: row.username,
      first_name: row.first_name,
      created_at: row.created_at,
      expires_at: row.expires_at
    }));
  } catch (error) {
    console.error(
      "[GET PENDING DEPOSITS ERROR]",
      error
    );

    return [];
  }
}

async function handlePendingDeposits(env, chatId, token) {
  const deposits = await getPendingDeposits(env);

  if (!deposits.length) {
    const message = "✅ Tidak ada deposit yang menunggu konfirmasi.";

    await sendTelegramMessage(
      token,
      chatId,
      message
    );

    return;
  }

  let message = `📋 <b>Deposit Menunggu (${deposits.length})</b>\n\n`;

  deposits.forEach((dep, idx) => {
    message += `${idx + 1}. <b>${dep.first_name}</b> (@${dep.username})\n`;
    message += `   Kode: <code>${dep.code}</code>\n`;
    message += `   Jumlah: <b>Rp${Number(dep.amount).toLocaleString("id-ID")}</b>\n`;
    message += `   Waktu: ${new Date(dep.created_at * 1000).toLocaleString("id-ID")}\n\n`;
  });

  message += "Gunakan: <code>/confirm DEP-CODE</code> untuk konfirmasi\n";
  message += "Gunakan: <code>/cancel DEP-CODE</code> untuk batalkan";

  await sendTelegramMessage(
    token,
    chatId,
    message
  );
}

async function handleConfirmDeposit(env, chatId, token, code) {
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode) {
    const message = "❌ Format: <code>/confirm DEP-CODE</code>";

    await sendTelegramMessage(
      token,
      chatId,
      message
    );

    return;
  }

  try {
    const deposit = await env.DB
      .prepare(
        `
          SELECT
            id,
            user_id,
            code,
            amount,
            status
          FROM deposits
          WHERE code = ?
          LIMIT 1
        `
      )
      .bind(cleanCode)
      .first();

    if (!deposit) {
      const message = `❌ Deposit dengan kode <code>${cleanCode}</code> tidak ditemukan.`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    if (deposit.status !== "PENDING") {
      const message = `❌ Deposit <code>${cleanCode}</code> sudah ${deposit.status === "PAID" ? "dikonfirmasi" : "dibatalkan"}.`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    const result = await confirmDepositByCode(
      env,
      cleanCode
    );

    if (!result.success) {
      const message = `❌ Gagal konfirmasi deposit: ${result.error}`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    const amount = Number(deposit.amount || 0);
    const message = `✅ <b>Deposit Dikonfirmasi</b>\n\n` +
      `Kode: <code>${cleanCode}</code>\n` +
      `Jumlah: <b>Rp${amount.toLocaleString("id-ID")}</b>\n` +
      `Status: PAID`;

    await sendTelegramMessage(
      token,
      chatId,
      message
    );
  } catch (error) {
    console.error(
      "[CONFIRM DEPOSIT ERROR]",
      error
    );

    const message = "❌ Terjadi kesalahan saat mengkonfirmasi deposit.";

    await sendTelegramMessage(
      token,
      chatId,
      message
    );
  }
}

async function handleCancelDeposit(env, chatId, token, code) {
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode) {
    const message = "❌ Format: <code>/cancel DEP-CODE</code>";

    await sendTelegramMessage(
      token,
      chatId,
      message
    );

    return;
  }

  try {
    const deposit = await env.DB
      .prepare(
        `
          SELECT
            id,
            user_id,
            code,
            amount,
            status
          FROM deposits
          WHERE code = ?
          LIMIT 1
        `
      )
      .bind(cleanCode)
      .first();

    if (!deposit) {
      const message = `❌ Deposit dengan kode <code>${cleanCode}</code> tidak ditemukan.`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    if (deposit.status !== "PENDING") {
      const message = `❌ Deposit <code>${cleanCode}</code> tidak bisa dibatalkan (status: ${deposit.status}).`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    const result = await cancelDepositByCode(
      env,
      cleanCode
    );

    if (!result.success) {
      const message = `❌ Gagal batalkan deposit: ${result.error}`;

      await sendTelegramMessage(
        token,
        chatId,
        message
      );

      return;
    }

    const message = `✅ <b>Deposit Dibatalkan</b>\n\n` +
      `Kode: <code>${cleanCode}</code>\n` +
      `Status: CANCELLED`;

    await sendTelegramMessage(
      token,
      chatId,
      message
    );
  } catch (error) {
    console.error(
      "[CANCEL DEPOSIT ERROR]",
      error
    );

    const message = "❌ Terjadi kesalahan saat membatalkan deposit.";

    await sendTelegramMessage(
      token,
      chatId,
      message
    );
  }
}

async function handleHelp(chatId, token) {
  const message = `🤖 <b>NexusBase Admin Bot</b>\n\n` +
    `<b>Perintah Tersedia:</b>\n` +
    `/pending - Lihat deposit menunggu\n` +
    `/confirm DEP-CODE - Konfirmasi deposit\n` +
    `/cancel DEP-CODE - Batalkan deposit\n` +
    `/help - Tampilkan bantuan\n\n` +
    `<b>Catatan:</b>\n` +
    `Gunakan kode deposit (contoh: DEP-1234567) untuk perintah confirm/cancel`;

  await sendTelegramMessage(
    token,
    chatId,
    message
  );
}

export async function handleTelegramWebhook(
  request,
  env
) {
  try {
    const config = await getTelegramConfig(env);

    if (!config.token || !config.chatId) {
      return jsonResponse({
        ok: true
      });
    }

    const update = await validateTelegramUpdate(
      request,
      env
    );

    if (!update) {
      return jsonResponse({
        ok: true
      });
    }

    const commandMatch = update.text.match(
      /^\/(\w+)(?:\s+(.+))?$/
    );

    if (!commandMatch) {
      return jsonResponse({
        ok: true
      });
    }

    const command = commandMatch[1].toLowerCase();
    const argument = commandMatch[2] || "";

    switch (command) {
      case "start":
      case "help":
        await handleHelp(
          update.chatId,
          config.token
        );

        break;

      case "pending":
        await handlePendingDeposits(
          env,
          update.chatId,
          config.token
        );

        break;

      case "confirm":
        await handleConfirmDeposit(
          env,
          update.chatId,
          config.token,
          argument
        );

        break;

      case "cancel":
        await handleCancelDeposit(
          env,
          update.chatId,
          config.token,
          argument
        );

        break;

      default:
        await sendTelegramMessage(
          config.token,
          update.chatId,
          `❓ Perintah <code>/${command}</code> tidak dikenal. Gunakan <code>/help</code> untuk bantuan.`
        );

        break;
    }

    return jsonResponse({
      ok: true
    });
  } catch (error) {
    console.error(
      "[TELEGRAM WEBHOOK ERROR]",
      error
    );

    return jsonResponse({
      ok: true
    });
  }
}

export default {
  handleTelegramWebhook,
  getTelegramConfig,
  sendTelegramMessage,
  getPendingDeposits
};
