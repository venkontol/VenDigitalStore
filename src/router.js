import {
  jsonResponse,
  errorResponse,
  getPath,
  getMethod
} from "./utils.js";

import {
  register,
  login,
  logout,
  logoutAll,
  me,
  requireAuth,
  requireAdmin
} from "./auth.js";

import {
  getBalance,
  getTransactions
} from "./wallet.js";

import {
  createDeposit,
  getDeposit,
  checkDeposit,
  getActiveDeposit,
  payDeposit
} from "./deposit.js";

import {
  notifyPaymentCheck,
  telegramWebhook,
  getQrImage
} from "./telegram.js";

import {
  getCategories,
  getProducts,
  getProduct,
  getFavorites,
  toggleFavorite,
  checkFavorite
} from "./marketplace.js";

import {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder
} from "./orders.js";

import {
  getAdminOverview,
  adminGetUsers,
  adminGetUser,
  adminUpdateUser,
  adminAdjustBalance
} from "./admin.js";

import {
  adminGetCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminGetProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminRefundOrder,
  adminGetDeposits,
  adminGetAnnouncements,
  adminCreateAnnouncement,
  adminUpdateAnnouncement,
  adminDeleteAnnouncement,
  getPublicAnnouncements,
  adminGetVisitorStats
} from "./admin_extra.js";

import {
  trackVisitor,
  getVisitorOverview,
  getVisitorStats,
  adminGetVisitorStats
} from "./visitor.js";

import {
  getPublicSettings,
  getAdminSettings,
  updateSettings,
  getDepositConfig,
  getStoreConfig
} from "./setting.js";

async function authRequired(request, env) {
  return requireAuth(request, env);
}

async function adminRequired(request, env) {
  return requireAdmin(request, env);
}

function methodAllowed(method, allowed) {
  return allowed.includes(method);
}

