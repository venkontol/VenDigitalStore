import {
  register,
  login,
  logout,
  logoutAll,
  me
} from "./auth.js";

import {
  createDeposit,
  getDeposit,
  checkDeposit,
  confirmDeposit,
  cancelDeposit,
  expireDeposits
} from "./deposit.js";

import {
  getWalletOverview,
  getWalletBalance,
  getWalletTransactions
} from "./wallet.js";

import {
  listNokosProducts,
  createNokosOrder,
  getNokosOrder,
  syncNokosOrder,
  cancelNokosOrder,
  finishNokosOrder,
  resendNokosOrder
} from "./nokos.js";

import {
  listSocialServices,
  createSocialOrder,
  getSocialOrder,
  syncSocialOrder,
  listSocialOrders,
  cancelSocialOrder
} from "./suntik-sosmed.js";

import {
  handleOrders
} from "./orders.js";

import {
  trackVisitor,
  trackPageView,
  getVisitorStats,
  getVisitorOverview,
  cleanupVisitorSessions
} from "./visitor.js";

import {
  adminDashboard,
  adminListUsers,
  adminGetUser,
  adminUpdateUser,
  adminAdjustUserBalance,
  adminListRecentActivity,
  adminDeleteUser,
  adminGetSystemCounts
} from "./admin.js";

import {
  getPublicSettings,
  getPublicSetting,
  adminGetSettings,
  adminGetSetting,
  adminUpdateSetting,
  adminUpdateSettings,
  adminResetSettings
} from "./setting.js";

import {
  errorResponse,
  getMethod,
  getPath
} from "./utils.js";

function routeKey(method, path) {
  return `${method} ${path}`;
}

