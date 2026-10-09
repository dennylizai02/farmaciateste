-- ============================================================
-- SUPABASE — RESTAURAR APENAS O CATÁLOGO DE PRODUTOS
-- ============================================================
-- Objetivo:
--   Popular apenas a tabela p2026_produtos com os produtos do
--   dataset antigo, sem restaurar os stocks/quantidades roubados.
--   As vendas, despesas, documentos e caixa continuam como
--   historial recente e não são reimportados neste script.
-- ============================================================

-- 0) Garantir que as tabelas p2026 existam
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

CREATE TABLE IF NOT EXISTS p2026_despesas (
  id BIGSERIAL PRIMARY KEY,
  categoria TEXT DEFAULT '',
  descricao TEXT DEFAULT '',
  valor NUMERIC(12,2) DEFAULT 0,
  metodo_pagamento TEXT DEFAULT 'CASH',
  data TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS p2026_saldo_caixa (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT DEFAULT 'investimento',
  metodo TEXT DEFAULT 'CASH',
  valor NUMERIC(12,2) DEFAULT 0,
  descricao TEXT DEFAULT '',
  data TIMESTAMPTZ DEFAULT NOW()
);

-- 1) Desativar RLS apenas para a tabela de produtos
ALTER TABLE p2026_produtos DISABLE ROW LEVEL SECURITY;

-- 2) Recriar o catálogo recente com os produtos antigos,
--    mas SEM importar os stocks/quantidades roubados
--    IMPORTANTE: NÃO usar TRUNCATE em p2026_produtos porque
--    p2026_movimentos referencia esta tabela por chave estrangeira.
INSERT INTO p2026_produtos (
  id,
  nome,
  categoria,
  quantidade,
  stock_minimo,
  preco_custo,
  preco_venda,
  fornecedor,
  validade,
  lote,
  created_at
)
SELECT
  p.id,
  p.nome,
  p.categoria,
  0 AS quantidade,
  p.stock_minimo,
  p.preco_custo,
  p.preco_venda,
  p.fornecedor,
  p.validade,
  p.lote,
  p.created_at
FROM produtos p
ON CONFLICT (id) DO UPDATE
SET
  nome = EXCLUDED.nome,
  categoria = EXCLUDED.categoria,
  quantidade = 0,
  stock_minimo = EXCLUDED.stock_minimo,
  preco_custo = EXCLUDED.preco_custo,
  preco_venda = EXCLUDED.preco_venda,
  fornecedor = EXCLUDED.fornecedor,
  validade = EXCLUDED.validade,
  lote = EXCLUDED.lote,
  created_at = EXCLUDED.created_at;

-- 3) Sincronizar a sequência dos IDs dos produtos
SELECT setval('p2026_produtos_id_seq', COALESCE((SELECT MAX(id) FROM p2026_produtos), 1));

-- ============================================================
-- NOTA:
--   Este script restaura APENAS o catálogo de produtos.
--   Não é usado TRUNCATE em p2026_produtos para não apagar
--   a referência usada por p2026_movimentos.
--   O stock da tabela p2026_produtos é reposto para 0
--   para não importar os stocks roubados.
--   As vendas históricas continuam em p2026_movimentos;
--   a sua referência ao produto fica válida pelos IDs.
-- ============================================================
