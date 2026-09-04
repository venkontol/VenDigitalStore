import router from "./src/router.js";

const APP_NAME = "VenDigitalStore";

const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#05070d">
<meta name="description" content="VenDigitalStore — Digital Marketplace">
<title>VenDigitalStore</title>
<style>
:root{
  --bg:#05070d;
  --bg2:#080c15;
  --panel:rgba(12,17,29,.78);
  --panel2:rgba(17,24,39,.82);
  --line:rgba(255,255,255,.09);
  --text:#f5f7fb;
  --muted:#8d98aa;
  --primary:#7c5cff;
  --primary2:#00d4ff;
  --success:#25d695;
  --danger:#ff5268;
  --warning:#ffc857;
  --shadow:0 25px 80px rgba(0,0,0,.42);
}

*{
  box-sizing:border-box;
  margin:0;
  padding:0;
}

html{
  scroll-behavior:smooth;
}

body{
  min-height:100vh;
  background:
    radial-gradient(circle at 15% 10%,rgba(124,92,255,.16),transparent 30%),
    radial-gradient(circle at 85% 20%,rgba(0,212,255,.10),transparent 28%),
    linear-gradient(145deg,var(--bg),var(--bg2));
  color:var(--text);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  overflow-x:hidden;
}

body:before{
  content:"";
  position:fixed;
  inset:0;
  pointer-events:none;
  background-image:
    linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);
  background-size:42px 42px;
  mask-image:linear-gradient(to bottom,black,transparent 90%);
}

a{
  color:inherit;
  text-decoration:none;
}

button,
input{
  font:inherit;
}

button{
  cursor:pointer;
}

.app{
  min-height:100vh;
  position:relative;
  z-index:1;
}

.nav{
  position:sticky;
  top:0;
  z-index:50;
  height:72px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 5%;
  border-bottom:1px solid var(--line);
  background:rgba(5,7,13,.72);
  backdrop-filter:blur(18px);
}

.logo{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:18px;
  font-weight:800;
  letter-spacing:-.4px;
}

.logo-mark{
  width:34px;
  height:34px;
  border-radius:11px;
  display:grid;
  place-items:center;
  background:linear-gradient(135deg,var(--primary),var(--primary2));
  box-shadow:0 8px 30px rgba(124,92,255,.28);
  font-size:13px;
  color:white;
}

.nav-links{
  display:flex;
  align-items:center;
  gap:7px;
}

.nav-links a,
.nav-links button{
  border:0;
  background:transparent;
  color:#aeb8c9;
  padding:9px 13px;
  border-radius:10px;
  transition:.2s;
}

.nav-links a:hover,
.nav-links button:hover{
  color:white;
  background:rgba(255,255,255,.055);
}

.container{
  width:min(1160px,90%);
  margin:auto;
}

.hero{
  min-height:calc(100vh - 72px);
  display:grid;
  place-items:center;
  padding:80px 0;
}

.hero-grid{
  display:grid;
  grid-template-columns:1.15fr .85fr;
  gap:70px;
  align-items:center;
}

.badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  border:1px solid rgba(124,92,255,.3);
  background:rgba(124,92,255,.08);
  color:#c9c0ff;
  padding:8px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:700;
  margin-bottom:22px;
}

.dot{
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--success);
  box-shadow:0 0 15px var(--success);
}

h1{
  font-size:clamp(44px,7vw,78px);
  line-height:.98;
  letter-spacing:-4px;
  max-width:780px;
}

