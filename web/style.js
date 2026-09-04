export const STYLE = `
:root{
  --black:#030207;
  --black2:#08050f;
  --purple:#8b5cf6;
  --purple2:#c4b5fd;
  --ice:#67e8f9;
  --ice2:#d9faff;
  --blue:#2563eb;
  --blue2:#3b82f6;
  --red:#dc163c;
  --red2:#ff315d;
  --blood:#7f1028;
  --white:#f8f7ff;
  --muted:#aaa7bb;
  --glass:rgba(8,6,18,.66);
  --border:rgba(196,181,253,.22);
  --shadow:0 25px 80px rgba(0,0,0,.55);
}

*{
  box-sizing:border-box;
  margin:0;
  padding:0;
}

html,
body{
  width:100%;
  min-height:100%;
  background:var(--black);
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
  min-height:100svh;
  overflow-x:hidden;
}

button,
input{
  font:inherit;
}

button{
  cursor:pointer;
}

button:disabled{
  cursor:not-allowed;
  opacity:.55;
}

.ven-page{
  position:relative;
  width:100%;
  min-height:100svh;
  overflow:hidden;
  isolation:isolate;
  background:
    radial-gradient(
      circle at 70% 35%,
      rgba(91,33,182,.15),
      transparent 32%
    ),
    radial-gradient(
      circle at 25% 65%,
      rgba(37,99,235,.12),
      transparent 30%
    ),
    radial-gradient(
      circle at 85% 70%,
      rgba(220,22,60,.10),
      transparent 25%
    ),
    #030207;
}

.ven-bg{
  position:absolute;
  inset:0;
  z-index:-5;
  overflow:hidden;
  background:
    linear-gradient(
      125deg,
      #020106 0%,
      #08040f 32%,
      #030714 60%,
      #080207 100%
    );
}

.ven-grid{
  position:absolute;
  inset:-20%;
  opacity:.18;
  transform:perspective(600px) rotateX(64deg) scale(1.35);
  transform-origin:center bottom;
  background-image:
    linear-gradient(
      rgba(103,232,249,.16) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(139,92,246,.16) 1px,
      transparent 1px
    );
  background-size:56px 56px;
  animation:gridMove 15s linear infinite;
}

.ven-noise{
  position:absolute;
  inset:0;
  opacity:.035;
  pointer-events:none;
  background-image:
    url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");
  mix-blend-mode:screen;
}

.ven-aurora{
  position:absolute;
  width:65vw;
  height:65vw;
  min-width:420px;
  min-height:420px;
  border-radius:50%;
  filter:blur(80px);
  opacity:.22;
  pointer-events:none;
}

.ven-aurora-purple{
  top:-30%;
  left:-15%;
  background:radial-gradient(
    circle,
    rgba(139,92,246,.72),
    transparent 68%
  );
  animation:auroraPurple 13s ease-in-out infinite alternate;
}

.ven-aurora-blue{
  right:-25%;
  top:10%;
  background:radial-gradient(
    circle,
    rgba(37,99,235,.62),
    transparent 68%
  );
  animation:auroraBlue 17s ease-in-out infinite alternate;
}

.ven-aurora-red{
  right:5%;
  bottom:-40%;
  background:radial-gradient(
    circle,
    rgba(220,22,60,.48),
    transparent 68%
  );
  animation:auroraRed 11s ease-in-out infinite alternate;
}

.ven-header{
  position:relative;
  z-index:20;
  display:flex;
  align-items:center;
  justify-content:space-between;
  width:100%;
  padding:24px 34px;
}

.ven-logo{
  display:flex;
  align-items:center;
  gap:13px;
  color:var(--white);
  text-decoration:none;
}

.ven-logo-mark{
  position:relative;
  display:grid;
  place-items:center;
  width:48px;
  height:48px;
  transform:rotate(45deg);
  border:1px solid rgba(196,181,253,.6);
  background:
    linear-gradient(
      135deg,
      rgba(139,92,246,.32),
      rgba(37,99,235,.18),
      rgba(220,22,60,.22)
    );
  box-shadow:
    0 0 20px rgba(139,92,246,.25),
    inset 0 0 20px rgba(103,232,249,.08);
}

.ven-logo-mark::before{
  content:"";
  position:absolute;
  inset:5px;
  border:1px solid rgba(103,232,249,.28);
}

.ven-logo-mark span{
  transform:rotate(-45deg);
  font-size:20px;
  font-weight:900;
  letter-spacing:-2px;
  background:
    linear-gradient(
      135deg,
      var(--ice2),
      var(--purple2) 48%,
      var(--red2)
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.ven-logo-text{
  display:flex;
  flex-direction:column;
  line-height:1;
}

.ven-logo-text strong{
  font-size:23px;
  letter-spacing:5px;
}

.ven-logo-text small{
  margin-top:6px;
  color:var(--muted);
  font-size:8px;
  letter-spacing:3px;
}

.ven-status{
  display:flex;
  align-items:center;
  gap:9px;
  padding:9px 13px;
  border:1px solid rgba(103,232,249,.15);
  border-radius:999px;
  background:rgba(3,2,7,.38);
  color:#c7c4d4;
  font-size:9px;
  letter-spacing:2px;
  backdrop-filter:blur(12px);
}

.ven-status-dot{
  width:7px;
  height:7px;
  border-radius:50%;
  background:#67e8f9;
  box-shadow:
    0 0 8px #67e8f9,
    0 0 18px rgba(103,232,249,.8);
  animation:statusPulse 1.8s ease-in-out infinite;
}

.ven-main{
  position:relative;
  z-index:5;
  display:grid;
  grid-template-columns:minmax(0,1.45fr) minmax(360px,.8fr);
  align-items:center;
  width:100%;
  min-height:calc(100svh - 120px);
  padding:0 5vw 30px;
}

.ven-character-stage{
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:650px;
  height:calc(100svh - 150px);
  overflow:hidden;
  perspective:1200px;
}

.ven-character-wrap{
  position:relative;
  z-index:8;
  width:min(54vw,680px);
  height:min(82vh,820px);
  min-height:520px;
  transform:
    translate3d(
      var(--mouse-x,0px),
      var(--mouse-y,0px),
      0
    )
    scale(1.02);
  transition:transform .16s ease-out;
  animation:characterFloat 6s ease-in-out infinite;
}

.ven-character{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:center;
  user-select:none;
  pointer-events:none;
  border-radius:38% 38% 24% 24%;
  filter:
    saturate(1.15)
    contrast(1.08)
    brightness(.88)
    drop-shadow(
      0 0 24px rgba(139,92,246,.38)
    );
  mask-image:
    linear-gradient(
      to bottom,
      transparent 0%,
      black 5%,
      black 88%,
      transparent 100%
    );
  -webkit-mask-image:
    linear-gradient(
      to bottom,
      transparent 0%,
      black 5%,
      black 88%,
      transparent 100%
    );
}

.ven-character-glow{
  position:absolute;
  inset:10%;
  z-index:-1;
  border-radius:50%;
  background:
    radial-gradient(
      circle,
      rgba(139,92,246,.35) 0%,
      rgba(103,232,249,.18) 28%,
      rgba(220,22,60,.12) 50%,
      transparent 72%
    );
  filter:blur(35px);
  animation:characterGlow 4.5s ease-in-out infinite;
}

.ven-character-shine{
  position:absolute;
  inset:0;
  pointer-events:none;
  overflow:hidden;
  border-radius:inherit;
}

.ven-character-shine::before{
  content:"";
  position:absolute;
  top:-30%;
  left:-60%;
  width:30%;
  height:170%;
  transform:rotate(18deg);
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(217,250,255,.20),
      rgba(196,181,253,.14),
      transparent
    );
  filter:blur(8px);
  animation:lightSweep 6s ease-in-out infinite;
}

.ven-orbit{
  position:absolute;
  z-index:2;
  border-radius:50%;
  pointer-events:none;
  border:1px solid rgba(103,232,249,.18);
  box-shadow:
    0 0 18px rgba(103,232,249,.08);
}

.ven-orbit-one{
  width:620px;
  height:230px;
  transform:
    rotate(-28deg)
    translateZ(-50px);
  animation:orbitOne 14s linear infinite;
}

.ven-orbit-two{
  width:520px;
  height:190px;
  border-color:rgba(139,92,246,.18);
  transform:
    rotate(38deg);
  animation:orbitTwo 19s linear infinite;
}

.ven-orbit-three{
  width:390px;
  height:140px;
  border-color:rgba(220,22,60,.18);
  transform:
    rotate(-55deg);
  animation:orbitThree 12s linear infinite;
}

.ven-energy{
  position:absolute;
  border-radius:50%;
  pointer-events:none;
  filter:blur(2px);
}

.ven-energy-purple{
  width:280px;
  height:280px;
  background:
    radial-gradient(
      circle,
      rgba(139,92,246,.22),
      transparent 68%
    );
  animation:energyPurple 7s ease-in-out infinite;
}

.ven-energy-blue{
  width:210px;
  height:210px;
  left:20%;
  bottom:10%;
  background:
    radial-gradient(
      circle,
      rgba(37,99,235,.20),
      transparent 68%
    );
  animation:energyBlue 8s ease-in-out infinite;
}

.ven-energy-red{
  width:190px;
  height:190px;
  right:16%;
  top:18%;
  background:
    radial-gradient(
      circle,
      rgba(220,22,60,.20),
      transparent 68%
    );
  animation:energyRed 5.5s ease-in-out infinite;
}

.ven-ice-ring{
  position:absolute;
  z-index:4;
  width:460px;
  height:460px;
  border-radius:50%;
  border:1px solid rgba(217,250,255,.11);
  box-shadow:
    inset 0 0 35px rgba(103,232,249,.05),
    0 0 35px rgba(103,232,249,.08);
  animation:iceRing 20s linear infinite;
}

.ven-ice-ring::before,
.ven-ice-ring::after{
  content:"";
  position:absolute;
  inset:16px;
  border-radius:50%;
  border:1px dashed rgba(196,181,253,.16);
}

.ven-ice-ring::after{
  inset:42px;
  border-color:rgba(220,22,60,.13);
}

.ven-ice-ring span{
  position:absolute;
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--ice2);
  box-shadow:
    0 0 9px var(--ice),
    0 0 20px rgba(103,232,249,.65);
}

.ven-ice-ring span:nth-child(1){
  top:0;
  left:50%;
}

.ven-ice-ring span:nth-child(2){
  top:25%;
  right:6%;
}

.ven-ice-ring span:nth-child(3){
  bottom:8%;
  right:18%;
}

.ven-ice-ring span:nth-child(4){
  bottom:8%;
  left:18%;
}

.ven-ice-ring span:nth-child(5){
  top:25%;
  left:6%;
}

.ven-ice-ring span:nth-child(6){
  top:50%;
  right:-3px;
}

.ven-phoenix-aura{
  position:absolute;
  z-index:3;
  right:2%;
  top:18%;
  width:360px;
  height:360px;
  pointer-events:none;
  opacity:.7;
  filter:blur(.2px);
}

.phoenix-wing{
  position:absolute;
  width:220px;
  height:100px;
  border-radius:100% 0 100% 0;
  border-top:2px solid rgba(255,49,93,.6);
  box-shadow:
    0 -8px 30px rgba(220,22,60,.2);
}

.phoenix-wing::after{
  content:"";
  position:absolute;
  inset:15px;
  border-top:1px solid rgba(255,130,150,.45);
}

.phoenix-wing-left{
  left:-25px;
  top:80px;
  transform:rotate(-32deg);
  animation:phoenixLeft 4s ease-in-out infinite;
}

.phoenix-wing-right{
  right:-25px;
  top:120px;
  transform:
    scaleX(-1)
    rotate(-32deg);
  animation:phoenixRight 4s ease-in-out infinite;
}

.ven-dragon-aura{
  position:absolute;
  z-index:3;
  left:2%;
  bottom:12%;
  width:380px;
  height:260px;
  pointer-events:none;
  opacity:.62;
}

.dragon-energy{
  position:absolute;
  width:100%;
  height:100%;
  border-radius:50%;
  filter:blur(18px);
}

.dragon-blue{
  background:
    radial-gradient(
      ellipse,
      rgba(37,99,235,.22),
      transparent 67%
    );
  animation:dragonBlue 8s ease-in-out infinite;
}

.dragon-red{
  background:
    radial-gradient(
      ellipse,
      rgba(220,22,60,.16),
      transparent 67%
    );
  animation:dragonRed 6s ease-in-out infinite;
}

.ven-scene-label{
  position:absolute;
  z-index:15;
  left:10%;
  bottom:5%;
  display:flex;
  align-items:center;
  gap:10px;
  color:#9f9bae;
  font-size:8px;
  letter-spacing:3px;
}

.ven-scene-label span:first-child{
  color:var(--ice2);
  font-weight:800;
}

.ven-scene-label i{
  display:block;
  width:40px;
  height:1px;
  background:
    linear-gradient(
      90deg,
      var(--ice),
      var(--purple),
      var(--red2)
    );
}

.ven-snow-front{
  position:absolute;
  inset:0;
  z-index:18;
  pointer-events:none;
  overflow:hidden;
}

.snow-particle{
  position:absolute;
  top:-30px;
  width:var(--size);
  height:var(--size);
  border-radius:50%;
  background:rgba(230,250,255,.9);
  box-shadow:
    0 0 7px rgba(217,250,255,.75);
  opacity:var(--opacity);
  animation:
    snowFall var(--duration) linear infinite;
  animation-delay:var(--delay);
}

.ven-auth-area{
  position:relative;
  z-index:30;
  display:flex;
  align-items:center;
  justify-content:center;
  width:100%;
}

.auth-panel{
  position:relative;
  width:min(100%,460px);
  padding:34px;
  overflow:hidden;
  border:1px solid var(--border);
  border-radius:28px;
  background:
    linear-gradient(
      145deg,
      rgba(15,11,30,.82),
      rgba(5,8,19,.68)
    );
  box-shadow:
    var(--shadow),
    0 0 50px rgba(139,92,246,.10),
    inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
}

.auth-panel::before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    linear-gradient(
      120deg,
      rgba(139,92,246,.06),
      transparent 30%,
      rgba(103,232,249,.04) 60%,
      rgba(220,22,60,.05)
    );
}

.auth-panel::after{
  content:"";
  position:absolute;
  top:0;
  left:12%;
  width:76%;
  height:1px;
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(217,250,255,.7),
      rgba(196,181,253,.7),
      rgba(255,49,93,.6),
      transparent
    );
  box-shadow:
    0 0 20px rgba(103,232,249,.3);
}

.auth-panel-glow{
  position:absolute;
  top:-130px;
  right:-120px;
  width:300px;
  height:300px;
  border-radius:50%;
  background:
    radial-gradient(
      circle,
      rgba(139,92,246,.20),
      transparent 68%
    );
  filter:blur(20px);
  pointer-events:none;
  animation:panelGlow 5s ease-in-out infinite alternate;
}

.auth-heading{
  position:relative;
  z-index:2;
  display:flex;
  gap:15px;
  align-items:flex-start;
  margin-bottom:28px;
}

.auth-mini-logo{
  flex:0 0 auto;
  display:grid;
  place-items:center;
  width:50px;
  height:50px;
  border-radius:15px;
  border:1px solid rgba(103,232,249,.22);
  background:
    linear-gradient(
      135deg,
      rgba(139,92,246,.25),
      rgba(37,99,235,.15),
      rgba(220,22,60,.16)
    );
  color:var(--ice2);
  font-size:13px;
  font-weight:900;
  letter-spacing:2px;
  box-shadow:
    0 0 25px rgba(139,92,246,.13);
}

.auth-kicker{
  margin-bottom:7px;
  color:#8d8a9d;
  font-size:8px;
  font-weight:700;
  letter-spacing:3px;
}

.auth-heading h1{
  font-size:27px;
  line-height:1.1;
  letter-spacing:-.8px;
  background:
    linear-gradient(
      110deg,
      #fff,
      var(--purple2) 42%,
      var(--ice) 72%,
      #fff
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.auth-heading p{
  margin-top:8px;
  color:#9693a4;
  font-size:12px;
  line-height:1.6;
}

.auth-form{
  position:relative;
  z-index:3;
  display:flex;
  flex-direction:column;
  gap:18px;
}

.auth-field{
  display:flex;
  flex-direction:column;
  gap:8px;
}

.auth-field > span{
  color:#aaa7b7;
  font-size:8px;
  font-weight:800;
  letter-spacing:2.5px;
}

.input-wrap{
  position:relative;
  display:flex;
  align-items:center;
  min-height:52px;
  border:1px solid rgba(196,181,253,.13);
  border-radius:14px;
  background:rgba(0,0,0,.26);
  transition:
    border-color .2s ease,
    box-shadow .2s ease,
    background .2s ease;
}

.input-wrap:focus-within{
  border-color:rgba(103,232,249,.48);
  background:rgba(6,7,18,.55);
  box-shadow:
    0 0 0 3px rgba(103,232,249,.05),
    0 0 28px rgba(37,99,235,.10);
}

.input-line{
  position:absolute;
  left:12px;
  right:12px;
  bottom:0;
  height:1px;
  opacity:0;
  background:
    linear-gradient(
      90deg,
      var(--purple),
      var(--ice),
      var(--red2)
    );
  transition:opacity .2s ease;
}

.input-wrap:focus-within .input-line{
  opacity:1;
}

.input-wrap input{
  width:100%;
  min-width:0;
  height:50px;
  padding:0 14px;
  border:0;
  outline:0;
  background:transparent;
  color:#f5f3ff;
  font-size:13px;
}

.input-wrap input::placeholder{
  color:#625f70;
}

.password-toggle{
  flex:0 0 auto;
  margin-right:10px;
  padding:7px 8px;
  border:0;
  border-radius:8px;
  background:rgba(139,92,246,.08);
  color:#aaa7b7;
  font-size:7px;
  font-weight:800;
  letter-spacing:1.5px;
}

.password-toggle:hover{
  color:var(--ice2);
  background:rgba(103,232,249,.08);
}

.auth-message{
  min-height:18px;
  color:#ff8da4;
  font-size:10px;
  line-height:1.5;
}

.auth-message.success{
  color:#8ff7ff;
}

.auth-submit{
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:54px;
  overflow:hidden;
  border:1px solid rgba(196,181,253,.35);
  border-radius:15px;
  background:
    linear-gradient(
      110deg,
      rgba(139,92,246,.78),
      rgba(37,99,235,.72),
      rgba(220,22,60,.66)
    );
  color:#fff;
  font-size:10px;
  font-weight:900;
  letter-spacing:2.5px;
  box-shadow:
    0 10px 35px rgba(91,33,182,.22);
  transition:
    transform .18s ease,
    box-shadow .18s ease;
}

.auth-submit::before{
  content:"";
  position:absolute;
  top:0;
  left:-100%;
  width:80%;
  height:100%;
  transform:skewX(-22deg);
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255,255,255,.25),
      transparent
    );
  animation:buttonSweep 4s ease-in-out infinite;
}

.auth-submit span,
.auth-submit i{
  position:relative;
  z-index:2;
}

.auth-submit i{
  position:absolute;
  right:18px;
  width:7px;
  height:7px;
  border-top:1px solid rgba(255,255,255,.8);
  border-right:1px solid rgba(255,255,255,.8);
  transform:rotate(45deg);
}

.auth-submit:hover{
  transform:translateY(-2px);
  box-shadow:
    0 15px 42px rgba(91,33,182,.34),
    0 0 35px rgba(103,232,249,.10);
}

.auth-submit:active{
  transform:translateY(0);
}

.auth-divider{
  display:flex;
  align-items:center;
  gap:10px;
  margin:23px 0 14px;
}

.auth-divider span{
  flex:1;
  height:1px;
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(196,181,253,.15)
    );
}

.auth-divider span:last-child{
  background:
    linear-gradient(
      90deg,
      rgba(196,181,253,.15),
      transparent
    );
}

.auth-divider b{
  color:#676474;
  font-size:7px;
  letter-spacing:2px;
}

.auth-register{
  position:relative;
  z-index:3;
  width:100%;
  min-height:46px;
  border:1px solid rgba(103,232,249,.14);
  border-radius:13px;
  background:rgba(103,232,249,.035);
  color:#c8c5d5;
  font-size:9px;
  font-weight:800;
  letter-spacing:2px;
  transition:
    color .18s ease,
    border-color .18s ease,
    background .18s ease;
}

.auth-register:hover{
  color:var(--ice2);
  border-color:rgba(103,232,249,.34);
  background:rgba(103,232,249,.07);
}

.auth-security{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  margin-top:20px;
  color:#686576;
  font-size:7px;
  letter-spacing:2px;
}

.security-dot{
  width:5px;
  height:5px;
  border-radius:50%;
  background:#8b5cf6;
  box-shadow:0 0 9px rgba(139,92,246,.8);
  animation:securityPulse 2s ease-in-out infinite;
}

.dashboard-panel{
  position:relative;
  width:min(100%,780px);
  padding:34px;
  overflow:hidden;
  border:1px solid var(--border);
  border-radius:28px;
  background:
    linear-gradient(
      145deg,
      rgba(15,11,30,.84),
      rgba(5,8,19,.72)
    );
  box-shadow:var(--shadow);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
}

.dashboard-top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:20px;
}

.dashboard-top h1{
  font-size:32px;
  letter-spacing:-1px;
  background:
    linear-gradient(
      110deg,
      #fff,
      var(--purple2),
      var(--ice)
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.dashboard-top p{
  margin-top:8px;
  color:#9491a2;
  font-size:12px;
}

.dashboard-logo{
  display:grid;
  place-items:center;
  width:64px;
  height:64px;
  border:1px solid rgba(196,181,253,.25);
  border-radius:18px;
  background:
    linear-gradient(
      135deg,
      rgba(139,92,246,.20),
      rgba(37,99,235,.13),
      rgba(220,22,60,.12)
    );
  color:var(--ice2);
  font-size:13px;
  font-weight:900;
  letter-spacing:3px;
}

.dashboard-balance{
  position:relative;
  display:flex;
  flex-direction:column;
  gap:8px;
  margin-top:30px;
  padding:24px;
  border:1px solid rgba(103,232,249,.13);
  border-radius:20px;
  background:
    radial-gradient(
      circle at 100% 0,
      rgba(139,92,246,.12),
      transparent 45%
    ),
    rgba(0,0,0,.22);
}

.dashboard-balance > span{
  color:#777486;
  font-size:8px;
  letter-spacing:2px;
}

.dashboard-balance strong{
  font-size:30px;
  letter-spacing:-1px;
  background:
    linear-gradient(
      100deg,
      var(--ice2),
      var(--purple2),
      #fff
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.dashboard-action{
  position:absolute;
  right:20px;
  bottom:20px;
  min-height:40px;
  padding:0 17px;
  border:1px solid rgba(196,181,253,.23);
  border-radius:11px;
  background:rgba(139,92,246,.12);
  color:#e8e4ff;
  font-size:8px;
  font-weight:900;
  letter-spacing:1.7px;
}

.dashboard-action:hover{
  background:rgba(139,92,246,.23);
}

.dashboard-grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:13px;
  margin-top:14px;
}

.dashboard-card{
  min-height:110px;
  padding:20px;
  text-align:left;
  border:1px solid rgba(196,181,253,.11);
  border-radius:17px;
  background:rgba(255,255,255,.025);
  color:#fff;
  transition:
    transform .18s ease,
    border-color .18s ease,
    background .18s ease;
}

.dashboard-card:hover{
  transform:translateY(-3px);
  border-color:rgba(103,232,249,.28);
  background:rgba(103,232,249,.045);
}

.dashboard-card strong{
  display:block;
  font-size:10px;
  letter-spacing:2px;
}

.dashboard-card span{
  display:block;
  margin-top:8px;
  color:#767384;
  font-size:10px;
}

.dashboard-logout:hover{
  border-color:rgba(255,49,93,.32);
  background:rgba(220,22,60,.05);
}

.dashboard-message{
  min-height:20px;
  margin-top:15px;
  color:#ff8da4;
  font-size:10px;
}

.deposit-panel{
  width:min(100%,620px);
}

.deposit-result{
  margin-top:22px;
  padding:18px;
  border:1px solid rgba(103,232,249,.13);
  border-radius:17px;
  background:rgba(0,0,0,.22);
}

.deposit-code,
.deposit-status{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:15px;
  padding:10px 0;
}

.deposit-code span,
.deposit-status span{
  color:#777486;
  font-size:8px;
  letter-spacing:2px;
}

.deposit-code strong{
  color:var(--ice2);
  font-size:15px;
  letter-spacing:3px;
}

.deposit-status strong{
  color:#f0b8c4;
  font-size:9px;
  letter-spacing:2px;
}

.deposit-result p{
  margin-top:13px;
  padding-top:13px;
  border-top:1px solid rgba(255,255,255,.06);
  color:#807d8d;
  font-size:10px;
  line-height:1.6;
}

.loading-panel{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:320px;
  text-align:center;
}

.loading-logo{
  font-size:38px;
  font-weight:1000;
  letter-spacing:8px;
  background:
    linear-gradient(
      120deg,
      var(--ice2),
      var(--purple2),
      var(--red2)
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
  animation:loadingLogo 2s ease-in-out infinite;
}

.loading-ring{
  position:relative;
  width:70px;
  height:70px;
  margin:30px 0 20px;
  border:1px solid rgba(103,232,249,.15);
  border-radius:50%;
}

.loading-ring::before,
.loading-ring::after{
  content:"";
  position:absolute;
  inset:8px;
  border-radius:50%;
  border:1px solid transparent;
  border-top-color:var(--ice);
  border-right-color:var(--purple);
  animation:loadingSpin 1.3s linear infinite;
}

.loading-ring::after{
  inset:18px;
  border-top-color:var(--red2);
  border-right-color:var(--blue2);
  animation-duration:.9s;
  animation-direction:reverse;
}

.loading-text{
  color:#dcd9e8;
  font-size:9px;
  font-weight:900;
  letter-spacing:3px;
}

.loading-status{
  margin-top:9px;
  color:#706d7e;
  font-size:7px;
  letter-spacing:2px;
}

.ven-footer{
  position:relative;
  z-index:20;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:12px;
  width:100%;
  padding:5px 20px 20px;
  color:#5e5b69;
  font-size:7px;
  letter-spacing:2px;
}

.ven-footer-line{
  width:45px;
  height:1px;
  background:
    linear-gradient(
      90deg,
      var(--purple),
      var(--ice),
      var(--red2)
    );
  opacity:.6;
}

@keyframes gridMove{
  from{
    background-position:0 0;
  }
  to{
    background-position:0 56px;
  }
}

@keyframes auroraPurple{
  0%{
    transform:translate3d(-5%,0,0) scale(1);
  }
  100%{
    transform:translate3d(12%,10%,0) scale(1.12);
  }
}

@keyframes auroraBlue{
  0%{
    transform:translate3d(0,-5%,0) scale(1);
  }
  100%{
    transform:translate3d(-10%,14%,0) scale(1.15);
  }
}

@keyframes auroraRed{
  0%{
    transform:translate3d(0,5%,0) scale(1);
  }
  100%{
    transform:translate3d(-12%,-10%,0) scale(1.1);
  }
}

@keyframes statusPulse{
  0%,100%{
    opacity:.5;
    transform:scale(.8);
  }
  50%{
    opacity:1;
    transform:scale(1.15);
  }
}

@keyframes characterFloat{
  0%,100%{
    margin-top:0;
  }
  50%{
    margin-top:-9px;
  }
}

@keyframes characterGlow{
  0%,100%{
    transform:scale(.92);
    opacity:.65;
  }
  50%{
    transform:scale(1.08);
    opacity:1;
  }
}

@keyframes lightSweep{
  0%{
    left:-60%;
    opacity:0;
  }
  18%{
    opacity:1;
  }
  40%,100%{
    left:150%;
    opacity:0;
  }
}

@keyframes orbitOne{
  from{
    transform:rotate(-28deg) rotate(0deg);
  }
  to{
    transform:rotate(-28deg) rotate(360deg);
  }
}

@keyframes orbitTwo{
  from{
    transform:rotate(38deg) rotate(360deg);
  }
  to{
    transform:rotate(38deg) rotate(0deg);
  }
}

@keyframes orbitThree{
  from{
    transform:rotate(-55deg) rotate(0deg);
  }
  to{
    transform:rotate(-55deg) rotate(-360deg);
  }
}

@keyframes energyPurple{
  0%,100%{
    transform:scale(.75);
    opacity:.45;
  }
  50%{
    transform:scale(1.2);
    opacity:.85;
  }
}

@keyframes energyBlue{
  0%,100%{
    transform:translate(0,0) scale(.8);
  }
  50%{
    transform:translate(25px,-18px) scale(1.12);
  }
}

@keyframes energyRed{
  0%,100%{
    transform:translate(0,0) scale(.8);
  }
  50%{
    transform:translate(-18px,20px) scale(1.16);
  }
}

@keyframes iceRing{
  from{
    transform:rotate(0deg);
  }
  to{
    transform:rotate(360deg);
  }
}

@keyframes phoenixLeft{
  0%,100%{
    transform:rotate(-32deg) scale(.92);
  }
  50%{
    transform:rotate(-24deg) scale(1.05);
  }
}

@keyframes phoenixRight{
  0%,100%{
    transform:scaleX(-1) rotate(-32deg) scale(.92);
  }
  50%{
    transform:scaleX(-1) rotate(-24deg) scale(1.05);
  }
}

@keyframes dragonBlue{
  0%,100%{
    transform:translateX(-10px) scale(.92);
    opacity:.45;
  }
  50%{
    transform:translateX(22px) scale(1.08);
    opacity:.8;
  }
}

@keyframes dragonRed{
  0%,100%{
    transform:translateX(15px) scale(.85);
    opacity:.35;
  }
  50%{
    transform:translateX(-20px) scale(1.1);
    opacity:.7;
  }
}

@keyframes snowFall{
  0%{
    transform:
      translate3d(0,-40px,0)
      rotate(0deg);
  }
  25%{
    transform:
      translate3d(25px,25vh,0)
      rotate(90deg);
  }
  50%{
    transform:
      translate3d(-20px,50vh,0)
      rotate(180deg);
  }
  75%{
    transform:
      translate3d(30px,75vh,0)
      rotate(270deg);
  }
  100%{
    transform:
      translate3d(-10px,110vh,0)
      rotate(360deg);
  }
}

@keyframes panelGlow{
  from{
    transform:translate(0,0) scale(.9);
  }
  to{
    transform:translate(-30px,30px) scale(1.1);
  }
}

@keyframes buttonSweep{
  0%,20%{
    left:-100%;
  }
  48%,100%{
    left:140%;
  }
}

@keyframes securityPulse{
  0%,100%{
    opacity:.35;
  }
  50%{
    opacity:1;
  }
}

@keyframes loadingLogo{
  0%,100%{
    opacity:.55;
    filter:blur(.5px);
  }
  50%{
    opacity:1;
    filter:blur(0);
  }
}

@keyframes loadingSpin{
  to{
    transform:rotate(360deg);
  }
}

@media(max-width:1100px){
  .ven-main{
    grid-template-columns:minmax(0,1fr) minmax(330px,.72fr);
    padding-left:25px;
    padding-right:25px;
  }

  .ven-character-wrap{
    width:min(54vw,570px);
  }

  .ven-character-stage{
    min-height:580px;
  }

  .ven-ice-ring{
    width:390px;
    height:390px;
  }

  .ven-phoenix-aura{
    transform:scale(.78);
    right:-5%;
  }

  .ven-dragon-aura{
    transform:scale(.78);
    left:-7%;
  }
}

@media(max-width:820px){
  body{
    overflow-y:auto;
  }

  .ven-page{
    min-height:100svh;
  }

  .ven-header{
    padding:18px 18px;
  }

  .ven-logo-mark{
    width:42px;
    height:42px;
  }

  .ven-logo-text strong{
    font-size:18px;
  }

  .ven-logo-text small{
    font-size:7px;
  }

  .ven-status{
    padding:7px 10px;
    font-size:7px;
  }

  .ven-main{
    display:flex;
    flex-direction:column;
    min-height:auto;
    padding:0 15px 20px;
  }

  .ven-character-stage{
    width:100%;
    height:58svh;
    min-height:400px;
    max-height:590px;
  }

  .ven-character-wrap{
    width:min(82vw,470px);
    height:56svh;
    min-height:390px;
    max-height:570px;
  }

  .ven-ice-ring{
    width:330px;
    height:330px;
  }

  .ven-orbit-one{
    width:430px;
    height:170px;
  }

  .ven-orbit-two{
    width:360px;
    height:145px;
  }

  .ven-orbit-three{
    width:280px;
    height:115px;
  }

  .ven-phoenix-aura{
    right:-14%;
    top:14%;
    transform:scale(.62);
  }

  .ven-dragon-aura{
    left:-15%;
    bottom:4%;
    transform:scale(.62);
  }

  .ven-scene-label{
    left:4%;
    bottom:2%;
  }

  .ven-auth-area{
    width:100%;
    padding:0 0 10px;
  }

  .auth-panel{
    width:100%;
    padding:25px 20px;
    border-radius:23px;
  }

  .dashboard-panel{
    width:100%;
    padding:25px 20px;
    border-radius:23px;
  }

  .dashboard-grid{
    grid-template-columns:1fr;
  }
}

@media(max-width:520px){
  .ven-header{
    padding:14px 13px;
  }

  .ven-logo{
    gap:9px;
  }

  .ven-logo-mark{
    width:36px;
    height:36px;
  }

  .ven-logo-mark span{
    font-size:15px;
  }

  .ven-logo-text strong{
    font-size:15px;
    letter-spacing:4px;
  }

  .ven-logo-text small{
    margin-top:4px;
    font-size:6px;
    letter-spacing:2px;
  }

  .ven-status{
    gap:5px;
    padding:6px 8px;
    font-size:6px;
    letter-spacing:1.4px;
  }

  .ven-status-dot{
    width:5px;
    height:5px;
  }

  .ven-character-stage{
    height:55svh;
    min-height:350px;
  }

  .ven-character-wrap{
    width:92vw;
    height:52svh;
    min-height:350px;
  }

  .ven-ice-ring{
    width:270px;
    height:270px;
  }

  .ven-orbit-one{
    width:330px;
    height:130px;
  }

  .ven-orbit-two{
    width:290px;
    height:110px;
  }

  .ven-orbit-three{
    width:220px;
    height:90px;
  }

  .ven-phoenix-aura{
    right:-34%;
    top:9%;
    transform:scale(.48);
  }

  .ven-dragon-aura{
    left:-30%;
    bottom:2%;
    transform:scale(.48);
  }

  .auth-panel{
    padding:22px 16px;
  }

  .auth-heading{
    gap:11px;
    margin-bottom:22px;
  }

  .auth-mini-logo{
    width:42px;
    height:42px;
    border-radius:12px;
    font-size:11px;
  }

  .auth-heading h1{
    font-size:22px;
  }

  .auth-heading p{
    font-size:10px;
  }

  .input-wrap,
  .input-wrap input{
    min-height:49px;
    height:49px;
  }

  .auth-submit{
    min-height:51px;
  }

  .ven-footer{
    padding-bottom:14px;
    font-size:6px;
  }
}

@media(prefers-reduced-motion:reduce){
  *,
  *::before,
  *::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
    scroll-behavior:auto !important;
    transition-duration:.01ms !important;
  }
}
`;
