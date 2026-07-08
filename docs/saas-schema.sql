-- LexFlow SaaS multi-tenant schema reference
-- Target: D1/PostgreSQL-compatible structure. Every operational table carries tenant_id.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'advogado')),
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_settings_tenant_id ON settings(tenant_id);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  base_url TEXT,
  auth_type TEXT,
  encrypted_secret_json TEXT,
  sync_frequency TEXT NOT NULL DEFAULT 'manual',
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  UNIQUE (tenant_id, provider)
);

CREATE INDEX idx_integrations_tenant_id ON integrations(tenant_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_log_tenant_id_created_at ON audit_log(tenant_id, created_at);

CREATE TABLE processos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  numero TEXT NOT NULL,
  tribunal TEXT,
  cliente TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_processos_tenant_id ON processos(tenant_id);
CREATE UNIQUE INDEX idx_processos_tenant_numero ON processos(tenant_id, numero);

CREATE TABLE movimentacoes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  processo_id TEXT NOT NULL REFERENCES processos(id),
  origem TEXT,
  data_movimentacao TEXT,
  texto TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_movimentacoes_tenant_id ON movimentacoes(tenant_id);

CREATE TABLE prazos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  processo_id TEXT,
  tipo TEXT NOT NULL,
  data_publicacao TEXT,
  prazo_fatal TEXT,
  status TEXT NOT NULL,
  responsavel_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_prazos_tenant_id ON prazos(tenant_id);
CREATE INDEX idx_prazos_tenant_fatal ON prazos(tenant_id, prazo_fatal);

CREATE TABLE alertas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  tipo TEXT NOT NULL,
  severidade TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX idx_alertas_tenant_id ON alertas(tenant_id);
