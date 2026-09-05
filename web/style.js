export const STYLE = `
:root {
  --bg: #05070f;
  --bg2: #0a0e1a;
  --card: rgba(12, 16, 28, 0.72);
  --card-border: rgba(180, 200, 255, 0.12);
  --text: #f0f4ff;
  --muted: #8b93a7;
  --ice: #7dd3fc;
  --ice2: #bae6fd;
  --blue: #3b82f6;
  --blue2: #60a5fa;
  --accent: linear-gradient(135deg, #60a5fa, #a78bfa);
  --success: #34d399;
  --error: #f87171;
  --radius: 18px;
  --shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100%;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

body { min-height: 100svh; overflow-x: hidden; }

button, input { font: inherit; }
button { cursor: pointer; border: none; background: none; color: inherit; }
button:disabled { opacity: 0.55; cursor: not-allowed; }

.ven-page {
  position: relative;
  min-height: 100svh;
  isolation: isolate;
  overflow: hidden;
}

.ven-bg {
  position: absolute;
  inset: 0;
  z-index: -5;
  background: radial-gradient(ellipse at 70% 20%, rgba(59, 130, 246, 0.12), transparent 50%),
              radial-gradient(ellipse at 20% 80%, rgba(125, 211, 252, 0.06), transparent 45%),
              #05070f;
}

.ven-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(160deg, #05070f 0%, #0a1020 40%, #05070f 100%);
}

.ven-mist {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(125, 211, 252, 0.04), transparent 60%);
  pointer-events: none;
}

.ven-noise {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.ven-header {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}

.ven-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
}

.ven-logo-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(125, 211, 252, 0.35);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(125, 211, 252, 0.1));
  transform: rotate(45deg);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
}

.ven-logo-mark span {
  transform: rotate(-45deg);
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #e0f2fe, #93c5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.ven-logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.ven-logo-text strong {
  font-size: 18px;
  letter-spacing: 3px;
  font-weight: 700;
}

.ven-logo-text small {
  font-size: 8px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-top: 3px;
}

.ven-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sound-toggle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background: rgba(8, 12, 22, 0.6);
  display: grid;
  place-items: center;
  color: var(--muted);
  transition: all 0.25s ease;
}

.sound-toggle:hover {
  border-color: rgba(125, 211, 252, 0.45);
  color: var(--ice);
}

.sound-toggle.is-on {
  color: var(--ice);
  border-color: rgba(125, 211, 252, 0.5);
  box-shadow: 0 0 12px rgba(125, 211, 252, 0.2);
}

.ven-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.15);
  background: rgba(5, 8, 16, 0.5);
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
}

.ven-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px #34d399;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.ven-main {
  position: relative;
  z-index: 5;
  display: grid;
  min-height: calc(100svh - 110px);
  padding: 0 4vw 30px;
}

.ven-main.has-character {
  grid-template-columns: minmax(0, 1.3fr) minmax(340px, 0.85fr);
  align-items: center;
  gap: 2vw;
}

.ven-main.no-character {
  grid-template-columns: 1fr;
  justify-items: center;
  align-items: start;
  padding-top: 20px;
}

.ven-character-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 520px;
  height: calc(100svh - 140px);
  pointer-events: none;
}

.ven-character-wrap {
  position: relative;
  width: min(48vw, 520px);
  height: min(78vh, 720px);
  animation: float 7s ease-in-out infinite;
}

.ven-character {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  border-radius: 40% 40% 20% 20%;
  filter: saturate(1.08) contrast(1.05) brightness(0.92);
  mask-image: linear-gradient(to bottom, transparent 0%, black 6%, black 90%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 6%, black 90%, transparent 100%);
}

.ven-character-glow {
  position: absolute;
  inset: 8%;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.28) 0%, rgba(125, 211, 252, 0.12) 35%, transparent 70%);
  filter: blur(40px);
  animation: glow 5s ease-in-out infinite;
}

.ven-character-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: inherit;
}

.ven-character-shine::before {
  content: "";
  position: absolute;
  top: -40%;
  left: -70%;
  width: 35%;
  height: 180%;
  background: linear-gradient(90deg, transparent, rgba(186, 230, 253, 0.18), transparent);
  transform: rotate(18deg);
  animation: shine 8s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}

@keyframes glow {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

@keyframes shine {
  0% { left: -70%; }
  100% { left: 130%; }
}

.ven-content-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.auth-panel {
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 36px 32px;
  border-radius: var(--radius);
  background: var(--card);
  border: 1px solid var(--card-border);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow);
}

.auth-heading { margin-bottom: 28px; }

.auth-kicker {
  font-size: 10px;
  letter-spacing: 2.5px;
  color: var(--ice);
  margin-bottom: 8px;
  opacity: 0.85;
}

.auth-heading h1 {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.auth-heading p {
  font-size: 13px;
  color: var(--muted);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.auth-field span {
  display: block;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: var(--muted);
  margin-bottom: 7px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrap input {
  width: 100%;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid rgba(125, 211, 252, 0.15);
  background: rgba(5, 8, 16, 0.55);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-wrap input:focus {
  border-color: rgba(125, 211, 252, 0.45);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.input-wrap input::placeholder { color: #5a6278; }

.password-toggle {
  position: absolute;
  right: 10px;
  font-size: 10px;
  letter-spacing: 1px;
  color: var(--muted);
  padding: 4px 8px;
}

.password-toggle:hover { color: var(--ice); }

.auth-message {
  font-size: 13px;
  min-height: 18px;
}

.auth-message.is-error { color: var(--error); }
.auth-message.is-success { color: var(--success); }

.auth-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1.5px;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
}

.auth-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(59, 130, 246, 0.4);
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0 16px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 1.5px;
}

.auth-divider span {
  flex: 1;
  height: 1px;
  background: rgba(125, 211, 252, 0.12);
}

.auth-secondary {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background: transparent;
  color: var(--text);
  font-size: 12px;
  letter-spacing: 1.5px;
  transition: border-color 0.2s, background 0.2s;
}

.auth-secondary:hover {
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(125, 211, 252, 0.05);
}

.auth-security {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 22px;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
}

.security-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ice);
  box-shadow: 0 0 6px var(--ice);
}

.dashboard {
  width: 100%;
  max-width: 520px;
  padding: 10px 0 40px;
}

.dash-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32px;
  gap: 16px;
}

.dash-welcome h1 {
  font-size: 26px;
  font-weight: 700;
  margin: 4px 0;
}

.dash-username {
  font-size: 13px;
  color: var(--muted);
}

.hamburger {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  background: rgba(8, 12, 22, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex-shrink: 0;
  transition: border-color 0.2s;
}

.hamburger span {
  display: block;
  width: 18px;
  height: 1.5px;
  background: var(--text);
  border-radius: 2px;
}

.hamburger:hover {
  border-color: rgba(125, 211, 252, 0.4);
}

.balance-card {
  padding: 32px 28px;
  border-radius: var(--radius);
  background: var(--card);
  border: 1px solid var(--card-border);
  backdrop-filter: blur(16px);
  text-align: center;
  box-shadow: var(--shadow);
}

.balance-label {
  display: block;
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-bottom: 10px;
}

.balance-value {
  display: block;
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #e0f2fe, #93c5fd);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 22px;
}

.btn-deposit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 32px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1.5px;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
  transition: transform 0.15s, box-shadow 0.2s;
}

.btn-deposit:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(59, 130, 246, 0.4);
}

.dash-hint {
  margin-top: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

.dash-hint strong {
  color: var(--ice2);
  font-weight: 500;
}

.btn-back {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  font-size: 12px;
  color: var(--muted);
  transition: 0.2s;
}

.btn-back:hover {
  color: var(--text);
  border-color: rgba(125, 211, 252, 0.4);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 80;
  opacity: 0;
  visibility: hidden;
  transition: 0.3s;
}

.sidebar-overlay.is-open {
  opacity: 1;
  visibility: visible;
}

.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  width: min(320px, 88vw);
  height: 100%;
  z-index: 90;
  background: rgba(8, 12, 22, 0.92);
  border-left: 1px solid rgba(125, 211, 252, 0.12);
  backdrop-filter: blur(24px);
  transform: translateX(100%);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
}

.sidebar.is-open {
  transform: translateX(0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 20px;
  border-bottom: 1px solid rgba(125, 211, 252, 0.1);
}

.sidebar-logo {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
}

.sidebar-close {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 22px;
  color: var(--muted);
  display: grid;
  place-items: center;
}

.sidebar-close:hover { color: var(--text); }

.sidebar-nav {
  flex: 1;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 14px;
  border-radius: 12px;
  text-align: left;
  transition: background 0.2s;
}

.sidebar-item:hover {
  background: rgba(125, 211, 252, 0.08);
}

.sidebar-icon {
  width: 28px;
  font-size: 16px;
  color: var(--ice);
  text-align: center;
}

.sidebar-item strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
}

.sidebar-item small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid rgba(125, 211, 252, 0.1);
}

.sidebar-item.logout strong { color: #f87171; }

.service-grid {
  display: grid;
  gap: 14px;
  margin-top: 10px;
}

.service-card {
  padding: 22px 20px;
  border-radius: var(--radius);
  border: 1px solid var(--card-border);
  background: var(--card);
  text-align: left;
  transition: border-color 0.2s, transform 0.15s;
}

.service-card:hover {
  border-color: rgba(125, 211, 252, 0.35);
  transform: translateY(-2px);
}

.service-card strong {
  display: block;
  font-size: 16px;
  margin-bottom: 6px;
}

.service-card span {
  font-size: 13px;
  color: var(--muted);
}

.empty-state, .account-card {
  margin-top: 20px;
  padding: 28px;
  border-radius: var(--radius);
  border: 1px solid var(--card-border);
  background: var(--card);
  text-align: center;
  color: var(--muted);
}

.account-card {
  text-align: left;
  line-height: 1.9;
}

.deposit-result {
  margin-top: 24px;
  padding: 20px;
  border-radius: var(--radius);
  border: 1px solid var(--card-border);
  background: var(--card);
}

.deposit-info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(125, 211, 252, 0.08);
}

.deposit-info-row span { color: var(--muted); }
.deposit-note {
  margin-top: 14px;
  font-size: 12px;
  color: var(--muted);
}

.ven-footer {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 16px;
  font-size: 9px;
  letter-spacing: 2px;
  color: #4a5168;
}

.ven-footer-line {
  width: 40px;
  height: 1px;
  background: rgba(125, 211, 252, 0.15);
}

.loading-panel {
  text-align: center;
  padding: 50px 30px;
}

.loading-logo {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 6px;
  margin-bottom: 28px;
}

.loading-ring {
  width: 48px;
  height: 48px;
  margin: 0 auto 20px;
  border: 2px solid rgba(125, 211, 252, 0.15);
  border-top-color: var(--ice);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--muted);
}

.loading-status {
  margin-top: 8px;
  font-size: 11px;
  color: var(--ice);
}

@media (max-width: 900px) {
  .ven-main.has-character {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .ven-character-stage {
    min-height: 280px;
    height: 42vh;
    order: -1;
  }

  .ven-character-wrap {
    width: min(70vw, 340px);
    height: min(42vh, 380px);
  }

  .auth-panel { max-width: 100%; }
}

@media (max-width: 520px) {
  .ven-header { padding: 16px 18px; }
  .ven-logo-text strong { font-size: 15px; }
  .ven-logo-mark { width: 36px; height: 36px; }
  .auth-panel { padding: 28px 20px; }
  .auth-heading h1 { font-size: 22px; }
  .balance-value { font-size: 28px; }
  .dash-welcome h1 { font-size: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .ven-character-wrap,
  .ven-character-glow,
  .ven-character-shine::before,
  .ven-status-dot {
    animation: none !important;
  }
}
`;
