# Permissões e banco de dados

Projeto Supabase: **acaraje-gestao** (ref `sirhttnpwcoptezpxneb`). É separado do Booking Chef e do Cardápio Digital. Não misture os três.

## Cargos

| Cargo | Valor no banco | O que pode |
|---|---|---|
| Dono | `dono` | Tudo. É o único que gerencia a equipe e convites e altera os dados da empresa. |
| Sócio | `socio` | Ver tudo, lançar, editar e apagar. Não gerencia equipe. |
| Cargo de confiança | `confianca` | Ver tudo e **lançar** gastos, faturamento e anexos. Não apaga nem edita cadastros. |

Quem não é membro da empresa não vê nada. Os cargos são verificados **no banco** (regras RLS), não só na tela.

As regras usam quatro funções no schema `private`, todas `SECURITY DEFINER` com `search_path` vazio:

- `is_member`: tem qualquer cargo.
- `can_log`: dono, sócio ou confiança.
- `can_write`: dono ou sócio.
- `is_owner`: só dono.

## Matriz por tabela

Leitura: qualquer membro. Escrita:

| Tabela | Inserir | Editar | Apagar |
|---|---|---|---|
| expenses (gastos) | dono, sócio, confiança | dono, sócio, confiança (ver observações) | dono, sócio |
| revenues (faturamento) | dono, sócio, confiança | dono, sócio, confiança | dono, sócio |
| attachments e arquivos do bucket `attachments` | dono, sócio, confiança | dono, sócio, confiança | dono, sócio |
| import_batches | dono, sócio, confiança | dono, sócio, confiança | dono, sócio |
| suppliers (fornecedores) | dono, sócio, confiança | dono, sócio | dono, sócio |
| categories, category_goals, categorization_rules, csv_mappings | dono, sócio | dono, sócio | dono, sócio |
| ingredients, ingredient_prices, products, recipe_items (ficha técnica) | dono, sócio | dono, sócio | dono, sócio |
| recurrences (contas fixas), settings | dono, sócio | dono, sócio | dono, sócio |
| companies | — | só dono | — |
| company_members, member_invites | só dono | só dono | só dono |
| profiles | — | — | — |

`profiles`: cada pessoa lê o próprio perfil e o de quem divide a mesma empresa.

## Observações de segurança

- **Apagar é lógico** (`deleted_at`). O gatilho `guard_soft_delete` controla quem pode marcar como apagado. Cargo de confiança só desfaz um gasto **seu** nos primeiros 10 minutos.
- **Campos imutáveis**: `created_by` e `created_at` são carimbados pelo banco (`stamp_insert`) e não podem ser alterados (`guard_immutable`). Ninguém forja autoria.
- **Cadastro só por convite**: o gatilho `block_uninvited_signup` impede criar conta sem convite do dono. O convite só é aceito depois da confirmação do e-mail (`accept_invites`).
- **Valores em centavos** (`bigint`). Nunca use decimal para dinheiro.
- **Anexos**: bucket privado `attachments`, até 10 MB; aceita jpeg, png, webp, heic, heif e pdf. A pasta do arquivo começa pelo id da empresa, e as regras do Storage conferem isso.
- O papel `anon` não tem acesso às tabelas.
- A chave `sb_publishable_...` é pública por desenho (vai dentro do site). **Nunca** coloque a chave `service_role` no site ou no repositório.

## Funções (RPC) usadas pelo app

| Função | Para quê |
|---|---|
| `generate_recurrences` / `generate_recurrences_range` | Cria as contas fixas do mês (ou de um período) sem duplicar (índice único `ux_expenses_recurrence_month`). |
| `save_recipe` | Salva uma ficha técnica inteira de uma vez (tudo ou nada). |
| `accept_invites` | Vincula quem entrou à empresa conforme o convite. |

Outros gatilhos de integridade: `guard_ingredient_unit` (impede trocar a unidade de um insumo já usado) e `guard_category_depth` (categoria só tem 2 níveis).

## Migrações aplicadas

Estão **só no Supabase** (não há arquivo `.sql` de cada uma no repositório). Ordem:

1. `20261118011945` gestao_core: tabelas, enums, RLS, funções de cargo, Realtime e bucket.
2. `20261118012718` guard_soft_delete: controle de quem apaga.
3. `20261118164858` convites_e_perfis: convites, perfis, bloqueio de cadastro sem convite.
4. `20261118165143` gerar_contas_fixas: contas fixas mensais.
5. `20261118170709` guard_soft_delete_desfazer: janela de 10 min para desfazer.
6. `20261118172500` auditoria_seguranca_banco: campos imutáveis, limites do bucket, convite só após confirmar e-mail, revoga `anon`.
7. `20261118173331` auditoria_integridade_dados: `save_recipe`, unidade, profundidade de categoria, contas fixas por período.

O arquivo `supabase/migrations/20261112000000_gestao_core.sql` é só o rascunho inicial e **está desatualizado**. A fonte de verdade é o banco. Para ver o que está valendo: Supabase → *Database → Migrations*, ou a consulta `select * from supabase_migrations.schema_migrations;`.

## Como mudar o banco com segurança

1. Mude por migração (nunca editando tabela solta), com o nome no formato `assunto_curto`.
2. Teste a regra com os três cargos antes de publicar.
3. Rode *Advisors* (Supabase → Advisors) e corrija avisos de segurança.
4. Guarde uma cópia do SQL novo neste repositório em `supabase/migrations/`.

## Pendências conhecidas (opcionais)

- Histórico de alterações (auditoria) dos lançamentos.
- Índices de chaves estrangeiras e unificação de regras repetidas (desempenho, só importa com muito dado).
- Testes automáticos das regras por cargo.
- Confirmar vários gastos de uma vez não é transacional (se cair no meio, parte fica confirmada).
- Telas "Importar extrato" e "Estoque" ainda aparecem como "Em breve".
