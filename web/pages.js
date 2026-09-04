import { STYLE } from "./style.js";
import { APP } from "./app.js";

const ANIME_IMAGE =
  "https://raw.githubusercontent.com/venkontol/Khusus-image-/main/grok_1788555622820.jpg";

function shell(content) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <meta name="theme-color" content="#07050d">
  <meta
    name="description"
    content="VenDigitalStore - Digital Marketplace"
  >
  <title>VenDigitalStore</title>

  <style>
    ${STYLE}
  </style>
</head>

<body>
  <div class="ven-page">
    <div class="ven-bg">
      <div class="ven-grid"></div>
      <div class="ven-noise"></div>
      <div class="ven-aurora ven-aurora-purple"></div>
      <div class="ven-aurora ven-aurora-blue"></div>
      <div class="ven-aurora ven-aurora-red"></div>
    </div>

    <div class="ven-particles" id="particles"></div>

    <header class="ven-header">
      <a
        class="ven-logo"
        href="/login"
        aria-label="VenDigitalStore"
      >
        <span class="ven-logo-mark">
          <span>V</span>
        </span>

        <span class="ven-logo-text">
          <strong>VEN</strong>
          <small>DIGITAL STORE</small>
        </span>
      </a>

      <div class="ven-status">
        <span class="ven-status-dot"></span>
        <span>SYSTEM ONLINE</span>
      </div>
    </header>

    <main class="ven-main">
      <section class="ven-character-stage">
        <div class="ven-orbit ven-orbit-one"></div>
        <div class="ven-orbit ven-orbit-two"></div>
        <div class="ven-orbit ven-orbit-three"></div>

        <div class="ven-energy ven-energy-purple"></div>
        <div class="ven-energy ven-energy-blue"></div>
        <div class="ven-energy ven-energy-red"></div>

        <div class="ven-ice-ring">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div class="ven-character-wrap" id="characterWrap">
          <div class="ven-character-glow"></div>

          <img
            id="animeCharacter"
            class="ven-character"
            src="${ANIME_IMAGE}"
            alt="VenDigitalStore anime character"
            draggable="false"
          />

          <div class="ven-character-shine"></div>
        </div>

        <div class="ven-phoenix-aura">
          <div class="phoenix-wing phoenix-wing-left"></div>
          <div class="phoenix-wing phoenix-wing-right"></div>
        </div>

        <div class="ven-dragon-aura">
          <div class="dragon-energy dragon-blue"></div>
          <div class="dragon-energy dragon-red"></div>
        </div>

        <div class="ven-snow-front" id="snowFront"></div>

        <div class="ven-scene-label">
          <span>VEN</span>
          <i></i>
          <span>LIVE SCENE</span>
        </div>
      </section>

      <section class="ven-auth-area">
        ${content}
      </section>
    </main>

    <footer class="ven-footer">
      <span>VEN DIGITAL SYSTEM</span>
      <span class="ven-footer-line"></span>
      <span>SECURE ACCESS</span>
    </footer>
  </div>

  <script>
    ${APP}
  </script>
