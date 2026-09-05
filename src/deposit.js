// Karakter aman tanpa huruf/angka membingungkan (O/0, I/1)
const CHAR_POOL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateDepositCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    const randomIndex = Math.floor(Math.random() * CHAR_POOL.length);
    code += CHAR_POOL[randomIndex];
  }
  return code;
}

// 1. Buat Permintaan Deposit
export async function createDeposit(request, env, userId) {
  const { amount } = await request.json();

  if (!amount || amount < 1000 || amount > 10000000) {
    return Response.json(
      { error: "Nominal deposit minimal Rp1.000 dan maksimal Rp10.000.000" },
      { status: 400 }
    );
  }

  // Generate kode unik 4 karakter
  let code = generateDepositCode();
  let isUnique = false;
  let attempts = 0;

  // Pastikan kode benar-benar unik di DB untuk transaksi pending
  while (!isUnique && attempts < 5) {
    const existing = await env.DB.prepare(
      "SELECT id FROM deposits WHERE code = ? AND status = 'PENDING'"
    ).bind(code).first();

    if (!existing) {
      isUnique = true;
    } else {
      code = generateDepositCode();
      attempts++;
    }
  }

  if (!isUnique) {
    return Response.json(
      { error: "Sistem sibuk, silakan coba beberapa saat lagi." },
      { status: 500 }
    );
  }

  // Masa berlaku 60 menit
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO deposits (user_id, code, amount, status, expires_at) VALUES (?, ?, ?, 'PENDING', ?)"
  ).bind(userId, code, amount, expiresAt).run();

  return Response.json({
    success: true,
    data: {
      code,
      amount,
      expires_at: expiresAt,
      status: "PENDING"
    }
  });
}

// 2. Notifikasi Cek Pembayaran Ke Telegram (Rate Limit 30 Detik)
export async function notifyCheckPayment(request, env, userId) {
  const { code } = await request.json();

  if (!code) {
    return Response.json({ error: "Kode deposit tidak valid" }, { status: 400 });
  }

  // Cek Cooldown menggunakan KV Storage (30 Detik)
  const rateLimitKey = `check_cooldown:${userId}`;
  const isCoolingDown = await env.SETTINGS_KV.get(rateLimitKey);

  if (isCoolingDown) {
    return Response.json(
      { error: "Silakan tunggu beberapa detik sebelum mencoba lagi." },
      { status: 429 }
    );
  }

  // Ambil Data Deposit & Username
  const depositData = await env.DB.prepare(
    `SELECT d.*, u.username 
     FROM deposits d 
     JOIN users u ON d.user_id = u.id 
     WHERE d.code = ? AND d.user_id = ?`
  ).bind(code, userId).first();

  if (!depositData) {
    return Response.json({ error: "Deposit tidak ditemukan" }, { status: 404 });
  }

  if (depositData.status !== "PENDING") {
    return Response.json({ error: `Deposit sudah berstatus ${depositData.status}` }, { status: 400 });
  }

  if (new Date(depositData.expires_at) < new Date()) {
    await env.DB.prepare("UPDATE deposits SET status = 'EXPIRED' WHERE id = ?").bind(depositData.id).run();
    return Response.json({ error: "Deposit sudah expired" }, { status: 400 });
  }

  // Set Cooldown KV selama 30 detik
  await env.SETTINGS_KV.put(rateLimitKey, "true", { expirationTtl: 30 });

  // Kirim Notifikasi Telegram ke Owner
  const message = `🚨 **DEPOSIT REQUEST**\n\n` +
                  `**CODE:** \`${depositData.code}\`\n` +
                  `**USERNAME:** ${depositData.username}\n` +
                  `**AMOUNT:** Rp${depositData.amount.toLocaleString("id-ID")}\n\n` +
                  `Gunakan \`/pay ${depositData.code}\` untuk menyetujui.`;

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_OWNER_ID,
      text: message,
      parse_mode: "Markdown"
    })
  });

  return Response.json({
    success: true,
    message: "Notifikasi pembayaran telah dikirim ke admin untuk diverifikasi."
  });
}

// 3. Proxy Gambar QRIS (Menyembunyikan Bot Token dari Browser)
export async function getQrisImage(env) {
  const fileId = await env.SETTINGS_KV.get("QRIS_FILE_ID");

  if (!fileId) {
    return new Response("QRIS belum diatur oleh admin", { status: 404 });
  }

  // Minta File Path dari Telegram API
  const telegramRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileData = await telegramRes.json();

  if (!fileData.ok) {
    return new Response("Gagal mengambil QRIS", { status: 500 });
  }

  const filePath = fileData.result.file_path;

  // Stream Langsung Gambar QRIS ke Client
  const imageStream = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );

  return new Response(imageStream.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
