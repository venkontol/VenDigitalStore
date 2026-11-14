-- NexusBase - skema D1 (SQLite)
-- Jalankan: wrangler d1 execute nexusbase-db --remote --file=./database/schema.sql
-- Semua nominal dalam IDR (integer). Waktu dalam milidetik Unix (Date.now()).

CREATE TABLE IF NOT EXISTS users (
  telegram_id         TEXT PRIMARY KEY,
  username            TEXT,
  first_name          TEXT,
  state               TEXT,              -- state input menunggu (DEPOSIT_AMOUNT / OWNER_MARKUP)
  state_payload       TEXT,
  channel_verified_at INTEGER,           -- terakhir terverifikasi join channel (NULL = belum)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- Saldo: CHECK (balance >= 0) mencegah saldo negatif di level database.
CREATE TABLE IF NOT EXISTS wallets (
  user_id    TEXT PRIMARY KEY REFERENCES users(telegram_id),
  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(telegram_id),
  amount     INTEGER NOT NULL CHECK (amount > 0),
  status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deposit_status ON deposit_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deposit_user   ON deposit_requests(user_id, status);

-- Buku besar: setiap perubahan saldo wajib punya baris di sini.
-- UNIQUE(type, ref_type, ref_id) mencegah satu peristiwa dicatat/dibayar dua kali.
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL REFERENCES users(telegram_id),
  type          TEXT NOT NULL CHECK (type IN ('DEPOSIT','NOKOS_PURCHASE','REFUND')),
  amount        INTEGER NOT NULL CHECK (amount <> 0),   -- bertanda: + masuk, - keluar
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  ref_type      TEXT NOT NULL,
  ref_id        TEXT NOT NULL,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (type, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, id);

-- Order NOKOS.
-- PROCESSING : order dibuat lokal, menunggu respons provider (saldo di-hold, belum dipotong)
-- UNCERTAIN  : respons provider ambigu (timeout/5xx); bisa dilanjutkan dengan idempotency_key yang sama
-- FAILED     : provider pasti menolak; saldo tidak pernah dipotong
-- ACTIVE / OTP_RECEIVED / COMPLETED / CANCELED / EXPIRED : mengikuti status provider setelah saldo dipotong
-- NEEDS_REVIEW : nomor sudah didapat tetapi pemotongan/refund gagal; butuh tinjauan owner
CREATE TABLE IF NOT EXISTS nokos_orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL REFERENCES users(telegram_id),
  idempotency_key   TEXT NOT NULL UNIQUE,
  provider          TEXT NOT NULL DEFAULT 'smscode',
  provider_order_id INTEGER UNIQUE,
  product_id        INTEGER NOT NULL,
  product_name      TEXT,
  operator_name     TEXT,
  provider_price    INTEGER NOT NULL CHECK (provider_price >= 0),
  sell_price        INTEGER NOT NULL CHECK (sell_price > 0),
  status            TEXT NOT NULL CHECK (status IN ('PROCESSING','UNCERTAIN','FAILED','ACTIVE','OTP_RECEIVED','COMPLETED','CANCELED','EXPIRED','NEEDS_REVIEW')),
  phone_number      TEXT,
  otp_code          TEXT,
  otp_message       TEXT,
  sms_revision      INTEGER NOT NULL DEFAULT 0,
  expires_at        TEXT,
  failed_reason     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nokos_user   ON nokos_orders(user_id, id);
CREATE INDEX IF NOT EXISTS idx_nokos_status ON nokos_orders(status);

-- Konfigurasi bot yang bisa diubah owner. Kunci yang dipakai: nokos_markup_percent.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