async function handleRoute(request, env, ctx) {
  const method = getMethod(request);
  const path = getPath(request);
  const key = routeKey(method, path);

  switch (key) {
    case "GET /api/auth/me":
      return me(request, env, ctx);

    case "POST /api/auth/register":
      return register(request, env, ctx);

    case "POST /api/auth/login":
      return login(request, env, ctx);

    case "POST /api/auth/logout":
      return logout(request, env, ctx);

    case "POST /api/auth/logout-all":
      return logoutAll(request, env, ctx);

    case "GET /api/wallet":
    case "GET /api/wallet/overview":
      return getWalletOverview(request, env, ctx);

    case "GET /api/wallet/balance":
      return getWalletBalance(request, env, ctx);

    case "GET /api/wallet/transactions":
      return getWalletTransactions(request, env, ctx);

    case "POST /api/deposit":
      return createDeposit(request, env, ctx);

    case "GET /api/deposit":
      return getDeposit(request, env, ctx);

    case "POST /api/deposit/check":
      return checkDeposit(request, env, ctx);

    case "POST /api/deposit/confirm":
      return confirmDeposit(request, env, ctx);

    case "POST /api/deposit/cancel":
      return cancelDeposit(request, env, ctx);

    case "POST /api/deposit/expire":
      return expireDeposits(request, env, ctx);

    case "GET /api/nokos/services":
    case "GET /api/nokos/products":
      return listNokosProducts(request, env, ctx);

    case "POST /api/nokos/order":
      return createNokosOrder(request, env, ctx);

    case "GET /api/nokos/order":
      return getNokosOrder(request, env, ctx);

    case "POST /api/nokos/order/sync":
      return syncNokosOrder(request, env, ctx);

    case "POST /api/nokos/order/cancel":
      return cancelNokosOrder(request, env, ctx);

    case "POST /api/nokos/order/finish":
      return finishNokosOrder(request, env, ctx);

    case "POST /api/nokos/order/resend":
      return resendNokosOrder(request, env, ctx);

    case "GET /api/suntik-sosmed/services":
      return listSocialServices(request, env, ctx);

    case "POST /api/suntik-sosmed/order":
      return createSocialOrder(request, env, ctx);

    case "GET /api/suntik-sosmed/order":
      return getSocialOrder(request, env, ctx);

    case "GET /api/suntik-sosmed/orders":
      return listSocialOrders(request, env, ctx);

    case "POST /api/suntik-sosmed/order/sync":
      return syncSocialOrder(request, env, ctx);

    case "POST /api/suntik-sosmed/order/cancel":
      return cancelSocialOrder(request, env, ctx);

    case "GET /api/orders":
    case "POST /api/orders":
    case "GET /api/orders/order":
    case "POST /api/orders/cancel":
    case "GET /api/admin/orders":
    case "POST /api/admin/orders/status":
    case "POST /api/admin/orders/refund":
      return handleOrders(request, env, ctx);

    case "POST /api/visitor/track":
      return trackVisitor(request, env, ctx);

    case "POST /api/visitor/pageview":
      return trackPageView(request, env, ctx);

    case "GET /api/settings":
      return getPublicSettings(request, env, ctx);

    case "GET /api/settings/public":
      return getPublicSettings(request, env, ctx);

    case "GET /api/settings/value":
      return getPublicSetting(request, env, ctx);

    case "GET /api/admin/dashboard":
      return adminDashboard(request, env, ctx);

    case "GET /api/admin/users":
      return adminListUsers(request, env, ctx);

    case "GET /api/admin/user":
      return adminGetUser(request, env, ctx);

    case "PATCH /api/admin/user":
    case "PUT /api/admin/user":
      return adminUpdateUser(request, env, ctx);

    case "POST /api/admin/user/balance":
      return adminAdjustUserBalance(request, env, ctx);

    case "GET /api/admin/activity":
      return adminListRecentActivity(request, env, ctx);

    case "DELETE /api/admin/user":
      return adminDeleteUser(request, env, ctx);

    case "GET /api/admin/counts":
      return adminGetSystemCounts(request, env, ctx);

    case "GET /api/admin/visitors":
      return getVisitorOverview(request, env, ctx);

    case "GET /api/admin/visitor-stats":
      return getVisitorStats(request, env, ctx);

    case "POST /api/admin/visitor/cleanup":
      return cleanupVisitorSessions(request, env, ctx);

    case "GET /api/admin/settings":
      return adminGetSettings(request, env, ctx);

    case "GET /api/admin/settings/value":
      return adminGetSetting(request, env, ctx);

    case "PUT /api/admin/settings":
    case "PATCH /api/admin/settings":
      return adminUpdateSettings(request, env, ctx);

    case "PUT /api/admin/setting":
    case "PATCH /api/admin/setting":
      return adminUpdateSetting(request, env, ctx);

    case "POST /api/admin/settings/reset":
      return adminResetSettings(request, env, ctx);

    case "OPTIONS /api":
    case "OPTIONS /api/auth/me":
    case "OPTIONS /api/auth/register":
    case "OPTIONS /api/auth/login":
    case "OPTIONS /api/auth/logout":
    case "OPTIONS /api/auth/logout-all":
    case "OPTIONS /api/wallet":
    case "OPTIONS /api/wallet/overview":
    case "OPTIONS /api/wallet/balance":
    case "OPTIONS /api/wallet/transactions":
    case "OPTIONS /api/deposit":
    case "OPTIONS /api/deposit/check":
    case "OPTIONS /api/deposit/confirm":
    case "OPTIONS /api/deposit/cancel":
    case "OPTIONS /api/deposit/expire":
    case "OPTIONS /api/nokos/services":
    case "OPTIONS /api/nokos/products":
    case "OPTIONS /api/nokos/order":
    case "OPTIONS /api/nokos/order/sync":
    case "OPTIONS /api/nokos/order/cancel":
    case "OPTIONS /api/nokos/order/finish":
    case "OPTIONS /api/nokos/order/resend":
    case "OPTIONS /api/suntik-sosmed/services":
    case "OPTIONS /api/suntik-sosmed/order":
    case "OPTIONS /api/suntik-sosmed/orders":
    case "OPTIONS /api/suntik-sosmed/order/sync":
    case "OPTIONS /api/suntik-sosmed/order/cancel":
    case "OPTIONS /api/orders":
    case "OPTIONS /api/orders/order":
    case "OPTIONS /api/orders/cancel":
    case "OPTIONS /api/admin/orders":
    case "OPTIONS /api/admin/orders/status":
    case "OPTIONS /api/admin/orders/refund":
    case "OPTIONS /api/visitor/track":
    case "OPTIONS /api/visitor/pageview":
    case "OPTIONS /api/settings":
    case "OPTIONS /api/settings/public":
    case "OPTIONS /api/settings/value":
    case "OPTIONS /api/admin/dashboard":
    case "OPTIONS /api/admin/users":
    case "OPTIONS /api/admin/user":
    case "OPTIONS /api/admin/activity":
    case "OPTIONS /api/admin/counts":
    case "OPTIONS /api/admin/orders":
    case "OPTIONS /api/admin/visitors":
    case "OPTIONS /api/admin/visitor-stats":
    case "OPTIONS /api/admin/visitor/cleanup":
    case "OPTIONS /api/admin/settings":
    case "OPTIONS /api/admin/settings/value":
    case "OPTIONS /api/admin/setting":
    case "OPTIONS /api/admin/settings/reset":
      return new Response(null, {
        status: 204
      });

    default:
      return errorResponse(
        "Endpoint tidak ditemukan.",
        404
      );
  }
}

export default async function router(request, env, ctx) {
  try {
    return await handleRoute(
      request,
      env,
      ctx
    );
  } catch (error) {
    return errorResponse(
      error?.message ||
        "Terjadi kesalahan pada server.",
      error?.status >= 400 &&
      error?.status < 600
        ? error.status
        : 500
    );
  }
}
