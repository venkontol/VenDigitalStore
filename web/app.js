export const APP = `
(function () {
  "use strict";

  const API = "/api";

  function $(selector) {
    return document.querySelector(selector);
  }

  function \[ (selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  async function api(path, options) {
    options = options || {};
    const headers = new Headers(options.headers || {});

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(API + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
      credentials: "same-origin",
      cache: "no-store"
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) || "Permintaan gagal.";
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function showMessage(element, message, type) {
    if (!element) return;
    element.textContent = message || "";
    element.className = "auth-message";
    if (type) element.classList.add("is-" + type);
  }

  function setLoading(button, loading, normalText) {
    if (!button) return;
    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.textContent || normalText || "";
      button.textContent = "MEMPROSES...";
    } else {
      button.disabled = false;
      button.textContent = normalText || button.dataset.originalText || "LANJUT";
    }
  }

  function formatMoney(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(number);
  }

  function escapeText(value) {
    return String(value == null ? "" : value);
  }

  function redirect(path) {
    window.location.href = path;
  }

  async function getMe() {
    return api("/auth/me");
  }

  function updateUserUI(user) {
    if (!user) return; \]("[data-user-username]").forEach(function (el) {
      el.textContent = "@" + escapeText(user.username || "");
    });

    \[ ("[data-user-name]").forEach(function (el) {
      el.textContent = escapeText(user.first_name || user.username || "User");
    }); \]("[data-user-balance]").forEach(function (el) {
      el.textContent = formatMoney(user.balance);
    });

    const welcome = $("#dashboardWelcome");
    if (welcome) {
      welcome.textContent = "Welcome back, " + escapeText(user.first_name || user.username || "User");
    }
  }

  async function handleExistingSession() {
    const path = window.location.pathname;

    try {
      const data = await getMe();
      if (!data || !data.user) return;

      if (path === "/login" || path === "/register" || path === "/") {
        redirect("/dashboard");
        return;
      }

      updateUserUI(data.user);
    } catch (_) {
      if (
        path === "/dashboard" ||
        path === "/deposit" ||
        path === "/marketplace" ||
        path === "/orders" ||
        path === "/account"
      ) {
        redirect("/login");
      }
    }
  }

  function setupPasswordToggles() {
    \[ ("[data-password-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        const target = button.getAttribute("data-password-toggle");
        const input = document.querySelector(target);
        if (!input) return;

        if (input.type === "password") {
          input.type = "text";
          button.textContent = "HIDE";
        } else {
          input.type = "password";
          button.textContent = "SHOW";
        }
      });
    });
  }

  function setupLogin() {
    const form = $("#loginForm");
    if (!form) return;

    const message = $("#loginMessage");
    const button = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage(message, "", "");

      const username = (form.querySelector("[name='username']") || {}).value.trim();
      const password = (form.querySelector("[name='password']") || {}).value;

      if (!username || !password) {
        showMessage(message, "Username dan password wajib diisi.", "error");
        return;
      }

      setLoading(button, true, "ACCESS SYSTEM");

      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: username, password: password })
        });

        if (data && data.user) updateUserUI(data.user);

        showMessage(message, "Login berhasil. Membuka dashboard...", "success");
        setTimeout(function () {
          redirect("/dashboard");
        }, 400);
      } catch (error) {
        showMessage(message, error.message || "Login gagal.", "error");
      } finally {
        setLoading(button, false, "ACCESS SYSTEM");
      }
    });
  }

  function setupRegister() {
    const form = $("#registerForm");
    if (!form) return;

    const message = $("#registerMessage");
    const button = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage(message, "", "");

      const firstName = (form.querySelector("[name='first_name']") || {}).value.trim();
      const username = (form.querySelector("[name='username']") || {}).value.trim();
      const password = (form.querySelector("[name='password']") || {}).value;
      const confirmPassword = (form.querySelector("[name='confirm_password']") || {}).value;

      if (!firstName) {
        showMessage(message, "Nama depan wajib diisi.", "error");
        return;
      }
      if (!username) {
        showMessage(message, "Username wajib diisi.", "error");
        return;
      }
      if (!password) {
        showMessage(message, "Password wajib diisi.", "error");
        return;
      }
      if (password.length < 8) {
        showMessage(message, "Password minimal 8 karakter.", "error");
        return;
      }
      if (password !== confirmPassword) {
        showMessage(message, "Konfirmasi password tidak sama.", "error");
        return;
      }

      setLoading(button, true, "CREATE ACCOUNT");

      try {
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            first_name: firstName,
            username: username,
            password: password
          })
        });

        if (data && data.user) updateUserUI(data.user);

        showMessage(message, "Akun berhasil dibuat. Membuka dashboard...", "success");
        setTimeout(function () {
          redirect("/dashboard");
        }, 400);
      } catch (error) {
        showMessage(message, error.message || "Gagal membuat akun.", "error");
      } finally {
        setLoading(button, false, "CREATE ACCOUNT");
      }
    });
  }

  function setupLogout() { \]("[data-action='logout']").forEach(function (button) {
      button.addEventListener("click", async function () {
        button.disabled = true;
        try {
          await api("/auth/logout", { method: "POST" });
        } catch (_) {}
        redirect("/login");
      });
    });
  }

  async function setupDashboard() {
    const dashboard = document.querySelector("[data-page='dashboard']");
    if (!dashboard) return;

    try {
      const data = await getMe();
      if (!data || !data.user) {
        redirect("/login");
        return;
      }
      updateUserUI(data.user);
    } catch (error) {
      redirect("/login");
    }

    const depositBtn = $("#depositButton");
    if (depositBtn) {
      depositBtn.addEventListener("click", function () {
        redirect("/deposit");
      });
    }
  }

  function setupNavigation() {
    $$("[data-nav]").forEach(function (element) {
      element.addEventListener("click", function () {
        const path = element.getAttribute("data-nav");
        if (path) redirect(path);
      });
    });
  }

  function setupDeposit() {
    const form = $("#depositForm");
    if (!form) return;

    const message = $("#depositMessage");
    const result = $("#depositResult");
    const button = form.querySelector("button[type='submit']");

    let pollTimer = null;

    function clearPoll() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function renderDeposit(deposit) {
      if (!result || !deposit) return;
      result.hidden = false;

      const ref = result.querySelector("[data-deposit-reference]");
      const amount = result.querySelector("[data-deposit-amount]");
      const status = result.querySelector("[data-deposit-status]");
      const expired = result.querySelector("[data-deposit-expired]");

      if (ref) ref.textContent = escapeText(deposit.reference_id || deposit.merchant_order_id || "-");
      if (amount) amount.textContent = formatMoney(deposit.amount);
      if (status) status.textContent = escapeText(deposit.status || "PENDING");
      if (expired) expired.textContent = escapeText(deposit.expired_at || "-");
    }

    async function pollDeposit(referenceId) {
      if (!referenceId) return;
      try {
        const data = await api("/deposit?reference_id=" + encodeURIComponent(referenceId));
        const deposit = data && (data.deposit || data.data || data);
        renderDeposit(deposit);

        const status = String(deposit && deposit.status ? deposit.status : "").toUpperCase();

        if (status === "PAID" || status === "SUCCESS" || status === "COMPLETED") {
          showMessage(message, "Pembayaran berhasil dikonfirmasi.", "success");
          clearPoll();
          setTimeout(function () {
            redirect("/dashboard");
          }, 900);
          return;
        }

        if (status === "EXPIRED" || status === "CANCELLED" || status === "FAILED") {
          showMessage(message, "Deposit " + status.toLowerCase() + ".", "error");
          clearPoll();
          return;
        }

        pollTimer = setTimeout(function () {
          pollDeposit(referenceId);
        }, 4000);
      } catch (_) {
        pollTimer = setTimeout(function () {
          pollDeposit(referenceId);
        }, 5000);
      }
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      showMessage(message, "", "");
      clearPoll();

      const amountInput = $("#depositAmount");
      const amount = amountInput ? Number(amountInput.value) : 0;

      if (!amount || amount < 1000) {
        showMessage(message, "Minimal deposit Rp 1.000", "error");
        return;
      }

      setLoading(button, true, "CREATE DEPOSIT");

      try {
        const data = await api("/deposit", {
          method: "POST",
          body: JSON.stringify({ amount: amount })
        });

        const deposit = data && (data.deposit || data.data || data);
        renderDeposit(deposit);

        const refId = deposit && (deposit.reference_id || deposit.merchant_order_id);
        if (refId) pollDeposit(refId);

        showMessage(message, "Deposit dibuat. Silakan selesaikan pembayaran.", "success");
      } catch (error) {
        showMessage(message, error.message || "Gagal membuat deposit.", "error");
      } finally {
        setLoading(button, false, "CREATE DEPOSIT");
      }
    });
  }

  function setupSound() {
    const toggle = $("#soundToggle");
    const audio = $("#bgMusic");
    if (!toggle || !audio) return;

    let enabled = localStorage.getItem("ven_sound") === "1";

    function updateUI() {
      toggle.classList.toggle("is-on", enabled);
      const offIcon = toggle.querySelector(".icon-sound-off");
      const onIcon = toggle.querySelector(".icon-sound-on");
      if (offIcon) offIcon.style.display = enabled ? "none" : "block";
      if (onIcon) onIcon.style.display = enabled ? "block" : "none";
      toggle.title = enabled ? "Sound On" : "Sound Off";
    }

    updateUI();

    if (enabled) {
      audio.volume = 0.35;
      audio.play().catch(function () {});
    }

    toggle.addEventListener("click", function () {
      enabled = !enabled;
      localStorage.setItem("ven_sound", enabled ? "1" : "0");
      updateUI();

      if (enabled) {
        audio.volume = 0.35;
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
    });
  }

  function setupSidebar() {
    const toggle = $("#menuToggle");
    const sidebar = $("#sidebar");
    const overlay = $("#sidebarOverlay");
    const closeBtn = $("#sidebarClose");

    if (!sidebar) return;

    function open() {
      sidebar.classList.add("is-open");
      if (overlay) overlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    }

    function close() {
      sidebar.classList.remove("is-open");
      if (overlay) overlay.classList.remove("is-open");
      document.body.style.overflow = "";
    }

    if (toggle) toggle.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (overlay) overlay.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  function setupShowRegisterLogin() {
    const showReg = $("#showRegister");
    const showLog = $("#showLogin");

    if (showReg) {
      showReg.addEventListener("click", function () {
        redirect("/register");
      });
    }

    if (showLog) {
      showLog.addEventListener("click", function () {
        redirect("/login");
      });
    }
  }

  function boot() {
    setupPasswordToggles();
    setupLogin();
    setupRegister();
    setupLogout();
    setupNavigation();
    setupDeposit();
    setupDashboard();
    setupSound();
    setupSidebar();
    setupShowRegisterLogin();
    handleExistingSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`;
