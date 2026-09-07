import {
  register, login, logout, logoutAll, me
} from "./auth.js";

import {
  createDeposit, getDeposit, checkDeposit, confirmDeposit, cancelDeposit, expireDeposits
} from "./deposit.js";

import {
  getWalletOverview, getWalletBalance, getWalletTransactions
} from "./wallet.js";

import {
  listNokosProducts, createNokosOrder, getNokosOrder, syncNokosOrder,
  cancelNokosOrder, finishNokosOrder, resendNokosOrder,
  listMyNokosOrders, adminListNokosOrders, adminGetNokosOrder, getNokosStats
} from "./nokos.js";

import {
  listSocialServices, createSocialOrder, getSocialOrder, syncSocialOrder,
  listSocialOrders, cancelSocialOrder
} from "./suntik-sosmed.js";

import { handleOrders } from "./orders.js";
import { getVisitorStats, trackVisitor } from "./visitor.js";
import {
  getAdminDashboard, getAdminUsers, getAdminUser, updateAdminUser,
  getAdminDeposits, getAdminOrders, getAdminStats
} from "./admin.js";

import { getSettings, updateSettings } from "./setting.js";
import { errorResponse, getMethod, getPath } from "./utils.js";

/* ──────────────── CORS & Response Helpers ──────────────── */

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/* ──────────────── Body Parser ──────────────── */

async function parseBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  try {
    const text = await request.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return {}; }
  } catch { return {}; }
}

/* ──────────────── Route Registry ──────────────── */

function route(method, path, handler, needsBody = false) {
  return { method, path, handler, needsBody };
}

const ROUTES = [
  /* Auth */
  route("POST", "/api/auth/register", register, true),
  route("POST", "/api/auth/login", login, true),
  route("POST", "/api/auth/logout", logout),
  route("POST", "/api/auth/logout-all", logoutAll),
  route("GET",  "/api/auth/me", me),

  /* Wallet */
  route("GET", "/api/wallet", getWalletOverview),
  route("GET", "/api/wallet/balance", getWalletBalance),
  route("GET", "/api/wallet/transactions", getWalletTransactions),

  /* Deposit */
  route("POST", "/api/deposit/create", createDeposit, true),
  route("GET",  "/api/deposit", getDeposit),
  route("GET",  "/api/deposit/check", checkDeposit),
  route("POST", "/api/deposit/confirm", confirmDeposit, true),
  route("POST", "/api/deposit/cancel", cancelDeposit, true),
  route("POST", "/api/deposit/expire", expireDeposits),

  /* NOKOS */
  route("GET",  "/api/nokos/services", listNokosProducts),
  route("POST", "/api/nokos/order", createNokosOrder, true),
  route("GET",  "/api/nokos/order", getNokosOrder),
  route("POST", "/api/nokos/sync", syncNokosOrder, true),
  route("POST", "/api/nokos/cancel", cancelNokosOrder, true),
  route("POST", "/api/nokos/finish", finishNokosOrder, true),
  route("POST", "/api/nokos/resend", resendNokosOrder, true),
  route("GET",  "/api/nokos/orders", listMyNokosOrders),

  /* NOKOS Admin */
  route("GET", "/api/admin/nokos/orders", adminListNokosOrders),
  route("GET", "/api/admin/nokos/order", adminGetNokosOrder),
  route("GET", "/api/admin/nokos/stats", getNokosStats),

  /* Suntik Sosmed */
  route("GET",  "/api/suntik-sosmed/services", listSocialServices),
  route("POST", "/api/suntik-sosmed/order", createSocialOrder, true),
  route("GET",  "/api/suntik-sosmed/order", getSocialOrder),
  route("POST", "/api/suntik-sosmed/sync", syncSocialOrder, true),
  route("GET",  "/api/suntik-sosmed/orders", listSocialOrders),
  route("POST", "/api/suntik-sosmed/cancel", cancelSocialOrder, true),

  /* Orders (delegated) */
  route("GET",  "/api/orders", handleOrders),
  route("GET",  "/api/orders/order", handleOrders),
  route("POST", "/api/orders", handleOrders, true),
  route("POST", "/api/orders/cancel", handleOrders, true),

  /* Admin Orders */
  route("GET",  "/api/admin/orders", handleOrders),
  route("POST", "/api/admin/orders/status", handleOrders, true),
  route("POST", "/api/admin/orders/refund", handleOrders, true),

  /* Visitor */
  route("GET",  "/api/visitor/stats", getVisitorStats),
  route("POST", "/api/visitor/track", trackVisitor, true),

  /* Admin */
  route("GET",  "/api/admin/dashboard", getAdminDashboard),
  route("GET",  "/api/admin/users", getAdminUsers),
  route("GET",  "/api/admin/user", getAdminUser),
  route("POST", "/api/admin/user", updateAdminUser, true),
  route("GET",  "/api/admin/deposits", getAdminDeposits),
  route("GET",  "/api/admin/stats", getAdminStats),

  /* Settings */
  route("GET",  "/api/settings", getSettings),
  route("POST", "/api/settings", updateSettings, true)
];

/* ──────────────── Simple In-Memory Rate Limiting ──────────────── */

const RATE_LIMIT = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;

function checkRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP")
          || request.headers.get("X-Forwarded-For")
          || "unknown";

  const now = Date.now();
  const entry = RATE_LIMIT.get(ip);

  if (!entry || now > entry.resetAt) {
    RATE_LIMIT.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_MAX_REQUESTS) {
    return {
      allowed: false,
      response: jsonResponse({
        success: false,
        error: "Rate limit exceeded. Coba lagi dalam 1 menit."
      }, 429, { "Retry-After": "60" })
    };
  }

  entry.count++;
  return { allowed: true };
}

/* ──────────────── Request Logging ──────────────── */

function logRequest(request, status, durationMs) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;
  const ip = request.headers.get("CF-Connecting-IP") || "-";
  console.log(`[${new Date().toISOString()}] ${ip} ${method} ${path} → ${status} (${durationMs}ms)`);
}

/* ──────────────── Main Router ──────────────── */

export default async function router(request, env, ctx) {
  const start = Date.now();

  try {
    const method = getMethod(request);
    const path = getPath(request);

    if (method === "OPTIONS") {
      return optionsResponse();
    }

    const rate = checkRateLimit(request);
    if (!rate.allowed) {
      logRequest(request, 429, Date.now() - start);
      return withCors(rate.response);
    }

    if (method === "GET" && path === "/api/health") {
      const response = jsonResponse({ success: true, status: "ok", timestamp: Math.floor(Date.now() / 1000) });
      logRequest(request, 200, Date.now() - start);
      return withCors(response);
    }

    const matched = ROUTES.find(r => r.method === method && r.path === path);

    if (!matched) {
      const response = jsonResponse({ success: false, error: "Endpoint tidak ditemukan." }, 404);
      logRequest(request, 404, Date.now() - start);
      return withCors(response);
    }

    const body = matched.needsBody ? await parseBody(request) : undefined;
    const result = matched.needsBody
      ? await matched.handler(request, env, ctx, body)
      : await matched.handler(request, env, ctx);

    const response = withCors(result);
    logRequest(request, response.status, Date.now() - start);
    return response;

  } catch (error) {
    console.error("[ROUTER ERROR]", error);
    const response = withCors(errorResponse(
      error?.message || "Terjadi kesalahan pada server.", 500
    ));
    logRequest(request, 500, Date.now() - start);
    return response;
  }
}
