import { router } from "./src/router.js";

const ANIME_IMAGE =
  "https://raw.githubusercontent.com/venkontol/Khusus-image-/main/grok_1788555622820.jpg";

const VEN_LOGO = `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="venLogoGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c4f7ff"/>
      <stop offset="30%" stop-color="#8b5cf6"/>
      <stop offset="65%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#ff315c"/>
    </linearGradient>
  </defs>
  <path
    d="M60 8 L103 33 L103 83 L60 108 L17 83 L17 33 Z"
    fill="none"
    stroke="url(#venLogoGradient)"
    stroke-width="5"
  />
  <path
    d="M31 39 L48 72 L60 91 L72 72 L89 39"
    fill="none"
    stroke="url(#venLogoGradient)"
    stroke-width="8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M43 32 L60 52 L77 32"
    fill="none"
    stroke="#f8fbff"
    stroke-width="4"
    opacity=".9"
  />
</svg>
`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value || 0));
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      ...extraHeaders
    }
  });
}

function shell(title, content, extraScript = "") {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#05040a">
<meta name="color-scheme" content="dark">
<meta name="description" content="VEN Digital Store — Premium Digital Marketplace">
<title>${escapeHtml(title)} — VEN Digital Store</title>
<style>
:root{
  --bg:#030309;
  --bg2:#070511;
  --glass:rgba(10,8,24,.64);
  --glass2:rgba(17,13,39,.72);
  --line:rgba(180,160,255,.18);
  --line2:rgba(104,211,255,.22);
  --white:#f8fbff;
  --muted:#a7a4b8;
  --purple:#8b5cf6;
  --violet:#b56cff;
  --ice:#bff8ff;
  --blue:#38bdf8;
  --red:#ff315c;
  --pink:#ff4fd8;
  --green:#45f0ae;
  --shadow:0 30px 100px rgba(0,0,0,.58);
}

*{
  box-sizing:border-box;
}

html,
body{
  margin:0;
  width:100%;
  min-height:100%;
  background:var(--bg);
  color:var(--white);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body{
  overflow-x:hidden;
}

button,
input{
  font:inherit;
}

button{
  cursor:pointer;
}

a{
  color:inherit;
  text-decoration:none;
}

::selection{
  background:rgba(139,92,246,.42);
  color:#fff;
}

::-webkit-scrollbar{
  width:7px;
}

::-webkit-scrollbar-track{
  background:#04030a;
}

::-webkit-scrollbar-thumb{
  background:linear-gradient(var(--purple),var(--red));
  border-radius:99px;
}

/* =========================================================
   LIVE BACKGROUND
========================================================= */

.live-scene{
  position:fixed;
  inset:0;
  overflow:hidden;
  z-index:0;
  background:
    radial-gradient(
      circle at 18% 40%,
      rgba(139,92,246,.18),
      transparent 34%
    ),
    radial-gradient(
      circle at 80% 24%,
      rgba(56,189,248,.12),
      transparent 32%
    ),
    radial-gradient(
      circle at 86% 78%,
      rgba(255,49,92,.15),
      transparent 32%
    ),
    #030309;
}

.scene-image{
  position:absolute;
  inset:-7%;
  background-image:
    linear-gradient(
      90deg,
      rgba(3,3,9,.92) 0%,
      rgba(3,3,9,.5) 30%,
      rgba(3,3,9,.04) 62%,
      rgba(3,3,9,.28) 100%
    ),
    linear-gradient(
      0deg,
      rgba(3,3,9,.86) 0%,
      transparent 38%,
      rgba(3,3,9,.28) 100%
    ),
    url("${ANIME_IMAGE}");
  background-size:cover;
  background-position:center;
  transform:
    translate3d(
      calc(var(--mx,0) * -18px),
      calc(var(--my,0) * -12px),
      0
    )
    scale(1.075);
  filter:
    saturate(1.16)
    contrast(1.06)
    brightness(.76);
  animation:sceneBreath 12s ease-in-out infinite alternate;
  will-change:transform;
}

@keyframes sceneBreath{
  from{
    transform:
      translate3d(
        calc(var(--mx,0) * -18px),
        calc(var(--my,0) * -12px),
        0
      )
      scale(1.075);
  }
  to{
    transform:
      translate3d(
        calc(var(--mx,0) * -18px - 8px),
        calc(var(--my,0) * -12px - 5px),
        0
      )
      scale(1.105);
  }
}

.scene-color{
  position:absolute;
  inset:-20%;
  background:
    conic-gradient(
      from 210deg at 65% 45%,
      rgba(139,92,246,.12),
      rgba(56,189,248,.08),
      rgba(255,49,92,.14),
      rgba(139,92,246,.12)
    );
  mix-blend-mode:screen;
  animation:colorRotate 18s linear infinite;
}

@keyframes colorRotate{
  to{
    transform:rotate(360deg);
  }
}

.scene-vignette{
  position:absolute;
  inset:0;
  background:
    radial-gradient(
      ellipse at center,
      transparent 30%,
      rgba(0,0,0,.28) 58%,
      rgba(0,0,0,.84) 100%
    );
}

.scene-grid{
  position:absolute;
  inset:0;
  opacity:.16;
  background-image:
    linear-gradient(
      rgba(161,133,255,.07) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(161,133,255,.07) 1px,
      transparent 1px
    );
  background-size:60px 60px;
  transform:
    perspective(500px)
    rotateX(62deg)
    translateY(32%);
  transform-origin:center bottom;
  animation:gridMove 13s linear infinite;
}

@keyframes gridMove{
  from{
    background-position:0 0;
  }
  to{
    background-position:0 60px;
  }
}

.energy-beam{
  position:absolute;
  width:70vw;
  height:2px;
  left:-20vw;
  opacity:.55;
  filter:blur(.2px);
  transform:rotate(-22deg);
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(56,189,248,.0),
      rgba(56,189,248,.9),
      rgba(181,108,255,.8),
      rgba(255,49,92,.72),
      transparent
    );
  animation:beamMove 8s ease-in-out infinite;
}

.energy-beam.one{
  top:30%;
}

.energy-beam.two{
  top:67%;
  animation-delay:3.2s;
  transform:rotate(16deg);
}

@keyframes beamMove{
  0%{
    transform:
      translateX(-20vw)
      rotate(-22deg)
      scaleX(.65);
    opacity:0;
  }
  25%{
    opacity:.6;
  }
  70%{
    opacity:.5;
  }
  100%{
    transform:
      translateX(115vw)
      rotate(-22deg)
      scaleX(1.2);
    opacity:0;
  }
}

#particles{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
}

/* =========================================================
   FLOATING HUD
========================================================= */

.hud{
  position:fixed;
  z-index:2;
  pointer-events:none;
  font-family:
    "JetBrains Mono",
    "SFMono-Regular",
    Consolas,
    monospace;
}

.hud-top{
  top:24px;
  left:28px;
  right:28px;
  display:flex;
  justify-content:space-between;
  align-items:center;
}

.hud-corner{
  padding:9px 13px;
  border:1px solid rgba(171,153,255,.18);
  background:rgba(5,4,13,.38);
  backdrop-filter:blur(12px);
  box-shadow:
    inset 0 0 24px rgba(139,92,246,.05),
    0 0 25px rgba(0,0,0,.22);
  font-size:10px;
  letter-spacing:2px;
  color:#aaa5bd;
}

.hud-live{
  color:#65f5bb;
  text-shadow:0 0 12px rgba(69,240,174,.5);
}

.hud-live::before{
  content:"";
  display:inline-block;
  width:6px;
  height:6px;
  margin-right:7px;
  border-radius:50%;
  background:#45f0ae;
  box-shadow:0 0 12px #45f0ae;
  animation:pulse 1.4s infinite;
}

