import { STYLE } from "./style.js";
import { APP } from "./app.js";

// Character from Frame 2 (user selected)
const ANIME_IMAGE = "/character.jpg";
// Fallback if static asset not served yet
const ANIME_FALLBACK =
  "https://raw.githubusercontent.com/venkontol/Khusus-image-/main/grok_1788555622820.jpg";

function shell(content, options = {}) {
  const isAuthPage = options.auth !== false;
  const showCharacter = options.character !== false;

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
    <!-- Background layers -->
    <div class="ven-bg">
      <div class="ven-gradient"></div>
      <div class="ven-mist"></div>
      <div class="ven-noise"></div>
    </div>

    <!-- Soft particles (limited for performance) -->
    <div class="ven-particles" id="particles" aria-hidden="true"></div>

    <!-- Header -->
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
          <img
            id="animeCharacter"
            class="ven-character"
            src="${ANIME_IMAGE}"
            onerror="this.src='${ANIME_FALLBACK}'"
            alt="VenDigitalStore"
            draggable="false"
          />
          <div class="ven-character-shine"></div>
        </div>
        <div class="ven-petals" id="petals"></div>
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

    <!-- Audio (default muted) -->
    <audio id="bgMusic" loop preload="none">
      <source src="/ambient.mp3" type="audio/mpeg">
    </audio>
  </div>

  <script>${APP}</script>
</body>
</html>`;
}

/* ===================== LOGIN ===================== */
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
            <input
              id
... 
