// Fitur owner. Akses diverifikasi dari OWNER_TELEGRAM_IDS (environment variable) pada SETIAP aksi.
// Pengguna biasa yang mengirim callback atau perintah owner tidak mendapat data apa pun.
import { all, first, run, now, clearState, setState, USER_STATE } from '../shared/db.js';
import { inline } from '../bot/keyboard.js';
import { escapeHtml, formatIDR } from '../shared/telegram.js';
import * as deposit from '../features/deposit.js';

const MAX_MARKUP_PERCENT = 300;

export function isOwner(config, telegramId) {
  return config.ownerIds.includes(String(telegramId));
}

function parseId(value) {
  return /^\d{1,12}$/.test(value ?? '') ? Number(value) : null;
}

export async function showPanel(ctx, chatId, user) {
  if (!isOwner(ctx.config, user.telegram_id)) {
    return ctx.tg.sendMessage(chatId, 'Perintah tidak dikenal. Gunakan menu di bawah.');
  }
  return ctx.tg.sendMessage(chatId, '👑 <b>Panel Owner</b>', {
    reply_markup: inline([
      [{ text: '📊 Statistik', callback_data: 'ow:st' }],
      [{ text: '💳 Deposit menunggu', callback_data: 'ow:dl' }],
      [{ text: '🛠 Pesanan perlu ditinjau', callback_data: 'ow:rv' }],
      [{ text: '💹 Atur markup NOKOS', callback_data: 'ow:mk' }],
    ]),
  });
}

async function showStats(ctx, chatId) {
  const db = ctx.db;
  const users = await first(db, 'SELECT COUNT(*) AS c FROM users');
  const wallets = await first(db, 'SELECT COALESCE(SUM(balance), 0) AS s FROM wallets');
  const pending = await first(
    db,
    `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM deposit_requests WHERE status = 'PENDING'`,
  );
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const sales = await first(
    db,
    `SELECT COUNT(*) AS c, COALESCE(-SUM(amount), 0) AS s FROM transactions
     WHERE type = 'NOKOS_PURCHASE' AND created_at >= ?`,
    [startOfDay.getTime()],
  );
  const byStatus = await all(db, 'SELECT status, COUNT(*) AS c FROM nokos_orders GROUP BY status');
  const markupRow = await first(db, `SELECT value FROM settings WHERE key = 'nokos_markup_percent'`);

  const statusLines = byStatus.length
    ? byStatus.map((r) => `• ${escapeHtml(r.status)}: ${r.c}`).join('\n')
    : '• belum ada order';

  const text = [
    '📊 <b>Statistik</b>',
    `User terdaftar: ${users?.c ?? 0}`,
    `Total saldo user: ${formatIDR(wallets?.s ?? 0)}`,
    `Deposit menunggu: ${pending?.c ?? 0} (${formatIDR(pending?.s ?? 0)})`,
    `Pembelian NOKOS hari ini (UTC): ${sales?.c ?? 0} transaksi, ${formatIDR(sales?.s ?? 0)}`,
    `Markup NOKOS: ${markupRow?.value ?? '0'}%`,
    '',
    '<b>Order per status</b>',
    statusLines,
  ].join('\n');

  return ctx.tg.sendMessage(chatId, text);
}

async function showPendingDeposits(ctx, chatId) {
  const rows = await all(
    ctx.db,
    `SELECT d.id, d.user_id, d.amount, u.username, u.first_name
     FROM deposit_requests d LEFT JOIN users u ON u.telegram_id = d.user_id
     WHERE d.status = 'PENDING' ORDER BY d.id ASC LIMIT 10`,
  );
  if (rows.length === 0) return ctx.tg.sendMessage(chatId, 'Tidak ada deposit yang menunggu.');

  for (const d of rows) {
    const who = `${escapeHtml(d.first_name || '-')}${d.username ? ` (@${escapeHtml(d.username)})` : ''}`;
    await ctx.tg.sendMessage(chatId, `💳 <b>Deposit #${d.id}</b>\nUser: ${who} • ID ${d.user_id}\nNominal: <b>${formatIDR(d.amount)}</b>`, {
      reply_markup: inline([
        [
          { text: '✅ Setujui', callback_data: `ow:da:${d.id}` },
          { text: '❌ Tolak', callback_data: `ow:dr:${d.id}` },
        ],
      ]),
    });
  }
}

async function showReview(ctx, chatId) {
  const rows = await all(
    ctx.db,
    `SELECT id, user_id, sell_price, failed_reason, provider_order_id FROM nokos_orders
     WHERE status = 'NEEDS_REVIEW' ORDER BY id DESC LIMIT 20`,
  );
  if (rows.length === 0) return ctx.tg.sendMessage(chatId, 'Tidak ada pesanan yang perlu ditinjau.');
  const lines = rows.map(
    (r) =>
      `• #${r.id} • user ${r.user_id} • ${formatIDR(r.sell_price)} • ${escapeHtml(r.failed_reason ?? '-')} • provider ${r.provider_order_id ?? '-'}`,
  );
  return ctx.tg.sendMessage(chatId, `🛠 <b>Perlu ditinjau</b>\n${lines.join('\n')}`);
}

async function askMarkup(ctx, chatId, user) {
  await setState(ctx.db, user.telegram_id, USER_STATE.OWNER_MARKUP);
  return ctx.tg.sendMessage(
    chatId,
    `Ketik markup NOKOS dalam persen (0–${MAX_MARKUP_PERCENT}), contoh <b>10</b> untuk +10%.\nKetik /batal untuk membatalkan.`,
  );
}

export async function handleMarkupInput(ctx, chatId, user, text) {
  if (!isOwner(ctx.config, user.telegram_id)) {
    await clearState(ctx.db, user.telegram_id);
    return;
  }
  if (!/^\d{1,3}$/.test(text) || Number(text) > MAX_MARKUP_PERCENT) {
    return ctx.tg.sendMessage(chatId, `Masukkan angka 0–${MAX_MARKUP_PERCENT}. Ketik /batal untuk membatalkan.`);
  }
  const pct = Number(text);
  await run(
    ctx.db,
    `INSERT INTO settings (key, value, updated_at) VALUES ('nokos_markup_percent', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [String(pct), now()],
  );
  await clearState(ctx.db, user.telegram_id);
  return ctx.tg.sendMessage(chatId, `✅ Markup NOKOS diatur ke ${pct}%. Berlaku untuk harga yang ditampilkan berikutnya.`);
}

export async function handleCallback(ctx, cq, user) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;

  if (!isOwner(ctx.config, user.telegram_id)) {
    return ctx.tg.sendMessage(chatId, 'Akses ditolak.');
  }

  const [, action, rawId] = String(cq.data).split(':');
  switch (action) {
    case 'st':
      return showStats(ctx, chatId);
    case 'dl':
      return showPendingDeposits(ctx, chatId);
    case 'rv':
      return showReview(ctx, chatId);
    case 'mk':
      return askMarkup(ctx, chatId, user);
    case 'da':
    case 'dr': {
      const id = parseId(rawId);
      if (!id) return;
      const result =
        action === 'da'
          ? await deposit.approveDeposit(ctx, id, user.telegram_id)
          : await deposit.rejectDeposit(ctx, id, user.telegram_id);
      return ctx.tg.editOrSend(chatId, messageId, result.text, { reply_markup: inline([]) });
    }
    default:
      return;
  }
}
