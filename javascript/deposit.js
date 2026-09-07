import {
  errorResponse, jsonResponse, nowUnix, normalizeDepositCode,
  parsePositiveInteger, randomId, readJson, cleanString
} from "./utils.js";

import { requireAuth, requireAdmin } from "./auth.js";
import { creditBalance } from "./wallet.js";

const QRIS_IMAGE = "/images/qris.jpg";
const MIN_DEPOSIT = 1000;
const MAX_DEPOSIT = 10000000;
const DEFAULT_EXPIRY_MINUTES = 30;

function generateDepositCode() {
  return "DEP-" + Date.now().toString(36).toUpperCase() + "-" + randomId(6).toUpperCase();
}

function getExpiryMinutes() {
  return DEFAULT_EXPIRY_MINUTES;
}

/* ──────────────── Create Deposit ──────────────── */

export async function createDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  if (!body) {
    return errorResponse("Data deposit tidak valid.", 400);
  }

  const amount = parsePositiveInteger(body?.amount);
  if (!amount) {
    return errorResponse("Nominal deposit tidak valid.", 400);
  }

  if (amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
    return errorResponse(
      `Nominal deposit harus antara ${MIN_DEPOSIT} dan ${MAX_DEPOSIT} rupiah.`, 400
    );
  }

  const idempotencyKey = cleanString(body?.idempotency_key || body?.idempotencyKey || "", 120) || null;

  if (idempotencyKey) {
    const existing = await env.DB
      .prepare(`SELECT code, amount, status, created_at, expires_at FROM deposits WHERE user_id = ? AND idempotency_key = ? LIMIT 1`)
      .bind(auth.user.id, idempotencyKey)
      .first();

    if (existing) {
      return jsonResponse({
        success: true,
        idempotent: true,
        message: "Deposit sudah pernah dibuat.",
        deposit: {
          code: existing.code,
          amount: existing.amount,
          status: existing.status,
          payment_method: "QRIS",
          qr_url: QRIS_IMAGE,
          created_at: existing.created_at,
          expired_at: existing.expires_at
        }
      }, 200);
    }
  }

  const now = nowUnix();
  const expiresAt = now + getExpiryMinutes() * 60;
  let code = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateDepositCode();
    try {
      await env.DB
        .prepare(`
          INSERT INTO deposits (
            user_id, code, amount, status, payment_method,
            idempotency_key, created_at, expires_at
          )
          VALUES (?, ?, ?, 'PENDING', 'QRIS', ?, ?, ?)
        `)
        .bind(auth.user.id, candidate, amount, idempotencyKey, now, expiresAt)
        .run();
      code = candidate;
      break;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }

  if (!code) {
    return errorResponse("Gagal membuat kode deposit.", 500);
  }

  return jsonResponse({
    success: true,
    message: "Deposit berhasil dibuat.",
    deposit: {
      code, amount, status: "PENDING",
      payment_method: "QRIS", qr_url: QRIS_IMAGE,
      created_at: now, expired_at: expiresAt
    }
  }, 201);
}

/* ──────────────── Get Deposit ──────────────── */

export async function getDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const code = normalizeDepositCode(url.searchParams.get("code"));

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  const deposit = await env.DB
    .prepare(`
      SELECT id, code, amount, status, payment_method,
             created_at, expires_at, checked_at, paid_at, cancelled_at, check_count
      FROM deposits
      WHERE code = ? AND user_id = ?
      LIMIT 1
    `)
    .bind(code, auth.user.id)
    .first();

  if (!deposit) {
    return errorResponse("Deposit tidak ditemukan.", 404);
  }

  let status = deposit.status;
  const now = nowUnix();

  if (status === "PENDING" && Number(deposit.expires_at) <= now) {
    await env.DB
      .prepare(`UPDATE deposits SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING' AND expires_at <= ?`)
      .bind(deposit.id, now)
      .run();
    status = "EXPIRED";
  }

  return jsonResponse({
    success: true,
    deposit: { ...deposit, status, qr_url: QRIS_IMAGE }
  });
}

/* ──────────────── Check Deposit ──────────────── */

