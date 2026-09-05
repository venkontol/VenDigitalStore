import {
  getCurrentUser,
  successResponse,
  errorResponse,
  nowUnix,
  getClientIp,
  sha256,
  cleanString
} from "./utils.js";

const VISITOR_COOKIE = "vd_visitor";
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
const ONLINE_WINDOW = 15 * 60;
const TZ_OFFSET = 7 * 60 * 60;

function json(data, status = 200) {
  return successResponse(data, status);
}

function getLocalDate(timestamp = nowUnix()) {
  const date = new Date((timestamp + TZ_OFFSET) * 1000);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStartOfLocalDay(timestamp = nowUnix()) {
  const date = getLocalDate(timestamp);
  const [year, month, day] = date.split("-").map(Number);

  return Math.floor(
    Date.UTC(year, month - 1, day) / 1000
  ) - TZ_OFFSET;
}

function getVisitorCookie(request) {
  const cookie = request.headers.get("Cookie") || "";

  const match = cookie.match(
    new RegExp(
      "(?:^|;\\s*)" +
      VISITOR_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "=([^;]+)"
    )
  );

  return match ? decodeURIComponent(match[1]) : "";
}

function visitorIdFromRequest(request) {
  return getVisitorCookie(request);
}

function visitorCookie(value) {
  return `${VISITOR_COOKIE}=${encodeURIComponent(value)}; Max-Age=${VISITOR_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function makeVisitorId(request) {
  const existing = visitorIdFromRequest(request);

  if(existing){
    return {
      id: existing,
      isNew: false
    };
  }

  const ip = getClientIp(request);
  const userAgent =
    cleanString(
      request.headers.get("User-Agent") || "",
      500
    );

  const raw =
    `${ip}|${userAgent}|${crypto.randomUUID()}`;

  const hash =
    await sha256(raw);

  return {
    id: `v_${hash.slice(0, 32)}`,
    isNew: true
  };
}

async function getAuthenticatedUser(request, env) {
  try{
    return await getCurrentUser(
      request,
      env
    );
  }catch{
    return null;
  }
}

async function ensureStatsRow(env, statDate) {
  await env.DB.prepare(`
    INSERT INTO visitor_stats (
      stat_date,
      total_views,
      unique_visitors,
      returning_visitors,
      created_at,
      updated_at
    )
    VALUES (?, 0, 0, 0, unixepoch(), unixepoch())
    ON CONFLICT(stat_date)
    DO NOTHING
  `)
    .bind(statDate)
    .run();
}

export async function trackVisitor(
  request,
  env
) {
  const now = nowUnix();

  const url =
    new URL(request.url);

  const path =
    cleanString(
      url.pathname || "/",
      500
    );

  const visitor =
    await makeVisitorId(request);

  const user =
    await getAuthenticatedUser(
      request,
      env
    );

  const userId =
    user?.id || null;

  const statDate =
    getLocalDate(now);

  await ensureStatsRow(
    env,
    statDate
  );

  const existing =
    await env.DB.prepare(`
      SELECT
        id,
        first_seen_at,
        last_seen_at,
        page_views,
        is_logged_in,
        user_id
      FROM visitor_sessions
      WHERE visitor_id = ?
      LIMIT 1
    `)
      .bind(visitor.id)
      .first();

  const isReturning =
    Boolean(existing);

  if(existing){
    await env.DB.prepare(`
      UPDATE visitor_sessions
      SET
        last_seen_at = ?,
        last_path = ?,
        page_views = page_views + 1,
        is_logged_in = ?,
        user_id = ?
      WHERE visitor_id = ?
    `)
      .bind(
        now,
        path,
        userId ? 1 : 0,
        userId,
        visitor.id
      )
      .run();
  }else{
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
    `)
      .bind(
        visitor.id,
        now,
        now,
        path,
        userId ? 1 : 0,
        userId
      )
      .run();
  }

  await env.DB.prepare(`
    UPDATE visitor_stats
    SET
      total_views = total_views + 1,
      unique_visitors = unique_visitors + ?,
      returning_visitors = returning_visitors + ?,
      updated_at = unixepoch()
    WHERE stat_date = ?
  `)
    .bind(
      isReturning ? 0 : 1,
      isReturning ? 1 : 0,
      statDate
    )
    .run();

  const headers = {
    "Cache-Control": "no-store"
  };

  if(visitor.isNew){
    headers["Set-Cookie"] =
      visitorCookie(visitor.id);
  }

  return new Response(
    JSON.stringify({
      success: true,
      visitor_id: visitor.id,
      new_visitor: visitor.isNew
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        ...headers
      }
    }
  );
}

