# Importar extrato

Tela que lê o extrato do banco (CSV ou OFX) e lança os gastos de uma vez. Portada do app desktop; as regras de leitura, o hash anti-duplicidade e a ordem de categorização são as mesmas.

## Como funciona

1. **Escolher o arquivo** (`.csv`, `.txt` ou `.ofx`, até 2 MB e 5.000 movimentações). O app detecta sozinho o separador (`;` `,` tab `|`), a codificação (UTF-8 ou Latin-1/Windows-1252), pula títulos antes da tabela e sugere as colunas de data, descrição e valor.
2. **Conferir.** Nas colunas, a pessoa só corrige o que o app errou. A prévia mostra cada linha com data, descrição, valor, fornecedor e tipo de gasto. Linhas **já importadas** ficam marcadas e travadas; linhas **sem tipo de gasto** ficam desmarcadas e vermelhas até alguém escolher.
3. **Importar.** Tudo é gravado de uma vez pela função `import_statement` do banco: se algo falhar, nada é lançado.

### Como o tipo de gasto é escolhido (nesta ordem)
1. **Regra aprendida** (`categorization_rules`): o trecho aparece na descrição, palavra por palavra. A regra também casa com a descrição **sem as palavras genéricas e sem números** (PIX, ENVIADO, DO, 123…), porque é assim que o app sugere o trecho: "ACOUGUE ZE" casa com "PIX ENVIADO ACOUGUE DO ZE 2".
2. **Fornecedor reconhecido** pelo CNPJ que aparece no texto, ou pelo nome (4 letras ou mais): usa o tipo de gasto padrão dele.
3. Senão fica **"para revisar"**.

"Lembrar para sempre" (só dono e sócio) guarda um trecho curto como regra e já aplica às outras linhas parecidas da tela. Se o trecho já existe, troca a categoria dele em vez de repetir.

### Duplicidade
Cada linha tem um código (SHA-256 de `data|valor com sinal|descrição normalizada`, mais `#2`, `#3`… para linhas idênticas no mesmo arquivo). Importar o mesmo arquivo de novo não grava nada em dobro, nem se uma parte já tinha entrado.

### Quem pode
Dono, sócio e cargo de confiança importam (`can_log`). Guardar regras e formatos de banco é só de dono e sócio.

## O que depende de você: aplicar a função no banco

A tela chama `public.import_statement`. O arquivo está em **`supabase/migrations/20261120090000_rpc_import_statement.sql`** (repositório da raiz) e **não foi aplicado**. Enquanto isso, ao importar a tela mostra "A importação ainda não foi liberada no banco" e não grava nada.

Antes de aplicar, teste num branch do Supabase. A função **nunca foi executada**. Casos a conferir:

1. Arquivo com despesas e uma entrada (faturamento), com o cargo de dono.
2. O mesmo arquivo de novo: tudo vira "já importada", nada é lançado.
3. Fornecedor novo (cria com "completar depois") e fornecedor que já existe (reaproveita, não duplica).
4. Cargo de confiança consegue importar.
5. Data fora de 01/01/2000 a hoje + 1 ano: a prévia já mostra "não consegui ler" e não envia.
6. Categoria de outra empresa: o banco recusa e nada é gravado.

## Diferenças em relação ao desktop
- O desktop também sugere o tipo de gasto **mais usado** pelo fornecedor no histórico; o web usa só o tipo padrão cadastrado no fornecedor.
- A busca de fornecedor pelo nome usa apelido, nome fantasia e razão social (nomes com 4 letras ou mais).
- A regra aprendida casa também sem as palavras genéricas (veja acima); no desktop só casa com a descrição inteira.
- Windows-1252 no lugar de Latin-1 (inofensivo).

## Para quem mexe no código
- Lógica pura (sem React) em `src/lib/import/`: `dinheiro.ts`, `texto.ts`, `hash.ts`, `parser.ts`, `previa.ts`. A tela é `src/telas/Importar.tsx`.
- Testes, sem dependência nova: `node scripts/testa-import.mts` (Node 22.18 ou mais novo, que já lê TypeScript). Cobrem dinheiro, texto, hash (com valores calculados por `sha256sum`), datas, CSV, OFX e a prévia.
- O `tsconfig.json` ganhou `noEmit` e `allowImportingTsExtensions` para esses scripts importarem os `.ts`. O build do Vite não muda.
- A prévia **não** é refeita quando as regras ou os fornecedores mudam (só quando muda o arquivo, as colunas ou a opção de entradas), para não apagar as escolhas que a pessoa já fez.
