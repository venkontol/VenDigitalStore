import router from "./router.js";

const FRONTEND_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/dashboard",
  "/nokos",
  "/suntik-sosmed",
  "/deposit",
  "/orders",
  "/account",
  "/admin",
  "/bantuan",
  "/transaksi"
]);

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

// Only these prefixes/paths are allowed to be served as static assets
const ALLOWED_STATIC_PREFIXES = ["/images/", "/html/"];
const ALLOWED_STATIC_FILES = new Set([
  "/favicon.ico",
  "/robots.txt"
]);

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

function serverErrorResponse(message = "Internal Server Error") {
  return new Response(message, {
    status: 500,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function tryAsset(env, path, request) {
  if (!env?.ASSETS) return null;
  try {
    const assetRequest = new Request(
      new URL(path, new URL(request.url).origin),
      request
    );
    const asset = await env.ASSETS.fetch(assetRequest);
    if (asset.status !== 404) {
      return asset;
    }
  } catch (err) {
    console.error("[ASSETS FETCH ERROR]", path, err);
  }
  return null;
}

async function serveFrontend(request, env) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  // 1. Exact mapped clean path → html/*.html
  if (HTML_MAP[pathname]) {
    const asset = await tryAsset(env, HTML_MAP[pathname], request);
    if (asset) {
      return applySecurityHeaders(
        new Response(asset.body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...Object.fromEntries(asset.headers)
          }
        })
      );
    }
  }

  // 2. Direct .html request (e.g. /dashboard.html or /html/dashboard.html)
  if (pathname.endsWith(".html")) {
    const candidates = [
      pathname.startsWith("/html/") ? pathname : `/html/${pathname.slice(1)}`,
      pathname
    ];
    for (const candidate of candidates) {
      if (!isAllowedStatic(candidate) && !candidate.startsWith("/html/")) continue;
      const asset = await tryAsset(env, candidate, request);
      if (asset) {
        return applySecurityHeaders(
          new Response(asset.body, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              ...Object.fromEntries(asset.headers)
            }
          })
        );
      }
    }
  }

  // 3. Allowed static assets only (/images/*, /html/*, favicon, robots)
  if (isAllowedStatic(pathname)) {
    const asset = await tryAsset(env, pathname, request);
    if (asset) {
      return applySecurityHeaders(asset);
    }
  }

  // 4. Fallback for unknown clean paths → index
  if (!pathname.includes(".")) {
    const indexAsset = await tryAsset(env, "/html/index.html", request);
    if (indexAsset) {
      return applySecurityHeaders(
        new Response(indexAsset.body, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...Object.fromEntries(indexAsset.headers)
          }
        })
      );
    }
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
        response = await router(request, env, ctx);
      } else if (request.method === "GET") {
        response = await serveFrontend(request, env);
      } else {
        response = notFoundResponse();
      }

      const secured = applySecurityHeaders(response);
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