@keyframes pulse{
  50%{
    opacity:.35;
    transform:scale(.72);
  }
}

.hud-bottom{
  left:28px;
  bottom:22px;
  display:flex;
  gap:8px;
}

.hud-chip{
  padding:8px 10px;
  border:1px solid rgba(180,160,255,.13);
  background:rgba(3,3,9,.38);
  color:#89859b;
  font-size:9px;
  letter-spacing:1.5px;
  backdrop-filter:blur(10px);
}

/* =========================================================
   LOGIN LAYOUT
========================================================= */

.page{
  position:relative;
  z-index:3;
  min-height:100vh;
  display:grid;
  grid-template-columns:
    minmax(260px, .8fr)
    minmax(420px, 1.15fr)
    minmax(250px, .75fr);
  gap:30px;
  align-items:center;
  padding:
    80px
    clamp(28px,6vw,100px)
    60px;
}

.brand{
  position:absolute;
  top:32px;
  left:clamp(28px,6vw,100px);
  display:flex;
  align-items:center;
  gap:13px;
  z-index:6;
}

.brand-mark{
  width:42px;
  height:42px;
  display:grid;
  place-items:center;
  filter:
    drop-shadow(0 0 12px rgba(139,92,246,.6))
    drop-shadow(0 0 25px rgba(56,189,248,.25));
}

.brand-mark svg{
  width:100%;
  height:100%;
}

.brand-name{
  line-height:1;
}

.brand-name strong{
  display:block;
  font-size:17px;
  letter-spacing:4px;
}

.brand-name span{
  display:block;
  margin-top:5px;
  color:#9e9aac;
  font-size:8px;
  letter-spacing:3px;
}

.panel{
  position:relative;
  border:1px solid rgba(192,177,255,.17);
  background:
    linear-gradient(
      135deg,
      rgba(17,13,39,.76),
      rgba(6,6,16,.56)
    );
  box-shadow:
    var(--shadow),
    inset 0 1px 0 rgba(255,255,255,.05),
    0 0 50px rgba(93,55,190,.08);
  backdrop-filter:blur(22px) saturate(1.25);
  -webkit-backdrop-filter:blur(22px) saturate(1.25);
}

.panel::before,
.panel::after{
  content:"";
  position:absolute;
  pointer-events:none;
}

.panel::before{
  inset:10px;
  border:1px solid rgba(139,92,246,.07);
}

.panel::after{
  width:70px;
  height:70px;
  top:-1px;
  right:-1px;
  border-top:2px solid rgba(191,248,255,.62);
  border-right:2px solid rgba(255,49,92,.62);
  filter:drop-shadow(0 0 10px rgba(139,92,246,.5));
}

.login-panel{
  max-width:600px;
  width:100%;
  justify-self:center;
  padding:clamp(28px,4vw,48px);
  border-radius:28px;
  overflow:hidden;
  animation:panelFloat 7s ease-in-out infinite;
}

@keyframes panelFloat{
  0%,100%{
    transform:translateY(0);
  }
  50%{
    transform:translateY(-7px);
  }
}

.login-panel::before{
  border-radius:22px;
}

.login-panel .scan{
  position:absolute;
  left:0;
  right:0;
  height:1px;
  top:-10%;
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(191,248,255,.65),
      rgba(181,108,255,.9),
      transparent
    );
  box-shadow:
    0 0 18px rgba(139,92,246,.7);
  animation:scanMove 5s linear infinite;
}

@keyframes scanMove{
  to{
    top:110%;
  }
}

.login-head{
  text-align:center;
  position:relative;
  z-index:2;
}

.login-logo{
  width:74px;
  height:74px;
  margin:0 auto 14px;
  animation:logoPulse 3s ease-in-out infinite;
  filter:
    drop-shadow(0 0 18px rgba(139,92,246,.75))
    drop-shadow(0 0 35px rgba(56,189,248,.25));
}

@keyframes logoPulse{
  50%{
    transform:
      scale(1.04)
      rotateY(7deg);
    filter:
      drop-shadow(0 0 25px rgba(139,92,246,.95))
      drop-shadow(0 0 45px rgba(255,49,92,.32));
  }
}

.login-title{
  font-size:clamp(25px,3vw,36px);
  margin:0;
  letter-spacing:2px;
  font-weight:800;
}

