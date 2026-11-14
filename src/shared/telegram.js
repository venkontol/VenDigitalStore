// Helper komunikasi dengan Telegram Bot API. Token tidak pernah masuk ke log atau pesan error.

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

export function createTelegram(token) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum dikonfigurasi');

  async function call(method, params = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Pesan sengaja tidak menyertakan URL (URL memuat token).
      throw new Error(`Telegram ${method} tidak dapat dihubungi (${err?.name ?? 'error'})`);
    }
    const data = await response.json().catch(() => null);
    if (!data?.ok) {
      throw new Error(`Telegram ${method} gagal: ${data?.description ?? `HTTP ${response.status}`}`);
    }
    return data.result;
  }

  const api = {
    call,

    sendMessage(chatId, text, extra = {}) {
      return call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      });
    },

    async editMessageText(chatId, messageId, text, extra = {}) {
      try {
        return await call('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...extra,
        });
      } catch (err) {
        if (String(err.message).includes('message is not modified')) return null;
        throw err;
      }
    },

    // Edit pesan lama; jika gagal (misal pesan sudah terlalu tua), kirim pesan baru.
    async editOrSend(chatId, messageId, text, extra = {}) {
      if (messageId) {
        try {
          return await api.editMessageText(chatId, messageId, text, extra);
        } catch {
          // lanjut ke kirim pesan baru
        }
      }
      return api.sendMessage(chatId, text, extra);
    },

    answerCallbackQuery(callbackQueryId, text = undefined, showAlert = false) {
      return call('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text ? { text: text.slice(0, 200), show_alert: showAlert } : {}),
      });
    },

    sendPhoto(chatId, photo, caption, extra = {}) {
      return call('sendPhoto', { chat_id: chatId, photo, caption, parse_mode: 'HTML', ...extra });
    },

    getChatMember(chatId, userId) {
      return call('getChatMember', { chat_id: chatId, user_id: userId });
    },
  };

  return api;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format rupiah: 750000 -> "Rp 750.000"
export function formatIDR(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}Rp ${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

// Kirim notifikasi ke semua owner. Satu kegagalan tidak menghentikan yang lain.
export async function notifyOwners(tg, ownerIds, text, extra = {}) {
  for (const id of ownerIds) {
    try {
      await tg.sendMessage(Number(id), text, extra);
    } catch (err) {
      console.error('Gagal kirim notifikasi owner:', err.message);
    }
  }
}
