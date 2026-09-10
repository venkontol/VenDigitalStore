PRAGMA foreign_keys = ON;

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  email TEXT
);

CREATE TABLE user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE social_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_service_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  category TEXT,
  service_name TEXT NOT NULL,
  service_type TEXT,
  provider_rate_per_1000 INTEGER NOT NULL DEFAULT 0 CHECK (provider_rate_per_1000 >= 0),
  selling_rate_per_1000 INTEGER NOT NULL DEFAULT 0 CHECK (selling_rate_per_1000 >= 0),
  provider_rate_raw TEXT,
  currency TEXT NOT NULL DEFAULT 'IDR',
  refill INTEGER NOT NULL DEFAULT 0 CHECK (refill IN (0, 1)),
  dripfeed INTEGER NOT NULL DEFAULT 0 CHECK (dripfeed IN (0, 1)),
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= min_quantity),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE nokos_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL UNIQUE,
  catalog_product_id INTEGER NOT NULL,
  country_id INTEGER,
  country_name TEXT,
  platform_id INTEGER,
  platform_name TEXT,
  operator_id INTEGER,
  operator_name TEXT,
  service_name TEXT NOT NULL,
  provider_price INTEGER NOT NULL DEFAULT 0 CHECK (provider_price >= 0),
  selling_price INTEGER NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('NOKOS', 'SOCIAL')),
  provider TEXT NOT NULL CHECK (provider IN ('SMSCODE', 'BUZZERPANEL')),
  external_order_id TEXT,
  service_id TEXT,
  service_name TEXT,
  target TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  rate_unit TEXT NOT NULL DEFAULT 'FIXED' CHECK (rate_unit IN ('FIXED', 'PER_1000')),
  provider_rate INTEGER NOT NULL DEFAULT 0 CHECK (provider_rate >= 0),
  selling_rate INTEGER NOT NULL DEFAULT 0 CHECK (selling_rate >= 0),
  provider_amount INTEGER NOT NULL DEFAULT 0 CHECK (provider_amount >= 0),
  customer_amount INTEGER NOT NULL DEFAULT 0 CHECK (customer_amount >= 0),
  provider_charge INTEGER,
  provider_currency TEXT DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'CREATING' CHECK (
    status IN (
      'CREATING',
      'PENDING',
      'PROCESSING',
      'OTP_RECEIVED',
      'COMPLETED',
      'PARTIAL',
      'CANCELLED',
      'EXPIRED',
      'REFUNDED',
      'FAILED',
      'UNKNOWN'
    )
  ),
  provider_status TEXT,
  provider_data TEXT,
  request_data TEXT,
  idempotency_key TEXT,
  failure_reason TEXT,
  phone_number TEXT,
  otp_code TEXT,
  otp_message TEXT,
  otp_received_at INTEGER,
  provider_expires_at INTEGER,
  start_count INTEGER,
  remains INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT,
  message TEXT,
  provider_data TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount >= 1000 AND amount <= 10000000),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')
  ),
  payment_method TEXT NOT NULL DEFAULT 'QRIS',
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  checked_at INTEGER,
  paid_at INTEGER,
  cancelled_at INTEGER,
  check_count INTEGER NOT NULL DEFAULT 0,
  wallet_transaction_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_transaction_id) REFERENCES balance_transactions(id) ON DELETE SET NULL
);

CREATE TABLE balance_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  deposit_id INTEGER,
  type TEXT NOT NULL CHECK (
    type IN ('DEPOSIT', 'PURCHASE', 'REFUND', 'ADJUSTMENT', 'BONUS')
  ),
  amount INTEGER NOT NULL CHECK (amount != 0),
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE visitor_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  user_agent TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE visitor_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL UNIQUE,
  visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_announcements_active
ON announcements(is_active, created_at DESC);

CREATE INDEX idx_balance_transactions_deposit
ON balance_transactions(deposit_id);

CREATE INDEX idx_balance_transactions_order
ON balance_transactions(order_id);

CREATE UNIQUE INDEX idx_balance_transactions_reference
ON balance_transactions(reference)
WHERE reference IS NOT NULL;

CREATE INDEX idx_balance_transactions_user
ON balance_transactions(user_id, created_at DESC);

CREATE INDEX idx_deposits_code
ON deposits(code);

CREATE INDEX idx_deposits_status
ON deposits(status, expires_at);

CREATE INDEX idx_deposits_user
ON deposits(user_id, created_at DESC);

CREATE UNIQUE INDEX idx_deposits_idempotency
ON deposits(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_nokos_services_available
ON nokos_services(available, active);

CREATE INDEX idx_nokos_services_catalog
ON nokos_services(catalog_product_id);

CREATE INDEX idx_nokos_services_country
ON nokos_services(country_id);

CREATE INDEX idx_nokos_services_operator
ON nokos_services(operator_id);

CREATE INDEX idx_nokos_services_platform
ON nokos_services(platform_id);

CREATE INDEX idx_order_events_order
ON order_events(order_id, created_at DESC);

CREATE UNIQUE INDEX idx_orders_external
ON orders(provider, external_order_id)
WHERE external_order_id IS NOT NULL;

CREATE UNIQUE INDEX idx_orders_idempotency
ON orders(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_orders_provider
ON orders(provider, external_order_id);

CREATE INDEX idx_orders_status
ON orders(status, created_at DESC);

CREATE INDEX idx_orders_type
ON orders(type);

CREATE INDEX idx_orders_user
ON orders(user_id, created_at DESC);

CREATE INDEX idx_settings_key
ON settings(key);

CREATE INDEX idx_social_services_available
ON social_services(available, active);

CREATE INDEX idx_social_services_category
ON social_services(category);

CREATE INDEX idx_social_services_platform
ON social_services(platform);

CREATE INDEX idx_user_sessions_expires
ON user_sessions(expires_at);

CREATE INDEX idx_user_sessions_user
ON user_sessions(user_id);

CREATE INDEX idx_users_active
ON users(is_active);

CREATE INDEX idx_users_admin
ON users(is_admin);

CREATE UNIQUE INDEX idx_users_email_unique
ON users(LOWER(TRIM(email)))
WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE INDEX idx_users_username
ON users(username);

CREATE INDEX idx_visitor_sessions_last_seen
ON visitor_sessions(last_seen_at);

CREATE INDEX idx_visitor_stats_date
ON visitor_stats(stat_date);
