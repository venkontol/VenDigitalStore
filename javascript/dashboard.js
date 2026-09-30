import {
  errorResponse,
  jsonResponse,
  formatRupiah
} from "./utils.js";

import { requireAuth } from "./auth.js";

async function getUserStats(env, userId) {
  try {
    const depositResult = await env.DB
      .prepare(
        `
          SELECT
            COALESCE(SUM(amount), 0) AS total_deposit
          FROM deposits
          WHERE user_id = ? AND status = 'PAID'
        `
      )
      .bind(userId)
      .first();

    const orderResult = await env.DB
      .prepare(
        `
          SELECT
            COUNT(*) AS total_orders,
            SUM(CASE WHEN status IN ('PENDING', 'CREATING', 'PROCESSING', 'OTP_RECEIVED') THEN 1 ELSE 0 END) AS active_orders,
            SUM(CASE WHEN status IN ('COMPLETED', 'PARTIAL', 'REFUNDED') THEN 1 ELSE 0 END) AS completed_orders
          FROM orders
          WHERE user_id = ?
        `
      )
      .bind(userId)
      .first();

    return {
      total_deposit: Number(depositResult?.total_deposit || 0),
      total_orders: Number(orderResult?.total_orders || 0),
      active_orders: Number(orderResult?.active_orders || 0),
      completed_orders: Number(orderResult?.completed_orders || 0)
    };
  } catch (error) {
    console.error(
      "[DASHBOARD STATS ERROR]",
      error
    );

    return {
      total_deposit: 0,
      total_orders: 0,
      active_orders: 0,
      completed_orders: 0
    };
  }
}

async function getLatestAnnouncement(env) {
  try {
    const row = await env.DB
      .prepare(
        `
          SELECT
            id,
            title,
            content
          FROM announcements
          WHERE is_active = 1
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .first();

    if (!row) {
      return {
        id: null,
        title: "Selamat datang di NexusBase",
        content: "Platform layanan digital otomatis real-time 24 jam."
      };
    }

    return {
      id: row.id,
      title: row.title,
      content: row.content
    };
  } catch (error) {
    console.error(
      "[DASHBOARD ANNOUNCEMENT ERROR]",
      error
    );

    return {
      id: null,
      title: "Selamat datang di NexusBase",
      content: "Platform layanan digital otomatis real-time 24 jam."
    };
  }
}

async function getRecentOrders(env, userId, limit = 5) {
  try {
    const results = await env.DB
      .prepare(
        `
          SELECT
            id,
            order_number,
            type,
            service_name,
            target,
            quantity,
            customer_amount,
            status,
            created_at
          FROM orders
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `
      )
      .bind(userId, limit)
      .all();

    return (results?.results || []).map(row => ({
      id: row.id,
      order_number: row.order_number,
      type: row.type,
      service_name: row.service_name,
      target: row.target,
      quantity: Number(row.quantity || 0),
      amount: Number(row.customer_amount || 0),
      status: row.status,
      created_at: row.created_at
    }));
  } catch (error) {
    console.error(
      "[DASHBOARD ORDERS ERROR]",
      error
    );

    return [];
  }
}

async function getAvailableServices(env, limit = 10) {
  try {
    const nokosResults = await env.DB
      .prepare(
        `
          SELECT
            id,
            service_name,
            selling_price,
            'nokos' AS type
          FROM nokos_services
          WHERE available = 1 AND active = 1
          ORDER BY service_name ASC
          LIMIT ?
        `
      )
      .bind(limit / 2)
      .all();

    const socialResults = await env.DB
      .prepare(
        `
          SELECT
            id,
            service_name,
            selling_rate_per_1000,
            'sosmed' AS type
          FROM social_services
          WHERE available = 1 AND active = 1
          ORDER BY service_name ASC
          LIMIT ?
        `
      )
      .bind(limit / 2)
      .all();

    const services = [
      ...(nokosResults?.results || []).map(row => ({
        id: row.id,
        name: row.service_name,
        type: "Nokos",
        price: Number(row.selling_price || 0)
      })),
      ...(socialResults?.results || []).map(row => ({
        id: row.id,
        name: row.service_name,
        type: "Suntik Sosmed",
        price: Number(row.selling_rate_per_1000 || 0)
      }))
    ];

    return services.slice(0, limit);
  } catch (error) {
    console.error(
      "[DASHBOARD SERVICES ERROR]",
      error
    );

    return [];
  }
}

export async function getDashboard(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const auth = await requireAuth(
      request,
      env
    );

    if (auth.response) {
      return auth.response;
    }

    const user = auth.user;
    const userId = user.id;

    const stats = await getUserStats(env, userId);
    const announcement = await getLatestAnnouncement(env);
    const recentOrders = await getRecentOrders(env, userId);
    const services = await getAvailableServices(env);

    const firstName = String(user.first_name || "User").split(" ")[0];
    const greeting = `Halo, ${firstName}! 👋`;

    return jsonResponse({
      success: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        username: user.username,
        balance: Number(user.balance || 0),
        balance_formatted: formatRupiah(user.balance || 0)
      },
      greeting,
      stats: {
        total_deposit: stats.total_deposit,
        active_orders: stats.active_orders,
        total_orders: stats.total_orders,
        completed_orders: stats.completed_orders
      },
      announcement,
      recent_orders: recentOrders,
      services
    });
  } catch (error) {
    console.error(
      "[DASHBOARD GET ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil data dashboard.",
      500
    );
  }
}

export default {
  getDashboard
};
