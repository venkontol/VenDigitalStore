import router from "./router.js";
import { requireAuth } from "./auth.js";

const HTML_MAP = Object.freeze({
  "/": "/html/index.html",
  "/login": "/html/index.html",
  "/register": "/html/index.html",
  "/dashboard": "/html/dashboard.html",
  "/nokos": "/html/nokos.html",
  "/suntik-sosmed": "/html/suntik-sosmed.html",
  "/deposit": "/html/deposit.html",
  "/orders": "/html/transaksi.html",
  "/transaksi": "/html/transaksi.html",
  "/account": "/html/account.html",
  "/admin": "/html/dashboard.html",
  "/bantuan": "/html/bantuan.html"
});

const ALLOWED_STATIC_PREFIXES = ["/images/", "/html/"];
const ALLOWED_STATIC_FILES = new Set(["/favicon.ico", "/robots.txt"]);

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'"
  ].join("; ")
});

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAllowedStatic(pathname) {
  if (ALLOWED_STATIC_FILES.has(pathname)) return true;
  return ALLOWED_STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function serverErrorResponse() {
  return new Response("Internal Server Error", {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function tryAsset(env, path, request) {
  if (!env?.ASSETS) {
    console.error("[ASSETS BINDING MISSING]");
    return null;
  }

  try {
    const assetUrl = new URL(path, new URL(request.url).origin);
    const assetRequest = new Request(assetUrl, {
      method: "GET",
      headers: request.headers
    });

    const response = await env.ASSETS.fetch(assetRequest);

    console.log(
      `[ASSET] ${path} → ${response.status}, content-type=${response.headers.get("content-type") || "missing"}, content-length=${response.headers.get("content-length") || "unknown"}`
    );

    if (response.status === 404) return null;

    return response;
  } catch (error) {
    console.error("[ASSETS FETCH ERROR]", path, error);
    return null;
  }
}

const GLOBAL_HEADER_BALANCE_SCRIPT = `
<script data-nexus-global-balance>
(() => {
  const endpoint = "/api/auth/me";
  const formatRupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
  let loading = false;
  let lastUserId = null;
  let activeHeader = null;
  let observer = null;
  let retryTimer = null;

  const getHeader = () => {
    const value = document.getElementById("saldoValue");
    const balance = document.querySelector("[data-nexus-balance]") || value?.closest(".bal") || value?.parentElement || null;
    const avatar = document.querySelector("[data-nexus-avatar]") || document.querySelector(".avatar");
    return { balance, value, avatar };
  };

  const updateHeader = user => {
    const { balance, value, avatar } = getHeader();
    if (!balance || !value) return false;
    const username = String(user?.username || "").trim();
    const amount = Number(user?.balance ?? 0);
    balance.classList.remove("loading", "error");
    value.textContent = formatRupiah(Number.isFinite(amount) ? amount : 0);
    if (avatar) avatar.textContent = username ? username.charAt(0).toUpperCase() : "N";
    lastUserId = user?.id ?? null;
    return true;
  };

  const setLoading = () => {
    const { balance } = getHeader();
    if (balance) balance.classList.add("loading");
  };

  const setError = () => {
    const { balance, value } = getHeader();
    if (value) value.textContent = "—";
    if (balance) {
      balance.classList.remove("loading");
      balance.classList.add("error");
    }
  };

  const scheduleRetry = () => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      loadBalance(true);
    }, 1500);
  };

  const loadBalance = async force => {
    const { balance, value } = getHeader();
    if (!balance || !value || loading) return false;
    if (!force && activeHeader !== balance) return false;
    loading = true;
    setLoading();
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true || !result.user) {
        throw new Error(result.error || result.message || "Saldo gagal dimuat");
      }
      return updateHeader(result.user);
    } catch (error) {
      console.error("[NEXUS BALANCE]", error);
      setError();
      scheduleRetry();
      return false;
    } finally {
      loading = false;
    }
  };

  const detectHeader = () => {
    const { balance, value } = getHeader();
    if (!value) return false;
    if (activeHeader !== value) {
      activeHeader = value;
      loadBalance(true);
      return true;
    }
    return true;
  };

  window.NexusBalance = {
    refresh: () => loadBalance(true),
    get userId() { return lastUserId; }
  };

  detectHeader();

  observer = new MutationObserver(() => {
    detectHeader();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("nexusbase:header-ready", () => detectHeader());
  window.addEventListener("nexusbase:balance-updated", () => loadBalance(true));
  window.addEventListener("nexusbase:deposit-confirmed", () => loadBalance(true));
  window.addEventListener("nexusbase:order-created", () => loadBalance(true));
  window.addEventListener("nexusbase:order-completed", () => loadBalance(true));
  window.addEventListener("pageshow", () => detectHeader());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") detectHeader();
  });
})();
</script>`;

function injectGlobalHeaderBalance(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;
  return new HTMLRewriter()
    .on("body", {
      element(element) {
        element.append(GLOBAL_HEADER_BALANCE_SCRIPT, { html: true });
      }
    })
    .transform(response);
}

async function getCurrentUserBalance(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;
  if (!env?.DB) {
    return new Response(JSON.stringify({ success: false, error: "Database tidak tersedia." }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" }
    });
  }
  try {
    const user = await env.DB.prepare(`
      SELECT id, username, balance, is_admin
      FROM users
      WHERE id = ?
      LIMIT 1
    `).bind(auth.user.id).first();
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: "Akun tidak ditemukan." }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: Number(user.id),
        username: user.username || "",
        balance: Number(user.balance || 0),
        is_admin: Boolean(user.is_admin)
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("[AUTH ME ERROR]", error);
    return new Response(JSON.stringify({ success: false, error: "Gagal mengambil data akun." }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store" }
    });
  }
}

async function serveFrontend(request, env) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (HTML_MAP[pathname]) {
    const asset = await tryAsset(env, HTML_MAP[pathname], request);
    if (asset) return applySecurityHeaders(asset);
  }

  if (pathname.endsWith(".html")) {
    const candidates = pathname.startsWith("/html/")
      ? [pathname]
      : [`/html/${pathname.slice(1)}`, pathname];

    for (const candidate of candidates) {
      if (!candidate.startsWith("/html/")) continue;

      const asset = await tryAsset(env, candidate, request);
      if (asset) return applySecurityHeaders(asset);
    }
  }

  if (isAllowedStatic(pathname)) {
    const asset = await tryAsset(env, pathname, request);
    if (asset) return applySecurityHeaders(asset);
  }

  if (!pathname.includes(".")) {
    const indexAsset = await tryAsset(env, "/html/index.html", request);
    if (indexAsset) return applySecurityHeaders(indexAsset);
  }

  return notFoundResponse();
}

export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    try {
      let response;

      if (isApiPath(pathname)) {
        if (request.method === "GET" && pathname === "/api/auth/me") {
          response = await getCurrentUserBalance(request, env);
        } else {
          response = await router(request, env, ctx);
        }
      } else if (request.method === "GET" || request.method === "HEAD") {
        response = await serveFrontend(request, env);
        if (request.method === "HEAD") {
          response = new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
      } else {
        response = notFoundResponse();
      }

      const frontendResponse = isApiPath(pathname) || request.method === "HEAD"
        ? response
        : injectGlobalHeaderBalance(response);
      const secured = applySecurityHeaders(frontendResponse);

      console.log(
        `[WORKER] ${request.method} ${pathname} → ${secured.status} (${Date.now() - start}ms)`
      );

      return secured;
    } catch (error) {
      console.error("[WORKER UNCAUGHT ERROR]", error);

      const fallback = applySecurityHeaders(serverErrorResponse());

      console.log(
        `[WORKER] ${request.method} ${pathname} → 500 (${Date.now() - start}ms) [uncaught]`
      );

      return fallback;
    }
  }
};
