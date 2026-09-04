import {
  json,
  now,
  normalizeUsername,
  normalizeFirstName,
  validateUsername,
  validatePassword,
  createUser,
  getUserByUsername,
  getUserById,
  markUserLogin,
  verifyPassword,
  createSession,
  getSessionUser,
  revokeSession,
  getCookie,
  getBearerToken
} from "./utils.js";

const SESSION_COOKIE = "vds_session";

function cookie(value, maxAge = 60 * 60 * 24 * 30) {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

function getToken(request) {
  return (
    getCookie(request, SESSION_COOKIE) ||
    getBearerToken(request) ||
    null
  );
}

async function currentUser(env, request) {
  const token = getToken(request);

  if (!token) {
    return null;
  }

  return await getSessionUser(env, token);
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    first_name: user.first_name || "",
    balance: Number(user.balance || 0),
    status: user.status,
    created_at: user.created_at,
    last_login_at: user.last_login_at
  };
}

async function readBody(request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return await request.json();
    }

    const form = await request.formData();

    return Object.fromEntries(form.entries());
  } catch {
    return {};
  }
}

function error(message, status = 400) {
  return json(
    {
      success: false,
      error: message
    },
    status
  );
}

function success(data = {}, status = 200, headers = {}) {
  return json(
    {
      success: true,
      ...data
    },
    status,
    headers
  );
}

function methodNotAllowed() {
  return error("Method tidak diizinkan.", 405);
}

async function handleRegister(request, env) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const body = await readBody(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const firstName = normalizeFirstName(
    body.first_name || body.firstName || ""
  );

  if (!username) {
    return error("Username wajib diisi.");
  }

  if (!validateUsername(username)) {
    return error(
      "Username harus 4-24 karakter dan hanya boleh menggunakan huruf kecil, angka, titik, underscore, atau tanda minus."
    );
  }

  if (!validatePassword(password)) {
    return error(
      "Password minimal 8 karakter."
    );
  }

  const existing = await getUserByUsername(env, username);

  if (existing) {
    return error(
      "Username sudah digunakan.",
      409
    );
  }

  const created = await createUser(
    env,
    username,
    password,
    firstName
  );

  if (!created) {
    return error(
      "Gagal membuat akun.",
      500
    );
  }

  const token = await createSession(
    env,
    created.id,
    request
  );

  return success(
    {
      message: "Registrasi berhasil.",
      user: publicUser(created)
    },
    201,
    {
      "Set-Cookie": cookie(token)
    }
  );
}

async function handleLogin(request, env) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const body = await readBody(request);

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!username || !password) {
    return error(
      "Username dan password wajib diisi."
    );
  }

  const user = await getUserByUsername(
    env,
    username
  );

  if (!user) {
    return error(
      "Username atau password salah.",
      401
    );
  }

  if (
    String(user.status || "").toUpperCase() !==
    "ACTIVE"
  ) {
    return error(
      "Akun tidak aktif.",
      403
    );
  }

  const valid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!valid) {
    return error(
      "Username atau password salah.",
      401
    );
  }

  await markUserLogin(env, user.id);

  const token = await createSession(
    env,
    user.id,
    request
  );

  const updatedUser = await getUserById(
    env,
    user.id
  );

  return success(
    {
      message: "Login berhasil.",
      user: publicUser(updatedUser || user)
    },
    200,
    {
      "Set-Cookie": cookie(token)
    }
  );
}

async function handleMe(request, env) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const user = await currentUser(
    env,
    request
  );

  if (!user) {
    return error(
      "Belum login.",
      401
    );
  }

  return success({
    authenticated: true,
    user: publicUser(user)
  });
}

async function handleLogout(request, env) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const token = getToken(request);

  if (token) {
    await revokeSession(
      env,
      token
    );
  }

  return success(
    {
      message: "Logout berhasil."
    },
    200,
    {
      "Set-Cookie": clearCookie()
    }
  );
}

async function handleSession(request, env) {
  const user = await currentUser(
    env,
    request
  );

  if (!user) {
    return success({
      authenticated: false,
      user: null
    });
  }

  return success({
    authenticated: true,
    user: publicUser(user)
  });
}

export async function authHandler(
  request,
  env,
  pathname
) {
  try {
    switch (pathname) {
      case "/api/auth/register":
        return await handleRegister(
          request,
          env
        );

      case "/api/auth/login":
        return await handleLogin(
          request,
          env
        );

      case "/api/auth/me":
        return await handleMe(
          request,
          env
        );

      case "/api/auth/logout":
        return await handleLogout(
          request,
          env
        );

      case "/api/auth/session":
        return await handleSession(
          request,
          env
        );

      default:
        return error(
          "Endpoint auth tidak ditemukan.",
          404
        );
    }
  } catch (err) {
    console.error(
      "AUTH_ERROR",
      err
    );

    return error(
      "Terjadi kesalahan pada sistem autentikasi.",
      500
    );
  }
}

export default authHandler;
