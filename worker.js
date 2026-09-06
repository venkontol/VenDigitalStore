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
  "/admin"
]);

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self"
  ].join("; ")
});

function normalizePath(pathname) {
  return (
    pathname.replace(/\/+$/, "") ||
    "/"
  );
}

function isApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function isFrontendPath(pathname) {
  return FRONTEND_PATHS.has(
    pathname
  );
}

function applySecurityHeaders(
  response
) {
  const headers =
    new Headers(
      response.headers
    );

  for (
    const [
      key,
      value
    ] of Object.entries(
      SECURITY_HEADERS
    )
  ) {
    headers.set(
      key,
      value
    );
  }

  return new Response(
    response.body,
    {
      status:
        response.status,
      statusText:
        response.statusText,
      headers
    }
  );
}

function notFoundResponse() {
  return new Response(
    "Not Found",
    {
      status: 404,
      headers: {
        "Content-Type":
          "text/plain; charset=utf-8",
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff"
      }
    }
  );
}

async function serveFrontend(
  request,
  env,
  ctx
) {
  const url =
    new URL(
      request.url
    );

  const assetRequest =
    new Request(
      new URL(
        url.pathname,
        url.origin
      ),
      request
    );

  if (
    env?.ASSETS
  ) {
    const asset =
      await env.ASSETS.fetch(
        assetRequest
      );

    if (
      asset.status !== 404
    ) {
      return applySecurityHeaders(
        asset
      );
    }
  }

  return notFoundResponse();
}

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    const pathname =
      normalizePath(
        url.pathname
      );

    if (
      isApiPath(
        pathname
      )
    ) {
      const response =
        await router(
          request,
          env,
          ctx
        );

      return applySecurityHeaders(
        response
      );
    }

    if (
      request.method ===
        "GET" &&
      isFrontendPath(
        pathname
      )
    ) {
      return serveFrontend(
        request,
        env,
        ctx
      );
    }

    if (
      request.method ===
        "GET" &&
      !pathname.includes(".")
    ) {
      return serveFrontend(
        request,
        env,
        ctx
      );
    }

    return notFoundResponse();
  }
};
