export async function handleTelegramWebhook(request, env) {
  const update = await request.json();
  const message = update.message;

  if (!message || !message.text) return new Response("OK");

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Validasi jika pengirim adalah Owner/Admin
  if (chatId.toString() !== env.TELEGRAM_OWNER_ID) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Handle Command /pay CODE
  if (text.startsWith("/pay ")) {
    const code = text.split(" ")[1]?.toUpperCase();
    if (!code || code.length !== 4) {
      await sendTelegram(env, chatId, "❌ Format salah. Gunakan: /pay <CODE>");
      return new Response("OK");
    }

    // Ambil Data Deposit
    const deposit = await env.DB.prepare(
      "SELECT * FROM deposits WHERE code = ? AND status = 'PENDING'"
    ).bind(code).first();

    if (!deposit) {
      await sendTelegram(env, chatId, "❌ Kode deposit tidak ditemukan atau sudah diproses.");
      return new Response("OK");
    }

    // Cek Apakah Expired
    if (new Date(deposit.expires_at) < new Date()) {
      await env.DB.prepare("UPDATE deposits SET status = 'EXPIRED' WHERE id = ?").bind(deposit.id).run();
      await sendTelegram(env, chatId, "⚠️ Deposit sudah kedaluwarsa.");
      return new Response("OK");
    }

    const reference = `DEPOSIT:${code}`;

    // Atomically Update Balance & Mark as Paid (Idempotent Transaction)
    try {
      await env.DB.batch([
        // 1. Insert Reference Transaksi (Fail otomatis jika reference terduplikasi)
        env.DB.prepare(
          "INSERT INTO wallet_transactions (user_id, amount, type, reference) VALUES (?, ?, 'DEPOSIT', ?)"
        ).bind(deposit.user_id, deposit.amount, reference),

        // 2. Tambah Saldo User
        env.DB.prepare(
          "UPDATE users SET balance = balance + ? WHERE id = ?"
        ).bind(deposit.amount, deposit.user_id),

        // 3. Ubah Status Deposit
        env.DB.prepare(
          "UPDATE deposits SET status = 'PAID' WHERE id = ?"
        ).bind(deposit.id)
      ]);

      await sendTelegram(env, chatId, `✅ **PEMBAYARAN SUKSES**\n\nCode: \`${code}\` \nAmount: Rp${deposit.amount.toLocaleString("id-ID")}`);
    } catch (err) {
      await sendTelegram(env, chatId, `❌ Gagal memproses transaksi: ${err.message}`);
    }
  }

  // Handle Command /setqr (Owner mengirim gambar QRIS)
  if (message.photo && message.caption === "/setqr") {
    const fileId = message.photo[message.photo.length - 1].file_id;
    await env.SETTINGS_KV.put("QRIS_FILE_ID", fileId);
    await sendTelegram(env, chatId, "✅ QRIS berhasil diperbarui.");
  }

  return new Response("OK");
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}
