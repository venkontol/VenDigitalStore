import {
  errorResponse,
  jsonResponse,
  nowUnix,
  getPagination,
  formatRupiah
} from "./utils.js";

import { requireAuth } from "./auth.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function mapStatusCode(status) {
  if (!status) {
    return "pending";
  }

  const normalized = String(status).toUpperCase();

  const statusMap = {
    PENDING: "pending",
    CREATING: "pending",
    PROCESSING: "pending",
    OTP_RECEIVED: "pending",
    COMPLETED: "berhasil",
    PARTIAL: "berhasil",
    REFUNDED: "berhasil",
    CANCELLED: "dibatalkan",
    EXPIRED: "dibatalkan",
    FAILED: "dibatalkan",
    UNKNOWN: "dibatalkan",
    PAID: "berhasil"
  };

  return statusMap[normalized] || "pending";
}

function formatTransactionDate(timestamp) {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const ms = Number(timestamp) * 1000;
  return new Date(ms).toISOString();
}

function normalizeLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

async function getBalanceTransactions(env, userId, limit, offset) {
  return env.DB
    .prepare(
      `
        SELECT
          id,
          type,
          amount,
          balance_before,
          balance_after,
          description,
          order_id,
          deposit_id,
          created_at
        FROM balance_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `
    )
    .bind(userId, limit, offset)
    .all();
}

async function getDepositTransactions(env, userId, limit, offset) {
  return env.DB
    .prepare(
      `
        SELECT
          id,
          code,
          amount,
          status,
          created_at,
          paid_at,
          cancelled_at,
          expires_at
        FROM deposits
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `
    )
    .bind(userId, limit, offset)
    .all();
}

async function getOrderTransactions(env, userId, limit, offset) {
  return env.DB
    .prepare(
      `
        SELECT
          id,
          order_number,
          type,
          provider,
          service_name,
          target,
          quantity,
          customer_amount,
          status,
          created_at,
          completed_at,
          cancelled_at
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `
    )
    .bind(userId, limit, offset)
    .all();
}

function formatBalanceTransaction(row) {
  if (!row) {
    return null;
  }

  const type = String(row.type || "");
  const amount = Math.abs(Number(row.amount || 0));
  const isCredit = Number(row.amount || 0) > 0;

  const typeLabels = {
    DEPOSIT: "Deposit Saldo",
    PURCHASE: "Pembelian Layanan",
    REFUND: "Refund Pesanan",
    ADJUSTMENT: "Penyesuaian Saldo",
    BONUS: "Bonus Saldo"
  };

  const typeIcons = {
    DEPOSIT: "i-in",
    PURCHASE: "i-out",
    REFUND: "i-in",
    ADJUSTMENT: "i-adjust",
    BONUS: "i-gift"
  };

  const description = row.description || typeLabels[type] || type;

  return {
    id: `WAL-${row.id}`,
    name: typeLabels[type] || type,
    detail: description,
    direction: isCredit ? "in" : "out",
    icon: typeIcons[type] || "i-wallet",
    amount,
    status: "berhasil",
    category: "saldo",
    date: formatTransactionDate(row.created_at),
    extra: `Saldo sebelumnya: ${formatRupiah(row.balance_before)}\nSaldo sesudah: ${formatRupiah(row.balance_after)}`
  };
}

function formatDepositTransaction(row) {
  if (!row) {
    return null;
  }

  const status = mapStatusCode(row.status);
  const amount = Number(row.amount || 0);

  const statusLabels = {
    PENDING: "Menunggu Pembayaran",
    PAID: "Pembayaran Berhasil",
    EXPIRED: "Kadaluarsa",
    CANCELLED: "Dibatalkan"
  };

  return {
    id: `DEP-${row.id}`,
    name: "Deposit Saldo",
    detail: `Kode: ${row.code}`,
    direction: "in",
    icon: "i-in",
    amount,
    status,
    category: "deposit",
    date: formatTransactionDate(row.created_at),
    extra: `Kode Deposit: ${row.code}\nMetode: QRIS\nStatus: ${statusLabels[row.status] || row.status}`
  };
}

function formatOrderTransaction(row) {
  if (!row) {
    return null;
  }

  const type = String(row.type || "");
  const amount = Number(row.customer_amount || 0);
  const status = mapStatusCode(row.status);

  const category = type === "NOKOS" ? "nokos" : "sosmed";
  const categoryLabel = type === "NOKOS" ? "Nokos" : "Suntik Sosmed";

  const statusLabels = {
    CREATING: "Membuat Pesanan",
    PENDING: "Menunggu Proses",
    PROCESSING: "Sedang Diproses",
    OTP_RECEIVED: "OTP Diterima",
    COMPLETED: "Selesai",
    PARTIAL: "Selesai Sebagian",
    CANCELLED: "Dibatalkan",
    EXPIRED: "Kadaluarsa",
    REFUNDED: "Dikembalikan",
    FAILED: "Gagal",
    UNKNOWN: "Status Tidak Jelas"
  };

  const target = String(row.target || "");
  const targetDisplay = target.length > 20 ? target.substring(0, 20) + "..." : target;

  return {
    id: `ORD-${row.id}`,
    name: `${categoryLabel} - ${row.service_name || "Layanan"}`,
    detail: `Target: ${targetDisplay} (${row.quantity}x)`,
    direction: "out",
    icon: type === "NOKOS" ? "i-nokos" : "i-sosmed",
    amount,
    status,
    category,
    date: formatTransactionDate(row.created_at),
    extra: `No. Pesanan: ${row.order_number}\nLayanan: ${row.service_name}\nTarget: ${target}\nJumlah: ${row.quantity}\nProvider: ${row.provider}\nStatus: ${statusLabels[row.status] || row.status}`
  };
}

