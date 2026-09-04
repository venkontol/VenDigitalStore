import { router } from "./src/router.js";
import { renderPage } from "./web/pages.js";

function securityHeaders(response) {
const headers = new Headers(response.headers);

headers.set("X-Content-Type-Options", "nosniff");
headers.set("X-Frame-Options", "SAMEORIGIN");
headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
headers.set(
"Permissions-Policy",
"camera=(), microphone=(), geolocation=()"
);

headers.set(
"Content-Security-Policy",
[
"default-src 'self'",
"script-src 'self' 'unsafe-inline'",
"style-src 'self' 'unsafe-inline'",
"img-src 'self' data: blob: https://raw.githubusercontent.com",
"font-src 'self' data:",
"connect-src 'self'",
"media-src 'self' blob:",
"object-src 'none'",
"base-uri 'self'",
"form-action 'self'",
"frame-ancestors 'self'"
].join("; ")
);

return new Response(response.body, {
status: response.status,
statusText: response.statusText,
headers
});
}

function htmlResponse(html, status = 200) {
return new Response(html, {
status,
headers: {
"Content-Type": "text/html; charset=UTF-8",
"Cache-Control": "no-store"
}
});
}

function jsonResponse(data, status = 200) {
return new Response(JSON.stringify(data), {
status,
headers: {
"Content-Type": "application/json; charset=UTF-8",
"Cache-Control": "no-store"
}
});
}

function normalizePath(pathname) {
if (!pathname || pathname === "/") {
return "/";
}

if (pathname.length > 1 && pathname.endsWith("/")) {
return pathname.slice(0, -1);
}

return pathname;
}

function isWebPage(pathname) {
return [
"/",
"/login",
"/register",
"/loading",
"/dashboard",
"/deposit",
"/products",
"/marketplace",
"/orders",
"/account"
].includes(pathname);
}

async function handleWeb(request) {
if (request.method !== "GET") {
return null;
}

const url = new URL(request.url);
const pathname = normalizePath(url.pathname);

if (!isWebPage(pathname)) {
return null;
}

return htmlResponse(renderPage(pathname));
}

export default {
async fetch(request, env, ctx) {
try {
const url = new URL(request.url);
const pathname = normalizePath(url.pathname);

  if (
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    const response = await router(
      request,
      env,
      ctx
    );

    return securityHeaders(response);
  }

  const web = await handleWeb(request);

  if (web) {
    return securityHeaders(web);
  }

  return securityHeaders(
    htmlResponse(
      "<!doctype html><html><head><meta charset='UTF-8'><title>VEN Digital Store</title></head><body style='background:#050509;color:white;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh'><div><h1>404</h1><p>Halaman tidak ditemukan.</p></div></body></html>",
      404
    )
  );
} catch (error) {
  console.error(
    "VEN_WORKER_ERROR",
    error
  );

  return securityHeaders(
    jsonResponse(
      {
        success: false,
        error: "Internal Server Error"
      },
      500
    )
  );
}

}
};
