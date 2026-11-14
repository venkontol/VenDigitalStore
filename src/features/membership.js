// Wajib join channel sebelum memakai bot. Status dicek lewat getChatMember (bot harus admin channel).
// Hasil verifikasi di-cache 6 jam di users.channel_verified_at agar tidak memanggil Telegram di setiap pesan.
import { run, now } from '../shared/db.js';
import { membershipKeyboard } from '../bot/keyboard.js';
import { escapeHtml } from '../shared/telegram.js';

const VERIFY_TTL_MS = 6 * 60 * 60 * 1000;
const JOINED_STATUSES = new Set(['creator', 'administrator', 'member']);

export async function isChannelMember(ctx, telegramId) {
  const member = await ctx.tg.getChatMember(ctx.config.requiredChannel, Number(telegramId));
  return JOINED_STATUSES.has(member.status) || (member.status === 'restricted' && member.is_member === true);
}

async function markVerified(db, telegramId, verified) {
  await run(db, 'UPDATE users SET channel_verified_at = ?, updated_at = ? WHERE telegram_id = ?', [
    verified ? now() : null,
    now(),
    String(telegramId),
  ]);
}

export async function sendGate(ctx, chatId, note = '') {
  const channel = ctx.config.requiredChannel;
  const text = [
    '🔒 <b>Akses terkunci</b>',
    `Untuk memakai NexusBase, bergabunglah dulu ke channel <b>${escapeHtml(channel)}</b>, lalu tekan tombol verifikasi.`,
    note ? `\n${escapeHtml(note)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return ctx.tg.sendMessage(chatId, text, { reply_markup: membershipKeyboard(channel) });
}

// Dipanggil sebelum setiap fitur. Mengembalikan true jika pengguna boleh lanjut.
export async function ensureMember(ctx, user, chatId) {
  if (user.channel_verified_at && now() - Number(user.channel_verified_at) < VERIFY_TTL_MS) {
    return true;
  }

  let joined;
  try {
    joined = await isChannelMember(ctx, user.telegram_id);
  } catch (err) {
    console.error('Cek membership gagal:', err.message);
    await sendGate(ctx, chatId, 'Keanggotaan belum dapat diperiksa. Coba lagi beberapa saat.');
    return false;
  }

  await markVerified(ctx.db, user.telegram_id, joined);
  if (!joined) {
    await sendGate(ctx, chatId);
    return false;
  }
  user.channel_verified_at = now();
  return true;
}

// Tombol "Saya sudah bergabung". Selalu cek ulang ke Telegram (tanpa cache).
export async function handleVerify(ctx, chatId, user) {
  let joined;
  try {
    joined = await isChannelMember(ctx, user.telegram_id);
  } catch (err) {
    console.error('Verifikasi membership gagal:', err.message);
    await ctx.tg.sendMessage(chatId, 'Verifikasi belum dapat diproses. Coba lagi beberapa saat.');
    return false;
  }

  await markVerified(ctx.db, user.telegram_id, joined);
  if (!joined) {
    await ctx.tg.sendMessage(chatId, '❌ Anda belum terdeteksi bergabung. Pastikan sudah join channel, lalu tekan verifikasi lagi.', {
      reply_markup: membershipKeyboard(ctx.config.requiredChannel),
    });
    return false;
  }
  return true;
}
