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
const SESSION_DAYS = 30;

export async function register(request, env) {
  const body = await readJson(request);

  if (!body) {
    return errorResponse("Data tidak valid.", 400);
  }

  const firstName = cleanFirstName(body.first_name);
  const username = cleanUsername(body.username);
  const password = String(body.password || "");

  if (!firstName) {
    return errorResponse("Nama depan wajib diisi.", 400);
  }

  if (!isValidUsername(username)) {
    return errorResponse(
      "Username harus 3-32 karakter dan hanya boleh menggunakan huruf kecil, angka, atau underscore.",
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
      SELECT id
      FROM users
      WHERE username = ?
      LIMIT 1
      `
    )
    .bind(username)
    .first();

  if (existing) {
    return errorResponse(
      "Username sudah digunakan.",
      409
    );
  }

  const passwordHash =
    await hashPassword(password);

  const now = nowUnix();

  const result = await env.DB
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
        updated_at
      )
      VALUES (?, ?, ?, 0, 1, 0, ?, ?)
      `
    )
    .bind(
      firstName,
      username,
      passwordHash,
      now,
      now
    )
    .run();

  if (!result.success) {
    return errorResponse(
      "Gagal membuat akun.",
      500
    );
  }

  const userId =
    result.meta?.last_row_id;

  if (!userId) {
    return errorResponse(
      "Akun berhasil dibuat tetapi ID akun tidak ditemukan.",
      500
    );
  }

  const session =
    await createSession(
      env.DB,
      userId,
      request
    );

  return new Response(
    JSON.stringify({
      success: true,
      message: "Akun berhasil dibuat.",
      user: {
        id: userId,
        first_name: firstName,
        username
      }
    }),
    {
      status: 201,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        "Set-Cookie": session.cookie
      }
    }
  );
}

export async function login(request, env) {
  const body = await readJson(request);

  if (!body) {
    return errorResponse(
      "Data login tidak valid.",
      400
    );
  }

  const username =
    cleanUsername(body.username);

  const password =
    String(body.password || "");

  if (!username || !password) {
    return errorResponse(
      "Username dan password wajib diisi.",
      400
    );
  }

  const user =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          first_name,
          username,
          password_hash,
          balance,
          is_active,
          is_admin
        FROM users
        WHERE username = ?
        LIMIT 1
        `
      )
      .bind(username)
      .first();

  if (!user) {
    return errorResponse(
      "Username atau password salah.",
      401
    );
  }

  if (!user.is_active) {
    return errorResponse(
      "Akun sedang dinonaktifkan.",
      403
    );
  }

  const valid =
    await verifyPassword(
      password,
      user.password_hash
    );

  if (!valid) {
    return errorResponse(
      "Username atau password salah.",
      401
    );
  }

  const now = nowUnix();

  await env.DB
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

  const session =
    await createSession(
      env.DB,
      user.id,
      request
    );

  return new Response(
    JSON.stringify({
      success: true,
      message: "Login berhasil.",
      user: {
        id: user.id,
        first_name: user.first_name,
        username: user.username,
        balance: user.balance,
        is_admin: Boolean(user.is_admin)
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        "Set-Cookie": session.cookie
      }
    }
  );
}

export async function logout(request, env) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE
    );

  if (token) {
    const tokenHash =
      await sha256(token);

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

  return new Response(
    JSON.stringify({
      success: true,
      message: "Logout berhasil."
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        "Set-Cookie":
          clearCookie(SESSION_COOKIE)
      }
    }
  );
}

export async function logoutAll(
  request,
  env
) {
  const user =
    await getCurrentUser(
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

  return new Response(
    JSON.stringify({
      success: true,
      message:
        "Semua session berhasil dihapus."
    }),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        "Cache-Control": "no-store",
        "Set-Cookie":
          clearCookie(SESSION_COOKIE)
      }
    }
  );
}

export async function me(request, env) {
  const user =
    await getCurrentUser(
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
}

export async function getCurrentUser(
  request,
  env
) {
  const token =
    getCookie(
      request,
      SESSION_COOKIE
    );

  if (!token) {
    return null;
  }

  const tokenHash =
    await sha256(token);

  const now =
    nowUnix();

  const session =
    await env.DB
      .prepare(
        `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.expires_at,
          u.id,
          u.first_name,
          u.username,
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
    balance: session.balance,
    is_active: Boolean(
      session.is_active
    ),
    is_admin: Boolean(
      session.is_admin
    ),
    created_at: session.created_at,
    last_login_at: session.last_login_at,
    session_expires_at:
      session.expires_at
  };
}

export async function requireAuth(
  request,
  env
) {
  const user =
    await getCurrentUser(
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
}

export async function requireAdmin(
  request,
  env
) {
  const result =
    await requireAuth(
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
  request
) {
  const token =
    randomToken(32);

  const tokenHash =
    await sha256(token);

  const now =
    nowUnix();

  const expiresAt =
    now +
    SESSION_DAYS * 24 * 60 * 60;

  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) ||
    request.headers.get(
      "X-Forwarded-For"
    ) ||
    null;

  const userAgent =
    request.headers.get(
      "User-Agent"
    ) || null;

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
          SESSION_DAYS * 24 * 60 * 60,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/"
      }
    )
  };
}
