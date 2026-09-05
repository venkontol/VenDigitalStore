import { router } from "./src/router.js";

export default {
  async fetch(request, env, ctx) {
    try {
      // Pastikan request memiliki environment D1
      if (!env.DB) {
        return jsonResponse(
          {
            success: false,
            error: "D1 database binding (DB) tidak tersedia."
          },
          500
        );
      }

      // Health check
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return jsonResponse({
          success: true,
          service: "VenDigitalStore",
          status: "ok",
          database: "connected",
          timestamp: new Date().toISOString()
        });
      }

      // Semua request utama diteruskan ke router
      return await router(request, env, ctx);
    } catch (error) {
      console.error("Worker error:", error);

      return jsonResponse(
        {
          success: false,
          error: "Internal server error"
        },
        500
      );
    }
  }
};

/**
 * JSON response helper
 */
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
  }
