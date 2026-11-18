# Netlify e Supabase: passo a passo para colocar o app no ar

Site: **cantinho-acaraje-gestao** → https://cantinho-acaraje-gestao.netlify.app

Os nomes dos menus do Netlify mudam de vez em quando. Se algo não estiver exatamente onde está escrito, procure pelo nome da opção em negrito.

## Parte 1: tirar a trava de login do site (resolve o erro 401)

O site foi criado com uma proteção que pede login do Netlify para quem abre. Para a equipe usar, ela precisa sair.

1. Entre em https://app.netlify.com e faça login.
2. Na tela inicial (**Projects**), clique no site **cantinho-acaraje-gestao**.
3. No menu da esquerda, clique em **Project configuration** (em algumas versões aparece como **Site configuration**).
4. Dentro dele, clique em **Access & security** (ou **Access control**).
5. Procure a seção **Visitor access**. Ela diz algo como "Netlify Authentication" ou "Password protection" ou "Team login".
6. Escolha **None** / **Public** / **Disable** (a opção que deixa qualquer pessoa abrir o endereço) e **salve**.
7. Abra https://cantinho-acaraje-gestao.netlify.app numa aba anônima. Deve aparecer a tela de login do app. Se ainda der 401, espere 1 minuto e recarregue com Ctrl+F5.

Importante: o app em si continua protegido, pois só entra quem tem conta e convite. A trava do Netlify é desnecessária.

Se não achar a opção: ela pode exigir plano pago em alguns tipos de conta. Nesse caso me diga o que aparece na tela de **Access & security**.

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
| 401 ao abrir o site | Parte 1 não foi concluída. |
| E-mail de confirmação leva a uma página que não abre | A *Site URL* do Supabase ainda está errada (Parte 2, passo 3). |
| "Cadastro só com convite" | O dono precisa convidar esse e-mail na tela **Equipe**. |
| Tela em branco após publicar | No Netlify, **Deploys** → abra o último e leia o log; mande a mensagem de erro. |
