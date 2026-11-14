// Pusat logika order NOKOS: katalog, harga final, pembelian, cek SMS, selesai, dan batal.
// Komunikasi provider hanya lewat providers/smscode.js. Pesan Telegram dikirim dari sini.
//
// ALUR PEMBELIAN AMAN
// 1. Saldo tersedia (saldo - order yang sedang diproses) dicek dan order dibuat PROCESSING
//    dalam SATU statement. Saldo BELUM dipotong pada tahap ini.
// 2. Provider dipanggil dengan idempotency key unik milik order.
// 3a. Provider pasti menolak  -> FAILED. Saldo tidak pernah dipotong.
// 3b. Respons ambigu (timeout/5xx) -> UNCERTAIN. Pengguna bisa "Lanjutkan": request dikirim ulang
//     dengan key yang sama, dan provider mencegah order ganda.
// 3c. Provider sukses -> saldo dipotong + buku besar dicatat dalam SATU batch atomik.
// 4. Batal: provider di-cancel dulu, lalu refund + buku besar dalam SATU batch atomik.

import * as smscode from '../providers/smscode.js';
import { ProviderError } from '../providers/smscode.js';
import { gridKeyboard, backRow } from '../bot/keyboard.js';
import { escapeHtml, formatIDR, notifyOwners } from '../shared/telegram.js';
import { first, run, batch, stmt, now } from '../shared/db.js';
import { ledgerStatements, getAvailable } from './wallet.js';
import { renderOrderDetail } from './orders.js';

const IN_FLIGHT = ['PROCESSING', 'UNCERTAIN'];
const ACTIVE = ['ACTIVE', 'OTP_RECEIVED'];
const MAX_COUNTRY_BUTTONS = 60;
const PRODUCT_LIMIT = 20;
const PRODUCT_LOOKUP_LIMIT = 1000;

// Status provider -> status lokal
const PROVIDER_STATUS = {
  ACTIVE: 'ACTIVE',
  OTP_RECEIVED: 'OTP_RECEIVED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
};

// Pesan ramah untuk pengguna. Detail teknis (termasuk saldo provider) tidak ditampilkan.
const PROVIDER_REASON_TEXT = {
  NO_OFFER_AVAILABLE: 'stok nomor habis',
  VALIDATION_ERROR: 'permintaan tidak valid',
  PROVIDER_ERROR: 'provider menolak pesanan',
};

// ---------- Harga ----------

async function getMarkupPercent(db) {
  const row = await first(db, `SELECT value FROM settings WHERE key = 'nokos_markup_percent'`);
  const pct = Number.parseInt(row?.value ?? '0', 10);
  return Number.isFinite(pct) && pct >= 0 ? pct : 0;
}

// Harga jual = harga provider + markup persen (dibulatkan ke atas, integer IDR).
export function applyMarkup(providerPrice, percent) {
  return providerPrice + Math.ceil((providerPrice * percent) / 100);
}

async function fetchProduct(ctx, countryId, platformId, productId) {
  const products = await smscode.listProducts(ctx.env, {
    countryId,
    platformId,
    limit: PRODUCT_LOOKUP_LIMIT,
  });
  const product = products.find((p) => p.id === productId);
  if (!product || !product.active || !(product.available > 0) || !(product.price > 0)) return null;
  return product;
}

// ---------- Katalog ----------

export async function showCountries(ctx, chatId) {
  const countries = (await smscode.listCountries(ctx.env)).filter((c) => c.active).slice(0, MAX_COUNTRY_BUTTONS);
  if (countries.length === 0) return ctx.tg.sendMessage(chatId, 'Katalog negara belum tersedia. Coba lagi nanti.');

  const buttons = countries.map((c) => ({
    text: `${c.emoji ?? ''} ${c.name}`.trim(),
    callback_data: `nk:c:${c.id}`,
  }));
  return ctx.tg.sendMessage(chatId, '🛒 <b>Beli NOKOS</b>\nPilih negara:', {
    reply_markup: gridKeyboard(buttons, 2),
  });
}

