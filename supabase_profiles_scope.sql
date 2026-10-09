-- ============================================================
-- SUPABASE — NOVA REGRA DE SEPARAÇÃO POR PERFIL
-- ============================================================
-- Ideia:
--   - manter UMA tabela de perfis (profiles)
--   - usar uma coluna dataset_scope para definir a família de tabelas
--   - legacy -> acessa tabelas antigas sem prefixo
--   - recent -> acessa tabelas novas com prefixo p2026_
-- ============================================================

-- 1) Garantir que a tabela de perfis exista com a nova coluna
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'vendedor',
  display_name TEXT DEFAULT '',
  dataset_scope TEXT NOT NULL DEFAULT 'recent' CHECK (dataset_scope IN ('legacy', 'recent')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dataset_scope TEXT NOT NULL DEFAULT 'recent'
  CHECK (dataset_scope IN ('legacy', 'recent'));

-- 2) Garantir que os perfis já existentes não fiquem sem scope
UPDATE profiles
SET dataset_scope = 'recent'
WHERE dataset_scope IS NULL OR dataset_scope NOT IN ('legacy', 'recent');

-- 3) Associar cada gestor ao scope certo, pela conta do auth.users
WITH gestao_legacy AS (
  SELECT id
  FROM auth.users
  WHERE email = 'gestao@farmacia-teste.com'
),

gestao_recent AS (
  SELECT id
  FROM auth.users
  WHERE email = 'gestao@admin.farmacia-teste.com'
)
INSERT INTO profiles (id, role, display_name, dataset_scope)
SELECT
  gl.id,
  'gestor',
  'Gestão Antiga',
  'legacy'
FROM gestao_legacy gl
ON CONFLICT (id) DO UPDATE
SET role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    dataset_scope = EXCLUDED.dataset_scope;

WITH gestao_recent AS (
  SELECT id
  FROM auth.users
  WHERE email = 'gestao@admin.farmacia-teste.com'
)
INSERT INTO profiles (id, role, display_name, dataset_scope)
SELECT
  gr.id,
  'gestor',
  'Gestão Recente',
  'recent'
FROM gestao_recent gr
ON CONFLICT (id) DO UPDATE
SET role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    dataset_scope = EXCLUDED.dataset_scope;

-- 4) Tal como no esquema atual, manter acesso anónimo sem RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 5) Opcional: se quiseres deixar explícito na base qual scope cada perfil deve ver
--    pode criar uma VIEW auxiliar para inspeção rápida
CREATE OR REPLACE VIEW profiles_scope_view AS
SELECT
  p.id,
  u.email,
  p.role,
  p.display_name,
  p.dataset_scope,
  CASE
    WHEN p.dataset_scope = 'legacy' THEN 'tabelas antigas (produtos, movimentos, despesas, documentos, saldo_caixa)'
    WHEN p.dataset_scope = 'recent' THEN 'tabelas recentes (p2026_produtos, p2026_movimentos, p2026_despesas, p2026_documentos, p2026_saldo_caixa)'
  END AS acesso_previsto,
  p.created_at
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id;

-- 6) Segurança operacional
--    A app deve ler o scope do perfil autenticado e decidir por tabela:
--      legacy -> produtos / movimentos / despesas / documentos / saldo_caixa
--      recent -> p2026_produtos / p2026_movimentos / p2026_despesas / p2026_documentos / p2026_saldo_caixa

-- FIM