.login-title span{
  background:
    linear-gradient(
      100deg,
      #d8fbff,
      #9d78ff 35%,
      #55d8ff 65%,
      #ff5177
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.login-sub{
  margin:9px 0 0;
  color:#a29fb0;
  font-size:12px;
  letter-spacing:2px;
}

.jp{
  margin-top:8px;
  color:#787386;
  font-size:10px;
  letter-spacing:4px;
}

.form{
  position:relative;
  z-index:2;
  margin-top:30px;
}

.field{
  position:relative;
  margin-bottom:15px;
}

.field input{
  width:100%;
  height:58px;
  padding:0 18px 0 52px;
  color:#fff;
  outline:none;
  border:1px solid rgba(185,168,255,.18);
  border-radius:14px;
  background:
    linear-gradient(
      120deg,
      rgba(13,10,31,.84),
      rgba(7,7,17,.62)
    );
  box-shadow:
    inset 0 0 24px rgba(139,92,246,.025);
  transition:
    border .25s,
    box-shadow .25s,
    transform .25s;
}

.field input::placeholder{
  color:#777389;
}

.field input:focus{
  border-color:rgba(139,92,246,.72);
  box-shadow:
    0 0 0 3px rgba(139,92,246,.09),
    0 0 25px rgba(139,92,246,.13),
    inset 0 0 22px rgba(139,92,246,.04);
  transform:translateY(-1px);
}

.field-icon{
  position:absolute;
  left:18px;
  top:50%;
  transform:translateY(-50%);
  color:#a58aff;
  width:18px;
  height:18px;
  opacity:.8;
}

.password-toggle{
  position:absolute;
  right:12px;
  top:50%;
  transform:translateY(-50%);
  width:35px;
  height:35px;
  display:grid;
  place-items:center;
  color:#88839a;
  background:transparent;
  border:0;
}

.options{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin:8px 2px 20px;
  font-size:11px;
  color:#9c98aa;
}

.remember{
  display:flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
}

.remember input{
  accent-color:var(--purple);
}

.options a{
  color:#b6a5ff;
  transition:.2s;
}

.options a:hover{
  color:#fff;
}

.login-button{
  position:relative;
  width:100%;
  height:61px;
  border:1px solid rgba(210,241,255,.25);
  border-radius:16px;
  color:#fff;
  font-weight:800;
  letter-spacing:4px;
  background:
    linear-gradient(
      100deg,
      #4430ff 0%,
      #7955ff 33%,
      #d44cff 62%,
      #ff315c 100%
    );
  box-shadow:
    0 0 28px rgba(139,92,246,.26),
    0 0 65px rgba(255,49,92,.08),
    inset 0 1px 0 rgba(255,255,255,.28);
  overflow:hidden;
  transition:
    transform .2s,
    box-shadow .2s;
}

.login-button::before{
  content:"";
  position:absolute;
  top:0;
  bottom:0;
  width:45%;
  left:-60%;
  background:
    linear-gradient(
      100deg,
      transparent,
      rgba(255,255,255,.38),
      transparent
    );
  transform:skewX(-20deg);
  animation:buttonShine 3.5s ease-in-out infinite;
}

@keyframes buttonShine{
  0%,55%{
    left:-60%;
  }
  100%{
    left:125%;
  }
}

.login-button:hover{
  transform:translateY(-2px);
  box-shadow:
    0 0 35px rgba(139,92,246,.4),
    0 0 80px rgba(255,49,92,.15);
}

.login-button:active{
  transform:translateY(0) scale(.99);
}

.login-button.loading{
  pointer-events:none;
  opacity:.7;
}

.register-link{
  text-align:center;
  margin:21px 0 0;
  color:#858195;
  font-size:11px;
}

.register-link a{
  color:#d0bcff;
  font-weight:700;
}

.register-link a:hover{
  color:#fff;
}

.divider{
  display:flex;
  align-items:center;
  gap:12px;
  margin:25px 0 17px;
  color:#686476;
  font-size:9px;
  letter-spacing:2px;
}

.divider::before,
.divider::after{
  content:"";
  height:1px;
  flex:1;
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(180,160,255,.2)
    );
}

.divider::after{
  background:
    linear-gradient(
      90deg,
      rgba(180,160,255,.2),
      transparent
    );
}

.socials{
  display:flex;
  justify-content:center;
  gap:10px;
}

.social{
  width:45px;
  height:40px;
  border:1px solid rgba(180,160,255,.13);
  border-radius:11px;
  display:grid;
  place-items:center;
  color:#aaa5bb;
  background:rgba(255,255,255,.025);
  transition:.25s;
}

.social:hover{
  color:#fff;
  border-color:rgba(139,92,246,.48);
  background:rgba(139,92,246,.1);
  transform:translateY(-3px);
}

.message{
  min-height:20px;
  margin:13px 0 0;
  text-align:center;
  color:#ff7891;
  font-size:11px;
}

.message.ok{
  color:#61f3b2;
}

/* =========================================================
   SIDE PANELS
========================================================= */

.side-panel{
  padding:23px;
  border-radius:22px;
  overflow:hidden;
}

.side-panel.left{
  justify-self:start;
  width:min(100%,310px);
}

.side-panel.right{
  justify-self:end;
  width:min(100%,320px);
}

.panel-label{
  color:#aaa3ba;
  font-size:9px;
  letter-spacing:3px;
  margin-bottom:20px;
}

.status-row{
  display:flex;
  align-items:center;
  gap:13px;
  padding:13px 0;
  border-bottom:1px solid rgba(180,160,255,.07);
}

.status-row:last-child{
  border-bottom:0;
}

.status-icon{
  width:35px;
  height:35px;
  display:grid;
  place-items:center;
  border:1px solid rgba(139,92,246,.24);
  color:#b6a4ff;
  background:rgba(139,92,246,.07);
}

.status-info{
  min-width:0;
}

.status-info small{
  display:block;
  color:#747083;
  font-size:8px;
  letter-spacing:1.4px;
  margin-bottom:4px;
}

.status-info strong{
  display:block;
  font-size:11px;
  letter-spacing:.4px;
}

.online{
  color:#55f0b0;
}

.ice{
  color:#8beaff;
}

.red{
  color:#ff6681;
}

.purple{
  color:#c19aff;
}

.side-title{
  font-size:18px;
  line-height:1.3;
  margin:0 0 9px;
}

.side-description{
  color:#8b8799;
  line-height:1.7;
  font-size:10px;
  margin:0 0 20px;
}

.feature{
  display:flex;
  gap:11px;
  align-items:flex-start;
  margin-top:14px;
}

.feature-dot{
  width:7px;
  height:7px;
  margin-top:4px;
  flex:0 0 auto;
  border-radius:50%;
  background:var(--purple);
  box-shadow:0 0 13px var(--purple);
}

.feature:nth-child(2) .feature-dot{
  background:var(--blue);
  box-shadow:0 0 13px var(--blue);
}

.feature:nth-child(3) .feature-dot{
  background:var(--red);
  box-shadow:0 0 13px var(--red);
}

.feature-text strong{
  display:block;
  font-size:10px;
  margin-bottom:4px;
}

.feature-text span{
  color:#747082;
  font-size:9px;
  line-height:1.5;
}

.core-ring{
  position:relative;
  width:155px;
  height:155px;
  margin:8px auto 20px;
  display:grid;
  place-items:center;
}

.core-ring::before,
.core-ring::after{
  content:"";
  position:absolute;
  inset:5px;
  border:1px solid rgba(139,92,246,.35);
  border-radius:50%;
  animation:ringRotate 7s linear infinite;
}

.core-ring::after{
  inset:18px;
  border-color:rgba(56,189,248,.3);
  animation:
    ringRotate 4.5s linear infinite reverse;
}

@keyframes ringRotate{
  to{
    transform:rotate(360deg);
  }
}

.core-logo{
  width:64px;
  height:64px;
  z-index:2;
  filter:
    drop-shadow(0 0 20px rgba(139,92,246,.8));
  animation:corePulse 2.5s ease-in-out infinite;
}

@keyframes corePulse{
  50%{
    transform:scale(1.08);
  }
}

.core-lines{
  display:grid;
  gap:8px;
}

.core-line{
  display:flex;
  justify-content:space-between;
  padding:9px 10px;
  border:1px solid rgba(180,160,255,.08);
  background:rgba(255,255,255,.018);
  font-size:9px;
}

.core-line span{
  color:#777287;
}

.core-line strong{
  color:#bcefff;
  font-weight:600;
}

.footer-note{
  position:fixed;
  z-index:5;
  left:50%;
  bottom:20px;
  transform:translateX(-50%);
  color:#666274;
  font-size:8px;
  letter-spacing:2px;
  white-space:nowrap;
  pointer-events:none;
}

/* =========================================================
   REGISTER
========================================================= */

.register-panel{
  max-width:650px;
}

.register-panel .form{
  margin-top:25px;
}

.name-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}

/* =========================================================
   DASHBOARD
========================================================= */

.app{
  position:relative;
  z-index:4;
  min-height:100vh;
  display:grid;
  grid-template-columns:240px 1fr;
}

.app-sidebar{
  position:fixed;
  inset:0 auto 0 0;
  width:240px;
  padding:22px 15px;
  background:
    linear-gradient(
      180deg,
      rgba(7,5,17,.94),
      rgba(3,3,9,.88)
    );
  border-right:1px solid rgba(180,160,255,.1);
  backdrop-filter:blur(25px);
  z-index:10;
}

.app-brand{
  display:flex;
  align-items:center;
  gap:10px;
  padding:5px 8px 22px;
}

.app-brand .brand-mark{
  width:35px;
  height:35px;
}

.app-brand strong{
  display:block;
  font-size:13px;
  letter-spacing:2px;
}

.app-brand span{
  display:block;
  margin-top:4px;
  font-size:7px;
  color:#777286;
  letter-spacing:1.8px;
}

.nav-title{
  color:#555162;
  font-size:8px;
  letter-spacing:2px;
  padding:15px 10px 7px;
}

.nav-item{
  display:flex;
  align-items:center;
  gap:10px;
  padding:11px 10px;
  margin:3px 0;
  border:1px solid transparent;
  border-radius:10px;
  color:#858194;
  font-size:10px;
  transition:.2s;
}

.nav-item:hover,
.nav-item.active{
  color:#fff;
  background:rgba(139,92,246,.09);
  border-color:rgba(139,92,246,.16);
}

.nav-symbol{
  width:16px;
  text-align:center;
  color:#aa91ff;
}

.sidebar-bottom{
  position:absolute;
  left:15px;
  right:15px;
  bottom:18px;
}

.system-mini{
  padding:12px;
  border:1px solid rgba(180,160,255,.09);
  background:rgba(255,255,255,.018);
  border-radius:12px;
}

.system-mini-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:8px;
  color:#6e697b;
}

