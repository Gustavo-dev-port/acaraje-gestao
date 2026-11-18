# Cantinho do Acarajé · Gestão (web)

App web (celular e computador) ligado ao projeto Supabase `acaraje-gestao`. Substitui o app WPF.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera a pasta dist/ (site estático)
```

`.env` guarda a URL e a chave **publicável** do Supabase (pode ficar no navegador; quem protege os dados são as regras de acesso do banco).

## Telas

Dashboard · Lançar gasto · Lançamentos (editar, anexar nota) · Contas a pagar · Contas fixas · Faturamento ·
Fornecedores · Categorias e metas · Ficha técnica (insumos, preços, fichas, CMV) · Relatórios (DRE, CSV, PDF) · Equipe.

## Papéis

- **dono**: tudo, inclusive convidar e remover pessoas.
- **sócio**: vê e edita tudo, apaga; não gerencia pessoas.
- **cargo de confiança**: vê os números, lança gastos e faturamento, cadastra fornecedor; não apaga nem mexe em cadastros.

As regras valem no banco (RLS), não só nas telas.

## Publicar

Qualquer hospedagem de site estático serve (Netlify, Vercel, Cloudflare Pages, GitHub Pages): publique a pasta `dist/`
com a variável `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` iguais às do `.env`. Depois, no Supabase em
Authentication → URL Configuration, coloque o endereço do site em *Site URL*.
