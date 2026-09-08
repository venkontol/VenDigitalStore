import {
  cleanFirstName,
  cleanUsername,
  errorResponse,
  getCookie,
  isValidPassword,
  isValidUsername,
  jsonResponse,
  nowUnix,
  randomToken,
  readJson,
  setCookie,
  clearCookie,
  sha256,
  hashPassword,
  verifyPassword
} from "./utils.js";

const SESSION_COOKIE = "vds_session";
const DEFAULT_SESSION_DAYS = 1;
const REMEMBER_SESSION_DAYS = 30;
const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

async function getBody(body, request) {
  if (body !== undefined) {
    return body;
  }

  return readJson(request);
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || null;
}

function getUserAgent(request) {
  return request.headers.get("User-Agent") || null;
}

function isRememberEnabled(value) {
  return value === true
    || value === 1
    || value === "1"
    || value === "true"
    || value === "on"
    || value === "yes";
}

function isUniqueConstraintError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return message.includes("unique constraint")
    || message.includes("unique failed")
    || message.includes("constraint failed");
}

function responseWithSession(data, status, session) {
  return jsonResponse(
    data,
    status,
    {
      "Set-Cookie": session.cookie
    }
  );
}

export async function register(request, env, ctx, body) {
  try {
    const data = await getBody(body, request);

    if (
      !data
      || typeof data !== "object"
      || Array.isArray(data)
    ) {
      return errorResponse(
        "Data tidak valid.",
        400
      );
    }

    const username = cleanUsername(data.username);
    const email = normalizeEmail(data.email);
    const password = String(data.password || "");

    if (!isValidUsername(username)) {
      return errorResponse(
        "Username harus 3-32 karakter dan hanya boleh menggunakan huruf kecil, angka, atau underscore.",
        400
      );
    }

    if (!isValidEmail(email)) {
      return errorResponse(
        "Gmail tidak valid. Gunakan alamat Gmail yang benar.",
        400
      );
    }

    if (!isValidPassword(password)) {
      return errorResponse(
        "Password harus 8-128 karakter.",
        400
      );
    }

    const existing = await env.DB
      .prepare(
        `
        SELECT id, username, email
        FROM users
        WHERE username = ?
           OR LOWER(TRIM(email)) = ?
        LIMIT 1
        `
      )
      .bind(
        username,
        email
      )
      .first();

    if (existing) {
      if (existing.username === username) {
        return errorResponse(
          "Username sudah digunakan.",
          409
        );
      }

      return errorResponse(
        "Gmail sudah digunakan.",
        409
      );
    }

    const passwordHash = await hashPassword(password);
    const firstName = cleanFirstName(username);
    const now = nowUnix();

    let result;

    try {
      result = await env.DB
        .prepare(
          `
          INSERT INTO users (
            first_name,
            username,
            password_hash,
            balance,
            is_active,
            is_admin,
            created_at,
            updated_at,
            email
          )
          VALUES (?, ?, ?, 0, 1, 0, ?, ?, ?)
          `
        )
        .bind(
          firstName,
          username,
          passwordHash,
          now,
          now,
          email
        )
        .run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return errorResponse(
          "Username atau Gmail sudah digunakan.",
          409
        );
      }

      throw error;
    }

    if (!result.success) {
      return errorResponse(
        "Gagal membuat akun.",
        500
      );
    }

    const userId = result.meta?.last_row_id;

    if (!userId) {
      return errorResponse(
        "Akun berhasil dibuat tetapi ID akun tidak ditemukan.",
        500
      );
    }

    let session;

    try {
      session = await createSession(
        env.DB,
        userId,
        request,
        true
      );
    } catch (error) {
      console.error(
        "[AUTH REGISTER SESSION ERROR]",
        error
      );

      return errorResponse(
        "Akun berhasil dibuat tetapi session gagal dibuat. Silakan login kembali.",
        500
      );
    }

    return responseWithSession(
      {
        success: true,
        message: "Akun berhasil dibuat.",
        user: {
          id: userId,
          first_name: firstName,
          username,
          email,
          balance: 0,
          is_admin: false
        }
      },
      201,
      session
    );
  } catch (error) {
    console.error(
      "[AUTH REGISTER ERROR]",
      error
    );

    return errorResponse(
      "Terjadi kesalahan saat membuat akun.",
      500
    );
  }
}