async function showServices(ctx, chatId, countryId) {
  const services = (await smscode.listServices(ctx.env, countryId)).filter((s) => s.active);
  if (services.length === 0) {
    return ctx.tg.sendMessage(chatId, 'Belum ada layanan tersedia untuk negara ini.', {
      reply_markup: gridKeyboard([], 2, [backRow('nk:h')]),
    });
  }
  const buttons = services.map((s) => ({ text: s.name, callback_data: `nk:s:${countryId}:${s.id}` }));
  return ctx.tg.sendMessage(chatId, '📱 Pilih layanan:', {
    reply_markup: gridKeyboard(buttons, 2, [backRow('nk:h')]),
  });
}

async function showProducts(ctx, chatId, countryId, platformId) {
  const pct = await getMarkupPercent(ctx.db);
  const products = (await smscode.listProducts(ctx.env, { countryId, platformId, limit: PRODUCT_LIMIT })).filter(
    (p) => p.active && p.available > 0 && p.price > 0,
  );
  if (products.length === 0) {
    return ctx.tg.sendMessage(chatId, 'Stok untuk layanan ini sedang habis.', {
      reply_markup: gridKeyboard([], 2, [backRow(`nk:c:${countryId}`)]),
    });
  }
  const buttons = products.map((p) => ({
    text: `${formatIDR(applyMarkup(p.price, pct))} • stok ${p.available}`,
    callback_data: `nk:p:${countryId}:${platformId}:${p.id}`,
  }));
  return ctx.tg.sendMessage(chatId, '💵 Pilih harga:', {
    reply_markup: gridKeyboard(buttons, 1, [backRow(`nk:c:${countryId}`)]),
  });
}

async function showConfirm(ctx, chatId, user, { countryId, platformId, productId }) {
  const product = await fetchProduct(ctx, countryId, platformId, productId);
  if (!product) {
    return ctx.tg.sendMessage(chatId, 'Nomor ini sudah tidak tersedia. Silakan pilih ulang.', {
      reply_markup: gridKeyboard([], 2, [backRow(`nk:s:${countryId}:${platformId}`)]),
    });
  }
  const sell = applyMarkup(product.price, await getMarkupPercent(ctx.db));
  const available = await getAvailable(ctx.db, user.telegram_id);

  const text = [
    '🧾 <b>Konfirmasi Pembelian</b>',
    `Layanan: ${escapeHtml(product.name ?? '-')}`,
    `Stok: ${product.available}`,
    `Harga: <b>${formatIDR(sell)}</b>`,
    `Saldo tersedia: ${formatIDR(available)}`,
  ].join('\n');

  return ctx.tg.sendMessage(chatId, text, {
    reply_markup: gridKeyboard(
      [{ text: '✅ Beli Sekarang', callback_data: `nk:b:${countryId}:${platformId}:${productId}:${sell}` }],
      1,
      [backRow(`nk:s:${countryId}:${platformId}`)],
    ),
  });
}

// ---------- Pembelian ----------

