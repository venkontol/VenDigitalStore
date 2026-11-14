// /start: pendaftaran pengguna baru, pengecekan pengguna lama, lalu gerbang membership dan menu utama.
import { batch, first, run, stmt, now } from '../shared/db.js';
import { mainMenuKeyboard } from '../bot/keyboard.js';
import { escapeHtml } from '../shared/telegram.js';
import * as membership from './membership.js';
import { isOwner } from '../owner/router.js';

// Dipanggil di setiap update. Membuat user dan dompet saldo (0) jika belum ada.
export async function getOrCreateUser(ctx, from) {
  const id = String(from.id);
  const t = now();
  await batch(ctx.db, [
    stmt(
      ctx.db,
      `INSERT INTO users (telegram_id, username, first_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         updated_at = excluded.updated_at`,
      [id, from.username ?? null, String(from.first_name ?? '').slice(0, 64), t, t],
    ),
    stmt(ctx.db, 'INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)', [id, t]),
  ]);
  return first(ctx.db, 'SELECT * FROM users WHERE telegram_id = ?', [id]);
}

export async function handleStart(ctx, chatId, user) {
  await run(ctx.db, 'UPDATE users SET state = NULL, state_payload = NULL WHERE telegram_id = ?', [user.telegram_id]);

  const name = escapeHtml(user.first_name || 'Pengguna');
  await ctx.tg.sendMessage(
    chatId,
    `👋 Selamat datang di <b>NexusBase</b>, ${name}!\nBot auto order nomor virtual untuk verifikasi SMS.`,
  );

  const joined = await membership.ensureMember(ctx, user, chatId);
  if (joined) return showMainMenu(ctx, chatId, user);
}

export async function showMainMenu(ctx, chatId, user) {
  return ctx.tg.sendMessage(chatId, '📋 <b>Menu Utama</b>\nPilih menu di bawah.', {
    reply_markup: mainMenuKeyboard(isOwner(ctx.config, user.telegram_id)),
  });
}