.system-online{
  color:#4cf0ad;
}

.main{
  min-width:0;
  grid-column:2;
  padding:25px clamp(20px,4vw,55px);
}

.topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
  margin-bottom:28px;
}

.topbar-title small{
  display:block;
  color:#706b7d;
  font-size:9px;
  letter-spacing:2px;
  margin-bottom:7px;
}

.topbar-title h1{
  margin:0;
  font-size:24px;
}

.user-badge{
  display:flex;
  align-items:center;
  gap:12px;
  padding:8px 11px;
  border:1px solid rgba(180,160,255,.1);
  border-radius:13px;
  background:rgba(255,255,255,.025);
}

.avatar{
  width:34px;
  height:34px;
  border-radius:50%;
  display:grid;
  place-items:center;
  color:#fff;
  font-weight:800;
  font-size:11px;
  background:
    linear-gradient(
      135deg,
      var(--purple),
      var(--blue),
      var(--red)
    );
  box-shadow:0 0 18px rgba(139,92,246,.3);
}

.user-badge strong{
  display:block;
  font-size:10px;
}

.user-badge span{
  display:block;
  color:#6f6a7c;
  font-size:8px;
  margin-top:3px;
}

.logout{
  border:0;
  background:transparent;
  color:#7d778a;
  font-size:9px;
}

.hero{
  position:relative;
  min-height:260px;
  padding:34px;
  overflow:hidden;
  border-radius:25px;
  border:1px solid rgba(180,160,255,.12);
  background:
    linear-gradient(
      110deg,
      rgba(10,7,24,.92),
      rgba(10,8,22,.48)
    );
  box-shadow:var(--shadow);
}

.hero::before{
  content:"";
  position:absolute;
  inset:0;
  background:
    radial-gradient(
      circle at 78% 20%,
      rgba(139,92,246,.3),
      transparent 35%
    ),
    radial-gradient(
      circle at 90% 70%,
      rgba(255,49,92,.2),
      transparent 35%
    );
}

.hero-content{
  position:relative;
  max-width:520px;
}

.hero-kicker{
  color:#a994ff;
  font-size:9px;
  letter-spacing:3px;
}

.hero h2{
  margin:12px 0 10px;
  font-size:clamp(25px,4vw,43px);
  line-height:1.05;
}

