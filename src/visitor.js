import {
  errorResponse,
  successResponse,
  cleanString,
  getClientIp,
  getUserAgent,
  nowUnix,
  sha256,
  getCurrentUser
} from "./utils.js";

export async function trackVisitor(request, env) {
  const url = new URL(request.url);

  if (
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    return errorResponse("Method tidak didukung.", 405);
  }

  const path = cleanString(url.pathname, 500) || "/";

  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const visitorSource =
    `${ip}|${userAgent}`;

  const visitorId =
    await sha256(visitorSource);

  const timestamp = nowUnix();

  const user = await getCurrentUser(request, env).catch(
    () => null
  );

  const userId = user ? Number(user.id) : null;
  const isLoggedIn = user ? 1 : 0;

  const existing = await env.DB.prepare(`
    SELECT
      id,
      first_seen_at,
      last_seen_at,
      page_views
    FROM visitor_sessions
    WHERE visitor_id = ?
    LIMIT 1
  `).bind(visitorId).first();

  let isReturning = 0;

  if (existing) {
    isReturning =
      Number(existing.page_views || 0) > 0 ? 1 : 0;

    await env.DB.prepare(`
      UPDATE visitor_sessions
      SET last_seen_at = ?,
          last_path = ?,
          page_views = page_views + 1,
          is_logged_in = ?,
          user_id = ?
      WHERE id = ?
    `).bind(
      timestamp,
      path,
      isLoggedIn,
      userId,
      existing.id
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO visitor_sessions (
        visitor_id,
        first_seen_at,
        last_seen_at,
        last_path,
        page_views,
        is_logged_in,
        user_id
      )
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(
      visitorId,
      timestamp,
      timestamp,
      path,
      isLoggedIn,
      userId
    ).run();
  }

  const statDate =
    new Date(timestamp * 1000)
      .toISOString()
      .slice(0, 10);

  const existingStats = await env.DB.prepare(`
    SELECT id
    FROM visitor_stats
    WHERE stat_date = ?
    LIMIT 1
  `).bind(statDate).first();

  if (existingStats) {
    await env.DB.prepare(`
      UPDATE visitor_stats
      SET total_views = total_views + 1,
          unique_visitors = unique_visitors + ?,
          returning_visitors = returning_visitors + ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      existing ? 0 : 1,
      isReturning,
      timestamp,
      existingStats.id
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO visitor_stats (
        stat_date,
        total_views,
        unique_visitors,
        returning_visitors,
        created_at,
        updated_at
      )
      VALUES (?, 1, ?, ?, ?, ?)
    `).bind(
      statDate,
      existing ? 0 : 1,
      isReturning,
      timestamp,
      timestamp
    ).run();
  }

  return successResponse({
    tracked: true
  });
}

export async function getVisitorOverview(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const now = nowUnix();

  const todayStart =
    getStartOfDay(now);

  const weekStart =
    getStartOfWeek(now);

  const monthStart =
    getStartOfMonth(now);

  const [
    total,
    today,
    week,
    month,
    online,
    uniqueToday,
    returningToday
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
    `).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
      WHERE stat_date >= ?
    `).bind(formatDate(todayStart)).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
      WHERE stat_date >= ?
    `).bind(formatDate(weekStart)).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
      WHERE stat_date >= ?
    `).bind(formatDate(monthStart)).first(),

    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM visitor_sessions
      WHERE last_seen_at >= ?
    `).bind(now - 300).first(),

    env.DB.prepare(`
      SELECT COALESCE(unique_visitors, 0) AS total
      FROM visitor_stats
      WHERE stat_date = ?
      LIMIT 1
    `).bind(formatDate(todayStart)).first(),

    env.DB.prepare(`
      SELECT COALESCE(returning_visitors, 0) AS total
      FROM visitor_stats
      WHERE stat_date = ?
      LIMIT 1
    `).bind(formatDate(todayStart)).first()
  ]);

  return successResponse({
    visitors: {
      total_views: Number(total?.total_views || 0),
      unique_visitors: Number(total?.unique_visitors || 0),
      returning_visitors: Number(
        total?.returning_visitors || 0
      ),
      today: {
        views: Number(today?.total_views || 0),
        unique_visitors: Number(
          uniqueToday?.total ??
          today?.unique_visitors ??
          0
        ),
        returning_visitors: Number(
          returningToday?.total ??
          today?.returning_visitors ??
          0
        )
      },
      week: {
        views: Number(week?.total_views || 0),
        unique_visitors: Number(
          week?.unique_visitors || 0
        ),
        returning_visitors: Number(
          week?.returning_visitors || 0
        )
      },
      month: {
        views: Number(month?.total_views || 0),
        unique_visitors: Number(
          month?.unique_visitors || 0
        ),
        returning_visitors: Number(
          month?.returning_visitors || 0
        )
      },
      online_now: Number(online?.total || 0)
    }
  });
}

export async function getVisitorStats(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const url = new URL(request.url);

  const daysRaw =
    Number(url.searchParams.get("days") || 30);

  const days =
    Number.isSafeInteger(daysRaw)
      ? Math.min(Math.max(daysRaw, 1), 365)
      : 30;

  const now = nowUnix();

  const start =
    now - days * 86400;

  const result = await env.DB.prepare(`
    SELECT
      stat_date,
      total_views,
      unique_visitors,
      returning_visitors
    FROM visitor_stats
    WHERE stat_date >= ?
    ORDER BY stat_date ASC
  `).bind(formatDate(start)).all();

  return successResponse({
    days,
    stats: (result.results || []).map(row => ({
      date: row.stat_date,
      views: Number(row.total_views || 0),
      unique_visitors: Number(
        row.unique_visitors || 0
      ),
      returning_visitors: Number(
        row.returning_visitors || 0
      )
    }))
  });
}

export async function adminGetVisitorStats(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || Number(user.is_admin) !== 1) {
    return errorResponse("Akses admin diperlukan.", 403);
  }

  const url = new URL(request.url);

  const daysRaw =
    Number(url.searchParams.get("days") || 30);

  const days =
    Number.isSafeInteger(daysRaw)
      ? Math.min(Math.max(daysRaw, 1), 365)
      : 30;

  const now = nowUnix();
  const start = now - days * 86400;

  const result = await env.DB.prepare(`
    SELECT
      stat_date,
      total_views,
      unique_visitors,
      returning_visitors
    FROM visitor_stats
    WHERE stat_date >= ?
    ORDER BY stat_date ASC
  `).bind(formatDate(start)).all();

  const online =
    await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM visitor_sessions
      WHERE last_seen_at >= ?
    `).bind(now - 300).first();

  return successResponse({
    days,
    online_now: Number(online?.total || 0),
    stats: (result.results || []).map(row => ({
      date: row.stat_date,
      total_views: Number(row.total_views || 0),
      unique_visitors: Number(
        row.unique_visitors || 0
      ),
      returning_visitors: Number(
        row.returning_visitors || 0
      )
    }))
  });
}

function getStartOfDay(timestamp) {
  const date = new Date(timestamp * 1000);

  return Math.floor(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime() / 1000
  );
}

function getStartOfWeek(timestamp) {
  const date = new Date(timestamp * 1000);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;

  date.setDate(
    date.getDate() - diff
  );

  date.setHours(0, 0, 0, 0);

  return Math.floor(
    date.getTime() / 1000
  );
}

function getStartOfMonth(timestamp) {
  const date = new Date(timestamp * 1000);

  date.setDate(1);
  date.setHours(0, 0, 0, 0);

  return Math.floor(
    date.getTime() / 1000
  );
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000)
    .toISOString()
    .slice(0, 10);
}
