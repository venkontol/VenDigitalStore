import { router } from "./src/router.js";

const HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#08050f">
  <title>VenDigitalStore</title>
  <meta name="description" content="VenDigitalStore">
</head>
<body>
  <div id="app"></div>
  <script>
    location.replace("/login");
  </script>
</body>
</html>`;

const SECURITY_HEADERS = {
  "Content-Type": "text/html; charset=UTF-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "img-src 'self' data: blob: https://raw.githubusercontent.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "font-src 'self' data:; " +
    "media-src 'self' blob:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
};

function pageResponse(body = HTML, status = 200) {
  return new Response(body, {
    status,
    headers: SECURITY_HEADERS
  });
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "X-Frame-Options",
    "DENY"
  );

  headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "img-src 'self' data: blob: https://raw.githubusercontent.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "font-src 'self' data:; " +
    "media-src 'self' blob:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function isApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function isAssetPath(pathname) {
  return (
    pathname.includes(".") &&
    !pathname.endsWith(".html")
  );
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (isApiPath(pathname)) {
        const response = await router(
          request,
          env,
          ctx
        );

        return applySecurityHeaders(response);
      }

      if (
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return new Response(
          "Method Not Allowed",
          {
            status: 405,
            headers: {
              "Content-Type":
                "text/plain; charset=UTF-8",
              "Cache-Control":
                "no-store",
              "Allow": "GET, HEAD"
            }
          }
        );
      }

      if (isAssetPath(pathname)) {
        return new Response(
          "Not Found",
          {
            status: 404,
            headers: {
              "Content-Type":
                "text/plain; charset=UTF-8",
              "Cache-Control":
                "no-store",
              "X-Content-Type-Options":
                "nosniff"
            }
          }
        );
      }

      return pageResponse();

    } catch (error) {
      console.error(
        "VEN_WORKER_ERROR",
        error
      );

      return new Response(
        "Internal Server Error",
        {
          status: 500,
          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8",
            "Cache-Control":
              "no-store"
          }
        }
      );
    }
  }
};
