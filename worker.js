import { json } from "./src/utils.js";
import {
  handleUpdate,
  handleScheduled
} from "./src/index.js";

import {
  register,
  login,
  logout,
  getSession
} from "./src/auth.js";

function responseJson(data, status = 200, extraHeaders = {}) {
  return json(data, status, {
    "Cache-Control": "no-store",
    ...extraHeaders
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function methodNotAllowed() {
  return responseJson(
    {
      success: false,
      error: "Method Not Allowed"
    },
    405
  );
}

function authError(error) {
  return responseJson(
    {
      success: false,
      error:
        error?.message ||
        "Terjadi kesalahan."
    },
    Number.isInteger(error?.status)
      ? error.status
      : 500
  );
}

async function handleAuthRegister(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const data =
      await readJson(request);

    const user =
      await register(
        env,
        data
      );

    return responseJson(
      {
        success: true,
        message:
          "Akun berhasil dibuat.",
        user: {
          id: user.id,
          username: user.username,
          first_name:
            user.first_name,
          balance:
            Number(
              user.balance || 0
            ),
          status:
            user.status
        }
      },
      201
    );
  } catch (error) {
    return authError(error);
  }
}

async function handleAuthLogin(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const data =
      await readJson(request);

    const result =
      await login(
        env,
        data
      );

    return responseJson(
      {
        success: true,
        message:
          "Login berhasil.",
        user: result.user
      },
      200,
      {
        "Set-Cookie":
          result.session.cookie
      }
    );
  } catch (error) {
    return authError(error);
  }
}

async function handleAuthLogout(
  request,
  env
) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const result =
      await logout(
        env,
        request
      );

    return responseJson(
      {
        success: true,
        message:
          "Logout berhasil."
      },
      200,
      {
        "Set-Cookie":
          result.cookie
      }
    );
  } catch (error) {
    return authError(error);
  }
}

async function handleAuthMe(
  request,
  env
) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  try {
    const user =
      await getSession(
        env,
        request
      );

    if (!user) {
      return responseJson(
        {
          success: false,
          authenticated: false,
          user: null
        },
        401
      );
    }

    return responseJson({
      success: true,
      authenticated: true,
      user
    });
  } catch (error) {
    return authError(error);
  }
}

function webPage(
  title,
  content
) {
  return new Response(
    `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | VenDigitalStore</title>
</head>
<body>
${content}
</body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=UTF-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
}

function loginPage() {
  return webPage(
    "Login",
    `
<main>
  <h1>VenDigitalStore</h1>
  <p>Login untuk melanjutkan.</p>

  <form id="login-form">
    <input
      id="username"
      name="username"
      type="text"
      autocomplete="username"
      placeholder="Username"
      required
    >

    <input
      id="password"
      name="password"
      type="password"
      autocomplete="current-password"
      placeholder="Password"
      required
    >

    <button type="submit">
      Login
    </button>
  </form>

  <p id="message"></p>

  <p>
    Belum punya akun?
    <a href="/register">Daftar</a>
  </p>
</main>

<script>
const form =
  document.getElementById("login-form");

const message =
  document.getElementById("message");

form.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    message.textContent =
      "Memproses...";

    const username =
      document
        .getElementById("username")
        .value;

    const password =
      document
        .getElementById("password")
        .value;

    try {
      const response =
        await fetch(
          "/api/auth/login",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
              username,
              password
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        message.textContent =
          data.error ||
          "Login gagal.";

        return;
      }

      window.location.href =
        "/dashboard";
    } catch {
      message.textContent =
        "Tidak dapat terhubung ke server.";
    }
  }
);
</script>
`
  );
}

function registerPage() {
  return webPage(
    "Daftar",
    `
<main>
  <h1>VenDigitalStore</h1>
  <p>Buat akun baru.</p>

  <form id="register-form">
    <input
      id="first_name"
      name="first_name"
      type="text"
      autocomplete="given-name"
      placeholder="Nama"
      maxlength="80"
    >

    <input
      id="username"
      name="username"
      type="text"
      autocomplete="username"
      placeholder="Username"
      minlength="3"
      maxlength="32"
      required
    >

    <input
      id="password"
      name="password"
      type="password"
      autocomplete="new-password"
      placeholder="Password"
      minlength="8"
      maxlength="128"
      required
    >

    <button type="submit">
      Buat Akun
    </button>
  </form>

  <p id="message"></p>

  <p>
    Sudah punya akun?
    <a href="/login">Login</a>
  </p>
</main>

<script>
const form =
  document.getElementById(
    "register-form"
  );

const message =
  document.getElementById(
    "message"
  );