export async function getVisitorOverview(
  request,
  env
) {
  const now = nowUnix();

  const todayStart =
    getStartOfLocalDay(now);

  const tomorrowStart =
    todayStart + 86400;

  const weekStart =
    todayStart - 6 * 86400;

  const monthStart =
    todayStart - 29 * 86400;

  const todayDate =
    getLocalDate(now);

  const today =
    await env.DB.prepare(`
      SELECT
        COALESCE(total_views, 0) AS total_views,
        COALESCE(unique_visitors, 0) AS unique_visitors,
        COALESCE(returning_visitors, 0) AS returning_visitors
      FROM visitor_stats
      WHERE stat_date = ?
      LIMIT 1
    `)
      .bind(todayDate)
      .first();

  const week =
    await env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
      WHERE
        stat_date >= ?
        AND stat_date <= ?
    `)
      .bind(
        getLocalDate(weekStart),
        todayDate
      )
      .first();

  const month =
    await env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
      WHERE
        stat_date >= ?
        AND stat_date <= ?
    `)
      .bind(
        getLocalDate(monthStart),
        todayDate
      )
      .first();

  const online =
    await env.DB.prepare(`
      SELECT COUNT(*) AS online_now
      FROM visitor_sessions
      WHERE last_seen_at >= ?
    `)
      .bind(now - ONLINE_WINDOW)
      .first();

  const total =
    await env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_views), 0) AS total_views,
        COALESCE(SUM(unique_visitors), 0) AS unique_visitors,
        COALESCE(SUM(returning_visitors), 0) AS returning_visitors
      FROM visitor_stats
    `)
      .first();

  return json({
    success: true,
    today: {
      views: Number(today?.total_views || 0),
      unique_visitors:
        Number(today?.unique_visitors || 0),
      returning_visitors:
        Number(today?.returning_visitors || 0)
    },
    week: {
      views: Number(week?.total_views || 0),
      unique_visitors:
        Number(week?.unique_visitors || 0),
      returning_visitors:
        Number(week?.returning_visitors || 0)
    },
    month: {
      views: Number(month?.total_views || 0),
      unique_visitors:
        Number(month?.unique_visitors || 0),
      returning_visitors:
        Number(month?.returning_visitors || 0)
    },
    total: {
      views: Number(total?.total_views || 0),
      unique_visitors:
        Number(total?.unique_visitors || 0),
      returning_visitors:
        Number(total?.returning_visitors || 0)
    },
    online_now:
      Number(online?.online_now || 0)
  });
}

export async function getVisitorStats(
  request,
  env
) {
  const url =
    new URL(request.url);

  const daysRaw =
    Number(
      url.searchParams.get("days") || 30
    );

  const days =
    Math.min(
      Math.max(
        Number.isFinite(daysRaw)
          ? Math.floor(daysRaw)
          : 30,
        1
      ),
      365
    );

  const now =
    nowUnix();

  const start =
    getStartOfLocalDay(now) -
    (days - 1) * 86400;

  const rows =
    await env.DB.prepare(`
      SELECT
        stat_date,
        total_views,
        unique_visitors,
        returning_visitors
      FROM visitor_stats
      WHERE stat_date >= ?
      ORDER BY stat_date ASC
      LIMIT ?
    `)
      .bind(
        getLocalDate(start),
        days
      )
      .all();

  return json({
    success: true,
    days,
    data: (rows.results || []).map(row=>({
      date: row.stat_date,
      views: Number(row.total_views || 0),
      unique_visitors:
        Number(row.unique_visitors || 0),
      returning_visitors:
        Number(row.returning_visitors || 0)
    }))
  });
}

export async function adminGetVisitorStats(
  request,
  env
) {
  const overview =
    await getVisitorOverview(
      request,
      env
    );

  const overviewData =
    await overview.json();

  const stats =
    await getVisitorStats(
      request,
      env
    );

  const statsData =
    await stats.json();

  return json({
    success: true,
    overview: overviewData,
    stats: statsData.data || []
  });
}

export async function cleanupVisitorSessions(
  env
) {
  const cutoff =
    nowUnix() -
    60 * 60 * 24 * 400;

  const result =
    await env.DB.prepare(`
      DELETE FROM visitor_sessions
      WHERE last_seen_at < ?
    `)
      .bind(cutoff)
      .run();

  return {
    success: true,
    deleted:
      Number(
        result?.meta?.changes || 0
      )
  };
    }
