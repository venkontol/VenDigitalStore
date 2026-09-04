import {
  json,
  normalizeUsername,
  normalizeName,
  validUsername,
  validPassword,
  getUserByUsername,
  getActiveUserById,
  createUser,
  updateLastLogin,
  hashPassword,
  verifyPassword,
  createSession,
  getSessionFromRequest,
  getSessionToken,
  revokeSession,
  revokeAllUserSessions
} from "./utils.js";

function cookieHeader(token, expiresAt) {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  return [
    `vds_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearCookieHeader() {
  return [
    "vds_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: Number(user.id),
    username: user.username,
    first_name: user.first_name || "",
    balance: Number(user.balance || 0),
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at || null
  };
}

async function readJson(request) {
  try {
    const data = await request.json();

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function responseWithCookie(body, status, token, expiresAt, extraHeaders = {}) {
  return json(
    body,
    status,
    {
      ...extraHeaders,
      "Set-Cookie": cookieHeader(token, expiresAt)
    }
  );
}

function responseClearingCookie(body, status, extraHeaders = {}) {
  return json(
    body,
    status,
    {
      ...extraHeaders,
      "Set-Cookie": clearCookieHeader()
    }
  );
}

export async function register(request, env) {
  const data = await readJson(request);

  if (!data) {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const username = normalizeUsername(data.username);
  const firstName = normalizeName(
    data.first_name ??
    data.firstName ??
    data.name ??
    ""
  );
  const password = String(data.password ?? "");

  if (!validUsername(username)) {
    return json(
      {
        success: false,
        error: "Username tidak valid. Gunakan 3-32 karakter: huruf, angka, titik, garis bawah, atau tanda minus."
      },
      400
    );
  }

  if (!validPassword(password)) {
    return json(
      {
        success: false,
        error: "Password tidak valid."
      },
      400
    );
  }

  if (!firstName) {
    return json(
      {
        success: false,
        error: "Nama depan wajib diisi."
      },
      400
    );
  }

  const existing = await getUserByUsername(env, username);

  if (existing) {
    return json(
      {
        success: false,
        error: "Username sudah digunakan."
      },
      409
    );
  }

  try {
    const passwordHash = await hashPassword(password);

    const user = await createUser(env, {
      username,
      passwordHash,
      firstName
    });

    if (!user) {
      return json(
        {
          success: false,
          error: "Gagal membuat akun."
        },
        500
      );
    }

    const session = await createSession(env, user.id, 30);

    return responseWithCookie(
      {
        success: true,
        message: "Akun berhasil dibuat.",
        user: publicUser(user)
      },
      201,
      session.token,
      session.expiresAt
    );
  } catch (error) {
    const message = String(error?.message || error);

    if (
      message.toLowerCase().includes("unique") ||
      message.toLowerCase().includes("username")
    ) {
      return json(
        {
          success: false,
          error: "Username sudah digunakan."
        },
        409
      );
    }

    console.error("REGISTER_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal membuat akun."
      },
      500
    );
  }
}

export async function login(request, env) {
  const data = await readJson(request);

  if (!data) {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const username = normalizeUsername(data.username);
  const password = String(data.password ?? "");

  if (!validUsername(username)) {
    return json(
      {
        success: false,
        error: "Username atau password salah."
      },
      401
    );
  }

  if (!password) {
    return json(
      {
        success: false,
        error: "Username atau password salah."
      },
      401
    );
  }

  const user = await getUserByUsername(env, username);

  if (!user || user.status !== "ACTIVE") {
    return json(
      {
        success: false,
        error: "Username atau password salah."
      },
      401
    );
  }

  const passwordValid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!passwordValid) {
    return json(
      {
        success: false,
        error: "Username atau password salah."
      },
      401
    );
  }

  try {
    await updateLastLogin(env, user.id);

    const session = await createSession(env, user.id, 30);

    const freshUser =
      await getActiveUserById(env, user.id);

    return responseWithCookie(
      {
        success: true,
        message: "Login berhasil.",
        user: publicUser(freshUser || user)
      },
      200,
      session.token,
      session.expiresAt
    );
  } catch (error) {
    console.error("LOGIN_ERROR", error);

    return json(
      {
        success: false,
        error: "Login gagal."
      },
      500
    );
  }
}

export async function me(request, env) {
  const session = await getSessionFromRequest(env, request);

  if (!session) {
    return json(
      {
        success: false,
        authenticated: false,
        user: null
      },
      401
    );
  }

  return json({
    success: true,
    authenticated: true,
    user: {
      id: Number(session.user_id),
      username: session.username,
      first_name: session.first_name || "",
      balance: Number(session.balance || 0),
      status: session.status,
      session_expires_at: session.expires_at
    }
  });
}

export async function logout(request, env) {
  const token = getSessionToken(request);

  if (token) {
    try {
      await revokeSession(env, token);
    } catch (error) {
      console.error("LOGOUT_ERROR", error);
    }
  }

  return responseClearingCookie(
    {
      success: true,
      message: "Logout berhasil."
    },
    200
  );
}

export async function logoutAll(request, env) {
  const session = await getSessionFromRequest(env, request);

  if (!session) {
    return responseClearingCookie(
      {
        success: false,
        error: "Session tidak valid."
      },
      401
    );
  }

  try {
    await revokeAllUserSessions(env, session.user_id);
  } catch (error) {
    console.error("LOGOUT_ALL_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal mengakhiri semua session."
      },
      500
    );
  }

  return responseClearingCookie(
    {
      success: true,
      message: "Semua session berhasil diakhiri."
    },
    200
  );
}

export async function authHandler(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "POST" && pathname === "/api/auth/register") {
    return register(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    return login(request, env);
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    return me(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    return logout(request, env);
  }

  if (
    request.method === "POST" &&
    pathname === "/api/auth/logout-all"
  ) {
    return logoutAll(request, env);
  }

  return json(
    {
      success: false,
      error: "Auth endpoint tidak ditemukan."
    },
    404
  );
}

export default authHandler;
