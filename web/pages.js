import { STYLE } from "./style.js";
import { APP } from "./app.js";

const CHARACTER_VIDEO = "https://raw.githubusercontent.com/venkontol/VenDigitalStore/main/character-live.mp4";
const CHARACTER_IMAGE = "https://raw.githubusercontent.com/venkontol/VenDigitalStore/main/character-frame2.jpg";
const AMBIENT_MUSIC = "https://raw.githubusercontent.com/venkontol/VenDigitalStore/main/ambient-music.mp3";

function shell(content, options = {}) {
  const showCharacter = options.character !== false;
  const useVideo = options.video === true; // true = login/register

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#05070f">
  <meta name="description" content="VenDigitalStore - Digital Marketplace">
  <title>VenDigitalStore</title>
  <style>${STYLE}</style>
</head>
<body class="${options.bodyClass || ""}">
  <div class="ven-page">
    <div class="ven-bg">
      <div class="ven-gradient"></div>
      <div class="ven-mist"></div>
      <div class="ven-noise"></div>
    </div>

    <div class="ven-particles" id="particles" aria-hidden="true"></div>

    <header class="ven-header">
      <a class="ven-logo" href="/dashboard" aria-label="VenDigitalStore">
        <span class="ven-logo-mark"><span>V</span></span>
        <span class="ven-logo-text">
          <strong>VEN</strong>
          <small>DIGITAL STORE</small>
        </span>
      </a>

      <div class="ven-header-right">
        <button type="button" class="sound-toggle" id="soundToggle" aria-label="Toggle sound" title="Sound Off">
          <svg class="icon-sound-off" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
            <line x1="23" y1="9" x2="17" y2="15"/>
            <line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
          <svg class="icon-sound-on" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" style="display:none">
            <path d="M11 5L6 9H2v6h4l5 4V5z"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>

        <div class="ven-status">
          <span class="ven-status-dot"></span>
          <span>ONLINE</span>
        </div>
      </div>
    </header>

    <main class="ven-main ${showCharacter ? "has-character" : "no-character"}">
      ${
        showCharacter
          ? `
      <section class="ven-character-stage" aria-hidden="true">
        <div class="ven-character-wrap" id="characterWrap">
          <div class="ven-character-glow"></div>
          ${
            useVideo
              ? `<video
                  id="animeCharacter"
                  class="ven-character"
                  src="${CHARACTER_VIDEO}"
                  autoplay
                  muted
                  loop
                  playsinline
                  preload="auto"
                ></video>`
              : `<img
                  id="animeCharacter"
                  class="ven-character"
                  src="${CHARACTER_IMAGE}"
                  alt="VenDigitalStore"
                  draggable="false"
                />`
          }
          <div class="ven-character-shine"></div>
        </div>
      </section>`
          : ""
      }

      <section class="ven-content-area">
        ${content}
      </section>
    </main>

    <footer class="ven-footer">
      <span>VEN DIGITAL SYSTEM</span>
      <span class="ven-footer-line"></span>
      <span>SECURE ACCESS</span>
    </footer>

    <audio id="bgMusic" loop preload="none">
      <source src="${AMBIENT_MUSIC}" type="audio/mpeg">
    </audio>
  </div>

  <script>${APP}</script>
</body>
</html>`;
}

function loginPage() {
  return shell(`
    <div class="auth-panel" id="authPanel">
      <div class="auth-heading">
        <div class="auth-kicker">DIGITAL MARKETPLACE</div>
        <h1>WELCOME BACK</h1>
        <p>Access your VenDigitalStore account.</p>
      </div>

      <form id="loginForm" class="auth-form" autocomplete="on">
        <label class="auth-field">
          <span>USERNAME</span>
          <div class="input-wrap">
            <input id="loginUsername" name="username" type="text" placeholder="Enter username" autocomplete="username" required minlength="3" maxlength="32" />
          </div>
        </label>

        <label class="auth-field">
          <span>PASSWORD</span>
          <div class="input-wrap">
            <input id="loginPassword" name="password" type="password" placeholder="Enter password" autocomplete="current-password" required />
            <button type="button" class="password-toggle" data-password-toggle="#loginPassword">SHOW</button>
          </div>
        </label>

        <div class="auth-message" id="loginMessage" aria-live="polite"></div>

        <button type="submit" class="auth-submit" id="loginSubmit">
          <span>ACCESS SYSTEM</span>
        </button>
      </form>

      <div class="auth-divider"><span></span><b>NEW USER</b><span></span></div>

      <button type="button" class="auth-secondary" id="showRegister">CREATE ACCOUNT</button>

      <div class="auth-security">
        <span class="security-dot"></span>
        <span>ENCRYPTED SESSION</span>
      </div>
    </div>
  `, { video: true });
}

function registerPage() {
  return shell(`
    <div class="auth-panel" id="authPanel">
      <div class="auth-heading">
        <div class="auth-kicker">NEW ACCOUNT</div>
        <h1>CREATE ACCOUNT</h1>
        <p>Join the VenDigitalStore system.</p>
      </div>

      <form id="registerForm" class="auth-form" autocomplete="on">
        <label class="auth-field">
          <span>FIRST NAME</span>
          <div class="input-wrap">
            <input id="registerFirstName" name="first_name" type="text" placeholder="Enter your name" autocomplete="given-name" required maxlength="50" />
          </div>
        </label>

        <label class="auth-field">
          <span>USERNAME</span>
          <div class="input-wrap">
            <input id="registerUsername" name="username" type="text" placeholder="Choose username" autocomplete="username" required minlength="3" maxlength="32" />
          </div>
        </label>

        <label class="auth-field">
          <span>PASSWORD</span>
          <div class="input-wrap">
            <input id="registerPassword" name="password" type="password" placeholder="Create password" autocomplete="new-password" required />
            <button type="button" class="password-toggle" data-password-toggle="#registerPassword">SHOW</button>
          </div>
        </label>

        <label class="auth-field">
          <span>CONFIRM PASSWORD</span>
          <div class="input-wrap">
            <input id="registerConfirmPassword" name="confirm_password" type="password" placeholder="Repeat password" autocomplete="new-password" required />
          </div>
        </label>

        <div class="auth-message" id="registerMessage" aria-live="polite"></div>

        <button type="submit" class="auth-submit" id="registerSubmit">
          <span>CREATE ACCOUNT</span>
        </button>
      </form>

      <div class="auth-divider"><span></span><b>EXISTING USER</b><span></span></div>

      <button type="button" class="auth-secondary" id="showLogin">BACK TO LOGIN</button>
    </div>
  `, { video: true });
}

function dashboardPage() {
  return shell(`
    <div class="dashboard" data-page="dashboard">
      <div class="dash-top">
        <div class="dash-welcome">
          <div class="auth-kicker">VEN DIGITAL SYSTEM</div>
          <h1 id="dashboardWelcome">Welcome back</h1>
          <p class="dash-username" data-user-username>@user</p>
        </div>

        <button type="button" class="hamburger" id="menuToggle" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </div>

      <div class="balance-card">
        <span class="balance-label">AVAILABLE BALANCE</span>
        <strong class="balance-value" data-user-balance>Rp 0</strong>
        <button type="button" class="btn-deposit" id="depositButton">DEPOSIT</button>
      </div>

      <div class="dash-hint">
        Gunakan menu di pojok kanan untuk order <strong>Nokos</strong> atau <strong>Suntik Sosmed</strong>.
      </div>
    </div>

    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-logo">VEN</span>
        <button type="button" class="sidebar-close" id="sidebarClose" aria-label="Close menu">×</button>
      </div>

      <nav class="sidebar-nav">
        <button type="button" class="sidebar-item" data-nav="/marketplace">
          <span class="sidebar-icon">◈</span>
          <div>
            <strong>Marketplace</strong>
            <small>Nokos & Suntik Sosmed</small>
          </div>
        </button>

        <button type="button" class="sidebar-item" data-nav="/orders">
          <span class="sidebar-icon">☰</span>
          <div>
            <strong>Orders</strong>
            <small>Riwayat pesanan</small>
          </div>
        </button>

        <button type="button" class="sidebar-item" data-nav="/account">
          <span class="sidebar-icon">◎</span>
          <div>
            <strong>Account</strong>
            <small>Profil & pengaturan</small>
          </div>
        </button>
      </nav>

      <div class="sidebar-footer">
        <button type="button" class="sidebar-item logout" data-action="logout">
          <span class="sidebar-icon">⏻</span>
          <div>
            <strong>Logout</strong>
            <small>Keluar dari sistem</small>
          </div>
        </button>
      </div>
    </aside>
  `, { character: false, bodyClass: "page-dashboard" });
}

function depositPage() {
  return shell(`
    <div class="dashboard deposit-page">
      <div class="dash-top">
        <div>
          <div class="auth-kicker">WALLET SYSTEM</div>
          <h1>DEPOSIT</h1>
          <p>Tambah saldo ke akun VenDigitalStore.</p>
        </div>
        <button type="button" class="btn-back" data-nav="/dashboard">← Dashboard</button>
      </div>

      <form id="depositForm" class="auth-form">
        <label class="auth-field">
          <span>JUMLAH (Rp)</span>
          <div class="input-wrap">
            <input id="depositAmount" type="number" min="1000" max="10000000" step="1000" placeholder="Minimum Rp 1.000" required />
          </div>
        </label>

        <div class="auth-message" id="depositMessage"></div>

        <button type="submit" class="auth-submit" id="depositSubmit">
          <span>CREATE DEPOSIT</span>
        </button>
      </form>

      <div class="deposit-result" id="depositResult" hidden>
        <div class="deposit-info-row">
          <span>REFERENCE</span>
          <strong data-deposit-reference>-</strong>
        </div>
        <div class="deposit-info-row">
          <span>AMOUNT</span>
          <strong data-deposit-amount>-</strong>
        </div>
        <div class="deposit-info-row">
          <span>STATUS</span>
          <strong data-deposit-status>PENDING</strong>
        </div>
        <div class="deposit-info-row">
          <span>EXPIRED</span>
          <strong data-deposit-expired>-</strong>
        </div>
        <p class="deposit-note">Selesaikan pembayaran. Status akan diperbarui otomatis.</p>
      </div>
    </div>
  `, { character: false, bodyClass: "page-dashboard" });
}

function marketplacePage() {
  return shell(`
    <div class="dashboard">
      <div class="dash-top">
        <div>
          <div class="auth-kicker">MARKETPLACE</div>
          <h1>Pilih Layanan</h1>
        </div>
        <button type="button" class="btn-back" data-nav="/dashboard">← Dashboard</button>
      </div>

      <div class="service-grid">
        <button type="button" class="service-card" data-service="nokos">
          <strong>NOKOS</strong>
          <span>Nomor Kosong / Virtual Number</span>
        </button>
        <button type="button" class="service-card" data-service="sosmed">
          <strong>SUNTIK SOSMED</strong>
          <span>Followers, Likes, Views, dll</span>
        </button>
      </div>
    </div>
  `, { character: false, bodyClass: "page-dashboard" });
}

function ordersPage() {
  return shell(`
    <div class="dashboard">
      <div class="dash-top">
        <div>
          <div class="auth-kicker">ORDERS</div>
          <h1>Riwayat Pesanan</h1>
        </div>
        <button type="button" class="btn-back" data-nav="/dashboard">← Dashboard</button>
      </div>
      <div class="empty-state">
        <p>Belum ada pesanan.</p>
      </div>
    </div>
  `, { character: false, bodyClass: "page-dashboard" });
}

function accountPage() {
  return shell(`
    <div class="dashboard">
      <div class="dash-top">
        <div>
          <div class="auth-kicker">ACCOUNT</div>
          <h1>Profil</h1>
        </div>
        <button type="button" class="btn-back" data-nav="/dashboard">← Dashboard</button>
      </div>
      <div class="account-card">
        <p><strong>Username:</strong> <span data-user-username>@user</span></p>
        <p><strong>Nama:</strong> <span data-user-name>-</span></p>
        <p><strong>Saldo:</strong> <span data-user-balance>Rp 0</span></p>
      </div>
    </div>
  `, { character: false, bodyClass: "page-dashboard" });
}

function loadingPage() {
  return shell(`
    <div class="auth-panel loading-panel">
      <div class="loading-logo">VEN</div>
      <div class="loading-ring"><span></span></div>
      <div class="loading-text">INITIALIZING SYSTEM</div>
      <div class="loading-status" id="loadingStatus">CONNECTING</div>
    </div>
  `, { character: false });
}

export function renderPage(pathname) {
  switch (pathname) {
    case "/":
    case "/login":
      return loginPage();
    case "/register":
      return registerPage();
    case "/dashboard":
      return dashboardPage();
    case "/deposit":
      return depositPage();
    case "/marketplace":
      return marketplacePage();
    case "/orders":
      return ordersPage();
    case "/account":
      return accountPage();
    case "/loading":
      return loadingPage();
    default:
      return loginPage();
  }
}
