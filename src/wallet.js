import {
  json,
  getSessionFromRequest,
  getBalance,
  addBalance,
  chargeCustomer,
  refundCustomer
} from "./utils.js";

function authenticatedSession(request, env) {
  return getSessionFromRequest(env, request);
}

export async function balance(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  const currentBalance = await getBalance(env, session.user_id);

  return json({
    success: true,
    balance: Number(currentBalance || 0)
  });
}

export async function credit(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  let data;

  try {
    data = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const amount = Number(data.amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return json(
      {
        success: false,
        error: "Jumlah saldo tidak valid."
      },
      400
    );
  }

  /*
   * Endpoint ini hanya untuk internal/admin.
   * Deposit user tidak boleh menggunakan endpoint ini secara langsung.
   */
  const referenceId =
    typeof data.reference_id === "string" &&
    data.reference_id.trim()
      ? data.reference_id.trim()
      : `MANUAL-${crypto.randomUUID()}`;

  const description =
    typeof data.description === "string"
      ? data.description.trim()
      : "Saldo ditambahkan";

  try {
    const newBalance = await addBalance(
      env,
      session.user_id,
      amount,
      referenceId,
      description
    );

    return json({
      success: true,
      balance: Number(newBalance),
      amount
    });
  } catch (error) {
    console.error("WALLET_CREDIT_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal menambahkan saldo."
      },
      500
    );
  }
}

export async function charge(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  let data;

  try {
    data = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const amount = Number(data.amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return json(
      {
        success: false,
        error: "Jumlah pembayaran tidak valid."
      },
      400
    );
  }

  const referenceId =
    typeof data.reference_id === "string" &&
    data.reference_id.trim()
      ? data.reference_id.trim()
      : `CHARGE-${crypto.randomUUID()}`;

  const description =
    typeof data.description === "string"
      ? data.description.trim()
      : "Pembayaran";

  try {
    const newBalance = await chargeCustomer(
      env,
      session.user_id,
      amount,
      referenceId,
      description
    );

    return json({
      success: true,
      balance: Number(newBalance),
      charged: amount
    });
  } catch (error) {
    const message = String(error?.message || error);

    if (
      message.includes("INSUFFICIENT_BALANCE") ||
      message.toLowerCase().includes("insufficient")
    ) {
      return json(
        {
          success: false,
          error: "Saldo tidak mencukupi."
        },
        400
      );
    }

    if (
      message.includes("DUPLICATE") ||
      message.toLowerCase().includes("already")
    ) {
      return json(
        {
          success: false,
          error: "Transaksi dengan reference tersebut sudah diproses."
        },
        409
      );
    }

    console.error("WALLET_CHARGE_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal melakukan pembayaran."
      },
      500
    );
  }
}

export async function refund(request, env) {
  const session = await authenticatedSession(request, env);

  if (!session) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  let data;

  try {
    data = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Body JSON tidak valid."
      },
      400
    );
  }

  const amount = Number(data.amount);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return json(
      {
        success: false,
        error: "Jumlah refund tidak valid."
      },
      400
    );
  }

  const referenceId =
    typeof data.reference_id === "string" &&
    data.reference_id.trim()
      ? data.reference_id.trim()
      : `REFUND-${crypto.randomUUID()}`;

  const description =
    typeof data.description === "string"
      ? data.description.trim()
      : "Refund";

  try {
    const newBalance = await refundCustomer(
      env,
      session.user_id,
      amount,
      referenceId,
      description
    );

    return json({
      success: true,
      balance: Number(newBalance),
      refunded: amount
    });
  } catch (error) {
    console.error("WALLET_REFUND_ERROR", error);

    return json(
      {
        success: false,
        error: "Gagal melakukan refund."
      },
      500
    );
  }
}

export async function walletHandler(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "GET" && pathname === "/api/wallet/balance") {
    return balance(request, env);
  }

  if (request.method === "POST" && pathname === "/api/wallet/credit") {
    return credit(request, env);
  }

  if (request.method === "POST" && pathname === "/api/wallet/charge") {
    return charge(request, env);
  }

  if (request.method === "POST" && pathname === "/api/wallet/refund") {
    return refund(request, env);
  }

  return json(
    {
      success: false,
      error: "Wallet endpoint tidak ditemukan."
    },
    404
  );
}

export default walletHandler;
