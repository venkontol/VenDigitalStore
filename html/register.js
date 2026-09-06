<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  >
  <meta
    name="theme-color"
    content="#05070d"
  >
  <meta
    name="description"
    content="Buat akun VenDigitalStore"
  >
  <title>Daftar — VenDigitalStore</title>

  <link
    rel="stylesheet"
    href="/CSS/base.css"
  >

  <link
    rel="stylesheet"
    href="/CSS/components.css"
  >

  <link
    rel="stylesheet"
    href="/CSS/login.css"
  >
</head>

<body>
  <main class="auth-page">
    <div class="auth-container">

      <section class="auth-box">
        <a
          class="auth-logo"
          href="/"
          aria-label="VenDigitalStore"
        >
          <span class="auth-logo-mark">VD</span>
          <span>VenDigitalStore</span>
        </a>

        <div class="auth-head">
          <span class="auth-eyebrow">
            ACCOUNT
          </span>

          <h1>
            Buat akun
          </h1>

          <p>
            Daftar untuk mulai menggunakan
            wallet dan layanan digital
            VenDigitalStore.
          </p>
        </div>

        <div
          id="registerAlert"
          class="alert"
          role="alert"
          aria-live="polite"
        ></div>

        <form
          id="registerForm"
          method="post"
          autocomplete="on"
        >
          <div class="form-group">
            <label
              for="firstName"
            >
              Nama depan
            </label>

            <input
              id="firstName"
              class="input"
              type="text"
              name="first_name"
              autocomplete="given-name"
              maxlength="80"
              required
            >
          </div>

          <div class="form-group">
            <label
              for="username"
            >
              Username
            </label>

            <input
              id="username"
              class="input"
              type="text"
              name="username"
              autocomplete="username"
              maxlength="32"
              minlength="3"
              spellcheck="false"
              autocapitalize="none"
              required
            >
          </div>

          <div class="form-group">
            <label
              for="password"
            >
              Password
            </label>

            <input
              id="password"
              class="input"
              type="password"
              name="password"
              autocomplete="new-password"
              required
            >
          </div>

          <button
            id="registerButton"
            class="btn btn-primary"
            type="submit"
          >
            Buat Akun
          </button>
        </form>

        <div class="auth-foot">
          <span>
            Sudah punya akun?
          </span>

          <a href="/login">
            Login
          </a>
        </div>
      </section>

    </div>
  </main>

  <script
    type="module"
    src="/javascript/register.js"
  ></script>
</body>
</html>
