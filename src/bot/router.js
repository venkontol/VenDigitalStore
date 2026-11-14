// Router: hanya mengarahkan update Telegram ke feature yang sesuai. Tidak berisi logika bisnis.
// Urutan: /start tanpa gerbang -> gerbang membership -> perintah & tombol -> state input -> callback.
import { BTN, mainMenuKeyboard } from './keyboard.js';
import { clearState, USER_STATE } from '../shared/db.js';
import * as start from '../features/start.js';
import * as membership from '../features/membership.js';
import * as nokos from '../features/nokos.js';
import * as orders from '../features/orders.js';
import * as wallet from '../features/wallet.js';
import * as deposit from '../features/deposit.js';
import * as transactions from '../features/transactions.js';
import * as owner from '../owner/router.js';

const MAX_TEXT_LENGTH = 300;
const MAX_CALLBACK_LENGTH = 64;
const BUTTON_TEXTS = new Set(Object.values(BTN));

export async function routeUpdate(update, ctx) {
  if (update.callback_query) return routeCallback(update.callback_query, ctx);
  if (update.message) return routeMessage(update.message, ctx);
}

async function routeMessage(message, ctx) {
  const from = message.from;
  if (!from || from.is_bot || message.chat?.type !== 'private') return;

  const chatId = message.chat.id;
  const text = typeof message.text === 'string' ? message.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const user = await start.getOrCreateUser(ctx, from);

  if (text.startsWith('/start')) return start.handleStart(ctx, chatId, user);

  // Semua fitur di bawah hanya untuk yang sudah bergabung ke channel.
  if (!(await membership.ensureMember(ctx, user, chatId))) return;

  // Menekan tombol menu atau /batal membatalkan input yang sedang ditunggu.
  if ((text === '/batal' || BUTTON_TEXTS.has(text)) && user.state) {
    await clearState(ctx.db, user.telegram_id);
    user.state = null;
  }
  if (text === '/batal') return start.showMainMenu(ctx, chatId, user);
  if (text === '/menu') return start.showMainMenu(ctx, chatId, user);

  switch (text) {
    case BTN.NOKOS:
      return nokos.showCountries(ctx, chatId);
    case BTN.WALLET:
      return wallet.showWallet(ctx, chatId, user);
    case BTN.DEPOSIT:
      return deposit.promptAmount(ctx, chatId, user);
    case BTN.ORDERS:
      return orders.showList(ctx, chatId, user, 1);
    case BTN.TRANSACTIONS:
      return transactions.showList(ctx, chatId, user, 1);
    case BTN.OWNER:
    case '/owner':
      return owner.showPanel(ctx, chatId, user);
    default:
      break;
  }

  if (text && user.state === USER_STATE.DEPOSIT_AMOUNT) {
    return deposit.handleAmountInput(ctx, chatId, user, text);
  }
  if (text && user.state === USER_STATE.OWNER_MARKUP) {
    return owner.handleMarkupInput(ctx, chatId, user, text);
  }

  return start.showMainMenu(ctx, chatId, user);
}

async function routeCallback(cq, ctx) {
  const from = cq.from;
  if (!from || from.is_bot || !cq.message || cq.message.chat?.type !== 'private') return;

  const data = typeof cq.data === 'string' ? cq.data : '';
  if (!data || data.length > MAX_CALLBACK_LENGTH) return;

  // Hentikan loading di tombol. Pesan balasan dikirim oleh feature.
  await ctx.tg.answerCallbackQuery(cq.id).catch(() => {});

  const chatId = cq.message.chat.id;
  const user = await start.getOrCreateUser(ctx, from);
  const scope = data.split(':')[0];

  if (scope === 'mb') {
    const joined = await membership.handleVerify(ctx, chatId, user);
    if (joined) return start.showMainMenu(ctx, chatId, user);
    return;
  }

  if (!(await membership.ensureMember(ctx, user, chatId))) return;

  switch (scope) {
    case 'nk':
      return nokos.handleCallback(ctx, cq, user);
    case 'od':
      return orders.handleCallback(ctx, cq, user);
    case 'tx':
      return transactions.handleCallback(ctx, cq, user);
    case 'wl':
      return wallet.handleCallback(ctx, cq, user);
    case 'ow':
      return owner.handleCallback(ctx, cq, user);
    default:
      return;
  }
}
