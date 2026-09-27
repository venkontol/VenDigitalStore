import {
  errorResponse,
  jsonResponse,
  nowUnix
} from "./utils.js";

const DEFAULT_DISPLAY_LIMIT = 5;
const MAX_DISPLAY_LIMIT = 50;

function normalizeLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_DISPLAY_LIMIT;
  }

  return Math.min(parsed, MAX_DISPLAY_LIMIT);
}

function formatAnnouncement(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_active: Boolean(row.is_active)
  };
}

export async function getAnnouncements(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const url = new URL(request.url);
    const limit = normalizeLimit(
      url.searchParams.get("limit")
    );

    const offsetValue = Number(
      url.searchParams.get("offset")
    );

    const offset = Number.isInteger(offsetValue) &&
      offsetValue >= 0
      ? offsetValue
      : 0;

    const results = await env.DB
      .prepare(
        `
          SELECT
            id,
            title,
            content,
            is_active,
            created_at,
            updated_at
          FROM announcements
          WHERE is_active = 1
          ORDER BY created_at DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .bind(limit, offset)
      .all();

    const announcements = (results?.results || [])
      .map(formatAnnouncement)
      .filter(Boolean);

    return jsonResponse({
      success: true,
      announcements,
      limit,
      offset
    });
  } catch (error) {
    console.error(
      "[ANNOUNCEMENT GET ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil data pengumuman.",
      500
    );
  }
}

export async function getLatestAnnouncement(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const row = await env.DB
      .prepare(
        `
          SELECT
            id,
            title,
            content,
            is_active,
            created_at,
            updated_at
          FROM announcements
          WHERE is_active = 1
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .first();

    if (!row) {
      return jsonResponse({
        success: true,
        announcement: null
      });
    }

    const announcement = formatAnnouncement(row);

    return jsonResponse({
      success: true,
      announcement
    });
  } catch (error) {
    console.error(
      "[ANNOUNCEMENT LATEST ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil data pengumuman terbaru.",
      500
    );
  }
}

export async function getAnnouncementById(request, env) {
  try {
    if (!env?.DB) {
      return errorResponse(
        "Database tidak tersedia.",
        500
      );
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return errorResponse(
        "ID pengumuman tidak valid.",
        400
      );
    }

    const row = await env.DB
      .prepare(
        `
          SELECT
            id,
            title,
            content,
            is_active,
            created_at,
            updated_at
          FROM announcements
          WHERE id = ? AND is_active = 1
          LIMIT 1
        `
      )
      .bind(id)
      .first();

    if (!row) {
      return errorResponse(
        "Pengumuman tidak ditemukan.",
        404
      );
    }

    const announcement = formatAnnouncement(row);

    return jsonResponse({
      success: true,
      announcement
    });
  } catch (error) {
    console.error(
      "[ANNOUNCEMENT BY ID ERROR]",
      error
    );

    return errorResponse(
      "Gagal mengambil data pengumuman.",
      500
    );
  }
}

export default {
  getAnnouncements,
  getLatestAnnouncement,
  getAnnouncementById
};