async function route(request, env, ctx) {
  const method = getMethod(request);
  const path = getPath(request);

  if (path === "/api/health") {
    return jsonResponse({
      success: true,
      service: "VenDigitalStore",
      status: "ok",
      database: env.DB ? "connected" : "disconnected",
      timestamp: new Date().toISOString()
    });
  }

  if (
    path === "/api/telegram/webhook" &&
    method === "POST"
  ) {
    return telegramWebhook(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit/qr" &&
    method === "GET"
  ) {
    return getQrImage(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/auth/register" &&
    method === "POST"
  ) {
    return register(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/auth/login" &&
    method === "POST"
  ) {
    return login(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/auth/logout" &&
    method === "POST"
  ) {
    return logout(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/auth/logout-all" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return logoutAll(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/auth/me" &&
    method === "GET"
  ) {
    return me(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/store" &&
    method === "GET"
  ) {
    return getStoreConfig(
      request,
      env
    );
  }

  if (
    path === "/api/settings/public" &&
    method === "GET"
  ) {
    return getPublicSettings(
      request,
      env
    );
  }

  if (
    path === "/api/deposit/config" &&
    method === "GET"
  ) {
    return getDepositConfig(
      request,
      env
    );
  }

  if (
    path === "/api/categories" &&
    method === "GET"
  ) {
    return getCategories(
      request,
      env
    );
  }

  if (
    path === "/api/products" &&
    method === "GET"
  ) {
    return getProducts(
      request,
      env
    );
  }

  if (
    path.startsWith("/api/products/") &&
    method === "GET"
  ) {
    return getProduct(
      request,
      env
    );
  }

  if (
    path === "/api/announcements" &&
    method === "GET"
  ) {
    return getPublicAnnouncements(
      request,
      env
    );
  }

  if (
    path === "/api/visitor/track" &&
    method === "POST"
  ) {
    return trackVisitor(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/wallet/overview" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    const balance = await getBalance(
      request,
      env,
      ctx
    );

    if (balance instanceof Response) {
      return balance;
    }

    const transactions =
      await getTransactions(
        request,
        env,
        ctx
      );

    if (transactions instanceof Response) {
      return transactions;
    }

    return jsonResponse({
      success: true,
      balance:
        balance.balance ??
        balance.data?.balance ??
        0,
      transactions:
        transactions.transactions ??
        transactions.data?.transactions ??
        []
    });
  }

  if (
    path === "/api/wallet/balance" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getBalance(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/wallet/transactions" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getTransactions(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return createDeposit(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getDeposit(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit/active" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getActiveDeposit(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit/check" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return checkDeposit(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/favorites" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getFavorites(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/favorites/toggle" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return toggleFavorite(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/favorites/check" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return checkFavorite(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/orders" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return createOrder(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/orders" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getOrders(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/orders\/[^/]+$/.test(path) &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getOrder(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/orders\/[^/]+\/cancel$/.test(path) &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return cancelOrder(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/visitor/overview" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getVisitorOverview(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/visitor/stats" &&
    method === "GET"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getVisitorStats(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/overview" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getAdminOverview(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/users" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetUsers(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/users\/\d+$/.test(path) &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetUser(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/users\/\d+$/.test(path) &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminUpdateUser(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/users\/\d+\/balance$/.test(path) &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminAdjustBalance(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/categories" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetCategories(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/categories" &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminCreateCategory(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/categories\/\d+$/.test(path) &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminUpdateCategory(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/categories\/\d+$/.test(path) &&
    method === "DELETE"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminDeleteCategory(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/products" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetProducts(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/products" &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminCreateProduct(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/products\/\d+$/.test(path) &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminUpdateProduct(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/products\/\d+$/.test(path) &&
    method === "DELETE"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminDeleteProduct(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/orders" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetOrders(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/orders\/[^/]+$/.test(path) &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminUpdateOrderStatus(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/orders\/[^/]+\/refund$/.test(path) &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminRefundOrder(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/deposits" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetDeposits(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/announcements" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetAnnouncements(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/announcements" &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminCreateAnnouncement(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/announcements\/\d+$/.test(path) &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminUpdateAnnouncement(
      request,
      env,
      ctx
    );
  }

  if (
    /^\/api\/admin\/announcements\/\d+$/.test(path) &&
    method === "DELETE"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminDeleteAnnouncement(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/settings" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return getAdminSettings(
      request,
      env
    );
  }

  if (
    path === "/api/admin/settings" &&
    method === "PATCH"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return updateSettings(
      request,
      env
    );
  }

  if (
    path === "/api/admin/visitors" &&
    method === "GET"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return adminGetVisitorStats(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/admin/deposits/pay" &&
    method === "POST"
  ) {
    const user = await adminRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return payDeposit(
      request,
      env,
      ctx
    );
  }

  if (
    path === "/api/deposit/check-notify" &&
    method === "POST"
  ) {
    const user = await authRequired(
      request,
      env
    );

    if (user instanceof Response) {
      return user;
    }

    return notifyPaymentCheck(
      request,
      env,
      ctx
    );
  }

  if (
    method === "OPTIONS" &&
    path.startsWith("/api/")
  ) {
    return new Response(null,{
      status:204
    });
  }

  return errorResponse(
    "Endpoint tidak ditemukan.",
    404
  );
}

export async function router(request, env, ctx) {
  try {
    if (!env.DB) {
      return errorResponse(
        "D1 database binding tidak tersedia.",
        500
      );
    }

    if (
      !methodAllowed(
        getMethod(request),
        [
          "GET",
          "POST",
          "PATCH",
          "PUT",
          "DELETE",
          "OPTIONS"
        ]
      )
    ) {
      return errorResponse(
        "Method tidak diizinkan.",
        405
      );
    }

    return await route(
      request,
      env,
      ctx
    );
  } catch (error) {
    console.error(
      "Router error:",
      error
    );

    return errorResponse(
      "Internal server error.",
      500
    );
  }
}

export default router;