.hero h2 span{
  background:
    linear-gradient(
      100deg,
      #c9faff,
      #9a72ff,
      #4edcff,
      #ff5579
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.hero p{
  color:#858092;
  font-size:11px;
  line-height:1.7;
  max-width:440px;
}

.hero-buttons{
  display:flex;
  gap:9px;
  margin-top:21px;
}

.hero-btn{
  padding:11px 17px;
  border-radius:10px;
  font-size:9px;
  border:1px solid rgba(180,160,255,.13);
  background:rgba(255,255,255,.025);
  color:#aaa5b6;
}

.hero-btn.primary{
  color:#fff;
  border-color:rgba(139,92,246,.35);
  background:linear-gradient(100deg,#6241f5,#b34cff,#ff315c);
}

.cards{
  display:grid;
  grid-template-columns:
    repeat(4,minmax(0,1fr));
  gap:13px;
  margin-top:14px;
}

.stat{
  padding:18px;
  border:1px solid rgba(180,160,255,.1);
  border-radius:16px;
  background:rgba(9,7,19,.64);
  backdrop-filter:blur(16px);
}

.stat small{
  display:block;
  color:#686375;
  font-size:8px;
  letter-spacing:1.5px;
}

.stat strong{
  display:block;
  margin-top:9px;
  font-size:19px;
}

.stat span{
  display:block;
  margin-top:6px;
  color:#777286;
  font-size:8px;
}

.dashboard-grid{
  display:grid;
  grid-template-columns:
    1.25fr
    .75fr;
  gap:14px;
  margin-top:14px;
}

.section-card{
  padding:20px;
  border:1px solid rgba(180,160,255,.1);
  border-radius:17px;
  background:rgba(8,6,17,.67);
}

.section-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:17px;
}

.section-head strong{
  font-size:11px;
}

.section-head span{
  color:#686375;
  font-size:8px;
}

.service-grid{
  display:grid;
  grid-template-columns:
    repeat(2,minmax(0,1fr));
  gap:10px;
}

.service{
  padding:14px;
  border:1px solid rgba(180,160,255,.08);
  border-radius:13px;
  background:rgba(255,255,255,.015);
  transition:.22s;
}

.service:hover{
  border-color:rgba(139,92,246,.3);
  background:rgba(139,92,246,.05);
  transform:translateY(-2px);
}

.service-icon{
  width:30px;
  height:30px;
  display:grid;
  place-items:center;
  border-radius:9px;
  border:1px solid rgba(139,92,246,.18);
  color:#ad95ff;
  margin-bottom:10px;
}

.service strong{
  display:block;
  font-size:10px;
}

.service span{
  display:block;
  margin-top:5px;
  color:#696476;
  font-size:8px;
  line-height:1.5;
}

.deposit-box{
  display:grid;
  gap:10px;
}

.deposit-box input{
  height:46px;
  width:100%;
  padding:0 13px;
  border:1px solid rgba(180,160,255,.1);
  border-radius:10px;
  background:rgba(0,0,0,.18);
  color:#fff;
  outline:none;
}

.deposit-box button{
  height:46px;
  border:0;
  border-radius:10px;
  color:#fff;
  font-size:9px;
  font-weight:700;
  letter-spacing:1px;
  background:linear-gradient(100deg,#6141f5,#b74cff,#ff315c);
}

.deposit-result{
  min-height:25px;
  color:#777286;
  font-size:8px;
  line-height:1.6;
}

/* =========================================================
   RESPONSIVE
========================================================= */

@media(max-width:1180px){
  .page{
    grid-template-columns:
      minmax(200px,.55fr)
      minmax(420px,1.2fr);
  }

  .side-panel.right{
    display:none;
  }
}

@media(max-width:850px){
  .page{
    display:flex;
    flex-direction:column;
    justify-content:center;
    padding:
      95px
      18px
      65px;
    min-height:100svh;
  }

  .side-panel.left{
    display:none;
  }

  .login-panel{
    max-width:570px;
  }

  .scene-image{
    background-position:
      63% center;
  }

  .hud-top{
    top:16px;
    left:16px;
    right:16px;
  }

  .hud-corner{
    font-size:8px;
    letter-spacing:1.3px;
  }

  .hud-bottom{
    left:16px;
    bottom:15px;
  }

  .footer-note{
    bottom:9px;
    font-size:6px;
    letter-spacing:1px;
  }
}

@media(max-width:620px){
  .brand{
    top:18px;
    left:18px;
  }

  .brand-mark{
    width:35px;
    height:35px;
  }

  .brand-name strong{
    font-size:13px;
    letter-spacing:2.5px;
  }

  .brand-name span{
    font-size:6px;
    letter-spacing:1.7px;
  }

  .page{
    padding:
      76px
      10px
      48px;
  }

  .login-panel{
    padding:27px 18px 24px;
    border-radius:21px;
  }

  .login-logo{
    width:60px;
    height:60px;
  }

  .login-title{
    font-size:25px;
  }

  .login-sub{
    font-size:10px;
    letter-spacing:1.2px;
  }

  .field input{
    height:53px;
  }

  .login-button{
    height:56px;
  }

  .hud-top .hud-corner:first-child{
    display:none;
  }

  .hud-top{
    justify-content:flex-end;
  }

  .name-grid{
    grid-template-columns:1fr;
  }

  .app{
    display:block;
  }

  .app-sidebar{
    position:fixed;
    left:10px;
    right:10px;
    bottom:10px;
    top:auto;
    width:auto;
    height:62px;
    padding:7px;
    border:1px solid rgba(180,160,255,.14);
    border-radius:18px;
    display:flex;
    align-items:center;
    justify-content:center;
  }

  .app-brand,
  .nav-title,
  .sidebar-bottom{
    display:none;
  }

  .nav-item{
    width:45px;
    height:45px;
    margin:0 2px;
    padding:0;
    justify-content:center;
  }

  .nav-item span:last-child{
    display:none;
  }

  .main{
    padding:
      17px
      12px
      90px;
  }

  .cards{
    grid-template-columns:
      repeat(2,minmax(0,1fr));
  }

  .dashboard-grid{
    grid-template-columns:1fr;
  }

  .service-grid{
    grid-template-columns:1fr;
  }

  .hero{
    padding:24px;
  }

  .hero-buttons{
    flex-wrap:wrap;
  }
}

@media(prefers-reduced-motion:reduce){
  *,
  *::before,
  *::after{
    animation-duration:.001ms !important;
    animation-iteration-count:1 !important;
    scroll-behavior:auto !important;
  }
}
</style>
</head>
<body>
${content}
${extraScript}
</body>
</html>`;
}

/* =========================================================
   LIVE EFFECT SCRIPT
========================================================= */

function liveEffectsScript() {
  return `
<script>
(function(){
  const root = document.documentElement;
  let tx = 0;
  let ty = 0;
  let mx = 0;
  let my = 0;

  function update(){
    mx += (tx - mx) * 0.045;
    my += (ty - my) * 0.045;

    root.style.setProperty("--mx", mx.toFixed(4));
    root.style.setProperty("--my", my.toFixed(4));

    requestAnimationFrame(update);
  }

  window.addEventListener("pointermove", event => {
    tx = (event.clientX / window.innerWidth - .5) * 2;
    ty = (event.clientY / window.innerHeight - .5) * 2;
  }, {passive:true});

  window.addEventListener("deviceorientation", event => {
    if (typeof event.gamma !== "number") return;

    tx = Math.max(-1, Math.min(1, event.gamma / 30));
    ty = Math.max(-1, Math.min(1, event.beta / 45));
  }, {passive:true});

  update();

  const canvas = document.getElementById("particles");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const particles = [];
  const count = Math.min(
    150,
    Math.max(65, Math.floor(window.innerWidth / 8))
  );

  function resize(){
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function makeParticle(reset){
    const p = {
      x: Math.random() * width,
      y: reset ? height + Math.random() * 80 : Math.random() * height,
      size: Math.random() * 2.2 + .35,
      speed: Math.random() * .42 + .08,
      drift: (Math.random() - .5) * .25,
      alpha: Math.random() * .7 + .1,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random()
    };

    return p;
  }

  function init(){
    particles.length = 0;

    for(let i=0;i<count;i++){
      particles.push(makeParticle(false));
    }
  }

  function drawCrystal(x,y,size,alpha,rotation){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rotation);

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0,-size);
    ctx.lineTo(size*.55,-size*.22);
    ctx.lineTo(size*.2,size);
    ctx.lineTo(-size*.42,size*.3);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(
      -size,
      -size,
      size,
      size
    );

    gradient.addColorStop(0,"rgba(191,248,255,.9)");
    gradient.addColorStop(.5,"rgba(139,92,246,.72)");
    gradient.addColorStop(1,"rgba(255,49,92,.55)");

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = "rgba(210,245,255,.38)";
    ctx.lineWidth = .6;
    ctx.stroke();

    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,width,height);

    const t = performance.now() * .001;

    for(const p of particles){
      p.y -= p.speed;
      p.x +=
        p.drift +
        Math.sin(t * .6 + p.phase) * .08;

      if(p.y < -30){
        Object.assign(p,makeParticle(true));
      }

      if(p.x < -30) p.x = width + 30;
      if(p.x > width + 30) p.x = -30;

      const shimmer =
        p.alpha *
        (.65 + Math.sin(t * 2 + p.phase) * .35);

      let fill;

      if(p.hue < .34){
        fill = "rgba(191,248,255," + shimmer + ")";
      }else if(p.hue < .67){
        fill = "rgba(139,92,246," + shimmer + ")";
      }else{
        fill = "rgba(255,49,92," + shimmer + ")";
      }

      ctx.beginPath();
      ctx.fillStyle = fill;
      ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fill();
    }

    if(Math.random() < .035){
      const x = Math.random() * width;
      const y = Math.random() * height;

      drawCrystal(
        x,
        y,
        Math.random()*10+6,
        Math.random()*.25+.08,
        Math.random()*Math.PI
      );
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);

  resize();
  init();
  draw();
})();
</script>`;
}

/* =========================================================
   AUTH ICONS
========================================================= */

const USER_ICON = `
<svg class="field-icon" viewBox="0 0 24 24" fill="none">
  <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
  <path d="M4.5 20c.8-4 3.1-6 7.5-6s6.7 2 7.5 6"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"/>
</svg>
`;

const LOCK_ICON = `
<svg class="field-icon" viewBox="0 0 24 24" fill="none">
  <rect x="5" y="10" width="14" height="10" rx="2"
    stroke="currentColor"
    stroke-width="1.6"/>
  <path d="M8 10V7a4 4 0 0 1 8 0v3"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"/>
</svg>
`;

function loginPage() {
  const content = `
<div class="live-scene">
  <div class="scene-image"></div>
  <div class="scene-color"></div>
  <div class="scene-vignette"></div>
  <div class="scene-grid"></div>
  <div class="energy-beam one"></div>
  <div class="energy-beam two"></div>
  <canvas id="particles"></canvas>
</div>

<div class="hud hud-top">
  <div class="hud-corner">
    VEN DIGITAL SYSTEM
  </div>

  <div class="hud-corner">
    <span class="hud-live">SYSTEM ONLINE</span>
  </div>
</div>

<div class="brand">
  <div class="brand-mark">
    ${VEN_LOGO}
  </div>

  <div class="brand-name">
    <strong>VEN</strong>
    <span>DIGITAL STORE</span>
  </div>
</div>

<main class="page">

  <aside class="panel side-panel left">
    <div class="panel-label">
      SYSTEM STATUS
    </div>

    <div class="status-row">
      <div class="status-icon">◈</div>
      <div class="status-info">
        <small>SERVER</small>
        <strong class="online">ONLINE</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">◇</div>
      <div class="status-info">
        <small>SECURITY</small>
        <strong class="purple">AES-256</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">⌁</div>
      <div class="status-info">
        <small>NETWORK</small>
        <strong class="ice">VEN-NODE</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">◎</div>
      <div class="status-info">
        <small>DATABASE</small>
        <strong class="online">CONNECTED</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">+</div>
      <div class="status-info">
        <small>API</small>
        <strong class="ice">OPERATIONAL</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">△</div>
      <div class="status-info">
        <small>ENCRYPTION</small>
        <strong class="red">ACTIVE</strong>
      </div>
    </div>
  </aside>

  <section class="panel login-panel">
    <div class="scan"></div>

    <div class="login-head">

      <div class="login-logo">
        ${VEN_LOGO}
      </div>

      <h1 class="login-title">
        WELCOME <span>BACK</span>
      </h1>

      <div class="login-sub">
        MASUK KE VEN DIGITAL STORE
      </div>

      <div class="jp">
        ようこそ
      </div>

    </div>

    <form class="form" id="login-form">

      <div class="field">
        ${USER_ICON}

        <input
          id="username"
          name="username"
          type="text"
          autocomplete="username"
          maxlength="32"
          placeholder="Username"
          required
        >
      </div>

      <div class="field">
        ${LOCK_ICON}

        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Password"
          required
        >

        <button
          class="password-toggle"
          type="button"
          id="toggle-password"
          aria-label="Tampilkan password"
        >
          ◉
        </button>
      </div>

      <div class="options">

        <label class="remember">
          <input
            id="remember"
            type="checkbox"
          >
          <span>Ingat sesi</span>
        </label>

        <a href="/register">
          Buat akun
        </a>

      </div>

      <button
        class="login-button"
        id="login-button"
        type="submit"
      >
        MASUK
      </button>

      <div
        class="message"
        id="login-message"
      ></div>

      <div class="register-link">
        Belum memiliki akun?
        <a href="/register">
          DAFTAR SEKARANG
        </a>
      </div>

      <div class="divider">
        VEN ACCESS
      </div>

      <div class="socials">
        <div class="social">G</div>
        <div class="social">D</div>
        <div class="social">N</div>
      </div>

    </form>
  </section>

  <aside class="panel side-panel right">

    <div class="panel-label">
      VEN CORE
    </div>

    <div class="core-ring">
      <div class="core-logo">
        ${VEN_LOGO}
      </div>
    </div>

    <h2 class="side-title">
      Digital system
      <br>
      <span class="purple">ready.</span>
    </h2>

    <p class="side-description">
      Platform digital dengan sistem akun,
      saldo, layanan, dan transaksi terintegrasi.
    </p>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>SECURE ACCESS</strong>
        <span>Session terenkripsi untuk akses akun.</span>
      </div>
    </div>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>REALTIME SYSTEM</strong>
        <span>Status sistem diperbarui secara langsung.</span>
      </div>
    </div>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>PREMIUM SERVICES</strong>
        <span>Semua layanan digital VEN dalam satu platform.</span>
      </div>
    </div>

  </aside>

</main>

<div class="hud hud-bottom">
  <div class="hud-chip">VEN-CORE</div>
  <div class="hud-chip">SECURE</div>
  <div class="hud-chip">ONLINE</div>
</div>

<div class="footer-note">
  VEN DIGITAL STORE — PREMIUM DIGITAL MARKETPLACE
</div>
`;

  const script = `
<script>
(function(){
  const form = document.getElementById("login-form");
  const button = document.getElementById("login-button");
  const message = document.getElementById("login-message");
  const password = document.getElementById("password");
  const toggle = document.getElementById("toggle-password");

  toggle.addEventListener("click", function(){
    password.type =
      password.type === "password"
        ? "text"
        : "password";
  });

  form.addEventListener("submit", async function(event){
    event.preventDefault();

    const username =
      document.getElementById("username").value.trim();

    const pass =
      password.value;

    if(!username || !pass){
      message.textContent =
        "Username dan password wajib diisi.";
      return;
    }

    button.classList.add("loading");
    button.textContent = "MEMPROSES";
    message.className = "message";
    message.textContent = "Menghubungkan ke VEN Core...";

    try{
      const response = await fetch(
        "/api/auth/login",
        {
          method:"POST",
          credentials:"same-origin",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            username,
            password:pass
          })
        }
      );

      const data = await response.json();

      if(!response.ok){
        throw new Error(
          data.error || "Login gagal."
        );
      }

      message.className = "message ok";
      message.textContent =
        "Login berhasil. Membuka VEN Core...";

      setTimeout(function(){
        window.location.href = "/dashboard";
      },450);

    }catch(error){
      message.className = "message";
      message.textContent =
        error.message ||
        "Tidak dapat terhubung ke server.";

      button.classList.remove("loading");
      button.textContent = "MASUK";
    }
  });
})();
</script>
`;

  return htmlResponse(
    shell("Login", content, liveEffectsScript() + script)
  );
}

function registerPage() {
  const content = `