export async function login(
  request,
  env,
  ctx,
  body
) {
  try {
    const data = await getBody(body, request);

    if (
      !data
      || typeof data !== "object"
      || Array.isArray(data)
    ) {
      return errorResponse(
        "Data login tidak valid.",
        400
      );
    }

    const identity = String(
      data.identity
      ?? data.username
      ?? data.email
      ?? ""
    ).trim();

    const password = String(
      data.password || ""
    );

    const remember = isRememberEnabled(
      data.remember
    );

    if (!identity || !password) {
      return errorResponse(
        "Username atau Gmail dan password wajib diisi.",
        400
      );
    }

    let user;

    if (identity.includes("@")) {
      const email = normalizeEmail(identity);

      if (!isValidEmail(email)) {
        return errorResponse(
          "Username atau Gmail tidak valid.",
          400
        );
      }

      user = await env.DB
        .prepare(
          `
          SELECT
            id,
            first_name,
            username,
            email,
            password_hash,
            balance,
            is_active,
            is_admin,
            created_at,
            last_login_at
          FROM users
          WHERE LOWER(TRIM(email)) = ?
          LIMIT 1
          `
        )
        .bind(email)
        .first();
    } else {
      const username = cleanUsername(identity);

      if (!isValidUsername(username)) {
        return errorResponse(
          "Username atau Gmail tidak valid.",
          400
        );
      }

      user = await env.DB
        .prepare(
          `
          SELECT
            id,
            first_name,
            username,
            email,
            password_hash,
            balance,
            is_active,
            is_admin,
            created_at,
            last_login_at
          FROM users
          WHERE username = ?
          LIMIT 1
          `
        )
        .bind(username)
        .first();
    }

    if (!user) {
      return errorResponse(
        "Username, Gmail, atau password salah.",
        401
      );
    }

    if (!user.is_active) {
      return errorResponse(
        "Akun sedang dinonaktifkan.",
        403
      );
    }

    const valid = await verifyPassword(
      password,
      user.password_hash
    );

    if (!valid) {
      return errorResponse(
        "Username, Gmail, atau password salah.",
        401
      );
    }

    const now = nowUnix();

    const updateResult = await env.DB
      .prepare(
        `
        UPDATE users
        SET last_login_at = ?,
            updated_at = ?
        WHERE id = ?
        `
      )
      .bind(
        now,
        now,
        user.id
      )
      .run();

    if (!updateResult.success) {
      return errorResponse(
        "Login gagal memperbarui status akun.",
        500
      );
    }

    const session = await createSession(
      env.DB,
      user.id,
      request,
      remember
    );

    return responseWithSession(
      {
        success: true,
        message: "Login berhasil.",
        user: {
          id: user.id,
          first_name: user.first_name,
          username: user.username,
          email: user.email,
          balance: user.balance,
          is_admin: Boolean(user.is_admin),
          session_expires_at: session.expiresAt
        }
      },
      200,
      session
    );
  } catch (error) {
    console.error(
      "[AUTH LOGIN ERROR]",
      error
    );

    return errorResponse(
      "Terjadi kesalahan saat login.",
      500
    );
  }
}

export async function logout(
  request,
  env
) {
  try {
    const token = getCookie(
      request,
      SESSION_COOKIE
    );

    if (token) {
      const tokenHash = await sha256(token);

      await env.DB
        .prepare(
          `
          DELETE FROM user_sessions
          WHERE token_hash = ?
          `
        )
        .bind(tokenHash)
        .run();
    }

    return jsonResponse(
      {
        success: true,
        message: "Logout berhasil."
      },
      200,
      {
        "Set-Cookie": clearCookie(
          SESSION_COOKIE
        )
      }
    );
  } catch (error) {
    console.error(
      "[AUTH LOGOUT ERROR]",
      error
    );

    return errorResponse(
      "Terjadi kesalahan saat logout.",
      500
    );
  }
}

