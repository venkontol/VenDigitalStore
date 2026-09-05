import {
  cleanFirstName,
  cleanUsername,
  clearSessionCookie,
  errorResponse,
  hashPassword,
  jsonResponse,
  nowUnix,
  parseCookies,
  readJson,
  randomToken,
  sessionCookie,
  sha256,
  verifyPassword,
  isValidPassword,
  isValidUsername
} from "./utils.js";

const SESSION_TTL = 60 * 60 * 24 * 30;

export async function register(request, env) {
  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(error.message, 400);
  }

  const firstName = cleanFirstName(body.first_name);
  const username = cleanUsername(body.username);
  const password = typeof body.password === "string"
    ? body.password
    : "";

  if (firstName.length < 2) {
    return errorResponse("Nama depan minimal 2 karakter.", 400);
  }

  if (!isValidUsername(username)) {
    return errorResponse(
      "Username harus 3-32 karakter dan hanya boleh menggunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung.",
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
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    )
    .bind(username)
    .first();

  if (existing) {
    return errorResponse(
      "Username sudah digunakan.",
      409
    );
  }

  const passwordHash = await hashPassword(password);
  const now = nowUnix();

  let result;

  try {
    result = await env.DB
      .prepare(
        `INSERT INTO users
        (first_name, username, password_hash, balance, is_active, is_admin, created_at, updated_at)
        VALUES (?, ?, ?, 0, 1, 0, ?, ?)`
      )
      .bind(
        firstName,
        username,
        passwordHash,
        now,
        now
      )
      .run();
  } catch (error) {
    if (
      String(error.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return errorResponse(
        "Username sudah digunakan.",
        409
      );
    }

    throw error;
  }

  const userId = result.meta?.last_row_id;

  if (!userId) {
    return errorResponse(
      "Gagal membuat akun.",
      500
    );
  }

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = now + SESSION_TTL;

  await env.DB
    .prepare(
      `INSERT INTO user_sessions
      (user_id, session_token_hash, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      tokenHash,
      expiresAt,
      now,
      now
    )
    .run();

  const response = jsonResponse({
    success: true,
    user: {
      id: userId,
      first_name: firstName,
      username,
      balance: 0,
      is_admin: false
    }
  }, 201);

  response.headers.append(
    "Set-Cookie",
    sessionCookie(token, SESSION_TTL)
  );

  return response;
}

export async function login(request, env) {
  let body;

  try {
    body = await readJson(request);
  } catch (error) {
    return errorResponse(error.message, 400);
  }

  const username = cleanUsername(body.username);
  const password = typeof body.password === "string"
    ? body.password
    : "";

  if (!username || !password) {
    return errorResponse(
      "Username dan password wajib diisi.",
      400
    );
  }

  const user = await env.DB
    .prepare(
      `SELECT
        id,
        first_name,
        username,
        password_hash,
        balance,
        is_active,
        is_admin
      FROM users
      WHERE username = ?
      LIMIT 1`
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
      "Akun tidak aktif.",
      403
    );
  }

  const valid = await verifyPassword(
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
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = now + SESSION_TTL;

  await env.DB
    .prepare(
      `INSERT INTO user_sessions
      (user_id, session_token_hash, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      user.id,
      tokenHash,
      expiresAt,
      now,
      now
    )
    .run();

  await env.DB
    .prepare(
      "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?"
    )
    .bind(
      now,
      now,
      user.id
    )
    .run();

  const response = jsonResponse({
    success: true,
    user: {
      id: user.id,
      first_name: user.first_name,
      username: user.username,
      balance: user.balance,
      is_admin: Boolean(user.is_admin)
    }
  });

  response.headers.append(
    "Set-Cookie",
    sessionCookie(token, SESSION_TTL)
  );

  return response;
}

export async function logout(request, env) {
  const cookies = parseCookies(request);
  const token = cookies.vds_session;

  if (token) {
    const tokenHash = await sha256(token);

    await env.DB
      .prepare(
        `UPDATE user_sessions
         SET revoked_at = ?
         WHERE session_token_hash = ?
           AND revoked_at IS NULL`
      )
      .bind(
        nowUnix(),
        tokenHash
      )
      .run();
  }

  const response = jsonResponse({
    success: true
  });

  response.headers.append(
    "Set-Cookie",
    clearSessionCookie()
  );

  return response;
}

export async function logoutAll(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse(
      "Kamu belum login.",
      401
    );
  }

  await env.DB
    .prepare(
      `UPDATE user_sessions
       SET revoked_at = ?
       WHERE user_id = ?
         AND revoked_at IS NULL`
    )
    .bind(
      nowUnix(),
      user.id
    )
    .run();

  const response = jsonResponse({
    success: true
  });

  response.headers.append(
    "Set-Cookie",
    clearSessionCookie()
  );

  return response;
}

export async function me(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse(
      "Belum login.",
      401
    );
  }

  return jsonResponse({
    success: true,
    user
  });
}

export async function getCurrentUser(request, env) {
  const cookies = parseCookies(request);
  const token = cookies.vds_session;

  if (!token) {
    return null;
  }

  const tokenHash = await sha256(token);
  const now = nowUnix();

  const session = await env.DB
    .prepare(
      `SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        s.revoked_at,
        u.id,
        u.first_name,
        u.username,
        u.balance,
        u.is_active,
        u.is_admin
      FROM user_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.session_token_hash = ?
      LIMIT 1`
    )
    .bind(tokenHash)
    .first();

  if (!session) {
    return null;
  }

  if (session.revoked_at) {
    return null;
  }

  if (Number(session.expires_at) <= now) {
    await env.DB
      .prepare(
        "UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
      )
      .bind(
        now,
        session.session_id
      )
      .run();

    return null;
  }

  if (!session.is_active) {
    return null;
  }

  await env.DB
    .prepare(
      "UPDATE user_sessions SET last_seen_at = ? WHERE id = ?"
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
    balance: Number(session.balance),
    is_admin: Boolean(session.is_admin),
    is_active: Boolean(session.is_active)
  };
}

export async function requireAuth(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return {
      user: null,
      response: errorResponse(
        "Kamu harus login terlebih dahulu.",
        401
      )
    };
  }

  return {
    user,
    response: null
  };
}

export async function requireAdmin(request, env) {
  const result = await requireAuth(
    request,
    env
  );

  if (result.response) {
    return result;
  }

  if (!result.user.is_admin) {
    return {
      user: null,
      response: errorResponse(
        "Akses admin diperlukan.",
        403
      )
    };
  }

  return result;
      }
