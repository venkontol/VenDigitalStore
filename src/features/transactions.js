// Riwayat perubahan saldo (buku besar). Hanya membaca database.
import { all } from '../shared/db.js';
import { inline } from '../bot/keyboard.js';
import { escapeHtml, formatIDR } from '../shared/telegram.js';

const PAGE_SIZE = 10;

const TYPE_LABEL = {
  DEPOSIT: 'Deposit disetujui',
  NOKOS_PURCHASE: 'Pembelian NOKOS',
  REFUND: 'Refund NOKOS',
};

function formatDate(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export async function showList(ctx, chatId, user, page = 1) {
  const rows = await all(
    ctx.db,
    `SELECT id, type, amount, balance_after, created_at FROM transactions
     WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [String(user.telegram_id), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
  );
  const items = rows.slice(0, PAGE_SIZE);
  if (items.length === 0) {
    return ctx.tg.sendMessage(chatId, page === 1 ? 'Belum ada transaksi.' : 'Tidak ada transaksi di halaman ini.');
  }

  const lines = items.map((t) => {
    const sign = Number(t.amount) > 0 ? '+' : '-';
    return [
      `<b>${escapeHtml(TYPE_LABEL[t.type] ?? t.type)}</b>`,
      `${formatDate(t.created_at)}`,
      `${sign}${formatIDR(Math.abs(Number(t.amount)))} • Saldo: ${formatIDR(t.balance_after)}`,
    ].join('\n');
  });

  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Sebelumnya', callback_data: `tx:p:${page - 1}` });
  if (rows.length > PAGE_SIZE) nav.push({ text: 'Berikutnya ➡️', callback_data: `tx:p:${page + 1}` });

  return ctx.tg.sendMessage(chatId, `🧾 <b>Riwayat Transaksi</b>\n\n${lines.join('\n\n')}`, {
    reply_markup: nav.length ? inline([nav]) : undefined,
  });
}

export async function handleCallback(ctx, cq, user) {
  const [, action, arg] = String(cq.data).split(':');
  if (action !== 'p' || !/^\d{1,6}$/.test(arg ?? '')) return;
  return showList(ctx, cq.message.chat.id, user, Math.max(1, Number(arg)));
}