async function executePurchase(ctx, chatId, user, { countryId, platformId, productId, shownSell }) {
  const { db, tg } = ctx;
  const uid = String(user.telegram_id);

  const busy = await first(
    db,
    `SELECT id FROM nokos_orders WHERE user_id = ? AND status IN ('PROCESSING','UNCERTAIN') LIMIT 1`,
    [uid],
  );
  if (busy) {
    return tg.sendMessage(chatId, '⏳ Masih ada pesanan yang belum selesai diproses. Buka 📦 Pesanan untuk melanjutkannya.');
  }

  const product = await fetchProduct(ctx, countryId, platformId, productId);
  if (!product) return tg.sendMessage(chatId, 'Nomor ini sudah tidak tersedia. Silakan pilih ulang.');

  const sell = applyMarkup(product.price, await getMarkupPercent(db));
  if (sell !== shownSell) {
    return tg.sendMessage(chatId, '⚠️ Harga berubah. Silakan buka ulang konfirmasi pembelian.');
  }

  // Cek saldo dan simpan order dalam SATU statement. Saldo tidak disentuh di sini.
  const t = now();
  const idempotencyKey = `nk-${uid}-${crypto.randomUUID()}`;
  const insert = await run(
    db,
    `INSERT INTO nokos_orders
       (user_id, idempotency_key, provider, product_id, product_name, provider_price, sell_price, status, created_at, updated_at)
     SELECT ?, ?, 'smscode', ?, ?, ?, ?, 'PROCESSING', ?, ?
     WHERE COALESCE((SELECT balance FROM wallets WHERE user_id = ?), 0)
           - (SELECT COALESCE(SUM(sell_price), 0) FROM nokos_orders
              WHERE user_id = ? AND status IN ('PROCESSING','UNCERTAIN'))
           >= ?`,
    [uid, idempotencyKey, product.id, product.name ?? null, product.price, sell, t, t, uid, uid, sell],
  );

  if (insert.meta.changes !== 1) {
    const available = await getAvailable(db, uid);
    return tg.sendMessage(
      chatId,
      `❌ Saldo tidak cukup.\nHarga: ${formatIDR(sell)}\nSaldo tersedia: ${formatIDR(available)}\n\nSilakan deposit terlebih dahulu.`,
    );
  }

  const order = await first(db, 'SELECT * FROM nokos_orders WHERE id = ?', [insert.meta.last_row_id]);
  return attemptCreate(ctx, chatId, order);
}

async function setStatus(db, orderId, status, reason = null, allowedFrom = IN_FLIGHT) {
  const placeholders = allowedFrom.map(() => '?').join(',');
  return run(
    db,
    `UPDATE nokos_orders SET status = ?, failed_reason = COALESCE(?, failed_reason), updated_at = ?
     WHERE id = ? AND status IN (${placeholders})`,
    [status, reason, now(), orderId, ...allowedFrom],
  );
}

async function attemptCreate(ctx, chatId, order) {
  const { db, tg, env } = ctx;

  let item;
  try {
    const result = await smscode.createOrder(env, {
      productId: order.product_id,
      idempotencyKey: order.idempotency_key,
    });
    item = result?.orders?.[0];
  } catch (err) {
    if (err instanceof ProviderError && err.definitive) {
      await setStatus(db, order.id, 'FAILED', err.code);
      if (err.alertOwner) {
        await notifyOwners(tg, ctx.config.ownerIds, `⚠️ NOKOS: provider menolak order (${err.code}). Periksa akun SMSCode.`);
      }
      const reason = PROVIDER_REASON_TEXT[err.code] ?? 'layanan sedang tidak tersedia';
      return tg.sendMessage(chatId, `❌ Pesanan gagal: ${reason}.\nSaldo Anda tidak dipotong.`);
    }
    await setStatus(db, order.id, 'UNCERTAIN', err.code ?? 'UNCERTAIN', ['PROCESSING']);
    return tg.sendMessage(
      chatId,
      '⚠️ Status pesanan belum dapat dipastikan. Saldo Anda <b>belum</b> dipotong.\nBuka 📦 Pesanan lalu tekan <b>Lanjutkan</b> untuk memeriksa ulang.',
    );
  }

  if (!item) {
    await setStatus(db, order.id, 'FAILED', 'NO_ORDER_RETURNED');
    return tg.sendMessage(chatId, '❌ Pesanan gagal dibuat. Saldo Anda tidak dipotong.');
  }

  await run(
    db,
    `UPDATE nokos_orders SET provider_order_id = ?, phone_number = ?, operator_name = ?, expires_at = ?, updated_at = ?
     WHERE id = ?`,
    [item.id, item.phone_number ?? null, item.operator_name ?? null, item.expires_at ?? null, now(), order.id],
  );

  return commitPurchase(ctx, chatId, { ...order, provider_order_id: item.id }, item);
}