<div class="live-scene">
  <div class="scene-image"></div>
  <div class="scene-color"></div>
  <div class="scene-vignette"></div>
  <div class="scene-grid"></div>
  <div class="energy-beam one"></div>
  <div class="energy-beam two"></div>
  <canvas id="particles"></canvas>
</div>

<div class="hud hud-top">
  <div class="hud-corner">
    VEN DIGITAL SYSTEM
  </div>

  <div class="hud-corner">
    <span class="hud-live">REGISTRATION ONLINE</span>
  </div>
</div>

<div class="brand">
  <div class="brand-mark">
    ${VEN_LOGO}
  </div>

  <div class="brand-name">
    <strong>VEN</strong>
    <span>DIGITAL STORE</span>
  </div>
</div>

<main class="page">

  <aside class="panel side-panel left">
    <div class="panel-label">
      JOIN VEN
    </div>

    <div class="status-row">
      <div class="status-icon">◇</div>
      <div class="status-info">
        <small>ACCESS</small>
        <strong class="purple">NEW MEMBER</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">◈</div>
      <div class="status-info">
        <small>SECURITY</small>
        <strong class="ice">PROTECTED</strong>
      </div>
    </div>

    <div class="status-row">
      <div class="status-icon">◎</div>
      <div class="status-info">
        <small>DATABASE</small>
        <strong class="online">READY</strong>
      </div>
    </div>
  </aside>

  <section class="panel login-panel register-panel">
    <div class="scan"></div>

    <div class="login-head">

      <div class="login-logo">
        ${VEN_LOGO}
      </div>

      <h1 class="login-title">
        CREATE <span>ACCOUNT</span>
      </h1>

      <div class="login-sub">
        BERGABUNG DENGAN VEN DIGITAL STORE
      </div>

      <div class="jp">
        新しいアカウント
      </div>

    </div>

    <form class="form" id="register-form">

      <div class="name-grid">

        <div class="field">
          ${USER_ICON}
          <input
            id="first_name"
            type="text"
            autocomplete="given-name"
            maxlength="80"
            placeholder="Nama depan"
            required
          >
        </div>

        <div class="field">
          ${USER_ICON}
          <input
            id="username"
            type="text"
            autocomplete="username"
            maxlength="32"
            placeholder="Username"
            required
          >
        </div>

      </div>

      <div class="field">
        ${LOCK_ICON}

        <input
          id="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          placeholder="Password minimal 8 karakter"
          required
        >

        <button
          class="password-toggle"
          type="button"
          id="toggle-password"
        >
          ◉
        </button>
      </div>

      <div class="field">
        ${LOCK_ICON}

        <input
          id="password-confirm"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          placeholder="Ulangi password"
          required
        >
      </div>

      <button
        class="login-button"
        id="register-button"
        type="submit"
      >
        BUAT AKUN
      </button>

      <div
        class="message"
        id="register-message"
      ></div>

      <div class="register-link">
        Sudah memiliki akun?
        <a href="/login">
          LOGIN
        </a>
      </div>

    </form>
  </section>

  <aside class="panel side-panel right">

    <div class="panel-label">
      VEN MEMBERSHIP
    </div>

    <div class="core-ring">
      <div class="core-logo">
        ${VEN_LOGO}
      </div>
    </div>

    <h2 class="side-title">
      Enter the
      <span class="purple">VEN</span>
      system.
    </h2>

    <p class="side-description">
      Setelah akun dibuat, kamu dapat
      mengakses dashboard dan layanan
      digital VEN.
    </p>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>ACCOUNT</strong>
        <span>Profil dan session akun terintegrasi.</span>
      </div>
    </div>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>WALLET</strong>
        <span>Saldo akun tersedia dari dashboard.</span>
      </div>
    </div>

    <div class="feature">
      <div class="feature-dot"></div>
      <div class="feature-text">
        <strong>DIGITAL SERVICES</strong>
        <span>Siap digunakan untuk marketplace VEN.</span>
      </div>
    </div>

  </aside>

