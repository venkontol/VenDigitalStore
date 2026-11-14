// Pintu masuk Cloudflare Worker: menerima webhook Telegram, memvalidasi secret, lalu meneruskan ke router.
// Logika fitur TIDAK ditulis di file ini.
import { createTelegram } from './shared/telegram.js';
import { routeUpdate } from './bot/router.js';

const MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_PATH = '/webhook';

function getConfig(env) {
  const ownerIds = (env.OWNER_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  const depositMin = Number.parseInt(env.DEPOSIT_MIN_IDR ?? '10000', 10);
  return {
    ownerIds,
    requiredChannel: (env.REQUIRED_CHANNEL ?? '').trim() || '@NexusDigitalBot76',
    depositMinIdr: Number.isFinite(depositMin) && depositMin > 0 ? depositMin : 10000,
  };
}

// Perbandingan waktu-konstan agar secret webhook tidak bocor lewat selisih waktu.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Hapus secret dari teks log/error sebelum dicetak.
function redact(message, env) {
  let text = String(message ?? 'error');
  for (const secret of [env.TELEGRAM_BOT_TOKEN, env.SMSCODE_API_KEY, env.TELEGRAM_WEBHOOK_SECRET]) {
    if (secret) text = text.split(secret).join('[REDACTED]');
  }
  return text;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok');
    }
    if (request.method !== 'POST' || url.pathname !== WEBHOOK_PATH) {
      return new Response('Not found', { status: 404 });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.DB) {
      console.error('Konfigurasi wajib belum lengkap (cek secret dan binding DB).');
      return new Response('Server belum dikonfigurasi', { status: 500 });
    }

    const headerSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (!safeEqual(headerSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!update || typeof update !== 'object') {
      return new Response('Bad request', { status: 400 });
    }

    const ctx = {
      env,
      db: env.DB,
      config: getConfig(env),
      tg: createTelegram(env.TELEGRAM_BOT_TOKEN),
    };

    try {
      await routeUpdate(update, ctx);
    } catch (err) {
      // Balas 200 agar Telegram tidak mengirim ulang update yang sama terus-menerus.
      console.error('Gagal memproses update:', redact(err?.message, env));
    }
    return new Response('ok');
  },
};
