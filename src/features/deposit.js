// Deposit: QRIS statis + konfirmasi manual owner.
// PENTING: QRIS statis tidak memberi tahu nominal yang dibayar. Owner wajib mencocokkan mutasi
// secara manual sebelum menyetujui. Tidak ada deteksi pembayaran otomatis di sistem ini.
import { batch, first, run, stmt, now, setState, clearState, USER_STATE } from '../shared/db.js';
import { ledgerStatements, getBalance } from './wallet.js';
import { inline } from '../bot/keyboard.js';
import { escapeHtml, formatIDR, notifyOwners } from '../shared/telegram.js';

const MAX_DEPOSIT_IDR = 10_000_000;

function qrisSource(env) {
  return env.DEPOSIT_QRIS_FILE_ID || env.DEPOSIT_QRIS_URL || null;
}

export async function promptAmount(ctx, chatId, user) {
  if (!qrisSource(ctx.env)) {
    return ctx.tg.sendMessage(chatId, 'Deposit belum tersedia karena QRIS belum dikonfigurasi. Hubungi owner.');
  }
  const pending = await first(
    ctx.db,
    `SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'PENDING' LIMIT 1`,
    [String(user.telegram_id)],
  );
  if (pending) {
    return ctx.tg.sendMessage(chatId, `Anda masih punya deposit #${pending.id} yang menunggu konfirmasi owner.`);
  }
  await setState(ctx.db, user.telegram_id, USER_STATE.DEPOSIT_AMOUNT);
  return ctx.tg.sendMessage(
    chatId,
    `💳 <b>Deposit</b>\nKetik nominal deposit (angka saja), minimal ${formatIDR(ctx.config.depositMinIdr)}.\nKetik /batal untuk membatalkan.`,
  );
}

export async function handleAmountInput(ctx, chatId, user, text) {
  const digits = text.replace(/[.,\s]/g, '');
  if (!/^\d{1,9}$/.test(digits)) {
    return ctx.tg.sendMessage(chatId, 'Masukkan nominal berupa angka, contoh: 50000. Ketik /batal untuk membatalkan.');
  }
  const amount = Number(digits);
  const min = ctx.config.depositMinIdr;
  if (amount < min || amount > MAX_DEPOSIT_IDR) {
    return ctx.tg.sendMessage(
      chatId,
      `Nominal harus antara ${formatIDR(min)} dan ${formatIDR(MAX_DEPOSIT_IDR)}.`,
    );
  }

  const qris = qrisSource(ctx.env);
  if (!qris) {
    await clearState(ctx.db, user.telegram_id);
    return ctx.tg.sendMessage(chatId, 'Deposit belum tersedia karena QRIS belum dikonfigurasi. Hubungi owner.');
  }

  const pending = await first(
    ctx.db,
    `SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'PENDING' LIMIT 1`,
    [String(user.telegram_id)],
  );
  if (pending) {
    await clearState(ctx.db, user.telegram_id);
    return ctx.tg.sendMessage(chatId, `Anda masih punya deposit #${pending.id} yang menunggu konfirmasi owner.`);
  }

  const t = now();
  const res = await run(
    ctx.db,
    `INSERT INTO deposit_requests (user_id, amount, status, created_at) VALUES (?, ?, 'PENDING', ?)`,
    [String(user.telegram_id), amount, t],
  );
  const depositId = res.meta.last_row_id;
  await clearState(ctx.db, user.telegram_id);

  const caption =
    `Silakan scan QRIS berikut dan bayar <b>tepat ${formatIDR(amount)}</b>.\n` +
    `Setelah bayar, tunggu owner mengonfirmasi. Nomor permintaan: #${depositId}.`;
  try {
    if (ctx.env.DEPOSIT_QRIS_FILE_ID || ctx.env.DEPOSIT_QRIS_URL) {
      await ctx.tg.sendPhoto(chatId, qris, caption);
    } else {
      await ctx.tg.sendMessage(chatId, caption);
    }
  } catch (err) {
    console.error('Gagal kirim QRIS:', err.message);
    await ctx.tg.sendMessage(chatId, caption.replace('scan QRIS berikut', 'hubungi owner untuk QRIS'));
  }

  const who = `${escapeHtml(user.first_name || '-')}${user.username ? ` (@${escapeHtml(user.username)})` : ''}`;
  await notifyOwners(
    ctx.tg,
    ctx.config.ownerIds,
    `💳 <b>Permintaan deposit #${depositId}</b>\nUser: ${who} • ID ${user.telegram_id}\nNominal: <b>${formatIDR(amount)}</b>\n\nCek mutasi QRIS, lalu setujui atau tolak.`,
    {
      reply_markup: inline([
        [
          { text: '✅ Setujui', callback_data: `ow:da:${depositId}` },
          { text: '❌ Tolak', callback_data: `ow:dr:${depositId}` },
        ],
      ]),
    },
  );
}

export function approveDeposit(ctx, depositId, ownerId) {
  return decide(ctx, depositId, ownerId, 'APPROVED');
}

export function rejectDeposit(ctx, depositId, ownerId) {
  return decide(ctx, depositId, ownerId, 'REJECTED');
}

// Keputusan owner. Transisi status dijaga oleh "WHERE status = 'PENDING'" dan changes().
// Deposit yang sudah diputuskan tidak akan menambah saldo dua kali.
async function decide(ctx, depositId, ownerId, decision) {
  const { db, tg } = ctx;
  const dep = await first(db, 'SELECT id, user_id, amount, status FROM deposit_requests WHERE id = ?', [depositId]);
  if (!dep) return { ok: false, text: 'Deposit tidak ditemukan.' };
  if (dep.status !== 'PENDING') return { ok: false, text: `Deposit #${dep.id} sudah berstatus ${dep.status}.` };

  const t = now();
  const decideStmt = stmt(
    db,
    `UPDATE deposit_requests SET status = ?, decided_by = ?, decided_at = ?
     WHERE id = ? AND status = 'PENDING'`,
    [decision, String(ownerId), t, dep.id],
  );

  if (decision === 'REJECTED') {
    const res = await decideStmt.run();
    if (res.meta.changes !== 1) return { ok: false, text: 'Deposit sudah diproses orang lain.' };
    await tg.sendMessage(Number(dep.user_id), `❌ Deposit ${formatIDR(dep.amount)} ditolak owner. Hubungi owner jika ada pertanyaan.`).catch(() => {});
    return { ok: true, text: `❌ Deposit #${dep.id} ditolak.` };
  }

  let results;
  try {
    results = await batch(db, [
      decideStmt,
      ...ledgerStatements(db, {
        userId: dep.user_id,
        delta: dep.amount,
        type: 'DEPOSIT',
        refType: 'deposit_request',
        refId: dep.id,
        note: 'Deposit disetujui owner',
        now: t,
      }),
    ]);
  } catch (err) {
    console.error('Setujui deposit gagal:', dep.id, err.message);
    return { ok: false, text: `Gagal menyetujui deposit #${dep.id}. Cek data pada database.` };
  }

  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1 || results[2].meta.changes !== 1) {
    return { ok: false, text: `Deposit #${dep.id} tidak tercatat dengan benar. Cek ulang.` };
  }

  const balance = await getBalance(db, dep.user_id);
  await tg.sendMessage(
    Number(dep.user_id),
    `✅ Deposit ${formatIDR(dep.amount)} disetujui.\nSaldo Anda sekarang: ${formatIDR(balance)}`,
  ).catch(() => {});
  return { ok: true, text: `✅ Deposit #${dep.id} ${formatIDR(dep.amount)} disetujui.` };
}