.gradient{
  background:linear-gradient(110deg,#fff 10%,#b9b1ff 45%,#5ce6ff 90%);
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.hero p{
  margin-top:25px;
  max-width:620px;
  color:var(--muted);
  line-height:1.75;
  font-size:16px;
}

.actions{
  display:flex;
  gap:12px;
  flex-wrap:wrap;
  margin-top:30px;
}

.btn{
  border:1px solid var(--line);
  border-radius:13px;
  padding:13px 18px;
  color:white;
  background:rgba(255,255,255,.045);
  transition:.2s;
  font-weight:700;
}

.btn:hover{
  transform:translateY(-2px);
  border-color:rgba(255,255,255,.18);
}

.btn-primary{
  border:0;
  background:linear-gradient(135deg,var(--primary),#5c8dff);
  box-shadow:0 14px 40px rgba(124,92,255,.22);
}

.btn-danger{
  background:rgba(255,82,104,.08);
  border-color:rgba(255,82,104,.2);
  color:#ff8090;
}

.visual{
  position:relative;
  min-height:470px;
  display:grid;
  place-items:center;
}

.orbit{
  width:360px;
  height:360px;
  border-radius:50%;
  border:1px solid rgba(124,92,255,.22);
  box-shadow:
    0 0 90px rgba(124,92,255,.10),
    inset 0 0 80px rgba(0,212,255,.035);
  position:relative;
}

.orbit:before,
.orbit:after{
  content:"";
  position:absolute;
  border-radius:50%;
  border:1px solid rgba(0,212,255,.12);
}

.orbit:before{
  inset:35px;
}

.orbit:after{
  inset:75px;
}

.center-card{
  position:absolute;
  width:210px;
  min-height:180px;
  border:1px solid var(--line);
  border-radius:25px;
  background:linear-gradient(145deg,rgba(20,27,45,.94),rgba(8,12,21,.96));
  box-shadow:var(--shadow);
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  gap:10px;
}

.center-card strong{
  font-size:24px;
}

.center-card span{
  color:var(--muted);
  font-size:12px;
}

.float{
  position:absolute;
  padding:12px 15px;
  border:1px solid var(--line);
  border-radius:14px;
  background:rgba(13,19,32,.85);
  backdrop-filter:blur(12px);
  box-shadow:var(--shadow);
  font-size:12px;
  color:#c7d0df;
}

.float.a{
  top:55px;
  left:15px;
}

.float.b{
  right:0;
  top:140px;
}

.float.c{
  left:30px;
  bottom:65px;
}

.section{
  padding:100px 0;
}

.section-title{
  font-size:36px;
  letter-spacing:-1.5px;
  margin-bottom:12px;
}

.section-sub{
  color:var(--muted);
  line-height:1.7;
  max-width:650px;
  margin-bottom:35px;
}

.cards{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:16px;
}

.card{
  padding:25px;
  border:1px solid var(--line);
  border-radius:22px;
  background:var(--panel);
  box-shadow:0 15px 50px rgba(0,0,0,.18);
}

.card h3{
  margin-bottom:9px;
  font-size:18px;
}

.card p{
  color:var(--muted);
  line-height:1.65;
  font-size:14px;
}

.icon-box{
  width:42px;
  height:42px;
  border-radius:13px;
  display:grid;
  place-items:center;
  margin-bottom:18px;
  background:rgba(124,92,255,.12);
  border:1px solid rgba(124,92,255,.18);
  color:#bcb3ff;
  font-size:13px;
  font-weight:800;
}

.auth-page{
  min-height:calc(100vh - 72px);
  display:grid;
  place-items:center;
  padding:50px 0;
}

.auth-box{
  width:min(450px,100%);
  border:1px solid var(--line);
  border-radius:26px;
  background:linear-gradient(145deg,rgba(16,22,37,.9),rgba(7,10,18,.92));
  box-shadow:var(--shadow);
  padding:32px;
}

.auth-head{
  margin-bottom:27px;
}

.auth-head h1{
  font-size:31px;
  letter-spacing:-1.5px;
}

.auth-head p{
  color:var(--muted);
  margin-top:9px;
  line-height:1.6;
  font-size:14px;
}

.form-group{
  margin-bottom:16px;
}

.form-group label{
  display:block;
  font-size:13px;
  color:#b7c0ce;
  margin-bottom:8px;
}

.input{
  width:100%;
  border:1px solid var(--line);
  border-radius:12px;
  background:rgba(255,255,255,.035);
  color:white;
  outline:0;
  padding:13px 14px;
  transition:.2s;
}

.input:focus{
  border-color:rgba(124,92,255,.65);
  box-shadow:0 0 0 4px rgba(124,92,255,.08);
}

.auth-box .btn{
  width:100%;
  margin-top:5px;
}

.auth-foot{
  margin-top:20px;
  text-align:center;
  color:var(--muted);
  font-size:13px;
}

.auth-foot a{
  color:#bdb4ff;
  font-weight:700;
}

.alert{
  padding:12px 14px;
  border-radius:12px;
  margin-bottom:16px;
  font-size:13px;
  line-height:1.5;
  display:none;
}

.alert.show{
  display:block;
}

.alert.error{
  color:#ff8797;
  border:1px solid rgba(255,82,104,.2);
  background:rgba(255,82,104,.07);
}

.alert.success{
  color:#62e7b3;
  border:1px solid rgba(37,214,149,.2);
  background:rgba(37,214,149,.06);
}

.dashboard{
  padding:45px 0 90px;
}

.dash-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:20px;
  margin-bottom:25px;
}

.dash-head h1{
  font-size:38px;
  letter-spacing:-2px;
}

.dash-head p{
  color:var(--muted);
  margin-top:7px;
}

.balance-card{
  border:1px solid rgba(124,92,255,.22);
  border-radius:24px;
  padding:28px;
  background:
    radial-gradient(circle at 80% 20%,rgba(0,212,255,.10),transparent 30%),
    linear-gradient(135deg,rgba(124,92,255,.13),rgba(12,17,29,.88));
  margin-bottom:18px;
}

.balance-label{
  color:#9da8b9;
  font-size:13px;
}

.balance-value{
  margin-top:8px;
  font-size:38px;
  font-weight:850;
  letter-spacing:-1.5px;
}

.grid-2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:18px;
}

.panel{
  border:1px solid var(--line);
  border-radius:22px;
  background:var(--panel);
  padding:24px;
}

.panel h2{
  font-size:19px;
  margin-bottom:18px;
}

.transaction{
  display:flex;
  justify-content:space-between;
  gap:15px;
  padding:15px 0;
  border-bottom:1px solid var(--line);
}

.transaction:last-child{
  border-bottom:0;
}

.tx-left strong{
  display:block;
  font-size:13px;
}

.tx-left span{
  color:var(--muted);
  font-size:11px;
  display:block;
  margin-top:5px;
}

.tx-amount{
  white-space:nowrap;
  font-size:13px;
  font-weight:800;
}

.deposit-box{
  max-width:620px;
  margin:35px auto 80px;
}

.deposit-box h1{
  font-size:40px;
  letter-spacing:-2px;
}

.deposit-box > p{
  color:var(--muted);
  line-height:1.7;
  margin:10px 0 25px;
}

.qr-card{
  margin-top:20px;
  padding:22px;
  border:1px solid var(--line);
  border-radius:22px;
  background:var(--panel);
  text-align:center;
}

.qr-card img{
  display:block;
  width:min(330px,100%);
  aspect-ratio:1;
  object-fit:contain;
  margin:15px auto 20px;
  background:white;
  border-radius:12px;
  padding:8px;
}

.code{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:125px;
  padding:12px 18px;
  border-radius:12px;
  border:1px dashed rgba(124,92,255,.5);
  background:rgba(124,92,255,.08);
  color:#d8d2ff;
  font-size:22px;
  font-weight:900;
  letter-spacing:4px;
}

.status{
  display:inline-flex;
  padding:6px 9px;
  border-radius:999px;
  font-size:11px;
  font-weight:800;
}

.status.pending{
  background:rgba(255,200,87,.08);
  color:#ffd56e;
}

.status.paid{
  background:rgba(37,214,149,.08);
  color:#64e6b3;
}

.status.expired{
  background:rgba(255,82,104,.08);
  color:#ff8291;
}

.loading{
  opacity:.55;
  pointer-events:none;
}

.empty{
  color:var(--muted);
  font-size:13px;
  padding:20px 0;
  text-align:center;
}

.footer{
  border-top:1px solid var(--line);
  padding:30px 0;
  color:#6f7989;
  font-size:12px;
  text-align:center;
}

@media(max-width:850px){
  .hero-grid{
    grid-template-columns:1fr;
    gap:35px;
  }

  .visual{
    min-height:360px;
  }

  .orbit{
    width:300px;
    height:300px;
  }

  .cards{
    grid-template-columns:1fr;
  }

  .grid-2{
    grid-template-columns:1fr;
  }

  .dash-head{
    align-items:flex-start;
    flex-direction:column;
  }

  .nav{
    padding:0 5%;
  }

  .nav-links a{
    display:none;
  }
}

@media(max-width:520px){
  h1{
    letter-spacing:-2.5px;
  }

  .auth-box{
    padding:24px;
  }

  .container{
    width:92%;
  }

  .orbit{
    width:260px;
    height:260px;
  }

  .center-card{
    width:170px;
    min-height:145px;
  }

  .float{
    font-size:10px;
    padding:9px 11px;
  }

  .float.a{
    left:0;
  }

  .float.b{
    right:0;
  }

  .float.c{
    left:0;
  }
}
</style>
</head>
<body>
<div id="app" class="app"></div>

<script>
const API = "/api";

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function money(value){
  return new Intl.NumberFormat("id-ID",{
    style:"currency",
    currency:"IDR",
    maximumFractionDigits:0
  }).format(Number(value || 0));
}

function formatDate(value){
  if(!value) return "-";

  try{
    return new Intl.DateTimeFormat("id-ID",{
      dateStyle:"medium",
      timeStyle:"short"
    }).format(new Date(value));
  }catch{
    return value;
  }
}

async function api(path,options={}){
  const response = await fetch(API + path,{
    credentials:"include",
    headers:{
      "Content-Type":"application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = null;

  try{
    data = await response.json();
  }catch{}

  if(!response.ok){
    const error = new Error(
      data?.error ||
      "Permintaan gagal."
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function nav(active=""){
  return \`
    <header class="nav">
      <a class="logo" href="/">
        <span class="logo-mark">VD</span>
        <span>VenDigitalStore</span>
      </a>

      <nav class="nav-links">
        <a href="/">Home</a>
        <a href="/deposit">Deposit</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/login">Login</a>
      </nav>
    </header>
  \`;
}

function footer(){
  return \`
    <footer class="footer">
      <div class="container">
        VenDigitalStore · Digital Marketplace
      </div>
    </footer>
  \`;
}

function layout(content){
  return nav() + content + footer();
}

function showAlert(id,message,type="error"){
  const el = document.getElementById(id);

  if(!el) return;

  el.textContent = message;
  el.className = "alert show " + type;
}

function clearAlert(id){
  const el = document.getElementById(id);

  if(!el) return;

  el.textContent = "";
  el.className = "alert";
}

function setButtonLoading(button,loading,text){
  if(!button) return;

  if(loading){
    button.dataset.originalText = button.textContent;
    button.textContent = text || "Memproses...";
    button.classList.add("loading");
    button.disabled = true;
  }else{
    button.textContent =
      button.dataset.originalText ||
      button.textContent;

    button.classList.remove("loading");
    button.disabled = false;
  }
}

function homePage(){
  return layout(\`
    <main>
      <section class="hero">
        <div class="container hero-grid">
          <div>
            <div class="badge">
              <span class="dot"></span>
              SYSTEM ONLINE
            </div>

            <h1>
              Semua kebutuhan
              <span class="gradient">digital</span>
              dalam satu tempat.
            </h1>

            <p>
              VenDigitalStore adalah marketplace digital
              dengan sistem akun, saldo, deposit QRIS,
              dan transaksi yang terintegrasi.
            </p>

            <div class="actions">
              <a class="btn btn-primary" href="/register">
                Buat Akun
              </a>

              <a class="btn" href="/login">
                Login
              </a>
            </div>
          </div>

          <div class="visual">
            <div class="orbit"></div>

            <div class="center-card">
              <strong>VD STORE</strong>
              <span>Digital Marketplace</span>
              <span class="status paid">ONLINE</span>
            </div>

            <div class="float a">
              Secure Account
            </div>

            <div class="float b">
              QRIS Deposit
            </div>

            <div class="float c">
              Wallet System
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <h2 class="section-title">
            Sistem yang terintegrasi
          </h2>

          <p class="section-sub">
            Mulai dari akun, saldo sampai deposit,
            semuanya berjalan melalui backend yang sama.
          </p>

          <div class="cards">
            <div class="card">
              <div class="icon-box">01</div>
              <h3>Akun Aman</h3>
              <p>
                Session berbasis cookie HttpOnly
                dan password disimpan menggunakan
                mekanisme hashing yang aman.
              </p>
            </div>

            <div class="card">
              <div class="icon-box">02</div>
              <h3>Wallet</h3>
              <p>
                Saldo dan riwayat transaksi tersimpan
                pada sistem wallet terpusat.
              </p>
            </div>

            <div class="card">
              <div class="icon-box">03</div>
              <h3>Deposit QRIS</h3>
              <p>
                Buat deposit, tampilkan QRIS,
                lalu kirim permintaan pengecekan pembayaran.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  \`);
}

function loginPage(){
  return \`
    <main class="auth-page">
      <div class="container">
        <div class="auth-box">
          <div class="auth-head">
            <h1>Selamat datang kembali</h1>
            <p>
              Login untuk mengakses wallet dan marketplace
              VenDigitalStore.
            </p>
          </div>

          <div id="loginAlert" class="alert"></div>

          <form id="loginForm">
            <div class="form-group">
              <label>Username</label>
              <input
                class="input"
                name="username"
                autocomplete="username"
                required
                maxlength="32"
              >
            </div>

            <div class="form-group">
              <label>Password</label>
              <input
                class="input"
                type="password"
                name="password"
                autocomplete="current-password"
                required
              >
            </div>

            <button class="btn btn-primary" type="submit">
              Login
            </button>
          </form>

          <div class="auth-foot">
            Belum punya akun?
            <a href="/register">Daftar sekarang</a>
          </div>
        </div>
      </div>
    </main>
  \`;
}

function registerPage(){
  return \`
    <main class="auth-page">
      <div class="container">
        <div class="auth-box">
          <div class="auth-head">
            <h1>Buat akun</h1>
            <p>
              Buat akun VenDigitalStore untuk mulai menggunakan
              wallet dan layanan digital.
            </p>
          </div>

          <div id="registerAlert" class="alert"></div>

          <form id="registerForm">
            <div class="form-group">
              <label>Nama depan</label>
              <input
                class="input"
                name="first_name"
                autocomplete="given-name"
                required
                maxlength="80"
              >
            </div>

            <div class="form-group">
              <label>Username</label>
              <input
                class="input"
                name="username"
                autocomplete="username"
                required
                maxlength="32"
              >
            </div>

            <div class="form-group">
              <label>Password</label>
              <input
                class="input"
                type="password"
                name="password"
                autocomplete="new-password"
                required
              >
            </div>

            <button class="btn btn-primary" type="submit">
              Buat Akun
            </button>
          </form>

          <div class="auth-foot">
            Sudah punya akun?
            <a href="/login">Login</a>
          </div>
        </div>
      </div>
    </main>
  \`;
}

async function dashboardPage(){
  const me = await api("/auth/me");

  if(!me?.authenticated){
    location.href = "/login";
    return "";
  }

  return layout(\`
    <main class="dashboard">
      <div class="container">
        <div class="dash-head">
          <div>
            <h1>
              Halo, \${escapeHtml(me.user.first_name || me.user.username)}
            </h1>

            <p>
              Kelola saldo dan transaksi kamu di sini.
            </p>
          </div>

          <button id="logoutButton" class="btn btn-danger">
            Logout
          </button>
        </div>

        <div class="balance-card">
          <div class="balance-label">
            Saldo saat ini
          </div>

          <div id="balanceValue" class="balance-value">
            Memuat...
          </div>

          <div class="actions">
            <a class="btn btn-primary" href="/deposit">
              Deposit Saldo
            </a>

            <button id="refreshWallet" class="btn">
              Refresh
            </button>
          </div>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h2>Transaksi Terbaru</h2>
            <div id="transactions">
              <div class="empty">Memuat transaksi...</div>
            </div>
          </div>

          <div class="panel">
            <h2>Status Akun</h2>

            <div class="transaction">
              <div class="tx-left">
                <strong>Username</strong>
                <span>Akun aktif</span>
              </div>
              <div class="tx-amount">
                \${escapeHtml(me.user.username)}
              </div>
            </div>

            <div class="transaction">
              <div class="tx-left">
                <strong>Status</strong>
                <span>Account status</span>
              </div>
              <div class="tx-amount">
                <span class="status paid">
                  \${escapeHtml(me.user.status || "ACTIVE")}
                </span>
              </div>
            </div>

            <div class="transaction">
              <div class="tx-left">
                <strong>Session</strong>
                <span>Session aktif sampai</span>
              </div>
              <div class="tx-amount">
                \${formatDate(me.user.session_expires_at)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  \`);
}

function depositPage(){
  return layout(\`
    <main>
      <div class="container">
        <div class="deposit-box">
          <h1>Deposit Saldo</h1>

          <p>
            Masukkan nominal deposit. Sistem akan membuat
            kode pembayaran dan menampilkan QRIS yang aktif.
          </p>

          <div id="depositAlert" class="alert"></div>

          <div class="panel">
            <form id="depositForm">
              <div class="form-group">
                <label>Nominal Deposit</label>

                <input
                  class="input"
                  id="depositAmount"
                  name="amount"
                  type="number"
                  inputmode="numeric"
                  min="1000"
                  max="10000000"
                  step="1000"
                  placeholder="Contoh: 50000"
                  required
                >
              </div>

              <button
                id="depositButton"
                class="btn btn-primary"
                type="submit"
              >
                Buat Deposit
              </button>
            </form>
          </div>

          <div id="depositResult"></div>
        </div>
      </div>
    </main>
  \`);
}

function notFoundPage(){
  return layout(\`
    <main class="auth-page">
      <div class="container">
        <div class="auth-box">
          <div class="auth-head">
            <h1>Halaman tidak ditemukan</h1>
            <p>
              Halaman yang kamu cari tidak tersedia.
            </p>
          </div>

          <a class="btn btn-primary" href="/">
            Kembali ke Home
          </a>
        </div>
      </div>
    </main>
  \`);
}

async function render(){
  const path =
    location.pathname.replace(/\\/+$/,"") || "/";

  const app =
    document.getElementById("app");

  try{
    if(path === "/"){
      app.innerHTML = homePage();
      return;
    }

    if(path === "/login"){
      app.innerHTML =
        nav() +
        loginPage() +
        footer();

      bindLogin();
      return;
    }

    if(path === "/register"){
      app.innerHTML =
        nav() +
        registerPage() +
        footer();

      bindRegister();
      return;
    }

    if(path === "/dashboard"){
      app.innerHTML =
        await dashboardPage();

      bindDashboard();
      return;
    }

    if(path === "/deposit"){
      app.innerHTML =
        depositPage();

      bindDeposit();
      return;
    }

    app.innerHTML = notFoundPage();
  }catch(error){
    if(error?.status === 401){
      location.href = "/login";
      return;
    }

    app.innerHTML = layout(\`
      <main class="auth-page">
        <div class="container">
          <div class="auth-box">
            <div class="auth-head">
              <h1>Terjadi kesalahan</h1>
              <p>
                \${escapeHtml(error?.message || "Gagal memuat halaman.")}
              </p>
            </div>

            <button
              class="btn btn-primary"
              onclick="location.reload()"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </main>
    \`);
  }
}

function bindLogin(){
  const form =
    document.getElementById("loginForm");

  if(!form) return;

  form.addEventListener("submit",async(event)=>{
    event.preventDefault();

    clearAlert("loginAlert");

    const button =
      form.querySelector("button[type=submit]");

    const formData =
      new FormData(form);

    const username =
      String(formData.get("username") || "").trim();

    const password =
      String(formData.get("password") || "");

    setButtonLoading(
      button,
      true,
      "Login..."
    );

    try{
      await api("/auth/login",{
        method:"POST",
        body:JSON.stringify({
          username,
          password
        })
      });

      location.href = "/dashboard";
    }catch(error){
      showAlert(
        "loginAlert",
        error?.message || "Login gagal.",
        "error"
      );
    }finally{
      setButtonLoading(
        button,
        false
      );
    }
  });
}

function bindRegister(){
  const form =
    document.getElementById("registerForm");

  if(!form) return;

  form.addEventListener("submit",async(event)=>{
    event.preventDefault();

    clearAlert("registerAlert");

    const button =
      form.querySelector("button[type=submit]");

    const formData =
      new FormData(form);

    const first_name =
      String(formData.get("first_name") || "").trim();

    const username =
      String(formData.get("username") || "").trim();

    const password =
      String(formData.get("password") || "");

    setButtonLoading(
      button,
      true,
      "Membuat akun..."
    );

    try{
      await api("/auth/register",{
        method:"POST",
        body:JSON.stringify({
          first_name,
          username,
          password
        })
      });

      location.href = "/dashboard";
    }catch(error){
      showAlert(
        "registerAlert",
        error?.message || "Pendaftaran gagal.",
        "error"
      );
    }finally{
      setButtonLoading(
        button,
        false
      );
    }
  });
}

async function loadWallet(){
  const balance =
    document.getElementById("balanceValue");

  const transactions =
    document.getElementById("transactions");

  try{
    const data =
      await api("/wallet/overview");

    if(balance){
      balance.textContent =
        money(data.balance);
    }

    if(transactions){
      const rows =
        Array.isArray(data.transactions)
          ? data.transactions
          : [];

      if(!rows.length){
        transactions.innerHTML =
          '<div class="empty">Belum ada transaksi.</div>';
      }else{
        transactions.innerHTML =
          rows.map(row=>{
            const amount =
              Number(row.amount || 0);

            const positive =
              amount >= 0;

            return \`
              <div class="transaction">
                <div class="tx-left">
                  <strong>
                    \${escapeHtml(row.description || row.type || "Transaksi")}
                  </strong>

                  <span>
                    \${formatDate(row.created_at)}
                  </span>
                </div>

                <div
                  class="tx-amount"
                  style="color:\${
                    positive
                      ? "#62e6b1"
                      : "#ff8291"
                  }"
                >
                  \${positive ? "+" : ""}\${money(amount)}
                </div>
              </div>
            \`;
          }).join("");
      }
    }
  }catch(error){
    if(error?.status === 401){
      location.href = "/login";
      return;
    }

    if(transactions){
      transactions.innerHTML =
        '<div class="empty">Gagal memuat transaksi.</div>';
    }
  }
}

function bindDashboard(){
  const logout =
    document.getElementById("logoutButton");

  const refresh =
    document.getElementById("refreshWallet");

  if(logout){
    logout.addEventListener("click",async()=>{
      setButtonLoading(
        logout,
        true,
        "Logout..."
      );

      try{
        await api("/auth/logout",{
          method:"POST"
        });
      }finally{
        location.href = "/login";
      }
    });
  }

  if(refresh){
    refresh.addEventListener(
      "click",
      loadWallet
    );
  }

  loadWallet();
}

function renderDepositResult(data){
  const result =
    document.getElementById("depositResult");

  if(!result) return;

  const status =
    String(data.status || "PENDING")
      .toUpperCase();

  const statusClass =
    status === "PAID"
      ? "paid"
      : status === "EXPIRED"
        ? "expired"
        : "pending";

  const qrUrl =
    data.qr_url ||
    "/api/deposit/qr";

  result.innerHTML = \`
    <div class="qr-card">
      <div>
        <span class="status \${statusClass}">
          \${escapeHtml(status)}
        </span>
      </div>

      <img
        src="\${escapeHtml(qrUrl)}"
        alt="QRIS"
        id="depositQr"
      >

      <div>
        <div style="color:#8d98aa;font-size:12px;margin-bottom:8px">
          Kode pembayaran
        </div>

        <div class="code">
          \${escapeHtml(data.reference_id || data.code || "")}
        </div>
      </div>

      <div style="margin-top:18px;color:#dbe1eb;font-size:15px">
        \${money(data.amount)}
      </div>

      <div style="margin-top:8px;color:#8d98aa;font-size:12px">
        Berlaku sampai \${formatDate(data.expired_at)}
      </div>

      <div class="actions" style="justify-content:center">
        <a
          class="btn"
          href="\${escapeHtml(qrUrl)}"
          target="_blank"
          rel="noopener"
        >
          Buka QRIS
        </a>

        <button
          id="checkPaymentButton"
          class="btn btn-primary"
        >
          Cek Pembayaran
        </button>
      </div>

      <div
        id="paymentStatus"
        style="margin-top:14px;color:#8d98aa;font-size:12px"
      >
        Setelah melakukan pembayaran,
        tekan tombol Cek Pembayaran.
      </div>
    </div>
  \`;

  const checkButton =
    document.getElementById(
      "checkPaymentButton"
    );

  if(checkButton){
    checkButton.addEventListener(
      "click",
      ()=>checkPayment(
        data.code ||
        data.reference_id
      )
    );
  }
}

async function checkPayment(code){
  const button =
    document.getElementById(
      "checkPaymentButton"
    );

  const status =
    document.getElementById(
      "paymentStatus"
    );

  if(!code) return;

  setButtonLoading(
    button,
    true,
    "Mengecek..."
  );

  if(status){
    status.textContent =
      "Permintaan pengecekan sedang dikirim...";
  }

  try{
    const data =
      await api("/deposit/check",{
        method:"POST",
        body:JSON.stringify({
          code
        })
      });

    if(status){
      status.textContent =
        data.message ||
        "Permintaan pengecekan berhasil dikirim.";
    }

    await pollDeposit(code);
  }catch(error){
    if(status){
      status.textContent =
        error?.message ||
        "Gagal mengecek pembayaran.";
    }
  }finally{
    setButtonLoading(
      button,
      false
    );
  }
}

async function pollDeposit(code){
  const status =
    document.getElementById(
      "paymentStatus"
    );

  const started =
    Date.now();

  while(Date.now() - started < 120000){
    try{
      const data =
        await api(
          "/deposit?code=" +
          encodeURIComponent(code)
        );

      const current =
        String(data.status || "")
          .toUpperCase();

      if(current === "PAID"){
        if(status){
          status.textContent =
            "Pembayaran berhasil dikonfirmasi. Saldo sudah masuk.";
          status.style.color =
            "#62e6b1";
        }

        return;
      }

      if(current === "EXPIRED"){
        if(status){
          status.textContent =
            "Deposit sudah expired.";
          status.style.color =
            "#ff8291";
        }

        return;
      }
    }catch{}

    await new Promise(
      resolve=>setTimeout(resolve,5000)
    );
  }

  if(status){
    status.textContent =
      "Belum ada konfirmasi. Kamu bisa cek kembali nanti.";
  }
}

function bindDeposit(){
  const form =
    document.getElementById("depositForm");

  if(!form) return;

  form.addEventListener(
    "submit",
    async(event)=>{
      event.preventDefault();

      clearAlert("depositAlert");

      const button =
        document.getElementById(
          "depositButton"
        );

      const amountInput =
        document.getElementById(
          "depositAmount"
        );

      const amount =
        Number(amountInput?.value || 0);

      setButtonLoading(
        button,
        true,
        "Membuat deposit..."
      );

      try{
        const data =
          await api("/deposit",{
            method:"POST",
            body:JSON.stringify({
              amount
            })
          });

        renderDepositResult(data);
      }catch(error){
        if(error?.status === 401){
          location.href = "/login";
          return;
        }

        showAlert(
          "depositAlert",
          error?.message ||
          "Gagal membuat deposit.",
          "error"
        );
      }finally{
        setButtonLoading(
          button,
          false
        );
      }
    }
  );

  api("/auth/me")
    .then(data=>{
      if(!data?.authenticated){
        location.href = "/login";
      }
    })
    .catch(()=>{
      location.href = "/login";
    });
}

document.addEventListener(
  "click",
  event=>{
    const link =
      event.target.closest(
        'a[href^="/"]'
      );

    if(!link) return;

    const href =
      link.getAttribute("href");

    if(
      !href ||
      href.startsWith("/api") ||
      link.target === "_blank"
    ){
      return;
    }

    event.preventDefault();

    history.pushState(
      {},
      "",
      href
    );

    render();
  }
);

window.addEventListener(
  "popstate",
  render
);

render();
</script>
</body>
</html>`;

function htmlResponse() {
  return new Response(HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function securityHeaders(response) {
  const headers = new Headers(response.headers);

  headers.set(
    "X-Content-Type-Options",
    "nosniff"
  );

  headers.set(
    "X-Frame-Options",
    "DENY"
  );

  headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'unsafe-inline' 'self'",
      "script-src 'unsafe-inline' 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ")
  );

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}

function isApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function isFrontendPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/dashboard" ||
    pathname === "/deposit"
  );
}

export default {
  async fetch(request, env, ctx) {
    const url =
      new URL(request.url);

    const pathname =
      url.pathname.replace(
        /\/+$/,
        ""
      ) || "/";

    if(
      request.method === "OPTIONS" &&
      isApiPath(pathname)
    ){
      const response =
        await router(
          request,
          env,
          ctx
        );

      return securityHeaders(
        response
      );
    }

    if(isApiPath(pathname)){
      const response =
        await router(
          request,
          env,
          ctx
        );

      return securityHeaders(
        response
      );
    }

    if(
      request.method === "GET" &&
      isFrontendPath(pathname)
    ){
      return securityHeaders(
        htmlResponse()
      );
    }

    if(
      request.method === "GET" &&
      !pathname.includes(".")
    ){
      return securityHeaders(
        htmlResponse()
      );
    }

    return new Response(
      "Not Found",
      {
        status:404,
        headers:{
          "Content-Type":
            "text/plain; charset=utf-8",
          "Cache-Control":
            "no-store",
          "X-Content-Type-Options":
            "nosniff"
        }
      }
    );
  }
};
