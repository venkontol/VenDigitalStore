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
  getVisitorStats,
  trackVisitor
} from "./visitor.js";

import {
  getAdminDashboard,
  getAdminUsers,
  getAdminUser,
  updateAdminUser,
  getAdminDeposits,
  getAdminOrders,
  getAdminStats
} from "./admin.js";

import {
  getSettings,
  updateSettings
} from "./setting.js";

import {
  errorResponse,
  getMethod,
  getPath
} from "./utils.js";

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...headers
      }
    }
  );
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function optionsResponse() {
  return new Response(
    null,
    {
      status: 204,
      headers: corsHeaders()
    }
  );
}

function withCors(response) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}

async function parseBody(request) {
  const contentType =
    request.headers.get("content-type") || "";

  if (
    contentType.includes("application/json")
  ) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  if (
    contentType.includes(
      "application/x-www-form-urlencoded"
    )
  ) {
    const formData =
      await request.formData();

    return Object.fromEntries(
      formData.entries()
    );
  }

  try {
    const text = await request.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

function routeMatches(
  method,
  path,
  expectedMethod,
  expectedPath
) {
  return (
    method === expectedMethod &&
    path === expectedPath
  );
}

export default async function router(
  request,
  env,
  ctx
) {
  try {
    const method = getMethod(request);
    const path = getPath(request);

    if (method === "OPTIONS") {
      return optionsResponse();
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/auth/register"
      )
    ) {
      const body = await parseBody(request);
      return withCors(
        await register(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/auth/login"
      )
    ) {
      const body = await parseBody(request);
      return withCors(
        await login(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/auth/logout"
      )
    ) {
      return withCors(
        await logout(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/auth/logout-all"
      )
    ) {
      return withCors(
        await logoutAll(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/auth/me"
      )
    ) {
      return withCors(
        await me(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/wallet"
      )
    ) {
      return withCors(
        await getWalletOverview(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/wallet/balance"
      )
    ) {
      return withCors(
        await getWalletBalance(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/wallet/transactions"
      )
    ) {
      return withCors(
        await getWalletTransactions(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/deposit/create"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await createDeposit(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/deposit"
      )
    ) {
      return withCors(
        await getDeposit(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/deposit/check"
      )
    ) {
      return withCors(
        await checkDeposit(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/deposit/confirm"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await confirmDeposit(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/deposit/cancel"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await cancelDeposit(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/deposit/expire"
      )
    ) {
      return withCors(
        await expireDeposits(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/nokos/services"
      )
    ) {
      return withCors(
        await listNokosProducts(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/nokos/order"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await createNokosOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/nokos/order"
      )
    ) {
      return withCors(
        await getNokosOrder(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/nokos/sync"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await syncNokosOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/nokos/cancel"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await cancelNokosOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/nokos/finish"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await finishNokosOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/nokos/resend"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await resendNokosOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/suntik-sosmed/services"
      )
    ) {
      return withCors(
        await listSocialServices(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/suntik-sosmed/order"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await createSocialOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/suntik-sosmed/order"
      )
    ) {
      return withCors(
        await getSocialOrder(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/suntik-sosmed/sync"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await syncSocialOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/suntik-sosmed/orders"
      )
    ) {
      return withCors(
        await listSocialOrders(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/suntik-sosmed/cancel"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await cancelSocialOrder(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      method === "GET" &&
      (
        path === "/api/orders" ||
        path === "/api/orders/order" ||
        path === "/api/admin/orders"
      )
    ) {
      return withCors(
        await handleOrders(
          request,
          env,
          ctx
        )
      );
    }

    if (
      method === "POST" &&
      (
        path === "/api/orders" ||
        path === "/api/orders/cancel" ||
        path === "/api/admin/orders/status" ||
        path === "/api/admin/orders/refund"
      )
    ) {
      return withCors(
        await handleOrders(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/visitor/stats"
      )
    ) {
      return withCors(
        await getVisitorStats(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/visitor/track"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await trackVisitor(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/admin/dashboard"
      )
    ) {
      return withCors(
        await getAdminDashboard(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/admin/users"
      )
    ) {
      return withCors(
        await getAdminUsers(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/admin/user"
      )
    ) {
      return withCors(
        await getAdminUser(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/admin/user"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await updateAdminUser(
          request,
          env,
          ctx,
          body
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/admin/deposits"
      )
    ) {
      return withCors(
        await getAdminDeposits(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/admin/stats"
      )
    ) {
      return withCors(
        await getAdminStats(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "GET",
        "/api/settings"
      )
    ) {
      return withCors(
        await getSettings(
          request,
          env,
          ctx
        )
      );
    }

    if (
      routeMatches(
        method,
        path,
        "POST",
        "/api/settings"
      )
    ) {
      const body = await parseBody(request);

      return withCors(
        await updateSettings(
          request,
          env,
          ctx,
          body
        )
      );
    }

    return withCors(
      jsonResponse(
        {
          success: false,
          error: "Endpoint tidak ditemukan."
        },
        404
      )
    );
  } catch (error) {
    return withCors(
      errorResponse(
        error?.message ||
          "Terjadi kesalahan pada server.",
        500
      )
    );
  }
}
