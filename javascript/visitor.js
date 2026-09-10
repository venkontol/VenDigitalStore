import {
  errorResponse,
  successResponse,
  cleanString,
  nowUnix,
  randomId,
  sha256
} from "./utils.js";

const SESSION_ID_MAX_LENGTH = 128;
const USER_AGENT_MAX_LENGTH = 500;
const ACTIVE_WINDOW_SECONDS = 300;

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Real-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    null
  );
}

async function getIpHash(request) {
  const ip = getClientIp(request);
  if (!ip) return null;

  try {
    return await sha256(ip);
  } catch {
    return null;
  }
}

function getUserAgent(request) {
  return cleanString(
    request.headers.get("User-Agent") || "",
    USER_AGENT_MAX_LENGTH
  ) || null;
}

function normalizeSessionId(value) {
  const sessionId = cleanString(
    value || "",
    SESSION_ID_MAX_LENGTH
  );

  if (!sessionId) {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) {
    return null;
  }

  return sessionId;
}

function createSessionId() {
  return `v_${randomId(32)}`;
}

function getStatDate(timestamp = nowUnix()) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function getSession(env, sessionId) {
  if (!sessionId) return null;

  return env.DB.prepare(`
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
    LIMIT 1
  `)
    .bind(sessionId)
    .first();
}

async function createVisitorSession(
  env,
  {
    sessionId,
    ipHash,
    userAgent,
    timestamp
  }
) {
  await env.DB.prepare(`
    INSERT INTO visitor_sessions (
      session_id,
      ip_hash,
      user_agent,
      first_seen_at,
      last_seen_at,
      page_views
    )
    VALUES (?, ?, ?, ?, ?, 1)
  `)
    .bind(
      sessionId,
      ipHash,
      userAgent,
      timestamp,
      timestamp
    )
    .run();
}

async function updateVisitorSession(
  env,
  session,
  {
    ipHash,
    userAgent,
    timestamp
  }
) {
  await env.DB.prepare(`
    UPDATE visitor_sessions
    SET
      ip_hash = COALESCE(?, ip_hash),
      user_agent = COALESCE(?, user_agent),
      last_seen_at = ?,
      page_views = page_views + 1
    WHERE id = ?
  `)
    .bind(
      ipHash,
      userAgent,
      timestamp,
      session.id
    )
    .run();
}

async function updateVisitorStats(
  env,
  {
    statDate,
    isNewVisitor,
    timestamp
  }
) {
  const visitorIncrement = isNewVisitor ? 1 : 0;

  await env.DB.prepare(`
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
      visitors = visitors + excluded.visitors,
      page_views = page_views + 1,
      updated_at = excluded.updated_at
  `)
    .bind(
      statDate,
      visitorIncrement,
      timestamp,
      timestamp
    )
    .run();
}

function serializeSession(session) {
  if (!session) return null;

  return {
    session_id: session.session_id,
    first_seen_at: Number(session.first_seen_at || 0),
    last_seen_at: Number(session.last_seen_at || 0),
    page_views: Number(session.page_views || 0)
  };
}

async function getVisitorSummary(env, timestamp) {
  const statDate = getStatDate(timestamp);
  const activeSince = timestamp - ACTIVE_WINDOW_SECONDS;

  const today = await env.DB.prepare(`
    SELECT
      visitors,
      page_views
    FROM visitor_stats
    WHERE stat_date = ?
    LIMIT 1
  `)
    .bind(statDate)
    .first();

  const totals = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(visitors), 0) AS visitors,
      COALESCE(SUM(page_views), 0) AS page_views
    FROM visitor_stats
  `)
    .first();

  const active = await env.DB.prepare(`
    SELECT COUNT(*) AS active
    FROM visitor_sessions
    WHERE last_seen_at >= ?
  `)
    .bind(activeSince)
    .first();

  return {
    total_visitors: Number(totals?.visitors || 0),
    total_page_views: Number(totals?.page_views || 0),
    today_visitors: Number(today?.visitors || 0),
    today_page_views: Number(today?.page_views || 0),
    active_visitors: Number(active?.active || 0)
  };
}

export async function trackVisitor(
  request,
  env,
  ctx,
  body = {}
) {
  try {
    const timestamp = nowUnix();
    const ipHash = await getIpHash(request);
    const userAgent = getUserAgent(request);

    const requestedSessionId = normalizeSessionId(
      body?.session_id ||
      body?.sessionId
    );

    let session = await getSession(
      env,
      requestedSessionId
    );

    let sessionId = requestedSessionId;
    let isNewVisitor = false;

    if (!session) {
      sessionId = createSessionId();

      await createVisitorSession(env, {
        sessionId,
        ipHash,
        userAgent,
        timestamp
      });

      isNewVisitor = true;
    } else {
      await updateVisitorSession(env, session, {
        ipHash,
        userAgent,
        timestamp
      });
    }

    await updateVisitorStats(env, {
      statDate: getStatDate(timestamp),
      isNewVisitor,
      timestamp
    });

    session = await getSession(
      env,
      sessionId
    );

    const stats = await getVisitorSummary(
      env,
      timestamp
    );

    return successResponse({
      session: serializeSession(session),
      stats
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Gagal mencatat visitor.",
      error?.status || 500
    );
  }
}

export async function getVisitorStats(
  request,
  env,
  ctx
) {
  try {
    const timestamp = nowUnix();
    const stats = await getVisitorSummary(
      env,
      timestamp
    );

    return successResponse({
      stats
    });
  } catch (error) {
    return errorResponse(
      error?.message || "Gagal mengambil statistik visitor.",
      error?.status || 500
    );
  }
}
