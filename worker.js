import { json } from "./src/utils.js";
import { handleUpdate, handleScheduled } from "./src/index.js";

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        return new Response("VenDigitalStore Telegram Bot is online.", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8"
          }
        });
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        return json({
          success: true,
          service: "VenDigitalStore",
          modular: true,
          telegram: "online",
          database: "D1"
        });
      }

      if (request.method === "POST" && url.pathname === "/telegram/webhook") {
        const update = await request.json();

        ctx.waitUntil(
          handleUpdate(env, update).catch((error) => {
            console.error("Webhook error:", error?.message || error);
          })
        );

        return json({ success: true });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return json(
        {
          success: false,
          error: error?.message || "Unknown error"
        },
        500
      );
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleScheduled(env).catch((error) => {
        console.error("Scheduled error:", error?.message || error);
      })
    );
  }
};
