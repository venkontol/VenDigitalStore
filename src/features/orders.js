// Riwayat dan detail pesanan NOKOS. Hanya membaca database. Aksi provider (cek SMS, selesai, batal)
// ada di nokos.js. File ini juga menyediakan renderOrderDetail() yang dipakai nokos.js.
import { all, first } from '../shared/db.js';
import { backRow, inline } from '../bot/keyboard.js';
import { escapeHtml, formatIDR } from '../shared/telegram.js';

const PAGE_SIZE = 5;
const IN_FLIGHT = ['PROCESSING', 'UNCERTAIN'];
const ACTIVE = ['ACTIVE', 'OTP_RECEIVED'];

export const STATUS_LABEL = {
  PROCESSING: '⏳ Diproses',
  UNCERTAIN: '⚠️ Perlu dicek ulang',
  FAILED: '❌ Gagal',
  ACTIVE: '🟢 Menunggu SMS',
  OTP_RECEIVED: '✅ SMS diterima',
  COMPLETED: '🏁 Selesai',
  CANCELED: '🚫 Dibatalkan',
  EXPIRED: '⌛ Kedaluwarsa',
  NEEDS_REVIEW: '🛠 Menunggu tinjauan owner',
};

function orderKeyboard(order) {
  const rows = [];
  if (ACTIVE.includes(order.status)) {
    rows.push([
      { text: '🔄 Cek SMS', callback_data: `nk:chk:${order.id}` },
      { text: '✅ Selesai', callback_data: `nk:fin:${order.id}` },
    ]);
    rows.push([{ text: '🚫 Batalkan', callback_data: `nk:cnl:${order.id}` }]);
  } else if (IN_FLIGHT.includes(order.status)) {
    rows.push([{ text: '🔁 Lanjutkan', callback_data: `nk:res:${order.id}` }]);
  }
  rows.push(backRow('od:l:1', '⬅️ Riwayat'));
  return inline(rows);
}

export function renderOrderDetail(order) {
  const lines = [
    `<b>Pesanan #${order.id}</b>`,
    `Status: ${STATUS_LABEL[order.status] ?? escapeHtml(order.status)}`,
    `Layanan: ${escapeHtml(order.product_name ?? '-')}`,
    order.operator_name ? `Operator: ${escapeHtml(order.operator_name)}` : null,
    `Harga: ${formatIDR(order.sell_price)}`,
    order.phone_number ? `Nomor: <code>${escapeHtml(order.phone_number)}</code>` : null,
    order.otp_code ? `Kode SMS: <code>${escapeHtml(order.otp_code)}</code>` : null,
    !order.otp_code && order.otp_message ? `Pesan SMS: ${escapeHtml(order.otp_message)}` : null,
    order.expires_at ? `Berlaku sampai: ${escapeHtml(order.expires_at)}` : null,
    order.failed_reason && ['FAILED', 'UNCERTAIN', 'NEEDS_REVIEW'].includes(order.status)
      ? `Keterangan: ${escapeHtml(order.failed_reason)}`
      : null,
  ].filter(Boolean);
  return { text: lines.join('\n'), keyboard: orderKeyboard(order) };
}

export async function showList(ctx, chatId, user, page = 1) {
  const rows = await all(
    ctx.db,
    `SELECT id, status, sell_price FROM nokos_orders
     WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [String(user.telegram_id), PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
  );
  const items = rows.slice(0, PAGE_SIZE);
  if (items.length === 0) {
    return page === 1
      ? ctx.tg.sendMessage(chatId, 'Belum ada pesanan.')
      : ctx.tg.sendMessage(chatId, 'Tidak ada pesanan di halaman ini.');
  }

  const text = [
    '📦 <b>Riwayat Pesanan</b>',
    ...items.map((o) => `#${o.id} • ${STATUS_LABEL[o.status] ?? o.status} • ${formatIDR(o.sell_price)}`),
  ].join('\n');

  const buttons = items.map((o) => [{ text: `Lihat #${o.id}`, callback_data: `od:v:${o.id}` }]);
  const nav = [];
  if (page > 1) nav.push({ text: '⬅️ Sebelumnya', callback_data: `od:l:${page - 1}` });
  if (rows.length > PAGE_SIZE) nav.push({ text: 'Berikutnya ➡️', callback_data: `od:l:${page + 1}` });
  if (nav.length) buttons.push(nav);

  return ctx.tg.sendMessage(chatId, text, { reply_markup: inline(buttons) });
}

export async function showDetail(ctx, chatId, user, orderId) {
  const order = await first(ctx.db, 'SELECT * FROM nokos_orders WHERE id = ? AND user_id = ?', [
    orderId,
    String(user.telegram_id),
  ]);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  const view = renderOrderDetail(order);
  return ctx.tg.sendMessage(chatId, view.text, { reply_markup: view.keyboard });
}

export async function handleCallback(ctx, cq, user) {
  const chatId = cq.message.chat.id;
  const [, action, arg] = String(cq.data).split(':');
  if (!/^\d{1,12}$/.test(arg ?? '')) return;
  const value = Number(arg);
  if (action === 'l') return showList(ctx, chatId, user, Math.max(1, value));
  if (action === 'v') return showDetail(ctx, chatId, user, value);
}