</main>

<div class="hud hud-bottom">
  <div class="hud-chip">VEN-CORE</div>
  <div class="hud-chip">REGISTER</div>
  <div class="hud-chip">SECURE</div>
</div>

<div class="footer-note">
  VEN DIGITAL STORE — CREATE YOUR DIGITAL ACCESS
</div>
`;

  const script = `
<script>
(function(){
  const form =
    document.getElementById("register-form");

  const button =
    document.getElementById("register-button");

  const message =
    document.getElementById("register-message");

  const password =
    document.getElementById("password");

  const confirm =
    document.getElementById("password-confirm");

  const toggle =
    document.getElementById("toggle-password");

  toggle.addEventListener("click", function(){
    const visible =
      password.type === "text";

    password.type =
      visible ? "password" : "text";

    confirm.type =
      visible ? "password" : "text";
  });

  form.addEventListener("submit", async function(event){
    event.preventDefault();

    const first_name =
      document.getElementById("first_name").value.trim();

    const username =
      document.getElementById("username").value.trim();

    const pass =
      password.value;

    if(pass !== confirm.value){
      message.textContent =
        "Konfirmasi password tidak cocok.";
      return;
    }

    if(pass.length < 8){
      message.textContent =
        "Password minimal 8 karakter.";
      return;
    }

    button.classList.add("loading");
    button.textContent = "MEMBUAT AKUN";
    message.textContent =
      "Mendaftarkan akun ke VEN Core...";

    try{
      const response = await fetch(
        "/api/auth/register",
        {
          method:"POST",
          credentials:"same-origin",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            first_name,
            username,
            password:pass
          })
        }
      );

      const data = await response.json();

      if(!response.ok){
        throw new Error(
          data.error || "Pendaftaran gagal."
        );
      }

      message.className = "message ok";
      message.textContent =
        "Akun berhasil dibuat. Membuka login...";

      setTimeout(function(){
        window.location.href = "/login";
      },700);

    }catch(error){
      message.className = "message";
      message.textContent =
        error.message ||
        "Pendaftaran gagal.";

      button.classList.remove("loading");
      button.textContent = "BUAT AKUN";
    }
  });
})();
</script>
`;

  return htmlResponse(
    shell(
      "Daftar",
      content,
      liveEffectsScript() + script
    )
  );
}

async function getCurrentUser(request) {
  try{
    const response =
      await fetch(
        new URL(
          "/api/auth/me",
          request.url
        ),
        {
          method:"GET",
          headers:{
            Cookie:
              request.headers.get("Cookie") || ""
          }
        }
      );

    if(!response.ok){
      return null;
    }

    const data =
      await response.json();

    return data?.authenticated
      ? data.user
      : null;

  }catch{
    return null;
  }
}

function dashboardPage(user) {
  const safeName =
    escapeHtml(
      user?.first_name ||
      user?.username ||
      "Member"
    );

  const safeUsername =
    escapeHtml(
      user?.username ||
      "member"
    );

  const balance =
    money(user?.balance || 0);

  const initial =
    escapeHtml(
      String(
        user?.first_name ||
        user?.username ||
        "V"
      ).charAt(0).toUpperCase()
    );

  const content = `
<div class="live-scene">
  <div class="scene-image"></div>
  <div class="scene-color"></div>
  <div class="scene-vignette"></div>
  <canvas id="particles"></canvas>
</div>

<div class="app">

  <aside class="app-sidebar">

    <div class="app-brand">

      <div class="brand-mark">
        ${VEN_LOGO}
      </div>

      <div>
        <strong>VEN</strong>
        <span>DIGITAL STORE</span>
      </div>

    </div>

    <div class="nav-title">
      MAIN
    </div>

    <a class="nav-item active" href="/dashboard">
      <span class="nav-symbol">◇</span>
      <span>Dashboard</span>
    </a>

    <a class="nav-item" href="/products">
      <span class="nav-symbol">◈</span>
      <span>Marketplace</span>
    </a>

    <a class="nav-item" href="/orders">
      <span class="nav-symbol">◎</span>
      <span>Pesanan</span>
    </a>

    <div class="nav-title">
      WALLET
    </div>

    <a class="nav-item" href="/deposit">
      <span class="nav-symbol">+</span>
      <span>Deposit</span>
    </a>

    <a class="nav-item" href="/account">
      <span class="nav-symbol">△</span>
      <span>Akun</span>
    </a>

    <div class="sidebar-bottom">
      <div class="system-mini">
        <div class="system-mini-top">
          <span>VEN CORE</span>
          <span class="system-online">ONLINE</span>
        </div>
      </div>
    </div>

  </aside>

  <main class="main">

    <header class="topbar">

      <div class="topbar-title">
        <small>VEN DIGITAL SYSTEM</small>
        <h1>Dashboard</h1>
      </div>

      <div class="user-badge">
        <div class="avatar">
          ${initial}
        </div>

        <div>
          <strong>${safeName}</strong>
          <span>@${safeUsername}</span>
        </div>

        <button
          class="logout"
          id="logout-button"
          type="button"
        >
          Logout
        </button>
      </div>

    </header>

    <section class="hero">

      <div class="hero-content">

        <div class="hero-kicker">
          SYSTEM ACCESS GRANTED
        </div>

        <h2>
          Welcome to
          <br>
          <span>VEN DIGITAL STORE</span>
        </h2>

        <p>
          Semua kebutuhan digitalmu berada
          dalam satu sistem marketplace yang
          cepat, modern, dan terintegrasi.
        </p>

        <div class="hero-buttons">
          <a
            class="hero-btn primary"
            href="/products"
          >
            LIHAT MARKETPLACE
          </a>

          <a
            class="hero-btn"
            href="/deposit"
          >
            TAMBAH SALDO
          </a>
        </div>

      </div>

    </section>

    <section class="cards">

      <div class="stat">
        <small>SALDO AKUN</small>
        <strong id="balance-value">
          Rp ${balance}
        </strong>
        <span>Wallet VEN</span>
      </div>

      <div class="stat">
        <small>STATUS</small>
        <strong class="online">ACTIVE</strong>
        <span>Account status</span>
      </div>

      <div class="stat">
        <small>SECURITY</small>
        <strong class="ice">SECURE</strong>
        <span>Session protected</span>
      </div>

      <div class="stat">
        <small>SYSTEM</small>
        <strong class="purple">ONLINE</strong>
        <span>VEN Core</span>
      </div>

    </section>

    <section class="dashboard-grid">

      <div class="section-card">

        <div class="section-head">
          <strong>LAYANAN VEN</strong>
          <span>MARKETPLACE</span>
        </div>

        <div class="service-grid">

          <a class="service" href="/products">
            <div class="service-icon">T</div>
            <strong>SMM SERVICES</strong>
            <span>
              Layanan sosial media digital.
            </span>
          </a>

          <a class="service" href="/products">
            <div class="service-icon">N</div>
            <strong>NOKOS</strong>
            <span>
              Produk nomor virtual.
            </span>
          </a>

          <a class="service" href="/products">
            <div class="service-icon">P</div>
            <strong>PREMIUM</strong>
            <span>
              Produk digital premium.
            </span>
          </a>

          <a class="service" href="/products">
            <div class="service-icon">V</div>
            <strong>VOUCHER</strong>
            <span>
              Voucher dan produk digital.
            </span>
          </a>

        </div>

      </div>

      <div class="section-card">

        <div class="section-head">
          <strong>QUICK DEPOSIT</strong>
          <span>MIN Rp1.000</span>
        </div>

        <div class="deposit-box">

          <input
            id="quick-deposit"
            type="number"
            min="1000"
            max="10000000"
            step="1000"
            placeholder="Nominal deposit"
          >

          <button
            id="quick-deposit-button"
            type="button"
          >
            BUAT DEPOSIT
          </button>

          <div
            class="deposit-result"
            id="quick-deposit-result"
          >
            Deposit akan dibuat melalui
            sistem VEN.
          </div>

        </div>

      </div>

    </section>

  </main>