export async function logoutAll(
  request,
  env
) {
  try {
    const user = await getCurrentUser(
      request,
      env
    );

    if (!user) {
      return errorResponse(
        "Belum login.",
        401
      );
    }

    await env.DB
      .prepare(
        `
        DELETE FROM user_sessions
        WHERE user_id = ?
        `
      )
      .bind(user.id)
      .run();

    return jsonResponse(
      {
        success: true,
        message: "Semua session berhasil dihapus."
      },
      200,
      {
        "Set-Cookie": clearCookie(
          SESSION_COOKIE
        )
      }
    );
  } catch (error) {
    console.error(
      "[AUTH LOGOUT ALL ERROR]",
      error
    );

    return errorResponse(
      "Terjadi kesalahan saat mengakhiri semua session.",
      500
    );
  }
}

export async function me(
  request,
  env
) {
  try {
    const user = await getCurrentUser(
      request,
      env
    );

    if (!user) {
      return jsonResponse({
        success: true,
        authenticated: false,
        user: null
      });
    }

    return jsonResponse({
      success: true,
      authenticated: true,
      user
    });
  } catch (error) {
    console.error(
      "[AUTH ME ERROR]",
      error
    );

    return errorResponse(
      "Gagal memeriksa session.",
      500
    );
  }
}

export async function getCurrentUser(
  request,
  env
) {
  const token = getCookie(
    request,
    SESSION_COOKIE
  );

  if (!token) {
    return null;
  }

  const tokenHash = await sha256(token);
  const now = nowUnix();

  const session = await env.DB
    .prepare(
      `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        u.id,
        u.first_name,
        u.username,
        u.email,
        u.balance,
        u.is_active,
        u.is_admin,
        u.created_at,
        u.last_login_at
      FROM user_sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
      LIMIT 1
      `
    )
    .bind(
      tokenHash,
      now
    )
    .first();

  if (!session) {
    return null;
  }

  if (!session.is_active) {
    await env.DB
      .prepare(
        `
        DELETE FROM user_sessions
        WHERE id = ?
        `
      )
      .bind(session.session_id)
      .run();

    return null;
  }

  await env.DB
    .prepare(
      `
      UPDATE user_sessions
      SET last_seen_at = ?
      WHERE id = ?
      `
    )
    .bind(
      now,
      session.session_id
    )
    .run();

  return {
    id: session.id,
    first_name: session.first_name,
    username: session.username,
    email: session.email,
    balance: session.balance,
    is_active: Boolean(
      session.is_active
    ),
    is_admin: Boolean(
      session.is_admin
    ),
    created_at: session.created_at,
    last_login_at: session.last_login_at,
    session_expires_at: session.expires_at
  };
}

export async function requireAuth(
  request,
  env
) {
  try {
    const user = await getCurrentUser(
      request,
      env
    );

    if (!user) {
      return {
        user: null,
        response: errorResponse(
          "Authentication diperlukan.",
          401
        )
      };
    }

    return {
      user,
      response: null
    };
  } catch (error) {
    console.error(
      "[AUTH REQUIRE ERROR]",
      error
    );

    return {
      user: null,
      response: errorResponse(
        "Gagal memverifikasi authentication.",
        500
      )
    };
  }
}

export async function requireAdmin(
  request,
  env
) {
  const result = await requireAuth(
    request,
    env
  );

  if (result.response) {
    return result;
  }

  if (!result.user.is_admin) {
    return {
      user: result.user,
      response: errorResponse(
        "Akses admin diperlukan.",
        403
      )
    };
  }

  return {
    user: result.user,
    response: null
  };
}

async function createSession(
  db,
  userId,
  request,
  remember = false
) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = nowUnix();

  const sessionDays = remember
    ? REMEMBER_SESSION_DAYS
    : DEFAULT_SESSION_DAYS;

  const expiresAt =
    now +
    sessionDays * 24 * 60 * 60;

  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  await db
    .prepare(
      `
      INSERT INTO user_sessions (
        user_id,
        token_hash,
        expires_at,
        created_at,
        last_seen_at,
        ip_address,
        user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      userId,
      tokenHash,
      expiresAt,
      now,
      now,
      ip,
      userAgent
    )
    .run();

  return {
    token,
    expiresAt,
    cookie: setCookie(
      SESSION_COOKIE,
      token,
      {
        maxAge:
          sessionDays * 24 * 60 * 60,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/"
      }
    )
  };
}
