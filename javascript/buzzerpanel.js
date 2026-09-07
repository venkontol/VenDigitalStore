// Ganti baris BASE_URL & getApiKey lama dengan ini:

function getBaseUrl(env) {
  return String(
    env?.BUZZER_API_URL || "https://buzzerpanel.id/api/json.php"
  ).trim();
}

function getApiKey(env) {
  const key = String(
    env?.BUZZER_API_KEY || env?.BUZZERPANEL_API_KEY || ""
  ).trim();

  if (!key) {
    throw new BuzzerPanelError(
      "BuzzerPanel API key belum dikonfigurasi.",
      { status: 500, code: "BUZZERPANEL_API_KEY_MISSING" }
    );
  }
  return key;
}

function getSecretKey(env) {
  return String(
    env?.BUZZER_SECRET_KEY || env?.BUZZERPANEL_SECRET_KEY || ""
  ).trim();
}

// Di dalam function request(), ganti buildForm:
const form = buildForm({
  key: apiKey,
  api_key: apiKey,
  secret_key: getSecretKey(env) || undefined,
  ...payload
});

// Dan ganti fetch URL:
const response = await fetch(getBaseUrl(env), {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json"
  },
  body: form.toString(),
  signal: controller.signal
});
