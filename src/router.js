import { createDeposit, notifyCheckPayment, getQrisImage } from "./deposit.js";
import { handleTelegramWebhook } from "./telegram.js";
import { getSecurityHeaders } from "./utils.js";

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Apply Security Headers secara universal
  const headers = getSecurityHeaders();

  try {
    // API Webhook Telegram
    if (path === "/api/telegram/webhook" && method === "POST") {
      return await handleTelegramWebhook(request, env);
    }

    // Proxy QRIS Image (Akses Publik via Worker)
    if (path === "/api/deposit/qris" && method === "GET") {
      const imageResponse = await getQrisImage(env);
      return new Response(imageResponse.body, {
        status: imageResponse.status,
        headers: { ...headers, "Content-Type": "image/jpeg" }
      });
    }

    // --- PROTECTED ROUTES (BUTUH AUTENTIKASI) ---
    const sessionToken = getCookie(request, "session_id");
    const userId = sessionToken ? await validateSession(env, sessionToken) : null;

    if (!userId && path.startsWith("/api/wallet")) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    // Endpoint Deposit
    if (path === "/api/deposit/create" && method === "POST") {
      const res = await createDeposit(request, env, userId);
      return addHeaders(res, headers);
    }

    if (path === "/api/deposit/check" && method === "POST") {
      const res = await notifyCheckPayment(request, env, userId);
      return addHeaders(res, headers);
    }

    // Fallback 404
    return Response.json({ error: "Endpoint tidak ditemukan" }, { status: 404, headers });

  } catch (err) {
    return Response.json(
      { error: "Internal Server Error", detail: err.message },
      { status: 500, headers }
    );
  }
}

// Utility Helpers
function getCookie(request, name) {
  const cookieString = request.headers.get("Cookie");
  if (!cookieString) return null;
  const cookies = cookieString.split(";");
  for (let cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === name) return cookieValue;
  }
  return null;
}

async function validateSession(env, token) {
  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE id = ?"
  ).bind(token).first();

  if (!session || new Date(session.expires_at) < new Date()) {
    return null;
  }
  return session.user_id;
}

function addHeaders(response, headers) {
  Object.entries(headers).forEach(([key, val]) => {
    response.headers.set(key, val);
  });
  return response;
}
