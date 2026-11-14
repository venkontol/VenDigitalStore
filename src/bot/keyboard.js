// Pembuat Reply Keyboard dan Inline Keyboard. Struktur tombol yang berulang ditulis di sini.
//
// Daftar callback_data (maks. 64 byte, prefix per fitur agar tidak bertabrakan):
//   mb:v                  verifikasi join channel (membership.js)
//   nk:h                  daftar negara            nk:c:<negara>            daftar layanan
//   nk:s:<negara>:<layanan>  daftar harga          nk:p:<negara>:<layanan>:<produk>  konfirmasi
//   nk:b:<negara>:<layanan>:<produk>:<harga>  beli   nk:chk|res|fin|cnl:<orderId>  cek/lanjut/selesai/batal
//   od:l:<halaman>        riwayat pesanan          od:v:<orderId>           detail pesanan
//   tx:p:<halaman>        riwayat transaksi        wl:r                     refresh saldo
//   ow:st|dl|rv|mk        panel owner              ow:da|dr:<depositId>     setujui/tolak deposit

export const BTN = {
  NOKOS: '🛒 Beli NOKOS',
  WALLET: '💰 Saldo',
  DEPOSIT: '💳 Deposit',
  ORDERS: '📦 Pesanan',
  TRANSACTIONS: '🧾 Transaksi',
  OWNER: '👑 Panel Owner',
};

export function mainMenuKeyboard(isOwner) {
  const rows = [
    [BTN.NOKOS, BTN.WALLET],
    [BTN.DEPOSIT, BTN.ORDERS],
    [BTN.TRANSACTIONS],
  ];
  if (isOwner) rows.push([BTN.OWNER]);
  return { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true };
}

export function inline(rows) {
  return { inline_keyboard: rows };
}

// Susun tombol menjadi grid; extraRows ditaruh di bawah (misal tombol kembali).
export function gridKeyboard(buttons, cols = 2, extraRows = []) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += cols) {
    rows.push(buttons.slice(i, i + cols));
  }
  return inline([...rows, ...extraRows]);
}

export function backRow(callbackData, text = '⬅️ Kembali') {
  return [{ text, callback_data: callbackData }];
}

export function membershipKeyboard(channel) {
  return inline([
    [{ text: '📢 Buka Channel', url: `https://t.me/${channel.replace(/^@/, '')}` }],
    [{ text: '✅ Saya Sudah Bergabung', callback_data: 'mb:v' }],
  ]);
}
