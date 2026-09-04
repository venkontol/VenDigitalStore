export const APP = `

<script>
(function () {
  "use strict";

  const API = "/api";

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
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
        (data && (data.error || data.message)) ||
        "Permintaan gagal.";

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
    element.className = "ven-message";

    if (type) {
      element.classList.add("is-" + type);
    }
  }

  function setLoading(button, loading, normalText) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.dataset.originalText =
        button.textContent || normalText || "";
      button.textContent = "MEMPROSES...";
    } else {
      button.disabled = false;
      button.textContent =
        normalText ||
        button.dataset.originalText ||
        "LANJUT";
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

  async function handleExistingSession() {
    const path = window.location.pathname;

    try {
      const data = await getMe();

      if (!data || !data.user) {
        return;
      }

      if (
        path === "/login" ||
        path === "/register" ||
        path === "/"
      ) {
        redirect("/dashboard");
        return;
      }

      updateUserUI(data.user);
    } catch (_) {
      if (
        path === "/dashboard" ||
        path === "/deposit" ||
        path === "/products" ||
        path === "/marketplace" ||
        path === "/orders" ||
        path === "/account"
      ) {
        redirect("/login");
      }
    }
  }

  function updateUserUI(user) {
    if (!user) return;

    const usernameElements = $$("[data-user-username]");
    const nameElements = $$("[data-user-name]");
    const balanceElements = $$("[data-user-balance]");

    usernameElements.forEach(function (element) {
      element.textContent = "@" + escapeText(user.username || "");
    });

    nameElements.forEach(function (element) {
      element.textContent =
        escapeText(user.first_name || user.username || "User");
    });

    balanceElements.forEach(function (element) {
      element.textContent = formatMoney(user.balance);
    });
  }

  function setupPasswordToggles() {
    $$("[data-password-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        const targetSelector =
          button.getAttribute("data-password-toggle");

        const input = document.querySelector(targetSelector);

        if (!input) return;

        if (input.type === "password") {
          input.type = "text";
          button.textContent = "SEMBUNYIKAN";
        } else {
          input.type = "password";
          button.textContent = "LIHAT";
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

      const usernameInput = form.querySelector(
        "[name='username']"
      );

      const passwordInput = form.querySelector(
        "[name='password']"
      );

      const username =
        usernameInput ? usernameInput.value.trim() : "";

      const password =
        passwordInput ? passwordInput.value : "";

      if (!username || !password) {
        showMessage(
          message,
          "Username dan password wajib diisi.",
          "error"
        );
        return;
      }

      setLoading(button, true);

      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: username,
            password: password
          })
        });

        if (data && data.user) {
          updateUserUI(data.user);
        }

        showMessage(
          message,
          "Login berhasil. Membuka dashboard...",
          "success"
        );

        setTimeout(function () {
          redirect("/dashboard");
        }, 350);
      } catch (error) {
        showMessage(
          message,
          error.message || "Login gagal.",
          "error"
        );
      } finally {
        setLoading(button, false, "MASUK");
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

      const firstNameInput = form.querySelector(
        "[name='first_name']"
      );

      const usernameInput = form.querySelector(
        "[name='username']"
      );

      const passwordInput = form.querySelector(
        "[name='password']"
      );

      const confirmInput = form.querySelector(
        "[name='confirm_password']"
      );

      const firstName =
        firstNameInput ? firstNameInput.value.trim() : "";

      const username =
        usernameInput ? usernameInput.value.trim() : "";

      const password =
        passwordInput ? passwordInput.value : "";

      const confirmPassword =
        confirmInput ? confirmInput.value : "";

      if (!firstName) {
        showMessage(
          message,
          "Nama depan wajib diisi.",
          "error"
        );
        return;
      }

      if (!username) {
        showMessage(
          message,
          "Username wajib diisi.",
          "error"
        );
        return;
      }

      if (!password) {
        showMessage(
          message,
          "Password wajib diisi.",
          "error"
        );
        return;
      }

      if (password.length < 8) {
        showMessage(
          message,
          "Password minimal 8 karakter.",
          "error"
        );
        return;
      }

      if (password !== confirmPassword) {
        showMessage(
          message,
          "Konfirmasi password tidak sama.",
          "error"
        );
        return;
      }

      setLoading(button, true);

      try {
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            first_name: firstName,
            username: username,
            password: password
          })
        });

        if (data && data.user) {
          updateUserUI(data.user);
        }

        /*
         * Backend register langsung membuat session.
         * Jadi tidak perlu login ulang.
         */
        showMessage(
          message,
          "Akun berhasil dibuat. Membuka dashboard...",
          "success"
        );

        setTimeout(function () {
          redirect("/dashboard");
        }, 400);
      } catch (error) {
        showMessage(
          message,
          error.message || "Gagal membuat akun.",
          "error"
        );
      } finally {
        setLoading(button, false, "BUAT AKUN");
      }
    });
  }

  function setupLogout() {
    $$("[data-action='logout']").forEach(function (button) {
      button.addEventListener("click", async function () {
        button.disabled = true;

        try {
          await api("/auth/logout", {
            method: "POST"
          });
        } catch (_) {
          /*
           * Tetap arahkan ke login.
           * Session browser akan dibersihkan oleh backend
           * jika endpoint logout berhasil.
           */
        }

        redirect("/login");
      });
    });
  }

  async function setupDashboard() {
    const dashboard =
      document.querySelector("[data-page='dashboard']");

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
  }

  function setupNavigation() {
    $$("[data-nav]").forEach(function (element) {
      element.addEventListener("click", function () {
        const path = element.getAttribute("data-nav");

        if (path) {
          redirect(path);
        }
      });
    });
  }

  function setupDeposit() {
    const form = $("#depositForm");

    if (!form) return;

    const message = $("#depositMessage");
    const result = $("#depositResult");
    const button = form.querySelector("button[type='submit']");

    let currentReference = null;
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

      const reference =
        result.querySelector("[data-deposit-reference]");

      const amount =
        result.querySelector("[data-deposit-amount]");

      const status =
        result.querySelector("[data-deposit-status]");

      const expired =
        result.querySelector("[data-deposit-expired]");

      if (reference) {
        reference.textContent =
          escapeText(
            deposit.reference_id ||
            deposit.merchant_order_id ||
            "-"
          );
      }

      if (amount) {
        amount.textContent =
          formatMoney(deposit.amount);
      }

      if (status) {
        status.textContent =
          escapeText(deposit.status || "PENDING");
      }

      if (expired) {
        expired.textContent =
          escapeText(deposit.expired_at || "-");
      }
    }

    async function pollDeposit(referenceId) {
      if (!referenceId) return;

      try {
        const data = await api(
          "/deposit?reference_id=" +
          encodeURIComponent(referenceId)
        );

        const deposit =
          data && (data.deposit || data.data || data);

        renderDeposit(deposit);

        const status =
          String(
            deposit && deposit.status
              ? deposit.status
              : ""
          ).toUpperCase();

        if (
          status === "PAID" ||
          status === "SUCCESS" ||
          status === "COMPLETED"
        ) {
          showMessage(
            message,
            "Pembayaran berhasil dikonfirmasi.",
            "success"
          );

          clearPoll();

          setTimeout(function () {
            redirect("/dashboard");
          }, 900);

          return;
        }

        if (
          status === "EXPIRED" ||
          status === "CANCELLED" ||
          status === "FAILED"
        ) {
          showMessage(
            message,
            "Deposit berstatus " + status + ".",
            "error"
          );

          clearPoll();
          return;
        }

        pollTimer = setTimeout(function () {
          pollDeposit(referenceId);
        }, 10000);
      } catch (error) {
        /*
         * Jangan langsung menghentikan polling hanya karena
         * satu request gagal.
         */
        pollTimer = setTimeout(function () {
          pollDeposit(referenceId);
        }, 15000);
      }
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      clearPoll();

      showMessage(message, "", "");

      if (result) {
        result.hidden = true;
      }

      const amountInput = form.querySelector(
        "[name='amount']"
      );

      const amount = Number(
        amountInput ? amountInput.value : 0
      );

      if (!Number.isFinite(amount) || amount < 1000) {
        showMessage(
          message,
          "Minimal deposit Rp1.000.",
          "error"
        );
        return;
      }

      if (amount > 10000000) {
        showMessage(
          message,
          "Maksimal deposit Rp10.000.000.",
          "error"
        );
        return;
      }

      setLoading(button, true);

      try {
        const data = await api("/deposit", {
          method: "POST",
          body: JSON.stringify({
            amount: amount,
            payment_method: "QRIS"
          })
        });

        const deposit =
          data && (data.deposit || data.data || data);

        currentReference =
          deposit &&
          (
            deposit.reference_id ||
            deposit.merchant_order_id
          );

        renderDeposit(deposit);

        showMessage(
          message,
          "Deposit berhasil dibuat. Silakan selesaikan pembayaran lalu cek statusnya.",
          "success"
        );

        if (currentReference) {
          pollDeposit(currentReference);
        }
      } catch (error) {
        showMessage(
          message,
          error.message || "Gagal membuat deposit.",
          "error"
        );
      } finally {
        setLoading(button, false, "BUAT DEPOSIT");
      }
    });

    const manualCheck =
      document.querySelector("[data-check-deposit]");

    if (manualCheck) {
      manualCheck.addEventListener("click", function () {
        if (!currentReference) {
          showMessage(
            message,
            "Belum ada deposit yang sedang dicek.",
            "error"
          );
          return;
        }

        showMessage(
          message,
          "Memeriksa status pembayaran...",
          ""
        );

        pollDeposit(currentReference);
      });
    }
  }

  function createSnow() {
    const containers = [
      document.querySelector("#particles"),
      document.querySelector("#snowFront")
    ].filter(Boolean);

    if (!containers.length) return;

    containers.forEach(function (container) {
      if (container.dataset.generated === "1") {
        return;
      }

      container.dataset.generated = "1";

      const count =
        container.id === "snowFront" ? 55 : 85;

      for (let i = 0; i < count; i++) {
        const particle =
          document.createElement("span");

        particle.className =
          container.id === "snowFront"
            ? "ven-snow-particle"
            : "ven-particle";

        particle.style.left =
          Math.random() * 100 + "%";

        particle.style.setProperty(
          "--size",
          (Math.random() * 4 + 1) + "px"
        );

        particle.style.setProperty(
          "--duration",
          (Math.random() * 9 + 7) + "s"
        );

        particle.style.setProperty(
          "--delay",
          (Math.random() * -14) + "s"
        );

        particle.style.setProperty(
          "--opacity",
          (Math.random() * 0.65 + 0.2).toFixed(2)
        );

        container.appendChild(particle);
      }
    });
  }

  function setupParallax() {
    const page =
      document.querySelector(".ven-page");

    if (!page) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    function setTarget(clientX, clientY) {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;

      targetX =
        ((clientX / width) - 0.5) * 2;

      targetY =
        ((clientY / height) - 0.5) * 2;
    }

    window.addEventListener(
      "pointermove",
      function (event) {
        if (event.pointerType === "touch") {
          return;
        }

        setTarget(
          event.clientX,
          event.clientY
        );
      },
      { passive: true }
    );

    window.addEventListener(
      "touchmove",
      function (event) {
        if (!event.touches || !event.touches[0]) {
          return;
        }

        setTarget(
          event.touches[0].clientX,
          event.touches[0].clientY
        );
      },
      { passive: true }
    );

    function animate() {
      currentX +=
        (targetX - currentX) * 0.055;

      currentY +=
        (targetY - currentY) * 0.055;

      page.style.setProperty(
        "--mouse-x",
        currentX.toFixed(4)
      );

      page.style.setProperty(
        "--mouse-y",
        currentY.toFixed(4)
      );

      requestAnimationFrame(animate);
    }

    animate();
  }

  function setupLiveClock() {
    $$("[data-live-clock]").forEach(function (element) {
      function update() {
        const now = new Date();

        element.textContent =
          now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          });
      }

      update();
      setInterval(update, 1000);
    });
  }

  function setupMagneticButtons() {
    $$(".ven-button").forEach(function (button) {
      button.addEventListener(
        "pointermove",
        function (event) {
          if (event.pointerType === "touch") {
            return;
          }

          const rect =
            button.getBoundingClientRect();

          const x =
            event.clientX -
            rect.left -
            rect.width / 2;

          const y =
            event.clientY -
            rect.top -
            rect.height / 2;

          button.style.setProperty(
            "--button-x",
            (x * 0.08).toFixed(2) + "px"
          );

          button.style.setProperty(
            "--button-y",
            (y * 0.08).toFixed(2) + "px"
          );
        }
      );

      button.addEventListener(
        "pointerleave",
        function () {
          button.style.setProperty(
            "--button-x",
            "0px"
          );

          button.style.setProperty(
            "--button-y",
            "0px"
          );
        }
      );
    });
  }

  function setupFocusEffects() {
    $$("input").forEach(function (input) {
      input.addEventListener("focus", function () {
        input.closest(".ven-field")?.classList.add(
          "is-focused"
        );
      });

      input.addEventListener("blur", function () {
        input.closest(".ven-field")?.classList.remove(
          "is-focused"
        );
      });
    });
  }

  function setupKeyboard() {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        $$("[data-close]").forEach(function (element) {
          element.click();
        });
      }
    });
  }

  function boot() {
    setupPasswordToggles();
    setupLogin();
    setupRegister();
    setupLogout();
    setupNavigation();
    setupDeposit();
    setupDashboard();

    createSnow();
    setupParallax();
    setupLiveClock();
    setupMagneticButtons();
    setupFocusEffects();
    setupKeyboard();

    handleExistingSession();
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }

})();
</script>`;
