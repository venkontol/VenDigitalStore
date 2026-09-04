import { authHandler } from "./auth.js";
import { walletHandler } from "./wallet.js";
import { depositHandler } from "./deposit.js";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";

  const configuredOrigin =
    env.ALLOWED_ORIGIN ||
    env.FRONTEND_URL ||
    "";

  let allowOrigin = "*";

  if (configuredOrigin) {
    allowOrigin = configuredOrigin;
  } else if (origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, X-Idempotency-Key",
    "Access-Control-Allow-Credentials":
      allowOrigin === "*" ? "false" : "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, headers = {}) {
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

function notFound() {
  return json(
    {
      success: false,
      error: "Endpoint tidak ditemukan."
    },
    404
  );
}

function methodNotAllowed() {
  return json(
    {
      success: false,
      error: "Method tidak diizinkan."
    },
    405,
    {
      Allow: ALLOWED_METHODS
    }
  );
}

function serverError() {
  return json(
    {
      success: false,
      error: "Terjadi kesalahan pada server."
    },
    500
  );
}

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }

  if (pathname.length > 1) {
    return pathname.replace(/\/+$/, "");
  }

  return pathname;
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204
    });
  }

  if (!pathname.startsWith("/api")) {
    return notFound();
  }

  if (pathname === "/api") {
    return json({
      success: true,
      name: "VenDigitalStore API",
      version: "1.0.0",
      status: "online"
    });
  }

  if (
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/")
  ) {
    return await authHandler(
      request,
      env,
      pathname
    );
  }

  if (
  pathname === "/api/wallet" ||
  pathname.startsWith("/api/wallet/")
) {
  return await walletHandler(
    request,
    env,
    pathname
  );
    }

  if (
  pathname === "/api/deposit" ||
  pathname.startsWith("/api/deposit/")
) {
  return await depositHandler(
    request,
    env,
    pathname
  );
  }

  switch (pathname) {
    case "/api/health":
      return json({
        success: true,
        status: "ok",
        service: "VenDigitalStore API"
      });

    default:
      return notFound();
  }
}

export async function router(request, env, ctx) {
  try {
    const response = await handleApi(
      request,
      env,
      ctx
    );

    const headers = corsHeaders(
      request,
      env
    );

    const newHeaders = new Headers(
      response.headers
    );

    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }

    return new Response(
      response.body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      }
    );
  } catch (error) {
    console.error(
      "ROUTER_ERROR",
      error
    );

    const response = serverError();

    const headers = corsHeaders(
      request,
      env
    );

    const newHeaders = new Headers(
      response.headers
    );

    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }

    return new Response(
      response.body,
      {
        status: 500,
        headers: newHeaders
      }
    );
  }
}

export default router;