</div>
`;

  const script = `
<script>
(function(){

  const logout =
    document.getElementById("logout-button");

  logout.addEventListener("click", async function(){

    try{
      await fetch(
        "/api/auth/logout",
        {
          method:"POST",
          credentials:"same-origin"
        }
      );
    }finally{
      window.location.href="/login";
    }

  });

  const depositButton =
    document.getElementById(
      "quick-deposit-button"
    );

  const depositInput =
    document.getElementById(
      "quick-deposit"
    );

  const depositResult =
    document.getElementById(
      "quick-deposit-result"
    );

  depositButton.addEventListener(
    "click",
    async function(){

      const amount =
        Math.round(
          Number(depositInput.value)
        );

      if(!Number.isSafeInteger(amount) ||
         amount < 1000 ||
         amount > 10000000){

        depositResult.textContent =
          "Nominal harus antara Rp1.000 dan Rp10.000.000.";

        return;
      }

      depositButton.disabled = true;
      depositButton.textContent = "MEMPROSES";
      depositResult.textContent =
        "Membuat deposit...";

      try{

        const response =
          await fetch(
            "/api/deposit",
            {
              method:"POST",
              credentials:"same-origin",
              headers:{
                "Content-Type":
                  "application/json"
              },
              body:JSON.stringify({
                amount,
                payment_method:"QRIS"
              })
            }
          );

        const data =
          await response.json();

        if(!response.ok){
          throw new Error(
            data.error ||
            "Deposit gagal."
          );
        }

        const deposit =
          data.deposit;

        depositResult.innerHTML =
          "Deposit dibuat: <strong>" +
          String(
            deposit.reference_id || ""
          ) +
          "</strong><br>" +
          "Status: " +
          String(
            deposit.status || "PENDING"
          );

      }catch(error){

        depositResult.textContent =
          error.message ||
          "Deposit gagal.";

      }finally{

        depositButton.disabled = false;
        depositButton.textContent =
          "BUAT DEPOSIT";

      }

    }
  );

})();
</script>
`;

  return htmlResponse(
    shell(
      "Dashboard",
      content,
      liveEffectsScript() + script
    )
  );
}

function placeholderPage(title, description) {
  const content = `
<div class="live-scene">
  <div class="scene-image"></div>
  <div class="scene-color"></div>
  <div class="scene-vignette"></div>
  <div class="scene-grid"></div>
  <canvas id="particles"></canvas>
</div>

<div class="brand">
  <div class="brand-mark">
    ${VEN_LOGO}
  </div>

  <div class="brand-name">
    <strong>VEN</strong>
    <span>DIGITAL STORE</span>
  </div>
</div>

<main class="page">

  <section
    class="panel login-panel"
    style="max-width:760px"
  >

    <div class="login-head">

      <div class="login-logo">
        ${VEN_LOGO}
      </div>

      <h1 class="login-title">
        <span>${escapeHtml(title)}</span>
      </h1>

      <div class="login-sub">
        ${escapeHtml(description)}
      </div>

    </div>

    <div
      style="
        margin-top:30px;
        padding:20px;
        border:1px solid rgba(180,160,255,.1);
        border-radius:14px;
        background:rgba(255,255,255,.02);
        text-align:center;
        color:#817c8f;
        font-size:11px;
        line-height:1.8;
      "
    >
      Modul ini sudah disiapkan di UI VEN.
      API dan database dapat ditambahkan tanpa
      mengubah design system utama.
    </div>

    <div class="hero-buttons" style="justify-content:center">
      <a
        class="hero-btn primary"
        href="/dashboard"
      >
        KEMBALI KE DASHBOARD
      </a>

      <a
        class="hero-btn"
        href="/"
      >
        HOME
      </a>
    </div>

  </section>

</main>
`;

  return htmlResponse(
    shell(
      title,
      content,
      liveEffectsScript()
    )
  );
}

/* =========================================================
   WEB ROUTER
========================================================= */

async function handleWeb(request, env) {
  const url = new URL(request.url);
  const pathname =
    url.pathname.replace(/\/+$/, "") || "/";

  if(request.method !== "GET"){
    return null;
  }

  if(pathname === "/"){
    const user =
      await getCurrentUser(request);

    return Response.redirect(
      new URL(
        user ? "/dashboard" : "/login",
        request.url
      ),
      302
    );
  }

  if(pathname === "/login"){
    const user =
      await getCurrentUser(request);

    if(user){
      return Response.redirect(
        new URL("/dashboard",request.url),
        302
      );
    }

    return loginPage();
  }

  if(pathname === "/register"){
    const user =
      await getCurrentUser(request);

    if(user){
      return Response.redirect(
        new URL("/dashboard",request.url),
        302
      );
    }

    return registerPage();
  }

  if(pathname === "/dashboard"){
    const user =
      await getCurrentUser(request);

    if(!user){
      return Response.redirect(
        new URL("/login",request.url),
        302
      );
    }

    return dashboardPage(user);
  }

  if(
    pathname === "/products" ||
    pathname === "/marketplace"
  ){
    const user =
      await getCurrentUser(request);

    if(!user){
      return Response.redirect(
        new URL("/login",request.url),
        302
      );
    }

    return placeholderPage(
      "MARKETPLACE",
      "VEN DIGITAL MARKETPLACE"
    );
  }

  if(pathname === "/orders"){
    const user =
      await getCurrentUser(request);

    if(!user){
      return Response.redirect(
        new URL("/login",request.url),
        302
      );
    }

    return placeholderPage(
      "PESANAN",
      "RIWAYAT PESANAN VEN"
    );
  }

  if(pathname === "/account"){
    const user =
      await getCurrentUser(request);

    if(!user){
      return Response.redirect(
        new URL("/login",request.url),
        302
      );
    }

    return placeholderPage(
      "AKUN",
      "PENGATURAN AKUN VEN"
    );
  }

  if(pathname === "/deposit"){
    const user =
      await getCurrentUser(request);

    if(!user){
      return Response.redirect(
        new URL("/login",request.url),
        302
      );
    }

    return placeholderPage(
      "DEPOSIT",
      "VEN WALLET & DEPOSIT"
    );
  }

  return null;
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env, ctx){

    try{

      const url =
        new URL(request.url);

      /*
       * Semua API menggunakan router
       * terbaru dari src/router.js.
       */
      if(
        url.pathname === "/api" ||
        url.pathname.startsWith("/api/")
      ){
        return await router(
          request,
          env,
          ctx
        );
      }

      const webResponse =
        await handleWeb(
          request,
          env
        );

      if(webResponse){
        return webResponse;
      }

      return new Response(
        "VEN Digital Store — Not Found",
        {
          status:404,
          headers:{
            "Content-Type":
              "text/plain; charset=UTF-8",
            "Cache-Control":
              "no-store"
          }
        }
      );

    }catch(error){

      console.error(
        "VEN_WORKER_ERROR",
        error
      );

      return new Response(
        "Internal Server Error",
        {
          status:500,
          headers:{
            "Content-Type":
              "text/plain; charset=UTF-8",
            "Cache-Control":
              "no-store"
          }
        }
      );

    }
  }
};
