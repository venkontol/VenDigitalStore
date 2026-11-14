// Saldo pengguna: tampilan saldo dan penulisan buku besar.
// ledgerStatements() adalah SATU-SATUNYA pintu perubahan saldo; dipakai nokos.js dan deposit.js.
import { first } from '../shared/db.js';
import { formatIDR } from '../shared/telegram.js';
import { inline } from '../bot/keyboard.js';

export async function getBalance(db, userId) {
  const row = await first(db, 'SELECT balance FROM wallets WHERE user_id = ?', [String(userId)]);
  return row ? Number(row.balance) : 0;
}

// Total harga order yang sedang diproses (belum dipotong, tetapi sudah dicadangkan).
export async function getHeld(db, userId) {
  const row = await first(
    db,
    `SELECT COALESCE(SUM(sell_price), 0) AS held FROM nokos_orders
     WHERE user_id = ? AND status IN ('PROCESSING','UNCERTAIN')`,
    [String(userId)],
  );
  return Number(row?.held ?? 0);
}

export async function getAvailable(db, userId) {
  const balance = await getBalance(db, userId);
  const held = await getHeld(db, userId);
  return balance - held;
}

// Dua statement untuk dimasukkan ke db.batch() SETELAH statement transisi status.
// Statement pertama (buku besar) hanya tercatat jika transisi status berhasil (changes() > 0).
// Statement kedua (saldo) hanya berubah jika buku besar tercatat. Duplikasi ditolak oleh
// UNIQUE(type, ref_type, ref_id), dan saldo negatif ditolak oleh CHECK (balance >= 0).
// Jika salah satu gagal, seluruh batch di-rollback.
export function ledgerStatements(db, { userId, delta, type, refType, refId, note, now: timestamp }) {
  const ledger = db
    .prepare(
      `INSERT INTO transactions (user_id, type, amount, balance_after, ref_type, ref_id, note, created_at)
       SELECT w.user_id, ?, ?, w.balance + ?, ?, ?, ?, ?
       FROM wallets w
       WHERE w.user_id = ? AND changes() > 0`,
    )
    .bind(type, delta, delta, refType, String(refId), note, timestamp, String(userId));

  const wallet = db
    .prepare(
      `UPDATE wallets SET balance = balance + ?, updated_at = ?
       WHERE user_id = ? AND changes() > 0`,
    )
    .bind(delta, timestamp, String(userId));

  return [ledger, wallet];
}

export async function showWallet(ctx, chatId, user) {
  const balance = await getBalance(ctx.db, user.telegram_id);
  const held = await getHeld(ctx.db, user.telegram_id);
  const text = [
    '💰 <b>Saldo Anda</b>',
    `Saldo: <b>${formatIDR(balance)}</b>`,
    `Ditahan (pesanan diproses): ${formatIDR(held)}`,
    `Tersedia: <b>${formatIDR(balance - held)}</b>`,
  ].join('\n');
  return ctx.tg.sendMessage(chatId, text, {
    reply_markup: inline([[{ text: '🔄 Refresh', callback_data: 'wl:r' }]]),
  });
}

export async function handleCallback(ctx, cq, user) {
  if (cq.data === 'wl:r') return showWallet(ctx, cq.message.chat.id, user);
}

