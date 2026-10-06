# Fresa Master

Aplicativo completo de orçamento da Fresa Master para pedidos por voz ou texto, cadastro do cliente, seleção de ferramentas, cotação de frete, proposta comercial e aprovação do pedido.

- Os preços unitários informados por voz/texto prevalecem sobre o catálogo; desconto em reais é opcional e só aparece na proposta quando aplicado.
- React + Vite para a interface
- Supabase para login e armazenamento dos orçamentos
- Supabase Edge Function para APIs de IA, Bling e Melhor Envio
- GitHub Pages para hospedar a interface

## Endereço de entrega por mensagem

Marque **Entregar em outro endereço (diferente do Cartão CNPJ)**, cole a mensagem do cliente e clique em **Preencher entrega com IA**. A IA separa destinatário, CEP, rua, número e complemento; o ViaCEP completa/corrige rua, bairro, cidade e UF quando disponíveis para o CEP. O cadastro fiscal do CNPJ não é alterado.

Número e complemento não são deduzidos pelo CEP. Dados obrigatórios ausentes, CEP não encontrado e falhas de consulta são avisados para conferência manual. CEPs gerais de cidade podem não identificar rua/bairro. Confira os campos e clique em **Calcular** para atualizar o frete.

O recurso usa `/api/shipping/extract-delivery` no Express e `/shipping/extract-delivery` na Edge Function. Para disponibilizá-lo no app publicado, publique também a versão atualizada da função `api` no Supabase.

## Como rodar localmente

### 1. Instale as dependências
```bash
npm install
```

### 2. Configure o Supabase
Crie um arquivo `.env` a partir do `.env.example` e defina:
```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

### 3. Inicie o app
```bash
npm run dev
```

A aplicação ficará disponível em:
```text
http://localhost:3000
```

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` publica automaticamente quando há push para `main` ou pode ser iniciado manualmente em **Actions > Deploy Fresa Master to GitHub Pages > Run workflow**.

Antes da primeira publicação:

1. Em **Settings > Pages**, selecione **GitHub Actions** como fonte de publicação.
2. Em **Settings > Secrets and variables > Actions > Variables**, crie as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados públicos do projeto Supabase. Não use a `service_role` key no frontend.
3. Execute a migration `supabase/migrations/202609280001_quotes.sql` no Supabase para criar a tabela de orçamentos e suas regras de acesso.
4. Publique a função `supabase/functions/api` no projeto Supabase (`supabase functions deploy api`) e configure nela as chaves necessárias para Gemini, Bling e Melhor Envio. Não coloque essas chaves no GitHub Pages nem no frontend.
5. Em **Supabase > Authentication > URL Configuration**, configure o Site URL para `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/` e inclua esse mesmo endereço em Redirect URLs.
6. Faça push das alterações para `main` e acompanhe a execução em **Actions**.

O endereço do app é `https://fresamaster2002.github.io/ORCAMENTO---FRESA-MASTER/`. O Pages hospeda a interface; os recursos que consultam IA, Bling e Melhor Envio dependem da Edge Function ativa no Supabase.

## Acesso e dados

O login usa e-mail e senha com sessão persistente. O e-mail é usado apenas para configurar ou recuperar a senha. Os orçamentos são salvos na tabela `quotes` do Supabase, protegida por Row Level Security.
