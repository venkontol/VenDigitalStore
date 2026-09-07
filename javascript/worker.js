import router from "./router.js";

const FRONTEND_PATHS = new Set([
  "/", "/login", "/register", "/dashboard", "/nokos",
  "/suntik-sosmed", "/deposit", "/orders", "/account", "/admin"
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
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'"
  ].join("; ")
});

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isFrontendPath(pathname) {
  return FRONTEND_PATHS.has(pathname);
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

async function serveFrontend(request, env) {
  const url = new URL(request.url);

  if (env?.ASSETS) {
    try {
      const assetRequest = new Request(new URL(url.pathname, url.origin), request);
      const asset = await env.ASSETS.fetch(assetRequest);
      if (asset.status !== 404) {
        return applySecurityHeaders(asset);
      }
    } catch (assetError) {
      console.error("[ASSETS FETCH ERROR]", assetError);
    }
  }

  if (!url.pathname.includes(".")) {
    try {
      const indexRequest = new Request(new URL("/index.html", url.origin), request);
      if (env?.ASSETS) {
        const index = await env.ASSETS.fetch(indexRequest);
        if (index.status !== 404) {
          return applySecurityHeaders(new Response(index.body, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8", ...Object.fromEntries(index.headers) }
          }));
        }
      }
    } catch (indexError) {
      console.error("[INDEX FETCH ERROR]", indexError);
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
      } else if (request.method === "GET" && (isFrontendPath(pathname) || !pathname.includes("."))) {
        response = await serveFrontend(request, env);
      } else {
        response = notFoundResponse();
      }

      const secured = applySecurityHeaders(response);
      console.log(`[WORKER] ${request.method} ${pathname} → ${secured.status} (${Date.now() - start}ms)`);
      return secured;

    } catch (error) {
      console.error("[WORKER UNCAUGHT ERROR]", error);
      const fallback = applySecurityHeaders(serverErrorResponse());
      console.log(`[WORKER] ${request.method} ${pathname} → 500 (${Date.now() - start}ms) [uncaught]`);
      return fallback;
    }
  }
};