form.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    message.textContent =
      "Membuat akun...";

    const first_name =
      document
        .getElementById(
          "first_name"
        )
        .value;

    const username =
      document
        .getElementById(
          "username"
        )
        .value;

    const password =
      document
        .getElementById(
          "password"
        )
        .value;

    try {
      const response =
        await fetch(
          "/api/auth/register",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              first_name,
              username,
              password
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        message.textContent =
          data.error ||
          "Pendaftaran gagal.";

        return;
      }

      window.location.href =
        "/login";
    } catch {
      message.textContent =
        "Tidak dapat terhubung ke server.";
    }
  }
);
</script>
`
  );
}

async function dashboardPage(
  request,
  env
) {
  const user =
    await getSession(
      env,
      request
    );

  if (!user) {
    return Response.redirect(
      new URL(
        "/login",
        request.url
      ),
      302
    );
  }

  return webPage(
    "Dashboard",
    `
<main>
  <h1>VenDigitalStore</h1>

  <section>
    <p>
      Selamat datang,
      <strong>
        ${escapeHtml(
          user.first_name ||
          user.username
        )}
      </strong>
    </p>

    <p>
      Username:
      ${escapeHtml(
        user.username
      )}
    </p>

    <p>
      Saldo:
      Rp ${formatMoney(
        user.balance
      )}
    </p>
  </section>

  <nav>
    <a href="/dashboard">
      Dashboard
    </a>

    <a href="/products">
      Produk
    </a>

    <a href="/orders">
      Pesanan
    </a>

    <a href="/deposit">
      Deposit
    </a>

    <a href="/account">
      Akun
    </a>

    <button
      id="logout-button"
      type="button"
    >
      Logout
    </button>
  </nav>
</main>

<script>
document
  .getElementById(
    "logout-button"
  )
  .addEventListener(
    "click",
    async () => {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials:
            "same-origin"
        }
      );

      window.location.href =
        "/login";
    }
  );
</script>
`
  );
}

function formatMoney(value) {
  const amount =
    Number(value || 0);

  return new Intl.NumberFormat(
    "id-ID"
  ).format(amount);
}

function escapeHtml(value) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;"
    );
}

async function handleWebRoute(
  request,
  env
) {
  const url =
    new URL(request.url);

  if (
    request.method === "GET" &&
    url.pathname === "/"
  ) {
    const user =
      await getSession(
        env,
        request
      );

    if (user) {
      return Response.redirect(
        new URL(
          "/dashboard",
          request.url
        ),
        302
      );
    }

    return Response.redirect(
      new URL(
        "/login",
        request.url
      ),
      302
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/login"
  ) {
    const user =
      await getSession(
        env,
        request
      );

    if (user) {
      return Response.redirect(
        new URL(
          "/dashboard",
          request.url
        ),
        302
      );
    }

    return loginPage();
  }

  if (
    request.method === "GET" &&
    url.pathname === "/register"
  ) {
    const user =
      await getSession(
        env,
        request
      );

    if (user) {
      return Response.redirect(
        new URL(
          "/dashboard",
          request.url
        ),
        302
      );
    }

    return registerPage();
  }

  if (
    request.method === "GET" &&
    url.pathname === "/dashboard"
  ) {
    return dashboardPage(
      request,
      env
    );
  }

  return null;
}

async function handleApiRoute(
  request,
  env
) {
  const url =
    new URL(request.url);

  if (
    url.pathname ===
    "/api/auth/register"
  ) {
    return handleAuthRegister(
      request,
      env
    );
  }

  if (
    url.pathname ===
    "/api/auth/login"
  ) {
    return handleAuthLogin(
      request,
      env
    );
  }

  if (
    url.pathname ===
    "/api/auth/logout"
  ) {
    return handleAuthLogout(
      request,
      env
    );
  }

  if (
    url.pathname ===
    "/api/auth/me"
  ) {
    return handleAuthMe(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/status"
  ) {
    return responseJson({
      success: true,
      service:
        "VenDigitalStore",
      web: "online",
      auth: "online",
      database: "D1",
      telegram:
        "legacy"
    });
  }

  return null;
}

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    try {
      const url =
        new URL(request.url);

      const apiResponse =
        await handleApiRoute(
          request,
          env
        );

      if (apiResponse) {
        return apiResponse;
      }

      const webResponse =
        await handleWebRoute(
          request,
          env
        );

      if (webResponse) {
        return webResponse;
      }

      if (
        request.method === "POST" &&
        url.pathname ===
          "/telegram/webhook"
      ) {
        const update =
          await request.json();

        ctx.waitUntil(
          handleUpdate(
            env,
            update
          ).catch(
            (error) => {
              console.error(
                "Webhook error:",
                error?.message ||
                  error
              );
            }
          )
        );

        return responseJson({
          success: true
        });
      }

      return responseJson(
        {
          success: false,
          error: "Not Found"
        },
        404
      );
    } catch (error) {
      console.error(
        "Worker error:",
        error
      );

      return responseJson(
        {
          success: false,
          error:
            error?.message ||
            "Internal Server Error"
        },
        500
      );
    }
  },

  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      handleScheduled(
        env
      ).catch(
        (error) => {
          console.error(
            "Scheduled error:",
            error?.message ||
              error
          );
        }
      )
    );
  }
};
