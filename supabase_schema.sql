-- ============================================================
-- Schema para Farmácia — Sistema de Gestão de Stock e Vendas
-- ============================================================

-- 1. Produtos
CREATE TABLE IF NOT EXISTS produtos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT DEFAULT '',
  quantidade INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 0,
  preco_custo NUMERIC(12,2) DEFAULT 0,
  preco_venda NUMERIC(12,2) DEFAULT 0,
  fornecedor TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Movimentos (entradas/saídas de stock)
CREATE TABLE IF NOT EXISTS movimentos (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'saida',
  produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  preco_unitario NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  nota TEXT DEFAULT '',
  metodo_pagamento TEXT DEFAULT 'CASH',
  vendedor TEXT DEFAULT '',
  data TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Despesas
CREATE TABLE IF NOT EXISTS despesas (
  id BIGSERIAL PRIMARY KEY,
  categoria TEXT DEFAULT '',
  descricao TEXT DEFAULT '',
  valor NUMERIC(12,2) DEFAULT 0,
  metodo_pagamento TEXT DEFAULT 'CASH',
  data TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Documentos (facturas / cotações)
CREATE TABLE IF NOT EXISTS documentos (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'factura',
  cliente TEXT DEFAULT '',
  total NUMERIC(12,2) DEFAULT 0,
  metodo_pagamento TEXT DEFAULT '',
  detalhes JSONB DEFAULT '{}',
  data TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Saldo de caixa
CREATE TABLE IF NOT EXISTS saldo_caixa (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'investimento',
  metodo TEXT DEFAULT 'CASH',
  valor NUMERIC(12,2) DEFAULT 0,
  descricao TEXT DEFAULT '',
  data TIMESTAMPTZ DEFAULT NOW()
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_movimentos_data ON movimentos(data);
CREATE INDEX IF NOT EXISTS idx_movimentos_produto ON movimentos(produto_id);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas(data);
CREATE INDEX IF NOT EXISTS idx_documentos_data ON documentos(data);

-- 6. Perfis de utilizadores (vinculado ao auth.users do Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'vendedor',
  display_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS: Permitir acesso anónimo (desativar RLS em todas as tabelas)
-- ============================================================
ALTER TABLE produtos DISABLE ROW LEVEL SECURITY;
ALTER TABLE movimentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE despesas DISABLE ROW LEVEL SECURITY;
ALTER TABLE documentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE saldo_caixa DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
