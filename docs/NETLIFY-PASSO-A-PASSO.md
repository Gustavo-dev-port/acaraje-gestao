# Netlify e Supabase: passo a passo para colocar o app no ar

Site: **cantinho-acaraje-gestao** → https://cantinho-acaraje-gestao.netlify.app

Os nomes dos menus do Netlify mudam de vez em quando. Se algo não estiver exatamente onde está escrito, procure pelo nome da opção em negrito.

## Parte 1: conferir que o site está público

O painel do Netlify mudou: hoje ele tem a tela **Manage** com cartões.

1. Entre em https://app.netlify.com e abra o site **cantinho-acaraje-gestao**.
2. Clique em **Manage** (topo).
3. No cartão **Who can see it** deve estar escrito **Public · anyone can visit**. Se estiver outra coisa, clique no cartão e escolha a opção pública.
4. Teste o endereço numa aba anônima: deve aparecer a tela de login do app.

(O selo "private" ao lado do endereço, na pré-visualização do painel, é só do painel e pode ser ignorado.)

Outros cartões úteis: **Versions and previews** (publicações automáticas pelo GitHub) e **Keys and secrets** (vazio é o esperado; a chave pública do Supabase está no `netlify.toml`).

## Parte 2: configurar o login no Supabase

1. Entre em https://supabase.com/dashboard e abra o projeto **acaraje-gestao** (não os outros dois).
2. Menu da esquerda: **Authentication**.
3. **URL Configuration**:
   - **Site URL**: `https://cantinho-acaraje-gestao.netlify.app`
   - **Redirect URLs**: clique em **Add URL** e coloque `https://cantinho-acaraje-gestao.netlify.app/**`
   - Salve.
4. **Sign In / Providers** (ou **Providers → Email**):
   - Deixe **Confirm email** ligado.
   - Em **Minimum password length** coloque **8** (ou mais).
   - Ligue **Prevent use of leaked passwords** se a opção aparecer (em alguns planos fica indisponível; sem problema).
5. Salve.

## Parte 3: primeiro teste

1. Abra o site e entre com o e-mail do dono.
   - Se for o primeiro acesso, use **Primeiro acesso**, crie a senha e confirme pelo e-mail que chegar.
2. Vá em **Lançar gasto**, registre um valor pequeno de teste e confira em **Lançamentos**.
3. Apague o lançamento de teste.
4. Para chamar o sócio ou a pessoa de confiança: tela **Equipe** → convide pelo e-mail e escolha o cargo. A pessoa cria a conta com **o mesmo e-mail** do convite.

## Quando mudar algo no código

O site é publicado a partir do GitHub (repositório `Gustavo-dev-port/acaraje-gestao`). Para ver o histórico, no Netlify abra **Deploys**. Cada publicação aparece ali; a mais recente com o selo **Published** é a que está no ar. Para voltar a uma versão anterior, abra a antiga e clique em **Publish deploy**.

## Coisas que não são necessárias

- Nenhuma variável de ambiente: a URL e a chave pública do Supabase já estão no `netlify.toml`.
- Domínio próprio é opcional: Netlify → **Domain management** → **Add a domain**.
- O site antigo no GitHub Pages pode ser desligado (GitHub → repositório → **Settings → Pages**), pois não tem os cabeçalhos de segurança do Netlify.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| 401 ao abrir o site | Confira o cartão **Who can see it** (Parte 1). |
| E-mail de confirmação leva a uma página que não abre | A *Site URL* do Supabase ainda está errada (Parte 2, passo 3). |
| "Cadastro só com convite" | O dono precisa convidar esse e-mail na tela **Equipe**. |
| Tela em branco após publicar | No Netlify, **Deploys** → abra o último e leia o log; mande a mensagem de erro. |
