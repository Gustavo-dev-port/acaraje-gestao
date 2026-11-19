# Segurança do site (front-end)

Este documento descreve o que o código do site faz para se proteger, o que ele **não** consegue fazer sozinho e o que depende de configuração fora do código. A proteção dos dados em si (quem lê e escreve o quê) é do banco: veja `PERMISSOES-E-BANCO.md`.

Estado em 19/11/2026. Mudanças de código desta rodada ainda não commitadas.

## O que o código faz

### Cabeçalhos (`netlify.toml`)
Valem no Netlify.

| Cabeçalho | Efeito |
|---|---|
| `Content-Security-Policy` | Só carrega scripts do próprio site. Conecta apenas ao Supabase, à BrasilAPI e às fontes do Google. Sem frames, workers nem plugins. Conexões http viram https. |
| `Strict-Transport-Security` | 2 anos, incluindo subdomínios. Sem `preload` de propósito: o registro na lista é difícil de desfazer. |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin`: isola a janela e impede que outros sites incorporem os arquivos daqui. |
| `X-Frame-Options`, `frame-ancestors` | O site não pode ser colocado dentro de outro (clickjacking). |
| `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | Padrões restritivos. |
| `Cache-Control: no-cache` em `/index.html` | Uma correção de segurança chega a todos na hora. |

### Login e recuperação de senha
- **PKCE** (`src/supabase.ts`): o link do e-mail traz um código de uso único, não o token da sessão na barra de endereço.
- **Recuperação** (`src/App.tsx`, `src/lib/recuperacao.ts`): a tela de nova senha aparece pelo evento `PASSWORD_RECOVERY`. A marca "ainda não trocou a senha" fica no `localStorage`; se a pessoa fechar a aba no meio, ao voltar cai de novo na troca de senha ou escolhe "Cancelar e sair".
- Ao trocar a senha, as **outras sessões** da conta são encerradas.
- O logout limpa a marca de recuperação e o endereço (hash).
- `getSession` com falha (sem internet) mostra o login em vez de ficar em "Carregando…".
- Cadastro com **mensagem única**: o site não revela quais e-mails têm convite.
- Senha mínima de **10 caracteres** no cadastro e na troca (`SENHA_MIN`, em `src/lib/validar.ts`).

### Entrada de dados
- CNPJ só vai para a Receita se tiver dígito verificador correto (`cnpjValido`).
- `maxLength` nos campos de texto; trava de duplo envio em Equipe, Lançar gasto, Faturamento e demais formulários.

### Anexos (`src/lib/gastos.ts`)
- Aceita JPG, PNG, WEBP, HEIC, HEIF e PDF, até 10 MB e 5 arquivos por vez. Os mesmos tipos e tamanho que o bucket do Supabase aceita.
- Vale o tipo informado pelo navegador (o iPhone converte HEIC em JPEG mas mantém o nome `.HEIC`). Sem tipo, vale a extensão. Imagem dizendo ser PDF, e o contrário, é recusada. SVG é recusado.
- A extensão guardada no servidor sai do tipo, não do nome do arquivo.
- Isto melhora a mensagem para a pessoa. Quem barra de verdade é o bucket.

### Build e dependências
- `vite build --mode demo` falha de propósito: o modo demo troca o Supabase por dados fictícios e nunca pode ser publicado.
- `vite` 6.4.x (`npm audit`: 0 vulnerabilidades).
- CI (`pages.yml`): `npm audit --omit=dev --audit-level=high` antes do build; `contents: read` para tudo e `pages`/`id-token: write` só no job de publicação.
- `dependabot.yml`: pull requests semanais de npm e das actions.
- O bundle contém só a chave **publicável** do Supabase (pública por desenho). A chave `service_role` nunca vai para o site ou para o repositório.

### GitHub Pages (limitação)
O Pages não aplica os cabeçalhos do `netlify.toml`. O build injeta a mesma CSP como `<meta>` (`cspMeta`, em `vite.config.ts`), com estes limites:
- `frame-ancestors` não funciona em `<meta>`: **sem proteção contra clickjacking**.
- Não existem em `<meta>`: HSTS, COOP/CORP, `X-Frame-Options` e `Permissions-Policy`.
- `upgrade-insecure-requests` fica só no cabeçalho do Netlify.

**Para ter todos os cabeçalhos, use o Netlify como destino principal.**

## O que depende de você (fora do código)

1. **Redirect URLs** (Supabase → Authentication → URL Configuration). Cadastre cada endereço onde o site roda, com a barra final:
   - o do Netlify, `https://<seu-site>.netlify.app/`;
   - o do GitHub Pages, com o subcaminho do repositório, `https://<usuário>.github.io/<repositório>/`;
   - o local, `http://localhost:5173/`.

   Sem isso, o link de "esqueci minha senha" não funciona. Cadastre **antes** de publicar a versão com PKCE.
2. **Política de senha** (Supabase → Authentication → Providers → Email): mínimo de 10 e proteção contra senhas vazadas. O site só confere o tamanho.
3. **Tempo de vida do login** (Authentication → Sessions): confira o tempo do token e a rotação do refresh token.
4. **Dependabot**: habilite no repositório do GitHub para os pull requests passarem a chegar.
5. **Aviso aos usuários**: o link de recuperação precisa ser aberto no mesmo aparelho e navegador em que foi pedido (limitação do PKCE). A tela de "esqueci minha senha" já avisa.

## Decisões em aberto

- O `npm audit` no CI **barra a publicação** quando surge uma vulnerabilidade alta ou crítica em dependência de produção. Isso protege, mas pode atrasar uma correção urgente. Para só avisar, remova essa etapa de `pages.yml` ou use `continue-on-error: true`.
- Ações do GitHub fixadas por SHA: não feito. O Dependabot cuida das atualizações, mas a fixação exige consultar os hashes no GitHub.

## Ainda não feito

- Fontes auto-hospedadas (hoje o navegador pede as fontes ao Google, que recebe o IP).
- Tirar `'unsafe-inline'` do `style-src`: exige conferir os `style=` do React e dos gráficos.
- `require-trusted-types-for 'script'` (testar antes em modo Report-Only).
- Teste real, em navegador, do fluxo de e-mail com PKCE e da abertura de anexos com COOP.
- Testes automatizados: o `web/` não tem nenhum.

## Como verificar depois de mudar algo

```bash
npx tsc --noEmit
npm audit --omit=dev --audit-level=high
npx vite build --outDir /tmp/dist-check --emptyOutDir
```

No `index.html` gerado, confira que o `<meta http-equiv="Content-Security-Policy">` está logo após o `<meta charset>` e que não há arquivos `.map`.
