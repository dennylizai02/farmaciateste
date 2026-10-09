-- ============================================================
-- SUPABASE — DIAGNÓSTICO RÁPIDO DO DATASET RECENTE
-- ============================================================
-- Objetivo:
--   Verificar em uma só passada se o catálogo recente está vazio,
--   se o profile do utilizador recente está apontado para 'recent'
--   e se há desvios na referência entre movimentos e produtos.
-- ============================================================

-- 1) Contagens rápidas
SELECT 'legacy_produtos' AS item, COUNT(*) AS total FROM produtos
UNION ALL
SELECT 'recent_produtos', COUNT(*) FROM p2026_produtos
UNION ALL
SELECT 'recent_movimentos', COUNT(*) FROM p2026_movimentos
UNION ALL
SELECT 'recent_despesas', COUNT(*) FROM p2026_despesas
UNION ALL
SELECT 'recent_documentos', COUNT(*) FROM p2026_documentos
UNION ALL
SELECT 'recent_saldo_caixa', COUNT(*) FROM p2026_saldo_caixa;

-- 2) Perfil de gestão dos dois emails
SELECT
  u.email,
  p.role,
  p.display_name,
  p.dataset_scope,
  CASE
    WHEN p.dataset_scope = 'legacy' THEN 'deve ler tabelas antigas'
    WHEN p.dataset_scope = 'recent' THEN 'deve ler p2026_*'
    ELSE 'scope inválido ou não definido'
  END AS expected_access
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN ('gestao@farmacia.picoco', 'gestao@picoco.com');

-- 3) Movimentos com produto_id órfão na tabela recente
SELECT
  m.id,
  m.tipo,
  m.produto_id,
  m.quantidade,
  m.total,
  m.data,
  m.nota,
  m.vendedor
FROM p2026_movimentos m
LEFT JOIN p2026_produtos p ON p.id = m.produto_id
WHERE p.id IS NULL
ORDER BY m.id DESC;

-- 4) Produtos recentes que existem e o stock atual
SELECT
  id,
  nome,
  categoria,
  quantidade,
  stock_minimo,
  preco_custo,
  preco_venda
FROM p2026_produtos
ORDER BY nome;

-- ============================================================
-- INTERPRETAÇÃO:
--   - Se recent_produtos = 0, o restore do catálogo recente ainda não foi aplicado.
--   - Se o email recente vier com dataset_scope = 'legacy', o site vai ler a base errada.
--   - Se aparecerem movimentos órfãos, o histórico tem produto_id que já não existe no catálogo recente.
-- ============================================================