export async function getTransactions(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const auth = await requireAuth(
      request,
      env
    );

    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const limit = normalizeLimit(
      url.searchParams.get("limit")
    );

    const offsetValue = Number(
      url.searchParams.get("offset")
    );

    const offset = Number.isInteger(offsetValue) &&
      offsetValue >= 0
      ? offsetValue
      : 0;

    const balanceResults = await getBalanceTransactions(
      env,
      auth.user.id,
      limit,
      offset
    );

    const depositResults = await getDepositTransactions(
      env,
      auth.user.id,
      limit,
      offset
    );

    const orderResults = await getOrderTransactions(
      env,
      auth.user.id,
      limit,
      offset
    );

    const balanceTransactions = (
      balanceResults?.results || []
    ).map(formatBalanceTransaction).filter(Boolean);

    const depositTransactions = (
      depositResults?.results || []
    ).map(formatDepositTransaction).filter(Boolean);

    const orderTransactions = (
      orderResults?.results || []
    ).map(formatOrderTransaction).filter(Boolean);

    const allTransactions = [
      ...balanceTransactions,
      ...depositTransactions,
      ...orderTransactions
    ].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    const paginatedTransactions = allTransactions.slice(
      0,
      limit
    );

    return jsonResponse({
      success: true,
      transactions: paginatedTransactions,
      limit,
      offset,
      total: allTransactions.length
    });
  } catch (error) {
    console.error(
      "[TRANSAKSI GET ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil data transaksi.",
      500
    );
  }
}

export async function getTransactionDetail(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const auth = await requireAuth(
      request,
      env
    );

    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const transactionId = url.searchParams.get("id");

    if (!transactionId) {
      return errorResponse(
        "ID transaksi diperlukan.",
        400
      );
    }

    const prefix = String(transactionId).split("-")[0];

    if (prefix === "WAL") {
      const id = Number(
        transactionId.replace("WAL-", "")
      );

      const row = await env.DB
        .prepare(
          `
            SELECT
              id,
              user_id,
              type,
              amount,
              balance_before,
              balance_after,
              description,
              order_id,
              deposit_id,
              created_at
            FROM balance_transactions
            WHERE id = ? AND user_id = ?
            LIMIT 1
          `
        )
        .bind(id, auth.user.id)
        .first();

      if (!row) {
        return errorResponse(
          "Transaksi tidak ditemukan.",
          404
        );
      }

      const transaction = formatBalanceTransaction(row);

      return jsonResponse({
        success: true,
        transaction
      });
    } else if (prefix === "DEP") {
      const id = Number(
        transactionId.replace("DEP-", "")
      );

      const row = await env.DB
        .prepare(
          `
            SELECT
              id,
              user_id,
              code,
              amount,
              status,
              created_at,
              paid_at,
              cancelled_at,
              expires_at
            FROM deposits
            WHERE id = ? AND user_id = ?
            LIMIT 1
          `
        )
        .bind(id, auth.user.id)
        .first();

      if (!row) {
        return errorResponse(
          "Deposit tidak ditemukan.",
          404
        );
      }

      const transaction = formatDepositTransaction(row);

      return jsonResponse({
        success: true,
        transaction
      });
    } else if (prefix === "ORD") {
      const id = Number(
        transactionId.replace("ORD-", "")
      );

      const row = await env.DB
        .prepare(
          `
            SELECT
              id,
              user_id,
              order_number,
              type,
              provider,
              service_name,
              target,
              quantity,
              customer_amount,
              status,
              created_at,
              completed_at,
              cancelled_at
            FROM orders
            WHERE id = ? AND user_id = ?
            LIMIT 1
          `
        )
        .bind(id, auth.user.id)
        .first();

      if (!row) {
        return errorResponse(
          "Pesanan tidak ditemukan.",
          404
        );
      }

      const transaction = formatOrderTransaction(row);

      return jsonResponse({
        success: true,
        transaction
      });
    } else {
      return errorResponse(
        "Format ID transaksi tidak valid.",
        400
      );
    }
  } catch (error) {
    console.error(
      "[TRANSAKSI DETAIL ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil detail transaksi.",
      500
    );
  }
}

export default {
  getTransactions,
  getTransactionDetail
};
