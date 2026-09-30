import {
  errorResponse,
  getUrl,
  getMethod,
  getPath
} from "./utils.js";

import {
  register,
  login,
  logout,
  logoutAll,
  me
} from "./auth.js";

import {
  getWalletBalance,
  getWalletTransactions,
  getWalletOverview
} from "./wallet.js";

import {
  createDeposit,
  getDeposit,
  checkDeposit,
  confirmDeposit,
  cancelDeposit,
  expireDeposits,
  listDeposits
} from "./deposit.js";

import nokosModule from "./nokos.js";

import {
  listSosmedServices,
  getSosmedService,
  refreshSosmedServices,
  createSosmedOrder,
  getSosmedOrder,
  syncSosmedOrder,
  listMySosmedOrders,
  requestSosmedRefill,
  getSosmedRefillStatus
} from "./suntik-sosmed.js";

import {
  getTransactions,
  getTransactionDetail
} from "./transaksi.js";

import {
  getAnnouncements,
  getLatestAnnouncement,
  getAnnouncementById
} from "./announcement.js";

import {
  getDashboard
} from "./dashboard.js";

import {
  getPublicSettings,
  getPublicSetting
} from "./setting.js";

import {
  handleTelegramWebhook
} from "./telegram.js";

function handleAuthRoutes(request, env, path, method) {
  if (method === "POST" && path === "/api/auth/register") {
    return register(request, env);
  }

  if (method === "POST" && path === "/api/auth/login") {
    return login(request, env);
  }

  if (method === "POST" && path === "/api/auth/logout") {
    return logout(request, env);
  }

  if (method === "POST" && path === "/api/auth/logout-all") {
    return logoutAll(request, env);
  }

  if (method === "GET" && path === "/api/auth/me") {
    return me(request, env);
  }

  return null;
}

function handleWalletRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/wallet/balance") {
    return getWalletBalance(request, env);
  }

  if (method === "GET" && path === "/api/wallet/transactions") {
    return getWalletTransactions(request, env);
  }

  if (method === "GET" && path === "/api/wallet/overview") {
    return getWalletOverview(request, env);
  }

  return null;
}

function handleDepositRoutes(request, env, path, method) {
  if (method === "POST" && path === "/api/deposits/create") {
    return createDeposit(request, env);
  }

  if (method === "GET" && path === "/api/deposits/get") {
    return getDeposit(request, env);
  }

  if (method === "POST" && path === "/api/deposits/check") {
    return checkDeposit(request, env);
  }

  if (method === "POST" && path === "/api/deposits/confirm") {
    return confirmDeposit(request, env);
  }

  if (method === "POST" && path === "/api/deposits/cancel") {
    return cancelDeposit(request, env);
  }

  if (method === "POST" && path === "/api/deposits/expire") {
    return expireDeposits(request, env);
  }

  if (method === "GET" && path === "/api/deposits/list") {
    return listDeposits(request, env);
  }

  return null;
}

function handleSosmedRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/sosmed/services") {
    return listSosmedServices(request, env);
  }

  if (method === "GET" && path === "/api/sosmed/service") {
    return getSosmedService(request, env);
  }

  if (method === "POST" && path === "/api/sosmed/services/refresh") {
    return refreshSosmedServices(request, env);
  }

  if (method === "POST" && path === "/api/sosmed/orders") {
    return createSosmedOrder(request, env);
  }

  if (method === "GET" && path === "/api/sosmed/order") {
    return getSosmedOrder(request, env);
  }

  if (method === "POST" && path === "/api/sosmed/order/sync") {
    return syncSosmedOrder(request, env);
  }

  if (method === "GET" && path === "/api/sosmed/orders") {
    return listMySosmedOrders(request, env);
  }

  if (method === "POST" && path === "/api/sosmed/refill") {
    return requestSosmedRefill(request, env);
  }

  if (method === "GET" && path === "/api/sosmed/refill/status") {
    return getSosmedRefillStatus(request, env);
  }

  return null;
}

function handleTransaksiRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/transaksi/list") {
    return getTransactions(request, env);
  }

  if (method === "GET" && path === "/api/transaksi/detail") {
    return getTransactionDetail(request, env);
  }

  return null;
}

function handleAnnouncementRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/announcement/list") {
    return getAnnouncements(request, env);
  }

  if (method === "GET" && path === "/api/announcement/latest") {
    return getLatestAnnouncement(request, env);
  }

  if (method === "GET" && path === "/api/announcement/detail") {
    return getAnnouncementById(request, env);
  }

  return null;
}

function handleDashboardRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/dashboard") {
    return getDashboard(request, env);
  }

  return null;
}

function handleSettingRoutes(request, env, path, method) {
  if (method === "GET" && path === "/api/setting/public") {
    return getPublicSettings(request, env);
  }

  if (method === "GET" && path === "/api/setting/public/key") {
    return getPublicSetting(request, env);
  }

  return null;
}

function handleTelegramRoutes(request, env, path, method) {
  if (method === "POST" && path === "/api/telegram/webhook") {
    return handleTelegramWebhook(request, env);
  }

  return errorResponse(
    "Telegram endpoint tidak tersedia.",
    404
  );
}

export default async function router(request, env, ctx) {
  try {
    const url = getUrl(request);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = getMethod(request);

    if (!path.startsWith("/api/")) {
      return errorResponse(
        "API endpoint tidak ditemukan.",
        404
      );
    }

    let response;

    if (path.startsWith("/api/auth/")) {
      response = handleAuthRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/wallet/")) {
      response = handleWalletRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/deposits/")) {
      response = handleDepositRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/nokos/")) {
      return nokosModule.handleNokos(request, env);
    }

    if (path.startsWith("/api/sosmed/")) {
      response = handleSosmedRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/transaksi/")) {
      response = handleTransaksiRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/announcement/")) {
      response = handleAnnouncementRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/dashboard/") || path === "/api/dashboard") {
      response = handleDashboardRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/setting/")) {
      response = handleSettingRoutes(request, env, path, method);
      if (response) return response;
    }

    if (path.startsWith("/api/telegram/")) {
      return handleTelegramRoutes(request, env, path, method);
    }

    return errorResponse(
      "API endpoint tidak ditemukan.",
      404
    );
  } catch (error) {
    console.error(
      "[ROUTER ERROR]",
      error
    );

    return errorResponse(
      "Terjadi kesalahan pada server.",
      500
    );
  }
}
