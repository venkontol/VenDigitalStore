const DashboardClient = (() => {
  const API = "/api";

  const state = {
    loading: false
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(
      Number.isFinite(Number(value))
        ? Number(value) * 1000
        : value
    );

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  async function request(
    path,
    options = {}
  ) {
    const response = await fetch(
      API + path,
      {
        credentials: "include",
        ...options,
        headers: {
          "Accept": "application/json",
          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {}),
          ...(options.headers || {})
        }
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const error = new Error(
        data?.error ||
          data?.message ||
          "Permintaan gagal."
      );

      error.status =
        response.status;

      error.data = data;

      throw error;
    }

    return data;
  }

  function setText(
    id,
    value
  ) {
    const element =
      getElement(id);

    if (element) {
      element.textContent =
        value;
    }
  }

  function setLoading(
    loading
  ) {
    state.loading =
      loading;

    const refresh =
      getElement(
        "refreshWallet"
      );

    if (!refresh) {
      return;
    }

    refresh.disabled =
      loading;

    refresh.classList.toggle(
      "loading",
      loading
    );

    refresh.textContent =
      loading
        ? "Memuat..."
        : "Refresh";
  }

  function showError(
    message
  ) {
    const element =
      getElement(
        "dashboardAlert"
      );

    if (!element) {
      return;
    }

    element.textContent =
      message ||
      "Terjadi kesalahan.";

    element.className =
      "alert show error";
  }

  function clearError() {
    const element =
      getElement(
        "dashboardAlert"
      );

    if (!element) {
      return;
    }

    element.textContent =
      "";

    element.className =
      "alert";
  }

  function renderTransactions(
    transactions
  ) {
    const container =
      getElement(
        "transactions"
      );

    if (!container) {
      return;
    }

    if (
      !Array.isArray(
        transactions
      ) ||
      transactions.length === 0
    ) {
      container.innerHTML =
        '<div class="empty">Belum ada transaksi.</div>';

      return;
    }

    container.innerHTML =
      transactions
        .map((transaction) => {
          const amount =
            Number(
              transaction.amount ||
                0
            );

          const positive =
            amount >= 0;

          const description =
            transaction.description ||
            transaction.type ||
            "Transaksi";

          return `
            <div class="transaction">
              <div class="tx-left">
                <strong>
                  ${escapeHtml(
                    description
                  )}
                </strong>

                <span>
                  ${escapeHtml(
                    formatDate(
                      transaction.created_at
                    )
                  )}
                </span>
              </div>

              <div
                class="tx-amount ${
                  positive
                    ? "positive"
                    : "negative"
                }"
              >
                ${
                  positive
                    ? "+"
                    : ""
                }${escapeHtml(
                  money(amount)
                )}
              </div>
            </div>
          `;
        })
        .join("");
  }

  async function loadWallet() {
    if (state.loading) {
      return;
    }

    clearError();
    setLoading(true);

    try {
      const data =
        await request(
          "/wallet/overview"
        );

      const balance =
        data?.balance ??
        data?.wallet?.balance ??
        0;

      setText(
        "balanceValue",
        money(balance)
      );

      renderTransactions(
        data?.transactions ||
          data?.wallet?.transactions ||
          []
      );
    } catch (error) {
      if (
        error?.status === 401
      ) {
        window.location.href =
          "/login";

        return;
      }

      setText(
        "balanceValue",
        "Rp 0"
      );

      const container =
        getElement(
          "transactions"
        );

      if (container) {
        container.innerHTML =
          '<div class="empty">Gagal memuat transaksi.</div>';
      }

      showError(
        error?.message ||
          "Gagal memuat wallet."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentUser() {
    try {
      const data =
        await request(
          "/auth/me"
        );

      if (
        !data?.authenticated ||
        !data?.user
      ) {
        window.location.href =
          "/login";

        return null;
      }

      renderUser(
        data.user
      );

      return data.user;
    } catch (error) {
      if (
        error?.status === 401
      ) {
        window.location.href =
          "/login";

        return null;
      }

      showError(
        error?.message ||
          "Gagal memuat akun."
      );

      return null;
    }
  }

  function renderUser(
    user
  ) {
    const name =
      user.first_name ||
      user.username ||
      "User";

    const greeting =
      getElement(
        "dashboardGreeting"
      );

    if (greeting) {
      greeting.textContent =
        `Halo, ${name}`;
    }

    const username =
      getElement(
        "dashboardUsername"
      );

    if (username) {
      username.textContent =
        user.username ||
        "-";
    }

    const status =
      getElement(
        "dashboardStatus"
      );

    if (status) {
      status.textContent =
        user.status ||
        (
          user.is_active
            ? "ACTIVE"
            : "INACTIVE"
        );
    }

    const session =
      getElement(
        "dashboardSession"
      );

    if (session) {
      session.textContent =
        formatDate(
          user.session_expires_at
        );
    }
  }

  async function logout() {
    const button =
      getElement(
        "logoutButton"
      );

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Logout...";
    }

    try {
      await request(
        "/auth/logout",
        {
          method: "POST"
        }
      );
    } catch {}

    window.location.href =
      "/login";
  }

  function bindRefresh() {
    const button =
      getElement(
        "refreshWallet"
      );

    if (!button) {
      return;
    }

    button.addEventListener(
      "click",
      loadWallet
    );
  }

  function bindLogout() {
    const button =
      getElement(
        "logoutButton"
      );

    if (!button) {
      return;
    }

    button.addEventListener(
      "click",
      logout
    );
  }

  function bindNavigation() {
    document.addEventListener(
      "click",
      (event) => {
        const link =
          event.target.closest(
            'a[href]'
          );

        if (!link) {
          return;
        }

        if (
          link.target ===
          "_blank"
        ) {
          return;
        }

        const href =
          link.getAttribute(
            "href"
          );

        if (
          !href ||
          !href.startsWith("/")
        ) {
          return;
        }

        if (
          href.startsWith(
            "/api/"
          )
        ) {
          return;
        }

        if (
          href.startsWith(
            "#"
          )
        ) {
          return;
        }

        event.preventDefault();

        window.location.href =
          href;
      }
    );
  }

  async function init() {
    bindRefresh();
    bindLogout();
    bindNavigation();

    const user =
      await loadCurrentUser();

    if (!user) {
      return;
    }

    await loadWallet();
  }

  return Object.freeze({
    init,
    loadWallet,
    loadCurrentUser,
    logout
  });
})();

window.DashboardClient =
  DashboardClient;

document.addEventListener(
  "DOMContentLoaded",
  () => {
    DashboardClient.init();
  }
);