export async function checkDeposit(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const code = normalizeDepositCode(body?.code);

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  const now = nowUnix();
  const deposit = await env.DB
    .prepare(`SELECT id, status, expires_at FROM deposits WHERE code = ? AND user_id = ? LIMIT 1`)
    .bind(code, auth.user.id)
    .first();

  if (!deposit) {
    return errorResponse("Deposit tidak ditemukan.", 404);
  }

  if (deposit.status === "PENDING" && Number(deposit.expires_at) <= now) {
    await env.DB
      .prepare(`UPDATE deposits SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`)
      .bind(deposit.id)
      .run();

    return jsonResponse({ success: true, status: "EXPIRED", message: "Deposit sudah expired." });
  }

  if (deposit.status !== "PENDING") {
    return jsonResponse({
      success: true,
      status: deposit.status,
      message: deposit.status === "PAID"
        ? "Pembayaran sudah dikonfirmasi."
        : "Deposit tidak lagi menunggu pembayaran."
    });
  }

  await env.DB
    .prepare(`UPDATE deposits SET checked_at = ?, check_count = check_count + 1 WHERE id = ? AND status = 'PENDING'`)
    .bind(now, deposit.id)
    .run();

  return jsonResponse({
    success: true, status: "PENDING",
    message: "Deposit masih menunggu konfirmasi pembayaran."
  });
}

/* ──────────────── Confirm Deposit ──────────────── */

export async function confirmDeposit(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const code = normalizeDepositCode(body?.code);

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  const deposit = await env.DB
    .prepare(`SELECT id, user_id, code, amount, status FROM deposits WHERE code = ? LIMIT 1`)
    .bind(code)
    .first();

  if (!deposit) {
    return errorResponse("Deposit tidak ditemukan.", 404);
  }

  if (deposit.status === "PAID") {
    return jsonResponse({
      success: true, already_paid: true,
      message: "Deposit sudah dikonfirmasi sebelumnya."
    });
  }

  if (deposit.status !== "PENDING") {
    return errorResponse(`Deposit berstatus ${deposit.status} dan tidak dapat dikonfirmasi.`, 409);
  }

  const now = nowUnix();
  const reference = `DEPOSIT:${deposit.id}`;

  let creditResult;
  try {
    creditResult = await creditBalance(env, {
      userId: deposit.user_id,
      amount: Number(deposit.amount),
      type: "DEPOSIT",
      reference,
      description: "Deposit QRIS",
      depositId: deposit.id
    });
  } catch (creditError) {
    if (creditError.message?.includes("sudah digunakan")) {
      const existing = await env.DB
        .prepare(`SELECT id, status, paid_at FROM deposits WHERE code = ? LIMIT 1`)
        .bind(code)
        .first();

      if (existing?.status === "PAID") {
        return jsonResponse({
          success: true, already_paid: true,
          message: "Deposit sudah dikonfirmasi sebelumnya."
        });
      }
    }
    throw creditError;
  }

  await env.DB
    .prepare(`UPDATE deposits SET status = 'PAID', paid_at = ?, wallet_transaction_id = ? WHERE id = ? AND status = 'PENDING'`)
    .bind(now, creditResult.id || null, deposit.id)
    .run();

  return jsonResponse({
    success: true,
    message: "Deposit berhasil dikonfirmasi.",
    deposit: {
      code: deposit.code,
      amount: Number(deposit.amount),
      status: "PAID",
      paid_at: now
    },
    balance: creditResult.balance
  });
}

/* ──────────────── Cancel Deposit ──────────────── */

export async function cancelDeposit(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const code = normalizeDepositCode(body?.code);

  if (!code) {
    return errorResponse("Kode deposit wajib diisi.", 400);
  }

  const now = nowUnix();
  const result = await env.DB
    .prepare(`UPDATE deposits SET status = 'CANCELLED', cancelled_at = ? WHERE code = ? AND status = 'PENDING'`)
    .bind(now, code)
    .run();

  if (!result.meta?.changes) {
    const deposit = await env.DB
      .prepare(`SELECT status FROM deposits WHERE code = ? LIMIT 1`)
      .bind(code)
      .first();

    if (!deposit) {
      return errorResponse("Deposit tidak ditemukan.", 404);
    }
    return errorResponse(`Deposit berstatus ${deposit.status}.`, 409);
  }

  return jsonResponse({
    success: true,
    message: "Deposit berhasil dibatalkan.",
    status: "CANCELLED"
  });
}

/* ──────────────── Expire Deposits ──────────────── */

export async function expireDeposits(request, env, ctx) {
  const now = nowUnix();
  const result = await env.DB
    .prepare(`UPDATE deposits SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= ?`)
    .bind(now)
    .run();

  return jsonResponse({
    success: true,
    expired: Number(result.meta?.changes || 0)
  });
}
