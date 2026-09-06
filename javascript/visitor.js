import {
  errorResponse,
  getCookie,
  getPath,
  jsonResponse,
  nowUnix,
  randomToken,
  sha256
} from "./utils.js";

const VISITOR_COOKIE = "vds_visitor";
const VISITOR_SESSION_DAYS = 30;
const VISITOR_SESSION_TTL =
  VISITOR_SESSION_DAYS * 24 * 60 * 60;

const MAX_USER_AGENT_LENGTH = 512;
const MAX_PATH_LENGTH = 2048;

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    ""
  );
}

function normalizePath(path) {
  const value =
    String(path || "/")
      .trim()
      .slice(0, MAX_PATH_LENGTH);

  if (!value) {
    return "/";
  }

  return value.startsWith("/")
    ? value
    : "/" + value;
}

function getDateKey(timestamp = nowUnix()) {
  return new Date(
    Number(timestamp) * 1000
  )
    .toISOString()
    .slice(0, 10);
}

function createVisitorId() {
  return randomToken(32);
}

function visitorCookie(
  value,
  maxAge = VISITOR_SESSION_TTL
) {
  return [
    `${VISITOR_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");
}

async function getVisitorSession(
  db,
  sessionId
) {
  if (!sessionId) {
    return null;
  }

  const current =
    nowUnix();

  const result =
    await db
      .prepare(
        `
          SELECT
            id,
            session_id,
            ip_hash,
            user_agent,
            first_seen_at,
            last_seen_at,
            page_views
          FROM visitor_sessions
          WHERE session_id = ?
            AND last_seen_at > ?
          LIMIT 1
        `
      )
      .bind(
        sessionId,
        current -
          VISITOR_SESSION_TTL
      )
      .first();

  return result || null;
}

async function createVisitorSession(
  db,
  request,
  sessionId,
  timestamp
) {
  const ip =
    getClientIp(
      request
    );

  const ipHash =
    ip
      ? await sha256(
          ip
        )
      : null;

  const userAgent =
    String(
      request.headers.get(
        "User-Agent"
      ) || ""
    ).slice(
      0,
      MAX_USER_AGENT_LENGTH
    );

  await db
    .prepare(
      `
        INSERT INTO visitor_sessions (
          session_id,
          ip_hash,
          user_agent,
          first_seen_at,
          last_seen_at,
          page_views
        )
        VALUES (?, ?, ?, ?, ?, 1)
      `
    )
    .bind(
      sessionId,
      ipHash,
      userAgent,
      timestamp,
      timestamp
    )
    .run();

  return {
    session_id:
      sessionId,
    ip_hash:
      ipHash,
    user_agent:
      userAgent,
    first_seen_at:
      timestamp,
    last_seen_at:
      timestamp,
    page_views: 1
  };
}

async function touchVisitorSession(
  db,
  session,
  timestamp
) {
  const result =
    await db
      .prepare(
        `
          UPDATE visitor_sessions
          SET
            last_seen_at = ?,
            page_views = page_views + 1
          WHERE id = ?
        `
      )
      .bind(
        timestamp,
        session.id
      )
      .run();

  if (
    result?.meta?.changes !== 1
  ) {
    return null;
  }

  return {
    ...session,
    last_seen_at:
      timestamp,
    page_views:
      Number(
        session.page_views || 0
      ) + 1
  };
}

async function updateVisitorStats(
  db,
  dateKey,
  isNewVisitor
) {
  const timestamp =
    nowUnix();

  const visitorIncrement =
    isNewVisitor
      ? 1
      : 0;

  const result =
    await db
      .prepare(
        `
          INSERT INTO visitor_stats (
            stat_date,
            visitors,
            page_views,
            created_at,
            updated_at
          )
          VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(stat_date)
          DO UPDATE SET
            visitors =
              visitors + excluded.visitors,
            page_views =
              page_views + 1,
            updated_at =
              excluded.updated_at
        `
      )
      .bind(
        dateKey,
        visitorIncrement,
        timestamp,
        timestamp
      )
      .run();

  return (
    result?.meta?.changes >= 1
  );
}

async function trackRequest(
  request,
  env
) {
  if (!env?.DB) {
    throw new Error(
      "Database tidak tersedia."
    );
  }

  const timestamp =
    nowUnix();

  const existingCookie =
    getCookie(
      request.headers,
      VISITOR_COOKIE
    );

  let session =
    await getVisitorSession(
      env.DB,
      existingCookie
    );

  let isNewVisitor =
    false;

  if (!session) {
    const sessionId =
      createVisitorId();

    session =
      await createVisitorSession(
        env.DB,
        request,
        sessionId,
        timestamp
      );

    isNewVisitor =
      true;
  } else {
    session =
      await touchVisitorSession(
        env.DB,
        session,
        timestamp
      );

    if (!session) {
      const sessionId =
        createVisitorId();

      session =
        await createVisitorSession(
          env.DB,
          request,
          sessionId,
          timestamp
        );

      isNewVisitor =
        true;
    }
  }

  const dateKey =
    getDateKey(
      timestamp
    );

  await updateVisitorStats(
    env.DB,
    dateKey,
    isNewVisitor
  );

  return {
    session,
    isNewVisitor
  };
}

async function cleanupVisitors(
  db
) {
  const cutoff =
    nowUnix() -
    VISITOR_SESSION_TTL;

  const result =
    await db
      .prepare(
        `
          DELETE FROM visitor_sessions
          WHERE last_seen_at < ?
        `
      )
      .bind(
        cutoff
      )
      .run();

  return (
    Number(
      result?.meta?.changes || 0
    )
  );
}

export async function trackVisitor(
  request,
  env
) {
  try {
    const tracked =
      await trackRequest(
        request,
        env
      );

    const headers =
      new Headers();

    headers.set(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    if (
      tracked.isNewVisitor
    ) {
      headers.set(
        "Set-Cookie",
        visitorCookie(
          tracked.session.session_id
        )
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        visitor: {
          session_id:
            tracked.session.session_id,
          first_visit:
            tracked.isNewVisitor
        }
      }),
      {
        status: 200,
        headers
      }
    );
  } catch {
    return errorResponse(
      "Gagal mencatat visitor.",
      500
    );
  }
}

export async function trackPageView(
  request,
  env
) {
  try {
    const tracked =
      await trackRequest(
        request,
        env
      );

    const url =
      new URL(
        request.url
      );

    const page =
      normalizePath(
        url.searchParams.get(
          "path"
        ) ||
          getPath(
            request
          )
      );

    return new Response(
      JSON.stringify({
        success: true,
        page,
        first_visit:
          tracked.isNewVisitor
      }),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          ...(tracked.isNewVisitor
            ? {
                "Set-Cookie":
                  visitorCookie(
                    tracked.session.session_id
                  )
              }
            : {})
        }
      }
    );
  } catch {
    return errorResponse(
      "Gagal mencatat page view.",
      500
    );
  }
}

export async function getVisitorStats(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const url =
    new URL(
      request.url
    );

  const daysRaw =
    Number(
      url.searchParams.get(
        "days"
      ) || 30
    );

  const days =
    Number.isFinite(
      daysRaw
    )
      ? Math.min(
          365,
          Math.max(
            1,
            Math.floor(
              daysRaw
            )
          )
        )
      )
      : 30;

  const rows =
    await env.DB
      .prepare(
        `
          SELECT
            stat_date,
            visitors,
            page_views,
            created_at,
            updated_at
          FROM visitor_stats
          ORDER BY stat_date DESC
          LIMIT ?
        `
      )
      .bind(
        days
      )
      .all();

  const data =
    Array.isArray(
      rows?.results
    )
      ? rows.results
      : [];

  const totals =
    data.reduce(
      (
        accumulator,
        row
      ) => {
        accumulator.visitors +=
          Number(
            row.visitors || 0
          );

        accumulator.page_views +=
          Number(
            row.page_views || 0
          );

        return accumulator;
      },
      {
        visitors: 0,
        page_views: 0
      }
    );

  return jsonResponse({
    success: true,
    days,
    totals,
    stats: data
  });
}

export async function getVisitorOverview(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const current =
    nowUnix();

  const activeCutoff =
    current -
    15 * 60;

  const today =
    getDateKey(
      current
    );

  const [
    activeResult,
    todayResult,
    totalResult
  ] =
    await Promise.all([
      env.DB
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM visitor_sessions
            WHERE last_seen_at >= ?
          `
        )
        .bind(
          activeCutoff
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              stat_date,
              visitors,
              page_views
            FROM visitor_stats
            WHERE stat_date = ?
            LIMIT 1
          `
        )
        .bind(
          today
        )
        .first(),

      env.DB
        .prepare(
          `
            SELECT
              COUNT(*) AS total_sessions,
              COALESCE(
                SUM(page_views),
                0
              ) AS total_page_views
            FROM visitor_sessions
          `
        )
        .first()
    ]);

  return jsonResponse({
    success: true,
    active_visitors:
      Number(
        activeResult?.count || 0
      ),
    today: {
      visitors:
        Number(
          todayResult?.visitors || 0
        ),
      page_views:
        Number(
          todayResult?.page_views || 0
        )
    },
    total: {
      sessions:
        Number(
          totalResult?.total_sessions ||
            0
        ),
      page_views:
        Number(
          totalResult?.total_page_views ||
            0
        )
    }
  });
}

export async function cleanupVisitorSessions(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const deleted =
    await cleanupVisitors(
      env.DB
    );

  return jsonResponse({
    success: true,
    deleted
  });
}

export async function getVisitorSession(
  request,
  env
) {
  if (!env?.DB) {
    return errorResponse(
      "Database tidak tersedia.",
      500
    );
  }

  const sessionId =
    getCookie(
      request.headers,
      VISITOR_COOKIE
    );

  const session =
    await getVisitorSession(
      env.DB,
      sessionId
    );

  if (!session) {
    return jsonResponse({
      success: true,
      visitor: null
    });
  }

  return jsonResponse({
    success: true,
    visitor: {
      session_id:
        session.session_id,
      first_seen_at:
        session.first_seen_at,
      last_seen_at:
        session.last_seen_at,
      page_views:
        session.page_views
    }
  });
}

export function getVisitorCookieName() {
  return VISITOR_COOKIE;
}

export function getVisitorSessionTtl() {
  return VISITOR_SESSION_TTL;
}