// Dipanggil hanya setelah provider memastikan order ada. Di sinilah saldo benar-benar dipotong.
async function commitPurchase(ctx, chatId, order, remote) {
  const { db, tg } = ctx;
  const t = now();
  const nextStatus = PROVIDER_STATUS[remote.status] ?? 'ACTIVE';

  // Provider sudah membatalkan/mengedarkan order sebelum kita potong saldo: tidak ada yang dibayar.
  if (nextStatus === 'CANCELED' || nextStatus === 'EXPIRED') {
    await setStatus(db, order.id, nextStatus);
    return showOrder(ctx, chatId, order.id, order.user_id);
  }

  let results;
  try {
    results = await batch(db, [
      stmt(
        db,
        `UPDATE nokos_orders SET status = ?, otp_code = ?, otp_message = ?, sms_revision = ?, updated_at = ?
         WHERE id = ? AND status IN ('PROCESSING','UNCERTAIN')`,
        [nextStatus, remote.otp_code ?? null, remote.otp_message ?? null, Number(remote.sms_revision ?? 0), t, order.id],
      ),
      ...ledgerStatements(db, {
        userId: order.user_id,
        delta: -order.sell_price,
        type: 'NOKOS_PURCHASE',
        refType: 'nokos_order',
        refId: order.id,
        note: 'Pembelian NOKOS',
        now: t,
      }),
    ]);
  } catch (err) {
    console.error('Potong saldo gagal, order', order.id, err.message);
    await setStatus(db, order.id, 'NEEDS_REVIEW', 'DEBIT_FAILED');
    await notifyOwners(tg, ctx.config.ownerIds, `🛠 NOKOS order #${order.id} perlu ditinjau: saldo gagal dipotong. Provider ID ${order.provider_order_id}.`);
    return tg.sendMessage(chatId, '⚠️ Nomor sudah didapat, tetapi saldo belum dapat dipotong otomatis. Owner akan meninjau pesanan Anda.');
  }

  // Order sudah diproses sebelumnya (mis. resume ganda): tidak ada pemotongan kedua.
  if (results[0].meta.changes !== 1) return showOrder(ctx, chatId, order.id, order.user_id);

  if (results[1].meta.changes !== 1) {
    await setStatus(db, order.id, 'NEEDS_REVIEW', 'LEDGER_MISSING', ['ACTIVE', 'OTP_RECEIVED']);
    await notifyOwners(tg, ctx.config.ownerIds, `🛠 NOKOS order #${order.id}: buku besar tidak tercatat. Periksa wallet user ${order.user_id}.`);
    return tg.sendMessage(chatId, '⚠️ Nomor sudah didapat. Owner akan meninjau pesanan Anda.');
  }

  const fresh = await first(db, 'SELECT * FROM nokos_orders WHERE id = ?', [order.id]);
  const view = renderOrderDetail(fresh);
  return tg.sendMessage(chatId, `✅ <b>Nomor berhasil didapat</b>\n\n${view.text}`, { reply_markup: view.keyboard });
}

