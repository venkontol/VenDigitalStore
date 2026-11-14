// Helper Cloudflare D1. Hanya akses database, TIDAK berisi logika bisnis.
// Semua query memakai parameter binding (.bind) untuk mencegah SQL injection.

export const USER_STATE = {
  DEPOSIT_AMOUNT: 'DEPOSIT_AMOUNT',
  OWNER_MARKUP: 'OWNER_MARKUP',
};

export function now() {
  return Date.now();
}

export function stmt(db, sql, params = []) {
  return db.prepare(sql).bind(...params);
}

export async function first(db, sql, params = []) {
  return stmt(db, sql, params).first();
}

export async function all(db, sql, params = []) {
  const res = await stmt(db, sql, params).all();
  return res.results ?? [];
}

export async function run(db, sql, params = []) {
  return stmt(db, sql, params).run();
}

// D1 batch berjalan sebagai satu transaksi: jika satu statement gagal, semua di-rollback.
export async function batch(db, statements) {
  return db.batch(statements);
}

export async function setState(db, telegramId, state, payload = null) {
  return run(db, 'UPDATE users SET state = ?, state_payload = ?, updated_at = ? WHERE telegram_id = ?', [
    state,
    payload,
    now(),
    String(telegramId),
  ]);
}

export async function clearState(db, telegramId) {
  return setState(db, telegramId, null, null);
}
