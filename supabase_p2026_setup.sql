-- ============================================================
-- SETUP PICOCO 2026 — Nova Gestão Pós-Roubo (Ambiente Limpo)
-- Preserva a base antiga intacta para a investigação policial.
-- ============================================================

-- 1. Produtos 2026
CREATE TABLE IF NOT EXISTS p2026_produtos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT DEFAULT '',
  quantidade INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 0,
  preco_custo NUMERIC(12,2) DEFAULT 0,
  preco_venda NUMERIC(12,2) DEFAULT 0,
  fornecedor TEXT DEFAULT '',
  validade DATE DEFAULT NULL,
  lote TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Movimentos 2026
CREATE TABLE IF NOT EXISTS p2026_movimentos (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'saida',
  produto_id INTEGER REFERENCES p2026_produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  preco_unitario NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  nota TEXT DEFAULT '',
  metodo_pagamento TEXT DEFAULT 'CASH',
  vendedor TEXT DEFAULT '',
  data TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Despesas 2026
CREATE TABLE IF NOT EXISTS p2026_despesas (
  id BIGSERIAL PRIMARY KEY,
  categoria TEXT DEFAULT '',
  descricao TEXT DEFAULT '',
  valor NUMERIC(12,2) DEFAULT 0,
  metodo_pagamento TEXT DEFAULT 'CASH',
  data TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Documentos 2026
CREATE TABLE IF NOT EXISTS p2026_documentos (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'factura',
  cliente TEXT DEFAULT '',
  total NUMERIC(12,2) DEFAULT 0,
  metodo_pagamento TEXT DEFAULT '',
  detalhes JSONB DEFAULT '{}',
  data TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Saldo de Caixa 2026
CREATE TABLE IF NOT EXISTS p2026_saldo_caixa (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'investimento',
  metodo TEXT DEFAULT 'CASH',
  valor NUMERIC(12,2) DEFAULT 0,
  descricao TEXT DEFAULT '',
  data TIMESTAMPTZ DEFAULT NOW()
);

-- Desativar RLS para permitir acesso às novas tabelas
ALTER TABLE p2026_produtos DISABLE ROW LEVEL SECURITY;
ALTER TABLE p2026_movimentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE p2026_despesas DISABLE ROW LEVEL SECURITY;
ALTER TABLE p2026_documentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE p2026_saldo_caixa DISABLE ROW LEVEL SECURITY;

-- 6. Recomeçar do zero no ambiente 2026, sem reusar stock antigo
TRUNCATE TABLE p2026_movimentos, p2026_produtos, p2026_despesas, p2026_documentos, p2026_saldo_caixa RESTART IDENTITY CASCADE;

-- 7. Copiar Catálogo de Produtos antigo para p2026_produtos com STOCK ZERO
INSERT INTO p2026_produtos (id, nome, categoria, quantidade, stock_minimo, preco_custo, preco_venda, fornecedor, validade, lote)
SELECT id, nome, categoria, 0 AS quantidade, stock_minimo, preco_custo, preco_venda, fornecedor, validade, lote
FROM produtos
ON CONFLICT (id) DO NOTHING;

-- Sincronizar o contador da sequência de IDs
SELECT setval('p2026_produtos_id_seq', COALESCE((SELECT MAX(id) FROM p2026_produtos), 1));

-- Índices de desempenho
CREATE INDEX IF NOT EXISTS idx_p2026_movimentos_data ON p2026_movimentos(data);
CREATE INDEX IF NOT EXISTS idx_p2026_movimentos_produto ON p2026_movimentos(produto_id);
CREATE INDEX IF NOT EXISTS idx_p2026_despesas_data ON p2026_despesas(data);
CREATE INDEX IF NOT EXISTS idx_p2026_documentos_data ON p2026_documentos(data);