// Refund saat pembatalan/provider cancel. Status diubah dan saldo dikembalikan dalam satu batch.
async function refundOrder(ctx, order) {
  const { db, tg } = ctx;
  const t = now();
  try {
    const results = await batch(db, [
      stmt(
        db,
        `UPDATE nokos_orders SET status = 'CANCELED', updated_at = ? WHERE id = ? AND status IN ('ACTIVE','OTP_RECEIVED')`,
        [t, order.id],
      ),
      ...ledgerStatements(db, {
        userId: order.user_id,
        delta: order.sell_price,
        type: 'REFUND',
        refType: 'nokos_order',
        refId: order.id,
        note: 'Refund pembatalan NOKOS',
        now: t,
      }),
    ]);
    if (results[0].meta.changes === 0) return false; // sudah pernah di-refund/dibatalkan
    if (results[1].meta.changes === 1) return true;
    throw new Error('buku besar refund tidak tercatat');
  } catch (err) {
    console.error('Refund gagal, order', order.id, err.message);
    await setStatus(db, order.id, 'NEEDS_REVIEW', 'REFUND_FAILED', ACTIVE);
    await notifyOwners(tg, ctx.config.ownerIds, `🛠 NOKOS order #${order.id}: refund perlu ditinjau owner.`);
    return false;
  }
}

// ---------- Aksi pada order ----------

async function getOwnOrder(db, userId, orderId) {
  return first(db, 'SELECT * FROM nokos_orders WHERE id = ? AND user_id = ?', [orderId, String(userId)]);
}

async function showOrder(ctx, chatId, orderId, userId) {
  const order = await getOwnOrder(ctx.db, userId, orderId);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  const view = renderOrderDetail(order);
  return ctx.tg.sendMessage(chatId, view.text, { reply_markup: view.keyboard });
}

// Sinkronisasi status dari provider. Hanya menyentuh order yang masih aktif.
async function syncOrder(ctx, order, remote) {
  const { db } = ctx;
  const next = PROVIDER_STATUS[remote.status] ?? order.status;

  // Provider membatalkan sendiri setelah saldo dipotong: kembalikan saldo pengguna.
  if (next === 'CANCELED' && ACTIVE.includes(order.status)) {
    await refundOrder(ctx, order);
    return;
  }

  const rev = Number(remote.sms_revision ?? 0);
  await run(
    db,
    `UPDATE nokos_orders
     SET status = ?, phone_number = COALESCE(?, phone_number), otp_code = ?, otp_message = ?,
         sms_revision = ?, expires_at = COALESCE(?, expires_at), updated_at = ?
     WHERE id = ? AND sms_revision <= ? AND status IN ('ACTIVE','OTP_RECEIVED','EXPIRED')`,
    [
      next,
      remote.phone_number ?? null,
      remote.otp_code ?? null,
      remote.otp_message ?? null,
      rev,
      remote.expires_at ?? null,
      now(),
      order.id,
      rev,
    ],
  );
}

export async function checkOrder(ctx, chatId, user, orderId) {
  const order = await getOwnOrder(ctx.db, user.telegram_id, orderId);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  if (IN_FLIGHT.includes(order.status)) return resumeOrder(ctx, chatId, order);
  if (!ACTIVE.includes(order.status) || !order.provider_order_id) return showOrder(ctx, chatId, orderId, user.telegram_id);

  let remote;
  try {
    remote = await smscode.getOrder(ctx.env, order.provider_order_id);
  } catch {
    return ctx.tg.sendMessage(chatId, 'Gagal mengambil status dari provider. Coba lagi sebentar.');
  }
  await syncOrder(ctx, order, remote);
  return showOrder(ctx, chatId, orderId, user.telegram_id);
}

// Melanjutkan order PROCESSING/UNCERTAIN. Key yang sama dipakai agar provider tidak membuat order ganda.
async function resumeOrder(ctx, chatId, order) {
  if (!IN_FLIGHT.includes(order.status)) return showOrder(ctx, chatId, order.id, order.user_id);

  if (order.provider_order_id) {
    let remote;
    try {
      remote = await smscode.getOrder(ctx.env, order.provider_order_id);
    } catch {
      return ctx.tg.sendMessage(chatId, 'Gagal memeriksa status provider. Coba lagi sebentar.');
    }
    return commitPurchase(ctx, chatId, order, remote);
  }
  return attemptCreate(ctx, chatId, order);
}