</body>
</html>`;
}

function loginPage() {
  return shell(`
    <div class="auth-panel" id="authPanel">

      <div class="auth-panel-glow"></div>

      <div class="auth-heading">
        <div class="auth-mini-logo">VEN</div>

        <div>
          <div class="auth-kicker">
            DIGITAL MARKETPLACE
          </div>

          <h1>WELCOME BACK</h1>

          <p>
            Access your VenDigitalStore account.
          </p>
        </div>
      </div>

      <form
        id="loginForm"
        class="auth-form"
        autocomplete="on"
      >
        <label class="auth-field">
          <span>USERNAME</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="loginUsername"
              name="username"
              type="text"
              placeholder="Enter username"
              autocomplete="username"
              required
              minlength="3"
              maxlength="32"
            />
          </div>
        </label>

        <label class="auth-field">
          <span>PASSWORD</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="loginPassword"
              name="password"
              type="password"
              placeholder="Enter password"
              autocomplete="current-password"
              required
            />

            <button
              type="button"
              class="password-toggle"
              id="loginPasswordToggle"
              aria-label="Show password"
            >
              SHOW
            </button>
          </div>
        </label>

        <div
          class="auth-message"
          id="loginMessage"
          aria-live="polite"
        ></div>

        <button
          type="submit"
          class="auth-submit"
          id="loginSubmit"
        >
          <span>ACCESS SYSTEM</span>
          <i></i>
        </button>
      </form>

      <div class="auth-divider">
        <span></span>
        <b>NEW USER</b>
        <span></span>
      </div>

      <button
        type="button"
        class="auth-register"
        id="showRegister"
      >
        CREATE ACCOUNT
      </button>

      <div class="auth-security">
        <span class="security-dot"></span>
        <span>ENCRYPTED SESSION</span>
      </div>
    </div>
  `);
}

function registerPage() {
  return shell(`
    <div class="auth-panel" id="authPanel">

      <div class="auth-panel-glow"></div>

      <div class="auth-heading">
        <div class="auth-mini-logo">VEN</div>

        <div>
          <div class="auth-kicker">
            NEW ACCOUNT
          </div>

          <h1>CREATE ACCOUNT</h1>

          <p>
            Join the VenDigitalStore system.
          </p>
        </div>
      </div>

      <form
        id="registerForm"
        class="auth-form"
        autocomplete="on"
      >
        <label class="auth-field">
          <span>FIRST NAME</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="registerFirstName"
              name="first_name"
              type="text"
              placeholder="Enter your name"
              autocomplete="given-name"
              required
              maxlength="50"
            />
          </div>
        </label>

        <label class="auth-field">
          <span>USERNAME</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="registerUsername"
              name="username"
              type="text"
              placeholder="Choose username"
              autocomplete="username"
              required
              minlength="3"
              maxlength="32"
            />
          </div>
        </label>

        <label class="auth-field">
          <span>PASSWORD</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="registerPassword"
              name="password"
              type="password"
              placeholder="Create password"
              autocomplete="new-password"
              required
            />

            <button
              type="button"
              class="password-toggle"
              id="registerPasswordToggle"
            >
              SHOW
            </button>
          </div>
        </label>

        <label class="auth-field">
          <span>CONFIRM PASSWORD</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="registerConfirmPassword"
              name="confirm_password"
              type="password"
              placeholder="Repeat password"
              autocomplete="new-password"
              required
            />
          </div>
        </label>

        <div
          class="auth-message"
          id="registerMessage"
          aria-live="polite"
        ></div>

        <button
          type="submit"
          class="auth-submit"
          id="registerSubmit"
        >
          <span>CREATE ACCOUNT</span>
          <i></i>
        </button>
      </form>

      <div class="auth-divider">
        <span></span>
        <b>EXISTING USER</b>
        <span></span>
      </div>

      <button
        type="button"
        class="auth-register"
        id="showLogin"
      >
        BACK TO LOGIN
      </button>

      <div class="auth-security">
        <span class="security-dot"></span>
        <span>SECURE REGISTRATION</span>
      </div>
    </div>
  `);
}

function loadingPage() {
  return shell(`
    <div class="auth-panel loading-panel">
      <div class="loading-logo">VEN</div>

      <div class="loading-ring">
        <span></span>
      </div>

      <div class="loading-text">
        INITIALIZING SYSTEM
      </div>

      <div
        class="loading-status"
        id="loadingStatus"
      >
        CONNECTING
      </div>
    </div>
  `);
}

function dashboardPage() {
  return shell(`
    <div class="dashboard-panel">

      <div class="dashboard-top">
        <div>
          <div class="auth-kicker">
            VEN DIGITAL SYSTEM
          </div>

          <h1>DASHBOARD</h1>

          <p id="dashboardWelcome">
            Loading account...
          </p>
        </div>

        <div class="dashboard-logo">
          VEN
        </div>
      </div>

      <div class="dashboard-balance">
        <span>AVAILABLE BALANCE</span>

        <strong id="balanceValue">
          Rp 0
        </strong>

        <button
          type="button"
          id="depositButton"
          class="dashboard-action"
        >
          DEPOSIT
        </button>
      </div>

      <div class="dashboard-grid">
        <button
          type="button"
          class="dashboard-card"
          data-action="marketplace"
        >
          <strong>MARKETPLACE</strong>
          <span>Digital products</span>
        </button>

        <button
          type="button"
          class="dashboard-card"
          data-action="orders"
        >
          <strong>ORDERS</strong>
          <span>Order history</span>
        </button>

        <button
          type="button"
          class="dashboard-card"
          data-action="profile"
        >
          <strong>PROFILE</strong>
          <span>Account settings</span>
        </button>

        <button
          type="button"
          class="dashboard-card dashboard-logout"
          id="logoutButton"
        >
          <strong>LOGOUT</strong>
          <span>End session</span>
        </button>
      </div>

      <div
        class="dashboard-message"
        id="dashboardMessage"
      ></div>
    </div>
  `);
}

function depositPage() {
  return shell(`
    <div class="dashboard-panel deposit-panel">

      <div class="dashboard-top">
        <div>
          <div class="auth-kicker">
            WALLET SYSTEM
          </div>

          <h1>DEPOSIT</h1>

          <p>
            Add balance to your VenDigitalStore account.
          </p>
        </div>

        <div class="dashboard-logo">
          VEN
        </div>
      </div>

      <form
        id="depositForm"
        class="auth-form"
      >
        <label class="auth-field">
          <span>AMOUNT</span>

          <div class="input-wrap">
            <span class="input-line"></span>

            <input
              id="depositAmount"
              type="number"
              min="1000"
              max="10000000"
              step="1000"
              placeholder="Minimum Rp 1.000"
              required
            />
          </div>
        </label>

        <div
          class="auth-message"
          id="depositMessage"
        ></div>

        <button
          type="submit"
          class="auth-submit"
          id="depositSubmit"
        >
          <span>CREATE DEPOSIT</span>
          <i></i>
        </button>
      </form>

      <div
        class="deposit-result"
        id="depositResult"
        hidden
      >
        <div class="deposit-code">
          <span>REFERENCE ID</span>
          <strong id="depositReference">-</strong>
        </div>

        <div class="deposit-status">
          <span>STATUS</span>
          <strong id="depositStatus">PENDING</strong>
        </div>

        <p>
          Complete the payment using the available payment
          instructions. This page will check the deposit status
          automatically.
        </p>
      </div>

      <button
        type="button"
        class="auth-register"
        id="backDashboard"
      >
        BACK TO DASHBOARD
      </button>
    </div>
  `);
}

export function renderPage(pathname) {
  switch (pathname) {
    case "/":
      return loginPage();

    case "/login":
      return loginPage();

    case "/register":
      return registerPage();

    case "/dashboard":
      return dashboardPage();

    case "/deposit":
      return depositPage();

    case "/loading":
      return loadingPage();

    default:
      return loginPage();
  }
  }