export async function resumeById(ctx, chatId, user, orderId) {
  const order = await getOwnOrder(ctx.db, user.telegram_id, orderId);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  return resumeOrder(ctx, chatId, order);
}

async function cancelOrder(ctx, chatId, user, orderId) {
  const order = await getOwnOrder(ctx.db, user.telegram_id, orderId);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  if (!ACTIVE.includes(order.status) || !order.provider_order_id) return showOrder(ctx, chatId, orderId, user.telegram_id);

  try {
    await smscode.cancelOrder(ctx.env, order.provider_order_id);
  } catch (err) {
    if (err instanceof ProviderError && err.code === 'CANCEL_TOO_EARLY') {
      return ctx.tg.sendMessage(chatId, '⏳ Pesanan belum bisa dibatalkan sekarang. Coba lagi beberapa menit lagi.');
    }
    if (err instanceof ProviderError && err.code === 'CONFLICT') {
      return ctx.tg.sendMessage(chatId, 'Pesanan tidak bisa dibatalkan karena kode SMS sudah diterima.');
    }
    return ctx.tg.sendMessage(chatId, 'Gagal membatalkan pesanan. Coba lagi nanti.');
  }

  const refunded = await refundOrder(ctx, order);
  if (!refunded) {
    return ctx.tg.sendMessage(chatId, '⚠️ Pesanan dibatalkan di provider, tetapi refund perlu ditinjau owner.');
  }
  await ctx.tg.sendMessage(chatId, `🚫 Pesanan dibatalkan. Saldo ${formatIDR(order.sell_price)} dikembalikan.`);
  return showOrder(ctx, chatId, orderId, user.telegram_id);
}

async function finishOrder(ctx, chatId, user, orderId) {
  const order = await getOwnOrder(ctx.db, user.telegram_id, orderId);
  if (!order) return ctx.tg.sendMessage(chatId, 'Pesanan tidak ditemukan.');
  if (!ACTIVE.includes(order.status) || !order.provider_order_id) return showOrder(ctx, chatId, orderId, user.telegram_id);

  try {
    await smscode.finishOrder(ctx.env, order.provider_order_id);
  } catch {
    return ctx.tg.sendMessage(chatId, 'Gagal menandai pesanan selesai. Coba lagi nanti.');
  }
  await setStatus(ctx.db, order.id, 'COMPLETED', null, ACTIVE);
  return showOrder(ctx, chatId, orderId, user.telegram_id);
}

// ---------- Router callback NOKOS ----------

export async function handleCallback(ctx, cq, user) {
  const chatId = cq.message.chat.id;
  const [, action, ...rawArgs] = String(cq.data).split(':');
  if (!rawArgs.every((a) => /^\d{1,12}$/.test(a))) return;
  const args = rawArgs.map(Number);

  switch (action) {
    case 'h':
      return showCountries(ctx, chatId);
    case 'c':
      if (args.length === 1) return showServices(ctx, chatId, args[0]);
      return;
    case 's':
      if (args.length === 2) return showProducts(ctx, chatId, args[0], args[1]);
      return;
    case 'p':
      if (args.length === 3) {
        return showConfirm(ctx, chatId, user, { countryId: args[0], platformId: args[1], productId: args[2] });
      }
      return;
    case 'b':
      if (args.length === 4) {
        return executePurchase(ctx, chatId, user, {
          countryId: args[0],
          platformId: args[1],
          productId: args[2],
          shownSell: args[3],
        });
      }
      return;
    case 'chk':
      if (args.length === 1) return checkOrder(ctx, chatId, user, args[0]);
      return;
    case 'res':
      if (args.length === 1) return resumeById(ctx, chatId, user, args[0]);
      return;
    case 'cnl':
      if (args.length === 1) return cancelOrder(ctx, chatId, user, args[0]);
      return;
    case 'fin':
      if (args.length === 1) return finishOrder(ctx, chatId, user, args[0]);
      return;
    default:
      return;
  }
}

